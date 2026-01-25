
import React, { useEffect, useRef, useMemo } from 'react';
import { Viewer, Entity, PointGraphics, EllipseGraphics, LabelGraphics } from 'resium';
import { Cartesian3, Color, ScreenSpaceEventHandler, ScreenSpaceEventType, defined, BillboardCollection, LabelCollection, LabelStyle, Math as CesiumMath, Cartesian2, VerticalOrigin, HorizontalOrigin, HeadingPitchRoll, BoundingSphere, HeadingPitchRange } from 'cesium';

// Helper to get vessel category from type code
const getVesselCategory = (typeCode) => {
    if (!typeCode) return 'Other';
    if (typeCode >= 70 && typeCode < 80) return 'Cargo';
    if (typeCode >= 80 && typeCode < 90) return 'Tanker';
    if (typeCode >= 60 && typeCode < 70) return 'Passenger';
    if (typeCode === 30) return 'Fishing';
    if (typeCode >= 36 && typeCode <= 37) return 'Pleasure';
    return 'Other';
};

// Helper to determine ship color by type
const getShipColor = (typeCode) => {
    if (typeCode >= 70 && typeCode < 80) return Color.LIGHTGREEN; // Cargo
    if (typeCode >= 80 && typeCode < 90) return Color.INDIANRED; // Tanker
    if (typeCode >= 60 && typeCode < 70) return Color.SKYBLUE; // Passenger
    if (typeCode === 30) return Color.ORANGE; // Fishing
    if (typeCode >= 36 && typeCode <= 37) return Color.MAGENTA; // Pleasure
    return Color.WHITE; // Other (including no typeCode)
};

// Helper: Create a triangle/chevron canvas for vessel icon
const createShipCanvas = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // Draw a sharp chevron/triangle pointing up
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.moveTo(16, 0);   // Top tip
    ctx.lineTo(28, 30);  // Bottom right
    ctx.lineTo(16, 22);  // Bottom middle (notch)
    ctx.lineTo(4, 30);   // Bottom left
    ctx.closePath();
    ctx.fill();

    return canvas;
};

const shipCanvas = createShipCanvas();

