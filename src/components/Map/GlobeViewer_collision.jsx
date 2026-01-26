
// 2.5 Collision Detection (PostRender)
useEffect(() => {
    const viewer = cesiumInstance;
    if (!viewer) return;

    const scene = viewer.scene;
    const removePostRender = scene.postRender.addEventListener(() => {
        if (!showLabels) return;

        const occupiedRects = []; // Array of {x, y, w, h}
        const time = viewer.clock.currentTime;

        // Iterate sorted boats (largest first)
        // We use the Ref to ensure we have the latest list even inside the callback closure if strict mode or stale closures bite us
        // But sortedBoats prop is good enough if we depend on it in useEffect
        // Actually, postRender is a persistent callback, so we should rely on refs or re-bind.
        // Using logic inside useEffect with [sortedBoats] dep causes re-bind on boat update, which is fine.

        sortedBoats.forEach(boat => {
            const mmsi = boat.MetaData?.MMSI;
            if (!mmsi) return;

            const entry = entityMap.current.get(mmsi);
            if (!entry || !entry.entity || !entry.entity.label) return;

            const entity = entry.entity;

            // Get position
            // We stored position in the entity. For constant property, getValue works.
            // Or we can use the position we calculated.
            // Let's use entity position.
            let position = entity.position?.getValue(time);

            if (!position) return;

            // Convert to screen coordinates
            const canvasPosition = SceneTransforms.wgs84ToWindowCoordinates(scene, position);

            if (!canvasPosition) {
                // Off screen or behind camera
                entity.label.show = false;
                return;
            }

            // Define label bounding box
            // Label is roughly centered horizontally, and above the boat vertically
            // Offset is (0, -25)
            // Font is 12px
            // Width approximation: char count * 7px + padding
            const text = boat.MetaData?.ShipName || '';
            const width = text.length * 8 + 10;
            const height = 20;

            // Label anchor position on screen
            const labelX = canvasPosition.x;
            const labelY = canvasPosition.y - 25; // Apply pixel offset

            // Bounding box centered at labelX, labelY
            // Since verticalOrigin is BOTTOM, the label is ABOVE labelY
            // Actually, verticalOrigin: VerticalOrigin.BOTTOM means the anchor is at the bottom of the label.
            // So the label extends upwards from labelY.
            const box = {
                x: labelX - width / 2,
                y: labelY - height,
                w: width,
                h: height
            };

            // Check collision
            let overlap = false;
            for (const rect of occupiedRects) {
                if (
                    box.x < rect.x + rect.w &&
                    box.x + box.w > rect.x &&
                    box.y < rect.y + rect.h &&
                    box.y + box.h > rect.y
                ) {
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
