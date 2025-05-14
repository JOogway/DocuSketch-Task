const EPSILON = 1e-9; 

export function normalizeVector(vector) {
    if (!vector) { 
        return { 
            x: 0, 
            y: 0 
        }; 
    }
    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
    if (length < EPSILON) {
        return { 
            x: 0, 
            y: 0 
        };
    }
    return { 
        x: vector.x / length, 
        y: vector.y / length 
    };
}

export function dotProduct(vector1, vector2) {
    if (!vector1 || !vector2) { 
        return 0; 
    }
    return vector1.x * vector2.x + vector1.y * vector2.y;
}

export function subtractVectors(point1, point2) {
    if (!point1 || !point2) { 
        return { 
            x: 0, 
            y: 0 
        }; 
    }
    return { 
        x: point1.x - point2.x, 
        y: point1.y - point2.y 
    };
}

export function addVectors(point1, point2) {
    if (!point1 || !point2) { 
        return { 
            x: 0, 
            y: 0 
        }; 
    }
    return { 
        x: point1.x + point2.x, 
        y: point1.y + point2.y 
    };
}

export function scaleVector(vector, scalar) {
    if (!vector) { return { x: 0, y: 0 }; }
    return { x: vector.x * scalar, y: vector.y * scalar };
}

export function pointsAreEqual(point1, point2, tolerance = EPSILON) {
    if (!point1 || !point2) {
        return false; 
    }
    return Math.abs(point1.x - point2.x) < tolerance && Math.abs(point1.y - point2.y) < tolerance;
}

export function calculateDistance(point1, point2) {
    if (!point1 || !point2) {
        console.warn("calculateDistance: Invalid points received.", point1, point2);
        return 0;
    }
    const deltaX = point2.x - point1.x;
    const deltaY = point2.y - point1.y;
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

export function getWallSegments(orderedRoomPoints) {
    const segments = [];
    if (!orderedRoomPoints || orderedRoomPoints.length < 2) {
        return segments;
    }
    for (let i = 0; i < orderedRoomPoints.length; i++) {
        segments.push([orderedRoomPoints[i], orderedRoomPoints[(i + 1) % orderedRoomPoints.length]]);
    }
    return segments;
}

export function segmentIntersection(p1, p2, p3, p4) {
    if (!p1 || !p2 || !p3 || !p4) { return null; }
    if ((Math.abs(p1.x - p2.x) < EPSILON && Math.abs(p1.y - p2.y) < EPSILON) || 
        (Math.abs(p3.x - p4.x) < EPSILON && Math.abs(p3.y - p4.y) < EPSILON)) {
        return null;
    }
    const denominator = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (Math.abs(denominator) < EPSILON) { return null; }
    let ua_numerator = (p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x);
    let ub_numerator = (p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x);
    let ua = ua_numerator / denominator;
    let ub = ub_numerator / denominator;
    if (ua < -EPSILON || ua > 1 + EPSILON || ub < -EPSILON || ub > 1 + EPSILON) { 
        return null; 
    }
    return {
        x: p1.x + ua * (p2.x - p1.x), y: p1.y + ua * (p2.y - p1.y) 
    };
}

export function linePolygonIntersection(lineOriginPoint, lineDirectionVector, polygonPoints) {
    if (!lineOriginPoint || !lineDirectionVector || !polygonPoints || polygonPoints.length < 2) {
        return null;
    }
    if (Math.abs(lineDirectionVector.x) < EPSILON && Math.abs(lineDirectionVector.y) < EPSILON) {
        console.warn("linePolygonIntersection: lineDirectionVector is a zero vector.");
        return null;
    }
    const intersections = [];
    const largeFactor = 1e7; 
    const linePoint1 = { 
        x: lineOriginPoint.x - lineDirectionVector.x * largeFactor, 
        y: lineOriginPoint.y - lineDirectionVector.y * largeFactor 
    };
    const linePoint2 = { 
        x: lineOriginPoint.x + lineDirectionVector.x * largeFactor, 
        y: lineOriginPoint.y + lineDirectionVector.y * largeFactor 
    };
    const wallSegments = getWallSegments(polygonPoints);
    for (const wall of wallSegments) {
        const intersectionPoint = segmentIntersection(linePoint1, linePoint2, wall[0], wall[1]);
        if (intersectionPoint) {
            let t_param;
            if (Math.abs(lineDirectionVector.x) > EPSILON) {
                t_param = (intersectionPoint.x - lineOriginPoint.x) / lineDirectionVector.x;
            } else if (Math.abs(lineDirectionVector.y) > EPSILON) {
                t_param = (intersectionPoint.y - lineOriginPoint.y) / lineDirectionVector.y;
            } else { 
                continue; 
            }
            intersections.push({ point: intersectionPoint, t: t_param });
        }
    }
    if (intersections.length < 2) { return null; }
    intersections.sort((a, b) => a.t - b.t);
    const uniqueIntersectionPoints = [];
    if (intersections.length > 0) {
        uniqueIntersectionPoints.push(intersections[0].point);
        for (let i = 1; i < intersections.length; i++) {
            if (!pointsAreEqual(intersections[i].point, intersections[i-1].point, 1e-5)) {
                uniqueIntersectionPoints.push(intersections[i].point);
            }
        }
    }
    if (uniqueIntersectionPoints.length < 2) { 
        return null; 
    }
    return [uniqueIntersectionPoints[0], uniqueIntersectionPoints[uniqueIntersectionPoints.length - 1]];
}