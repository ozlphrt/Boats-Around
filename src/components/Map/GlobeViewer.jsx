
import React, { useEffect, useRef } from 'react';
import { Viewer, Entity, PointGraphics, EllipseGraphics, LabelGraphics } from 'resium';
import { Cartesian3, Color, ScreenSpaceEventHandler, ScreenSpaceEventType, defined, BillboardCollection, Math as CesiumMath, Cartesian2, VerticalOrigin } from 'cesium';

// Helper to determine ship color by type
const getShipColor = (typeCode) => {
    if (!typeCode) return Color.GRAY;
    if (typeCode >= 70 && typeCode < 80) return Color.LIGHTGREEN; // Cargo
    if (typeCode >= 80 && typeCode < 90) return Color.INDIANRED; // Tanker
    if (typeCode >= 60 && typeCode < 70) return Color.SKYBLUE; // Passenger
    if (typeCode === 30) return Color.ORANGE; // Fishing
    if (typeCode >= 36 && typeCode <= 37) return Color.MAGENTA; // Pleasure
    return Color.LIGHTSLATEGRAY;
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

const GlobeViewer = ({ userLocation, boats, onSelectBoat, recenterTrigger }) => {
    const viewerRef = useRef(null);
    const primitivesRef = useRef(null);
    const hasFlownToUser = useRef(false);

    // 1. Initial Access & Collection Setup
    useEffect(() => {
        let collection = null;
        if (viewerRef.current && viewerRef.current.cesiumElement) {
            const scene = viewerRef.current.cesiumElement.scene;

            // Cleanup old if any (safety)
            if (primitivesRef.current) {
                scene.primitives.remove(primitivesRef.current);
            }

            // We use a BillboardCollection for oriented triangles
            collection = scene.primitives.add(new BillboardCollection());
            primitivesRef.current = collection;
        }

        return () => {
            if (viewerRef.current && viewerRef.current.cesiumElement && collection) {
                viewerRef.current.cesiumElement.scene.primitives.remove(collection);
            }
            primitivesRef.current = null;
        };
    }, [viewerRef.current]);

    // 2. Render Boats (Efficiently)
    useEffect(() => {
        if (!primitivesRef.current || !viewerRef.current?.cesiumElement) return;

        const collection = primitivesRef.current;
        collection.removeAll();

        boats.forEach(boat => {
            const lat = boat.Message?.PositionReport?.Latitude;
            const lon = boat.Message?.PositionReport?.Longitude;
            const heading = boat.Message?.PositionReport?.TrueHeading;
            const cog = boat.Message?.PositionReport?.Cog;

            if (lat === undefined || lon === undefined) return;

            const position = Cartesian3.fromDegrees(Number(lon), Number(lat));
            const color = getShipColor(boat.static?.Type);

            // Determine rotation (rad)
            // TrueHeading 511 means not available, fallback to COG
            let shipHeading = 0;
            if (heading !== undefined && heading < 360) {
                shipHeading = heading;
            } else if (cog !== undefined) {
                shipHeading = cog;
            }

            // Cesium rotation: 0 is up, positive is CCW. AIS Heading: 0 is North, positive is CW.
            const rotation = -CesiumMath.toRadians(shipHeading);

            // Add billboard
            collection.add({
                position: position,
                image: shipCanvas,
                color: color,
                width: 16,
                height: 16,
                rotation: rotation,
                id: boat,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            });
        });

        // Force render
        viewerRef.current.cesiumElement.scene.requestRender();

    }, [boats]);

    // 3. Picking Handler
    useEffect(() => {
        if (!viewerRef.current || !viewerRef.current.cesiumElement || !onSelectBoat) return;

        const viewer = viewerRef.current.cesiumElement;
        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

        handler.setInputAction((click) => {
            const pickedObject = viewer.scene.pick(click.position);
            if (defined(pickedObject) && pickedObject.id) {
                // If it's a point from our collection, id is the boat object
                // If it's the User Location Entity, id is the Entity object
                if (pickedObject.id.MetaData) {
                    onSelectBoat(pickedObject.id);
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


    // 4. Initial Fly-in
    useEffect(() => {
        if (viewerRef.current && viewerRef.current.cesiumElement && userLocation && !hasFlownToUser.current) {
            try {
                viewerRef.current.cesiumElement.camera.flyTo({
                    destination: Cartesian3.fromDegrees(userLocation.lon, userLocation.lat, 5000),
                    duration: 2
                });
                hasFlownToUser.current = true;
            } catch (e) {
                console.warn("GlobeViewer: Initial flyTo failed", e);
            }
        }
    }, [userLocation]);

    // 5. Manual Recenter
    useEffect(() => {
        if (recenterTrigger && viewerRef.current && viewerRef.current.cesiumElement && userLocation) {
            try {
                viewerRef.current.cesiumElement.camera.flyTo({
                    destination: Cartesian3.fromDegrees(userLocation.lon, userLocation.lat, 5000),
                    duration: 1.5
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
                                    text={`${miles} ${miles === 1 ? 'mile' : 'miles'}`}
                                    font="10px Inter, sans-serif"
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
