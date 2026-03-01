import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as Cesium from 'cesium';
import { Viewer, Entity, PointGraphics, EllipseGraphics, LabelGraphics } from 'resium';
const { Cartesian3, Color, ScreenSpaceEventHandler, ScreenSpaceEventType, defined, BillboardCollection, LabelCollection, LabelStyle, Math: CesiumMath, Cartesian2, VerticalOrigin, HorizontalOrigin, HeadingPitchRoll, BoundingSphere, HeadingPitchRange, Cartographic, ImageMaterialProperty, JulianDate } = Cesium;
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

const GlobeViewer = ({ userLocation, locationSource, boats, selectedBoat, onSelectBoat, onLocationUpdate, recenterTrigger, enabledVesselTypes, showLabels, onCameraChange }) => {
    const viewerRef = useRef(null);
    const [cesiumInstance, setCesiumInstance] = React.useState(null);
    const [longPressFeedback, setLongPressFeedback] = React.useState(null);
    const flownToPriority = useRef(-1); // -1: none, 1: default, 2: search, 3: gps

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
    const entityMap = useRef(new Map()); // MMSI -> { entity }

    // Memoize sorted and filtered boats
    const sortedBoats = useMemo(() => {
        const filtered = boats.filter(boat => {
            const category = getVesselCategory(boat.static?.Type);
            return enabledVesselTypes[category] !== false;
        });

        return filtered.sort((a, b) => {
            const sizeA = getVesselSize(a);
            const sizeB = getVesselSize(b);
            return sizeB - sizeA;
        });
    }, [boats, enabledVesselTypes]);

    useEffect(() => {
        const viewer = cesiumInstance;
        if (!viewer) return;

        const currentMmsis = new Set();
        sortedBoats.forEach(boat => {
            const mmsi = boat.MetaData?.MMSI;
            if (!mmsi) return;

            // Extract position & heading generically from any position-bearing message
            let lat, lon, shipHeading = 0;
            const innerMsg = boat.Message ? boat.Message[boat.MessageType] : null;

            if (innerMsg && innerMsg.Latitude !== undefined && innerMsg.Longitude !== undefined) {
                lat = innerMsg.Latitude;
                lon = innerMsg.Longitude;

                // Extract heading/cog
                if (innerMsg.TrueHeading !== undefined && innerMsg.TrueHeading < 360) {
                    shipHeading = innerMsg.TrueHeading;
                } else if (innerMsg.Cog !== undefined) {
                    shipHeading = innerMsg.Cog;
                }
            } else if (boat.MetaData?.latitude && boat.MetaData?.longitude) {
                lat = boat.MetaData.latitude;
                lon = boat.MetaData.longitude;
            }

            if (lat === undefined || lon === undefined) return;

            const position = Cartesian3.fromDegrees(Number(lon), Number(lat));
            currentMmsis.add(mmsi);
            const color = getShipColor(boat.static?.Type);
            const rotation = -CesiumMath.toRadians(shipHeading);

            let entry = entityMap.current.get(mmsi);

            if (!entry) {
                const entity = viewer.entities.add({
                    position: position,
                    id: String(mmsi),
                    ellipse: {
                        semiMajorAxis: 80.0,
                        semiMinorAxis: 80.0,
                        material: new Cesium.ImageMaterialProperty({
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
                        pixelOffset: new Cartesian2(0, -25),
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                        show: showLabels
                    }
                });

                entry = { entity: entity };
                entityMap.current.set(mmsi, entry);
            } else {
                entry.entity.position = position;
                entry.entity.ellipse.rotation = rotation;
                if (entry.entity.ellipse.material.color) {
                    entry.entity.ellipse.material.color = color;
                }
                if (entry.entity.label) {
                    if (boat.MetaData?.ShipName) {
                        entry.entity.label.text = boat.MetaData.ShipName;
                    }
                    if (!showLabels) {
                        entry.entity.label.show = false;
                    }
                }
            }
        });

        for (const [mmsi, entry] of entityMap.current.entries()) {
            if (!currentMmsis.has(mmsi)) {
                viewer.entities.remove(entry.entity);
                entityMap.current.delete(mmsi);
            }
        }
    }, [sortedBoats, showLabels, cesiumInstance]);

    // 2.5 Collision Detection (PostRender)
    useEffect(() => {
        const viewer = cesiumInstance;
        if (!viewer) return;

        const scene = viewer.scene;
        const removePostRender = scene.postRender.addEventListener(() => {
            if (!showLabels) return;

            const occupiedRects = [];
            const time = viewer.clock.currentTime;

            sortedBoats.forEach(boat => {
                const mmsi = boat.MetaData?.MMSI;
                if (!mmsi) return;

                const entry = entityMap.current.get(mmsi);
                if (!entry || !entry.entity || !entry.entity.label) return;

                const entity = entry.entity;
                const position = entity.position?.getValue(time);
                if (!position) return;

                const canvasPosition = scene.cartesianToCanvasCoordinates(position);
                if (!canvasPosition) {
                    entity.label.show = false;
                    return;
                }

                const text = boat.MetaData?.ShipName || '';
                const width = text.length * 8 + 10;
                const height = 20;
                const labelX = canvasPosition.x;
                const labelY = canvasPosition.y - 25;

                const box = {
                    x: labelX - width / 2,
                    y: labelY - height,
                    w: width,
                    h: height
                };

                let overlap = false;
                for (const rect of occupiedRects) {
                    if (box.x < rect.x + rect.w && box.x + box.w > rect.x && box.y < rect.y + rect.h && box.y + box.h > rect.y) {
                        overlap = true;
                        break;
                    }
                }

                if (overlap) {
                    entity.label.show = false;
                } else {
                    entity.label.show = true;
                    occupiedRects.push(box);
                }
            });
        });

        return () => {
            removePostRender();
        };
    }, [sortedBoats, showLabels, cesiumInstance]);

    // 3. Picking & Interaction Handler
    useEffect(() => {
        const viewer = cesiumInstance;
        if (!viewer || !onSelectBoat) return;

        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
        const longPressTimer = { current: null };
        const startPos = { current: null };

        const cancelLongPress = () => {
            if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }
            startPos.current = null;
            setLongPressFeedback(null);
        };

        handler.setInputAction((click) => {
            startPos.current = Cartesian2.clone(click.position);
            setLongPressFeedback({ x: click.position.x, y: click.position.y });
            longPressTimer.current = setTimeout(() => {
                handleLongPress(click.position);
                longPressTimer.current = null;
                startPos.current = null;
                setLongPressFeedback(null);
            }, 2000);
        }, ScreenSpaceEventType.LEFT_DOWN);

        handler.setInputAction((movement) => {
            if (startPos.current) {
                const dist = Cartesian2.distance(startPos.current, movement.endPosition);
                if (dist > 10) {
                    cancelLongPress();
                    startPos.current = null;
                }
            }
        }, ScreenSpaceEventType.MOUSE_MOVE);

        handler.setInputAction((click) => {
            if (longPressTimer.current && startPos.current) {
                cancelLongPress();
                handlePick(click.position);
            } else {
                cancelLongPress();
            }
        }, ScreenSpaceEventType.LEFT_UP);

        const handlePick = (position) => {
            const pickedObjects = viewer.scene.drillPick(position, 10);
            let foundBoat = null;

            if (pickedObjects && pickedObjects.length > 0) {
                for (const pickedObject of pickedObjects) {
                    const entity = pickedObject.id;
                    if (entity && entity.id && entityMap.current.has(Number(entity.id))) {
                        const boat = boatsRef.current.find(b => b.MetaData?.MMSI === Number(entity.id));
                        if (boat) {
                            foundBoat = boat;
                            break;
                        }
                    }
                }
            }
            onSelectBoat(foundBoat);
        };

        const handleLongPress = (screenPos) => {
            try {
                const cartesian = viewer.scene.camera.pickEllipsoid(screenPos, viewer.scene.globe.ellipsoid);
                if (cartesian) {
                    const sphere = new BoundingSphere(cartesian, 5000);
                    const cartographic = Cartographic.fromCartesian(cartesian);
                    const newLoc = {
                        lat: CesiumMath.toDegrees(cartographic.latitude),
                        lon: CesiumMath.toDegrees(cartographic.longitude),
                        heading: 0
                    };

                    viewer.camera.flyToBoundingSphere(sphere, {
                        duration: 2.0,
                        offset: new HeadingPitchRange(viewer.camera.heading, CesiumMath.toRadians(-45), 9000),
                        complete: () => {
                            if (onLocationUpdate) onLocationUpdate(newLoc);
                        }
                    });
                }
            } catch (e) { console.warn(e); }
        };

        return () => {
            cancelLongPress();
            handler.destroy();
        };
    }, [cesiumInstance, onSelectBoat, onLocationUpdate]);

    // 3.5 Camera Change Listener (Focal Point)
    useEffect(() => {
        const viewer = cesiumInstance;
        if (!viewer || !onCameraChange) return;

        const camera = viewer.scene.camera;
        const handleMoveEnd = () => {
            const windowCenter = new Cartesian2(viewer.scene.canvas.clientWidth / 2, viewer.scene.canvas.clientHeight / 2);
            const ray = camera.getPickRay(windowCenter);
            const position = viewer.scene.globe.pick(ray, viewer.scene);

            if (position) {
                const cartographic = Cartographic.fromCartesian(position);
                onCameraChange(CesiumMath.toDegrees(cartographic.latitude), CesiumMath.toDegrees(cartographic.longitude));
            }
        };

        const removeListener = camera.moveEnd.addEventListener(handleMoveEnd);
        return () => removeListener();
    }, [cesiumInstance, onCameraChange]);

    // 4. Initial Fly-in (Priority Based)
    useEffect(() => {
        if (!cesiumInstance || !userLocation || !locationSource) return;

        const priorities = { 'default': 1, 'search': 2, 'gps': 3, 'map': 0 };
        const currentPriority = priorities[locationSource] || 0;

        // Only fly if the new location has a higher priority than our last fly-in
        if (currentPriority > flownToPriority.current) {
            console.log(`[Globe] ✈️ Flying to ${locationSource} (priority ${currentPriority} > ${flownToPriority.current})`);
            const camera = cesiumInstance.camera;
            const target = Cartesian3.fromDegrees(userLocation.lon, userLocation.lat, 0);

            // Tighter zoom for GPS/Search
            const range = currentPriority > 1 ? 5000 : 9000;
            const sphereSize = currentPriority > 1 ? 2000 : 5000;

            camera.flyToBoundingSphere(new BoundingSphere(target, sphereSize), {
                duration: currentPriority > 1 ? 2.5 : 2,
                offset: new HeadingPitchRange(0, CesiumMath.toRadians(-45), range)
            });

            flownToPriority.current = currentPriority;
        }
    }, [cesiumInstance, userLocation, locationSource]);

    // 5. Manual Recenter
    useEffect(() => {
        if (recenterTrigger && cesiumInstance && userLocation) {
            const camera = cesiumInstance.camera;
            const target = Cartesian3.fromDegrees(userLocation.lon, userLocation.lat, 0);
            camera.flyToBoundingSphere(new BoundingSphere(target, 5000), {
                duration: 1.5,
                offset: new HeadingPitchRange(0, CesiumMath.toRadians(-45), 9000)
            });
        }
    }, [recenterTrigger, cesiumInstance, userLocation]);

    return (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            {longPressFeedback && <LongPressProgress x={longPressFeedback.x} y={longPressFeedback.y} />}
            <Viewer
                ref={(e) => { if (e?.cesiumElement) setCesiumInstance(e.cesiumElement); }}
                full animation={false} timeline={false} infoBox={false} selectionIndicator={true}
                baseLayerPicker={false} navigationHelpButton={false} homeButton={false} geocoder={false}
                sceneModePicker={false} fullscreenButton={false}
            >
                {userLocation && (
                    <Entity position={Cartesian3.fromDegrees(userLocation.lon, userLocation.lat)} name="You">
                        <PointGraphics pixelSize={12} color={Color.CYAN} outlineColor={Color.WHITE} outlineWidth={2} />
                    </Entity>
                )}

                {userLocation && [1, 2, 5, 10, 25, 50].map((miles) => {
                    const meters = miles * 1609.34;
                    const latOffset = meters / 111132;
                    return (
                        <React.Fragment key={`ring-group-${miles}`}>
                            <Entity position={Cartesian3.fromDegrees(userLocation.lon, userLocation.lat)}>
                                <EllipseGraphics semiMajorAxis={meters} semiMinorAxis={meters} fill={false} outline={true} outlineColor={Color.WHITE.withAlpha(0.3)} outlineWidth={1} />
                            </Entity>
                            <Entity position={Cartesian3.fromDegrees(userLocation.lon, userLocation.lat + latOffset)}>
                                <LabelGraphics text={`${miles} NM`} font='600 13px Inter, sans-serif' fillColor={Color.WHITE} showBackground={true} backgroundColor={Color.BLACK.withAlpha(0.6)} backgroundPadding={new Cartesian2(4, 2)} disableDepthTestDistance={Number.POSITIVE_INFINITY} verticalOrigin={VerticalOrigin.BOTTOM} pixelOffset={new Cartesian2(0, -5)} />
                            </Entity>
                        </React.Fragment>
                    );
                })}

                {selectedBoat && selectedBoat.Message?.PositionReport && (
                    <Entity position={Cartesian3.fromDegrees(Number(selectedBoat.Message.PositionReport.Longitude), Number(selectedBoat.Message.PositionReport.Latitude))}>
                        <EllipseGraphics semiMajorAxis={250} semiMinorAxis={250} fill={false} outline={true} outlineColor={Color.YELLOW} outlineWidth={3} />
                    </Entity>
                )}
            </Viewer>
        </div>
    );
};

export default GlobeViewer;
