export function convertRawRoomDataToOrderedCorners(jsonData, roomName = "Unknown Room") {
    if (!jsonData || !jsonData.corners || !jsonData.walls || jsonData.corners.length === 0) {
        console.warn(`[Converter] Invalid or empty raw room data for ${roomName}.`, jsonData);
        return [];
    }

    const cornersMap = new Map();
    jsonData.corners.forEach(corner => {
        cornersMap.set(corner.id, corner);
    });

    const orderedPoints = [];
    const visitedCornerIds = new Set();

    if (jsonData.corners.length === 0) {
        return [];
    }

    let currentCorner = cornersMap.get(jsonData.corners[0].id);
    if (!currentCorner) {
        console.error(`[Converter] Could not find starting corner for ${roomName}.`);
        return [];
    }
    const initialCornerId = currentCorner.id;
    let safetyCount = 0; // Otherwise you might 'yeet' your memory out of the browser, if points are somehow wrong...
    const maxCornersToVisit = jsonData.corners.length;

    while (safetyCount <= maxCornersToVisit) {
        if (visitedCornerIds.has(currentCorner.id)) {
            // If it's the initial corner, the polygon is closed.
            if (currentCorner.id === initialCornerId) {
                break; 
            } else {
                console.warn(`[Converter] Pathfinding for ${roomName} revisited non-start corner ${currentCorner.id} prematurely. Probably data is malformed.`);
                break;
            }
        }

        orderedPoints.push({ x: currentCorner.x, y: currentCorner.y });
        visitedCornerIds.add(currentCorner.id);

        if (orderedPoints.length === maxCornersToVisit) {
             // TODO maybe add additional safeguard here?
        }

        let nextWallId = null;
        if (currentCorner.wallStarts && currentCorner.wallStarts.length > 0) {
            nextWallId = currentCorner.wallStarts[0].id;
        } else {
            console.warn(`[Converter] Corner ${currentCorner.id} ('${currentCorner.x}, ${currentCorner.y}') in ${roomName} has no 'wallStarts'. Path traversal cannot continue.`);
            break;
        }

        let foundNextCorner = false;
        // Find the other corner that this 'nextWallId' ends at. TODO improve it later.
        for (const potentialNextCorner of jsonData.corners) {
            if (potentialNextCorner.id === currentCorner.id) {
                continue; // Don't link to self.
            }
            if (potentialNextCorner.wallEnds && potentialNextCorner.wallEnds.some(wallEnd => wallEnd.id === nextWallId)) {
                currentCorner = cornersMap.get(potentialNextCorner.id); // Get the full corner object
                if (!currentCorner) {
                    console.error(`[Converter] Corner ID ${potentialNextCorner.id} found in wallEnds but not in cornersMap for ${roomName}.`);
                    foundNextCorner = false;
                    break;
                }
                foundNextCorner = true;
                break;
            }
        }

        if (!foundNextCorner) {
            const initialCornerObject = cornersMap.get(initialCornerId);
            if (initialCornerObject.wallEnds && initialCornerObject.wallEnds.some(wallEnd => wallEnd.id === nextWallId)) {
                currentCorner = initialCornerObject;
            } else {
                console.warn(`[Converter] Could not find the next corner for wall ${nextWallId} starting from corner ${currentCorner.id} ('${currentCorner.x}, ${currentCorner.y}') in ${roomName}. Path may be broken or incomplete.`);
                break;
            }
        }
        safetyCount++;
    }

    if (orderedPoints.length !== maxCornersToVisit && safetyCount > maxCornersToVisit) {
         console.warn(`[Converter] For ${roomName}, path traversal stopped due to safety count. Processed ${orderedPoints.length}/${maxCornersToVisit} points.`);//Should never happen with proper data input though...
    } 


    return orderedPoints;
}