const GlobeViewer = ({ userLocation, boats, onSelectBoat, recenterTrigger, enabledVesselTypes, showLabels }) => {
    const viewerRef = useRef(null);
    const primitivesRef = useRef(null);
    const labelsRef = useRef(null);
    const hasFlownToUser = useRef(false);
    const frameSkipCounter = useRef(0);
    const updateRequestId = useRef(null);
    const lastBoatsUpdate = useRef(0);

    // 1. Initial Access & Collection Setup
    useEffect(() => {
        if (!viewerRef.current?.cesiumElement) return;

        const scene = viewerRef.current.cesiumElement.scene;
        
        // Defer collection creation to next frame to avoid blocking initial render
        let collection = null;
        let labels = null;
        
        const initFrame = requestAnimationFrame(() => {
            console.log("[GlobeViewer] Initializing BillboardCollection");
            
            // Cleanup old if any (safety)
            if (primitivesRef.current) {
                scene.primitives.remove(primitivesRef.current);
            }

            // We use a BillboardCollection for oriented triangles
            collection = scene.primitives.add(new BillboardCollection());
            primitivesRef.current = collection;

            // We use a LabelCollection for boat names
            labels = scene.primitives.add(new LabelCollection());
            labelsRef.current = labels;
        });

        return () => {
            cancelAnimationFrame(initFrame);
            if (viewerRef.current?.cesiumElement) {
                if (primitivesRef.current) {
                    viewerRef.current.cesiumElement.scene.primitives.remove(primitivesRef.current);
                }
                if (labelsRef.current) {
                    viewerRef.current.cesiumElement.scene.primitives.remove(labelsRef.current);
                }
            }
            primitivesRef.current = null;
            labelsRef.current = null;
        };
    }, [viewerRef.current?.cesiumElement]); // Use the actual element as dependency

    // 2. Render & Update Boats (Persistent)
    const entityMap = useRef(new Map()); // MMSI -> { billboard, label }
    const canvasPositionCache = useRef(new Map()); // MMSI -> { x, y, timestamp }

    // Memoize sorted and filtered boats
    const sortedBoats = useMemo(() => {
        // Filter boats by enabled vessel types
        const filtered = boats.filter(boat => {
            const category = getVesselCategory(boat.static?.Type);
            return enabledVesselTypes[category] !== false; // Default to true if not specified
        });
        
        // Sort filtered boats
        return filtered.sort((a, b) => {
            const typeA = a.static?.Type || 0;
            const typeB = b.static?.Type || 0;
            // Rank Cargo/Tanker higher than pleasure/fishing
            const priority = (type) => {
                if (type >= 80 && type < 90) return 10; // Tanker
                if (type >= 70 && type < 80) return 9;  // Cargo
                if (type >= 60 && type < 70) return 8;  // Passenger
                if (type === 30) return 2;              // Fishing
                return 1;
            };
            return priority(typeB) - priority(typeA);
        });
    }, [boats, enabledVesselTypes]);

    useEffect(() => {
        const collection = primitivesRef.current;
        const labels = labelsRef.current;
        const viewer = viewerRef.current?.cesiumElement;

        if (!collection || !labels || !viewer) return;

        // Debounce updates using requestAnimationFrame
        if (updateRequestId.current) {
            cancelAnimationFrame(updateRequestId.current);
        }

        updateRequestId.current = requestAnimationFrame(() => {
            const startTime = performance.now();
            const currentMmsis = new Set();

            const scene = viewer.scene;
            const occupiedRects = [];
            
            // Increment frame skip counter for decluttering
            frameSkipCounter.current++;
            const shouldRunDecluttering = frameSkipCounter.current % 3 === 0; // Every 3rd frame

            sortedBoats.forEach(boat => {
                const mmsi = boat.MetaData?.MMSI;
                if (!mmsi) return;
                currentMmsis.add(mmsi);

                const lat = boat.Message?.PositionReport?.Latitude;
                const lon = boat.Message?.PositionReport?.Longitude;
                const heading = boat.Message?.PositionReport?.TrueHeading;
                const cog = boat.Message?.PositionReport?.Cog;

                if (lat === undefined || lon === undefined) return;

                const position = Cartesian3.fromDegrees(Number(lon), Number(lat));
                const color = getShipColor(boat.static?.Type);

                let shipHeading = 0;
                if (heading !== undefined && heading < 360) {
                    shipHeading = heading;
                } else if (cog !== undefined) {
                    shipHeading = cog;
                }
                const rotation = -CesiumMath.toRadians(shipHeading);

                let entry = entityMap.current.get(mmsi);

                if (!entry) {
                    // Create new
                    const bb = collection.add({
                        position: position,
                        image: shipCanvas,
                        color: color,
                        width: 16,
                        height: 16,
                        rotation: rotation,
                        id: boat,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY
                    });

                    const name = boat.MetaData?.ShipName;
                    let lbl = null;
                    if (name) {
                        lbl = labels.add({
                            position: position,
                            text: name,
                            font: '600 0.75rem Inter, system-ui, sans-serif',
                            fillColor: Color.WHITE,
                            style: LabelStyle.FILL,
                            verticalOrigin: VerticalOrigin.TOP,
                            horizontalOrigin: HorizontalOrigin.CENTER,
                            pixelOffset: new Cartesian2(0, 10),
                            disableDepthTestDistance: Number.POSITIVE_INFINITY,
                            id: boat
                        });
                    }
                    entry = { billboard: bb, label: lbl };
                    entityMap.current.set(mmsi, entry);
                } else {
                    // Update existing
                    entry.billboard.position = position;
                    entry.billboard.rotation = rotation;
                    entry.billboard.color = color;
                    entry.billboard.id = boat; // Keep data fresh

                    if (entry.label) {
                        entry.label.position = position;
                        entry.label.text = boat.MetaData?.ShipName || entry.label.text;
                        entry.label.id = boat;
                    } else if (boat.MetaData?.ShipName) {
                        // Name appeared later
                        entry.label = labels.add({
                            position: position,
                            text: boat.MetaData.ShipName,
                            font: '600 0.75rem Inter, system-ui, sans-serif',
                            fillColor: Color.WHITE,
                            style: LabelStyle.FILL,
                            verticalOrigin: VerticalOrigin.TOP,
                            horizontalOrigin: HorizontalOrigin.CENTER,
                            pixelOffset: new Cartesian2(0, 10),
                            disableDepthTestDistance: Number.POSITIVE_INFINITY,
                            id: boat
                        });
                    }
                }

                // Label visibility: controlled by showLabels prop and decluttering
                if (entry.label) {
                    if (!showLabels) {
                        // Hide all labels if showLabels is false
                        entry.label.show = false;
                    } else if (shouldRunDecluttering) {
                        // Decluttering logic - only run every 3rd frame for performance
                        // Check cache first (cache valid for 100ms)
                        const cacheKey = mmsi;
                        const cached = canvasPositionCache.current.get(cacheKey);
                        const now = Date.now();
                        let canvasPos = null;

                        if (cached && (now - cached.timestamp < 100)) {
                            canvasPos = { x: cached.x, y: cached.y };
                        } else {
                            canvasPos = scene.cartesianToCanvasCoordinates(position);
                            if (canvasPos) {
                                canvasPositionCache.current.set(cacheKey, {
                                    x: canvasPos.x,
                                    y: canvasPos.y,
                                    timestamp: now
                                });
                            }
                        }

                        if (canvasPos) {
                            const labelWidth = entry.label.text.length * 6; // Rough estimate
                            const labelHeight = 15;
                            const rect = {
                                left: canvasPos.x - labelWidth / 2 - 5,
                                right: canvasPos.x + labelWidth / 2 + 5,
                                top: canvasPos.y + 10 - 5,
                                bottom: canvasPos.y + 10 + labelHeight + 5
                            };

                            const overlaps = occupiedRects.some(r => (
                                rect.left < r.right &&
                                rect.right > r.left &&
                                rect.top < r.bottom &&
                                rect.bottom > r.top
                            ));

                            if (overlaps) {
                                entry.label.show = false;
                            } else {
                                entry.label.show = true;
                                occupiedRects.push(rect);
                            }
                        } else {
                            entry.label.show = false; // Not on screen
                        }
                    }
                    // If not running decluttering, keep previous visibility state (prevents flickering)
                }
            });

            // Cleanup stale vessels
            for (const [mmsi, entry] of entityMap.current.entries()) {
                if (!currentMmsis.has(mmsi)) {
                    collection.remove(entry.billboard);
                    if (entry.label) labels.remove(entry.label);
                    entityMap.current.delete(mmsi);
                    canvasPositionCache.current.delete(mmsi);
                }
            }

            scene.requestRender();
            
            // Performance monitoring (only in dev)
            const frameTime = performance.now() - startTime;
            if (frameTime > 16) {
                console.warn(`[GlobeViewer] Frame took ${frameTime.toFixed(2)}ms (target: <16ms)`);
            }
            
            updateRequestId.current = null;
            lastBoatsUpdate.current = Date.now();
        });

        return () => {
            if (updateRequestId.current) {
                cancelAnimationFrame(updateRequestId.current);
                updateRequestId.current = null;
            }
        };
    }, [sortedBoats, showLabels]);

    // 3. Picking Handler
    useEffect(() => {
        if (!viewerRef.current || !viewerRef.current.cesiumElement || !onSelectBoat) return;

        const viewer = viewerRef.current.cesiumElement;
        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

        handler.setInputAction((click) => {
            const pickedObject = viewer.scene.pick(click.position);
            if (defined(pickedObject) && pickedObject.id) {
                // If it's a billboard or label from our collections, id is the boat object
                const boat = pickedObject.id;
                if (boat && (boat.MetaData || boat.static)) {
                    console.log("[GlobeViewer] Picked boat:", boat.MetaData?.ShipName || boat.MetaData?.MMSI);
                    onSelectBoat(boat);
                } else {
                    onSelectBoat(null);
                }
            } else {
                onSelectBoat(null);
            }
        }, ScreenSpaceEventType.LEFT_CLICK);

        return () => {
            handler.destroy();
        };
    }, [onSelectBoat]);


    // 4. Initial Fly-in - Zoom to show 2-mile range circle at 45-degree angle
    useEffect(() => {
        if (viewerRef.current && viewerRef.current.cesiumElement && userLocation && !hasFlownToUser.current) {
            try {
                const camera = viewerRef.current.cesiumElement.camera;
                const targetPosition = Cartesian3.fromDegrees(userLocation.lon, userLocation.lat, 0);
                
                // Use BoundingSphere to ensure camera targets the GPS location
                // Sphere radius of 5000m shows 2-mile (3219m) circle with context
                const sphere = new BoundingSphere(targetPosition, 5000);
                camera.flyToBoundingSphere(sphere, {
                    duration: 2,
                    offset: new HeadingPitchRange(0, CesiumMath.toRadians(-45), 9000)
                });
                hasFlownToUser.current = true;
            } catch (e) {
                console.warn("GlobeViewer: Initial flyTo failed", e);
            }
        }
    }, [userLocation]);

    // 5. Manual Recenter - Zoom to show 2-mile range circle at 45-degree angle
    useEffect(() => {
        if (recenterTrigger && viewerRef.current && viewerRef.current.cesiumElement && userLocation) {
            try {
                const camera = viewerRef.current.cesiumElement.camera;
                const targetPosition = Cartesian3.fromDegrees(userLocation.lon, userLocation.lat, 0);
                
                // Use BoundingSphere to ensure camera targets the GPS location
                const sphere = new BoundingSphere(targetPosition, 5000);
                camera.flyToBoundingSphere(sphere, {
                    duration: 1.5,
                    offset: new HeadingPitchRange(0, CesiumMath.toRadians(-45), 9000)
                });
            } catch (e) {
                console.warn("GlobeViewer: Recenter failed", e);
            }
        }
    }, [recenterTrigger, userLocation]);

    return (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <Viewer
                ref={viewerRef}
                full
                animation={false}
                timeline={false}
                infoBox={false}
                selectionIndicator={true}
                baseLayerPicker={false}
                navigationHelpButton={false}
                homeButton={false}
                geocoder={false}
                sceneModePicker={false}
                fullscreenButton={false}
            >
                {/* User Location - Keep as Entity for distinct look */}
                {userLocation && (
                    <Entity
                        position={Cartesian3.fromDegrees(userLocation.lon, userLocation.lat)}
                        name="You"
                    >
                        <PointGraphics
                            pixelSize={12}
                            color={Color.CYAN}
                            outlineColor={Color.WHITE}
                            outlineWidth={2}
                        />
                    </Entity>
                )}

                {/* Distance Rings */}
                {userLocation && [1, 2, 5, 10, 25, 50].map((miles) => {
                    const meters = miles * 1609.34;
                    const lat = Number(userLocation.lat);
                    const lon = Number(userLocation.lon);
                    // 1 degree latitude is approx 111132 meters
                    const latOffset = meters / 111132;

                    return (
                        <React.Fragment key={`ring-group-${miles}`}>
                            <Entity
                                position={Cartesian3.fromDegrees(lon, lat)}
                                name={`${miles} Mile Radius`}
                            >
                                <EllipseGraphics
                                    semiMajorAxis={meters}
                                    semiMinorAxis={meters}
                                    height={0}
                                    fill={false}
                                    outline={true}
                                    outlineColor={Color.WHITE.withAlpha(0.3)}
                                    outlineWidth={1}
                                />
                            </Entity>
                            <Entity
                                position={Cartesian3.fromDegrees(lon, lat + latOffset)}
                                name={`${miles} Mile Label`}
                            >
                                <LabelGraphics
                                    text={`${miles} NM`}
                                    font='600 13px Inter, system-ui, sans-serif'
                                    fillColor={Color.WHITE.withAlpha(0.9)}
                                    showBackground={true}
                                    backgroundColor={Color.BLACK.withAlpha(0.6)}
                                    backgroundPadding={new Cartesian2(4, 2)}
                                    disableDepthTestDistance={Number.POSITIVE_INFINITY}
                                    verticalOrigin={VerticalOrigin.BOTTOM}
                                    pixelOffset={new Cartesian2(0, -5)}
                                />
                            </Entity>
                        </React.Fragment>
                    );
                })}
            </Viewer>
        </div>
    );
};

export default GlobeViewer;
