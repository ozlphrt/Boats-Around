import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Viewer, Entity, PointGraphics, EllipseGraphics, LabelGraphics } from 'resium';
import { Cartesian3, Color, ScreenSpaceEventHandler, ScreenSpaceEventType, defined, BillboardCollection, LabelCollection, LabelStyle, Math as CesiumMath, Cartesian2, VerticalOrigin, HorizontalOrigin, HeadingPitchRoll, BoundingSphere, HeadingPitchRange, Cartographic, ImageMaterialProperty } from 'cesium';
import LongPressProgress from '../UI/LongPressProgress';
import { getVesselCategory, getShipColor, getVesselSize } from '../../utils/vesselUtils';


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

const GlobeViewer = ({ userLocation, boats, selectedBoat, onSelectBoat, onLocationUpdate, recenterTrigger, enabledVesselTypes, showLabels }) => {
    const viewerRef = useRef(null);
    const [cesiumInstance, setCesiumInstance] = React.useState(null);
    const [longPressFeedback, setLongPressFeedback] = React.useState(null);
    const primitivesRef = useRef(null);
    const labelsRef = useRef(null);
    const hasFlownToUser = useRef(false);
    const frameSkipCounter = useRef(0);
    const updateRequestId = useRef(null);

    const lastBoatsUpdate = useRef(0);
    const boatsRef = useRef(boats);

    // Sync boatsRef with prop
    useEffect(() => {
        boatsRef.current = boats;
    }, [boats]);

    // 1. Initial Access
    useEffect(() => {
        if (!viewerRef.current?.cesiumElement) return;
        setCesiumInstance(viewerRef.current.cesiumElement);
    }, [viewerRef.current?.cesiumElement]);

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

        // Sort filtered boats by size (descending)
        return filtered.sort((a, b) => {
            const sizeA = getVesselSize(a);
            const sizeB = getVesselSize(b);
            return sizeB - sizeA;
        });
    }, [boats, enabledVesselTypes]);

    useEffect(() => {
        const viewer = cesiumInstance;

        if (!viewer) return;

        const updateBoats = () => {
            // Viewport culling
            // Actually, with Entities, Cesium handles culling well, but we can prevent creating them if offscreen
            // For now, let's trust Cesium's Entity system or do simple radius check

            const currentMmsis = new Set();
            let renderedCount = 0;
            // const occupiedRects = []; // Moved to postRender for dynamic checking
            const scene = viewer.scene;
            const heading = scene.camera.heading;

            boats.forEach(boat => {
                const mmsi = boat.MetaData?.MMSI;
                if (!mmsi) return;

                // Extract lat/lon
                let lat, lon;
                if (boat.Message?.PositionReport) {
                    lat = boat.Message.PositionReport.Latitude;
                    lon = boat.Message.PositionReport.Longitude;
                } else if (boat.MetaData?.latitude && boat.MetaData?.longitude) {
                    lat = boat.MetaData.latitude;
                    lon = boat.MetaData.longitude;
                }

                if (lat === undefined || lon === undefined) return;

                // --- Simple Distance Check to avoid processing world-wide boats ---
                // (Optional: Implement if needed, but for now trust the viewport loop or let Cesium handle it)
                const position = Cartesian3.fromDegrees(Number(lon), Number(lat));


                currentMmsis.add(mmsi);
                renderedCount++;

                const heading = boat.Message?.PositionReport?.TrueHeading;
                const cog = boat.Message?.PositionReport?.Cog;
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
                    // Create New Entity
                    // Use Ellipse with rotation to make it LIE FLAT on the water
                    const entity = viewer.entities.add({
                        position: position,
                        id: String(mmsi), // Cesium requires string/number for ID
                        ellipse: {
                            semiMajorAxis: 80.0, // Increased from 18.0 to be visible at altitude
                            semiMinorAxis: 80.0,
                            material: new ImageMaterialProperty({
                                image: shipCanvas,
                                color: color
                            }),
                            rotation: rotation,
                            zIndex: 10
                        },
                        label: {
                            text: boat.MetaData?.ShipName || '',
                            font: '600 12px Inter, system-ui, sans-serif',
                            fillColor: Color.WHITE,
                            style: LabelStyle.FILL,
                            verticalOrigin: VerticalOrigin.BOTTOM,
                            pixelOffset: new Cartesian2(0, -25), // Above the boat
                            disableDepthTestDistance: Number.POSITIVE_INFINITY,
                            show: showLabels // Initial state
                            // We can use eyeOffset or heightReference to clamp? 
                            // Default is fine for sea level.
                        }
                    });

                    // Manually tint the canvas material?? 
                    // Ellipse material takes an Image. We can't tint it easily per instance unless we make a new canvas per color.
                    // Oh, we already make a white canvas.
                    // Actually, we need 'color' property on material? 
                    // ImageMaterialProperty allows 'color' to tint!
                    entity.ellipse.material.color = color;

                    entry = { entity: entity };
                    entityMap.current.set(mmsi, entry);
                } else {
                    // Update Existing
                    entry.entity.position = position;
                    entry.entity.ellipse.rotation = rotation;
                    // Update color if type changed? Rare, but safe
                    if (entry.entity.ellipse.material.color) {
                        entry.entity.ellipse.material.color = color;
                    }


                    if (entry.entity.label) {
                        if (boat.MetaData?.ShipName) {
                            entry.entity.label.text = boat.MetaData.ShipName;
                        }
                        // Only force update show if it's strictly false or we are initializing? 
                        // No, let declutter logic handle 'show' if showLabels is true.
                        // If showLabels is false, we can force it off here.
                        if (!showLabels) {
                            entry.entity.label.show = false;
                        }
                        // If showLabels is true, we leave it to declutter logic, 
                        // BUT we must ensure it's not permanently stuck off if we switch back.
                        // We'll let the postRender loop handle turning it ON.
                    }
                }

            });
            for (const [mmsi, entry] of entityMap.current.entries()) {
                if (!currentMmsis.has(mmsi)) {
                    viewer.entities.remove(entry.entity);
                    entityMap.current.delete(mmsi);
                    canvasPositionCache.current.delete(mmsi);
                }
            }

        }; // Close updateBoats

        updateBoats();
    }, [sortedBoats, showLabels, cesiumInstance]); // Remove boats from dependency if we use sortedBoats

    // 2.5 Label Decluttering (PostRender)
    useEffect(() => {
        if (!cesiumInstance) return;
        const scene = cesiumInstance.scene;

        const scratchPosition = new Cartesian2();

        const declutter = () => {
            if (!showLabels) return; // If globally off, nothing to do (updateBoats handles turning them off)

            const occupiedRects = [];

            // Iterate through SORTED boats (Largest/Most important first)
            for (const boat of sortedBoats) {
                const mmsi = boat.MetaData?.MMSI;
                if (!mmsi) continue;

                const entry = entityMap.current.get(mmsi);
                if (!entry || !entry.entity || !entry.entity.label) continue;

                const entity = entry.entity;
                // Get current position in screen coordinates
                // We need the Cartesian3 position. It might be a Property or a value.
                // entity.position is a PositionProperty. getValue needs time.
                const positionCartesian = entity.position.getValue(cesiumInstance.clock.currentTime);

                if (!positionCartesian) {
                    entity.label.show = false;
                    continue;
                }

                // Convert to screen coords
                const screenPos = scene.cartesianToCanvasCoordinates(positionCartesian, scratchPosition);

                if (!screenPos) {
                    // Off screen (behind camera)
                    entity.label.show = false;
                    continue;
                }

                // Define Label Bounding Box
                // Approx size: 100px wide, 20px high. 
                // Pixel offset is (0, -25) -> 25px UP from the anchor.
                const labelWidth = 120;
                const labelHeight = 20;
                const x = screenPos.x - labelWidth / 2; // Centered horizontally
                const y = screenPos.y - 25 - labelHeight; // Above the point

                const myRect = { x, y, width: labelWidth, height: labelHeight };

                // Check collision with already visible labels
                let overlap = false;
                for (const rect of occupiedRects) {
                    if (x < rect.x + rect.width &&
                        x + labelWidth > rect.x &&
                        y < rect.y + rect.height &&
                        y + labelHeight > rect.y) {
                        overlap = true;
                        break;
                    }
                }

                if (overlap) {
                    if (entity.label.show) entity.label.show = false;
                } else {
                    if (!entity.label.show) entity.label.show = true;
                    occupiedRects.push(myRect);
                }
            }
        };

        const removeListener = scene.postRender.addEventListener(declutter);

        return () => {
            removeListener();
        };
    }, [cesiumInstance, showLabels, sortedBoats]);

    // 3. Picking & Interaction Handler (Click + Long Press)
    useEffect(() => {
        if (!cesiumInstance || !onSelectBoat) return;


        const viewer = cesiumInstance;
        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

        const longPressTimer = { current: null };
        const startPos = { current: null };

        // Helper: Cancel the timer if it's running
        const cancelLongPress = () => {
            if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }
            startPos.current = null;
            // Clear visual feedback
            setLongPressFeedback(null);
        };

        // LEFT DOWN: Start timer and store start position
        handler.setInputAction((click) => {
            // Store start position to check for drag/movement
            startPos.current = Cartesian2.clone(click.position);

            // Show feedback immediately
            setLongPressFeedback({ x: click.position.x, y: click.position.y });

            // Start 2-second timer for Long Press (Fly To)
            longPressTimer.current = setTimeout(() => {
                // If timer fires, it's a Long Press
                handleLongPress(click.position);
                longPressTimer.current = null; // Reset
                startPos.current = null;
                setLongPressFeedback(null); // Hide feedback upon completion
            }, 2000);

        }, ScreenSpaceEventType.LEFT_DOWN);

        // MOUSE MOVE: Cancel if moved too much (drag)
        handler.setInputAction((movement) => {
            if (startPos.current) {
                const dist = Cartesian2.distance(startPos.current, movement.endPosition);
                // If moved more than 10 pixels, treat as drag/pan and cancel long press
                if (dist > 10) {
                    cancelLongPress();
                    // Also clear startPos to prevent ALL click actions (it's a drag)
                    startPos.current = null;
                }
            }
        }, ScreenSpaceEventType.MOUSE_MOVE);

        // LEFT UP: Handle Short Click vs Long Press release
        handler.setInputAction((click) => {
            // 1. If timer is still running, it means < 2 seconds have passed
            // AND we haven't dragged too far (startPos.current would be null if we did)
            if (longPressTimer.current && startPos.current) {
                // This is a VALID SHORT CLICK (Tap)
                cancelLongPress(); // Stop the long press timer
                handlePick(click.position);
            } else {
                // Either long press already happened, or it was a drag
                cancelLongPress();
            }
        }, ScreenSpaceEventType.LEFT_UP);

        const handlePick = (position) => {
            // Debug log
            console.log(`[GlobeViewer] Click at ${position.x}, ${position.y}`);

            // Use drillPick to get all objects at this pixel (handles overlapping labels/billboards)
            const pickedObjects = viewer.scene.drillPick(position, 10); // Check top 10 things

            let foundBoat = null;

            if (pickedObjects && pickedObjects.length > 0) {
                for (const pickedObject of pickedObjects) {
                    // pickedObject.id is the Entity instance if we hit an Entity
                    const entity = pickedObject.id;
                    const primitive = pickedObject.primitive;

                    let pickedMmsi = null;

                    if (entity && entity.id) {
                        // It's likely a Cesium Entity, id is the string MMSI
                        pickedMmsi = entity.id;
                    } else if (primitive && primitive.id) {
                        // Check primitive
                        if (typeof primitive.id === 'object' && primitive.id.MetaData) {
                            foundBoat = primitive.id;
                            break;
                        }
                        pickedMmsi = primitive.id;
                    }

                    if (pickedMmsi) {
                        const mmsi = Number(pickedMmsi);
                        if (entityMap.current.has(mmsi)) {
                            // Found in our map - ensure we use the latest boats list
                            const boat = boatsRef.current.find(b => b.MetaData?.MMSI === mmsi);
                            if (boat) {
                                foundBoat = boat;
                                break;
                            }
                        }
                    }
                }
            }

            if (foundBoat) {
                onSelectBoat(foundBoat);
            } else {
                console.log("[GlobeViewer] No boat found at cursor. Deselecting.");
                onSelectBoat(null);
            }
        };

        const handleLongPress = (screenPos) => {
            try {
                // Pick ellipsoid (ignoring entities) to get lat/lon
                const cartesian = viewer.scene.camera.pickEllipsoid(screenPos, viewer.scene.globe.ellipsoid);
                if (cartesian) {
                    console.log("[GlobeViewer] Long press detected, flying to location...");

                    // Fly camera to LOOK AT the new location (same as recenter logic)
                    const sphere = new BoundingSphere(cartesian, 5000);

                    // Convert clicked point to Lat/Lon for state update
                    const cartographic = Cartographic.fromCartesian(cartesian);
                    const newLoc = {
                        lat: CesiumMath.toDegrees(cartographic.latitude),
                        lon: CesiumMath.toDegrees(cartographic.longitude),
                        heading: 0 // Reset or keep? Recenter logic uses 0.
                    };

                    viewer.camera.flyToBoundingSphere(sphere, {
                        duration: 2.0,
                        offset: new HeadingPitchRange(viewer.camera.heading, CesiumMath.toRadians(-45), 9000), // Keep current heading, enforce 45deg pitch, 9000m range
                        complete: () => {
                            // Update the app's source of truth for location
                            if (onLocationUpdate) {
                                console.log("[GlobeViewer] Fly complete. Updating user location:", newLoc);
                                onLocationUpdate(newLoc);
                            }
                        }
                    });
                }
            } catch (e) {
                console.warn("[GlobeViewer] Long press error:", e);
            }
        };

        return () => {
            cancelLongPress();
            handler.destroy();
        };
    }, [onSelectBoat, cesiumInstance, onLocationUpdate]);


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
            {longPressFeedback && (
                <LongPressProgress x={longPressFeedback.x} y={longPressFeedback.y} />
            )}
            <Viewer
                ref={(e) => {
                    viewerRef.current = e;
                    if (e?.cesiumElement) {
                        setCesiumInstance(e.cesiumElement);
                    }
                }}
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

                {/* Selection Ring */}
                {selectedBoat && selectedBoat.Message?.PositionReport && (
                    <Entity
                        position={Cartesian3.fromDegrees(
                            Number(selectedBoat.Message.PositionReport.Longitude),
                            Number(selectedBoat.Message.PositionReport.Latitude)
                        )}
                        name="Selection Ring"
                    >
                        <EllipseGraphics
                            semiMajorAxis={250} // 250m radius ring
                            semiMinorAxis={250}
                            height={10}
                            fill={false}
                            outline={true}
                            outlineColor={Color.YELLOW}
                            outlineWidth={3}
                        />
                        {/* Inner pulsating dot or similar could go here */}
                    </Entity>
                )}
            </Viewer>
        </div>
    );
};

export default GlobeViewer;
