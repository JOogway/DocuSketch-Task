import { convertRawRoomDataToOrderedCorners } from "./converter-json.js";
import {
    normalizeVector,
    dotProduct,
    subtractVectors,
    pointsAreEqual,
    getWallSegments,
    linePolygonIntersection,
    calculateDistance
} from "./geometric-calculus.js";

// ##### DOM Elements for Labels #####
const lengthValueSpan = document.getElementById('lengthValueLabel');
const widthValueSpan = document.getElementById('widthValueLabel');
const canvas = document.getElementById('roomCanvas');

// ##### Canvas and Context #####
if (!canvas) {
    throw new Error("Canvas element with ID 'roomCanvas' not found.");
}
const ctx = canvas.getContext('2d');
const canvasWidth = canvas.width;
const canvasHeight = canvas.height;
const basePadding = 50;

// ##### Color Constants for Dimensions #####
const LENGTH_LINE_COLOR = 'blue';
const WIDTH_LINE_COLOR = 'red';

// ##### Global Variables #####
let currentRoomDataStore = [];
let currentRoom = null;
let transformParams = null;
let lengthWidthPairs = [];
let currentPairIndex = 0;
let currentView = '2D';

// ##### 3D View Parameters #####
const ROOM_HEIGHT_DATA_RATIO = 0.3;
const OBLIQUE_ANGLE = Math.PI / 6;
const OBLIQUE_FACTOR = 0.5;
const PADDING_MULTIPLIER_3D = 1.6;

// ##### Coordinate Transformation #####
function calculateTransformParams(points) {
  const effectivePadding = currentView === '3D' ? basePadding * PADDING_MULTIPLIER_3D : basePadding;
  if (!points || points.length === 0) {
    return { minX: 0, minY: 0, maxY: 0, maxX: 0, scale: 1, effectivePadding: effectivePadding };
  }
  let minX = points[0].x, maxX = points[0].x;
  let minY = points[0].y, maxY = points[0].y;
  points.forEach(point => {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
  });
  const dataWidth = maxX - minX; const dataHeight = maxY - minY;
  const availableCanvasWidth = canvasWidth - 2 * effectivePadding;
  const availableCanvasHeight = canvasHeight - 2 * effectivePadding;
  let scale;
  if (dataWidth < 1e-6 && dataHeight < 1e-6) { 
    scale = 1; 
    } else if (dataWidth < 1e-6) { 
    scale = availableCanvasHeight > 0 && dataHeight > 0 ? availableCanvasHeight / dataHeight : 1; 
    } else if (dataHeight < 1e-6) { 
    scale = availableCanvasWidth > 0 && dataWidth > 0 ? availableCanvasWidth / dataWidth : 1; 
    }else { 
        scale = Math.min(availableCanvasWidth / dataWidth, availableCanvasHeight / dataHeight); 
        }
  if (!isFinite(scale) || scale <= 0) { 
    scale = 1; 
    }
  return { minX, minY, maxY, maxX, scale, effectivePadding: effectivePadding };
}

function transform2DPoint(point, transformParameters) {
  const canvasX = (point.x - transformParameters.minX) * transformParameters.scale + transformParameters.effectivePadding;
  const canvasY = (transformParameters.maxY - point.y) * transformParameters.scale + transformParameters.effectivePadding;
  return { x: canvasX, y: canvasY };
}

function project3DPoint(point, heightInOriginalUnits, transformParameters) {
  const floorPoint2D = transform2DPoint(point, transformParameters);
  const drawingAreaHeight = canvasHeight - 2 * transformParameters.effectivePadding;
  const drawingAreaWidth = canvasWidth - 2 * transformParameters.effectivePadding;
  const depthCueBase = floorPoint2D.y - transformParameters.effectivePadding;
  const normalizedDepthCue = drawingAreaHeight > 0 ? Math.max(0, Math.min(1, depthCueBase / drawingAreaHeight)) : 0;
  const obliqueXOffset = normalizedDepthCue * (drawingAreaWidth * 0.35) * OBLIQUE_FACTOR * Math.cos(OBLIQUE_ANGLE);
  const obliqueYOffset = normalizedDepthCue * (drawingAreaHeight * 0.35) * OBLIQUE_FACTOR * Math.sin(OBLIQUE_ANGLE);
  const screenSpaceHeight = heightInOriginalUnits * transformParameters.scale;
  const projectedX = floorPoint2D.x + obliqueXOffset;
  const projectedY = floorPoint2D.y - obliqueYOffset - screenSpaceHeight;
  return { x: projectedX, y: projectedY };
}

// ##### Drawing Functions #####
function getPolygonTransformedPoints(points, transformParameters, height = 0) {
  if (!points) { return []; }
  return points.map(point => {
    return currentView === '2D' ? transform2DPoint(point, transformParameters) : project3DPoint(point, height, transformParameters);
  });
}

function drawRoomShape(points, transformParameters) {
  const floorTransformedPoints = getPolygonTransformedPoints(points, transformParameters, 0);
  if (floorTransformedPoints.length < 2 || !points || points.length < 2) { 
    return; 
}
  ctx.beginPath(); ctx.moveTo(floorTransformedPoints[0].x, floorTransformedPoints[0].y);
  for (let i = 1; i < floorTransformedPoints.length; i++) { 
    ctx.lineTo(floorTransformedPoints[i].x, floorTransformedPoints[i].y); 
}
  ctx.closePath();
  let minTransformedX, minTransformedY = Infinity; 
  let maxTransformedX, maxTransformedY = -Infinity; 
  floorTransformedPoints.forEach(point => { 
    minTransformedX = Math.min(minTransformedX, point.x); 
    maxTransformedX = Math.max(maxTransformedX, point.x); 
    minTransformedY = Math.min(minTransformedY, point.y); 
    maxTransformedY = Math.max(maxTransformedY, point.y); 
});
  if (
    isFinite(minTransformedX) && 
    isFinite(maxTransformedX) && 
    isFinite(minTransformedY) && 
    isFinite(maxTransformedY) && 
    maxTransformedX > minTransformedX && 
    maxTransformedY > minTransformedY) {
    const gradient = ctx.createLinearGradient(minTransformedX, minTransformedY, maxTransformedX, maxTransformedY); 
    gradient.addColorStop(0, '#EAEAEA'); 
    gradient.addColorStop(1, '#D0D0D0'); 
    ctx.fillStyle = gradient;
  } else { 
    ctx.fillStyle = '#E0E0E0'; 
}
  ctx.fill(); 
  ctx.strokeStyle = '#555'; 
  ctx.lineWidth = (currentView === '2D' ? 2 : 1.5); 
  ctx.stroke();
  if (currentView === '3D') {
    const dataWidth = (transformParameters.maxX - transformParameters.minX); 
    const actualRoomHeightDataUnits = dataWidth * ROOM_HEIGHT_DATA_RATIO;
    const topTransformedPoints = getPolygonTransformedPoints(points, transformParameters, actualRoomHeightDataUnits);
    ctx.lineWidth = 1; 
    ctx.strokeStyle = '#777';
    for (let i = 0; i < points.length; i++) { 
        if (floorTransformedPoints[i] && topTransformedPoints[i]) { 
            ctx.beginPath(); 
            ctx.moveTo(floorTransformedPoints[i].x, floorTransformedPoints[i].y); 
            ctx.lineTo(topTransformedPoints[i].x, topTransformedPoints[i].y); 
            ctx.stroke(); 
        } 
    }
    if (topTransformedPoints.length >= 2) {
      ctx.beginPath(); 
      ctx.moveTo(topTransformedPoints[0].x, topTransformedPoints[0].y);
      for (let i = 1; i < topTransformedPoints.length; i++) { 
        if (topTransformedPoints[i]) { 
            ctx.lineTo(topTransformedPoints[i].x, 
                topTransformedPoints[i].y); 
            } 
        }
      ctx.closePath(); 
      ctx.strokeStyle = '#666'; 
      ctx.stroke();
    }
  }
}

function drawLengthWidth(pair, transformParameters) {
  if (!pair || !pair.lengthSeg || !pair.widthSeg || !transformParameters || !pair.lengthSeg[0] || !pair.widthSeg[0]) {
    return;
  }
  const lengthPoint1 = currentView === '2D' ? transform2DPoint(pair.lengthSeg[0], transformParameters) : project3DPoint(pair.lengthSeg[0], 0, transformParameters);
  const lengthPoint2 = currentView === '2D' ? transform2DPoint(pair.lengthSeg[1], transformParameters) : project3DPoint(pair.lengthSeg[1], 0, transformParameters);
  const widthPoint1 = currentView === '2D' ? transform2DPoint(pair.widthSeg[0], transformParameters) : project3DPoint(pair.widthSeg[0], 0, transformParameters);
  const widthPoint2 = currentView === '2D' ? transform2DPoint(pair.widthSeg[1], transformParameters) : project3DPoint(pair.widthSeg[1], 0, transformParameters);
  
  ctx.setLineDash([6, 6]);
  
  ctx.beginPath();
  ctx.moveTo(lengthPoint1.x, lengthPoint1.y);
  ctx.lineTo(lengthPoint2.x, lengthPoint2.y);
  ctx.strokeStyle = LENGTH_LINE_COLOR;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(widthPoint1.x, widthPoint1.y);
  ctx.lineTo(widthPoint2.x, widthPoint2.y);
  ctx.strokeStyle = WIDTH_LINE_COLOR;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  
  ctx.setLineDash([]);
}

// ##### Center out 3D figure #####
function get3DProjectedBoundingBox(roomCorners, transformParameters, currentLengthWidthPairs, currentLengthWidthPairIndex) {
  if (!roomCorners || roomCorners.length === 0 || !transformParameters) { return null; }
  const allProjectedPoints = []; const dataWidth = (transformParameters.maxX - transformParameters.minX); const actualRoomHeightDataUnits = dataWidth * ROOM_HEIGHT_DATA_RATIO;
  roomCorners.forEach(corner => { allProjectedPoints.push(project3DPoint(corner, 0, transformParameters)); allProjectedPoints.push(project3DPoint(corner, actualRoomHeightDataUnits, transformParameters)); });
  if (currentLengthWidthPairs && currentLengthWidthPairs.length > 0 && currentLengthWidthPairIndex < currentLengthWidthPairs.length) {
    const pair = currentLengthWidthPairs[currentLengthWidthPairIndex];
    if (pair && pair.lengthSeg && pair.lengthSeg.length === 2 && pair.widthSeg && pair.widthSeg.length === 2) {
      allProjectedPoints.push(project3DPoint(pair.lengthSeg[0], 0, transformParameters)); allProjectedPoints.push(project3DPoint(pair.lengthSeg[1], 0, transformParameters));
      allProjectedPoints.push(project3DPoint(pair.widthSeg[0], 0, transformParameters)); allProjectedPoints.push(project3DPoint(pair.widthSeg[1], 0, transformParameters));
    }
  }
  if (allProjectedPoints.length === 0) { return null; }
  let minProjectedX = Infinity, maxProjectedX = -Infinity, minProjectedY = Infinity, maxProjectedY = -Infinity;
  allProjectedPoints.forEach(point => { if (point && typeof point.x === 'number' && typeof point.y === 'number') { minProjectedX = Math.min(minProjectedX, point.x); maxProjectedX = Math.max(maxProjectedX, point.x); minProjectedY = Math.min(minProjectedY, point.y); maxProjectedY = Math.max(maxProjectedY, point.y); } });
  if (!isFinite(minProjectedX) || !isFinite(maxProjectedX) || !isFinite(minProjectedY) || !isFinite(maxProjectedY)) { return null; }
  return { minX: minProjectedX, maxX: maxProjectedX, minY: minProjectedY, maxY: maxProjectedY };
}

// ##### Label Update Function #####
function updateDimensionLabels(lengthValue, widthValue) {
    if (lengthValueSpan && widthValueSpan) {
        if (typeof lengthValue === 'number' && typeof widthValue === 'number') {
            lengthValueSpan.textContent = `${lengthValue.toFixed(2)} units`;
            lengthValueSpan.style.color = LENGTH_LINE_COLOR; 

            widthValueSpan.textContent = `${widthValue.toFixed(2)} units`;
            widthValueSpan.style.color = WIDTH_LINE_COLOR;   
        } else {
            lengthValueSpan.textContent = "N/A";
            lengthValueSpan.style.color = "";

            widthValueSpan.textContent = "N/A";
            widthValueSpan.style.color = "";
        }
    }
}

// ##### Core Logic (Dimensions Calculation - Merged Walls & Max Altitude Reach) #####
// TODO Sometimes it makes no sense, for example for t shape, figure out better algorithm.
function calculateAllLengthWidthPairs(roomPoints) {
    const newPairs = []; 
    if (!roomPoints || roomPoints.length < 3) { 
        console.warn("L/W Calc: Not enough points."); 
        return newPairs; 
    }
    const initialSegments = getWallSegments(roomPoints); 
    if (initialSegments.length === 0) { 
        console.warn("L/W Calc: No initial segments."); 
        return newPairs; 
    }
    const maximalWallSegments = [];
    if (initialSegments.length > 0) {
        let currentMergedStartPoint = initialSegments[0][0];
        let currentMergedEndPoint = initialSegments[0][1];
        let currentDelta = subtractVectors(currentMergedEndPoint, currentMergedStartPoint);
        let lastDirection = (Math.sqrt(dotProduct(currentDelta,currentDelta)) < 1e-9)?{x:0,y:0}:normalizeVector(currentDelta);
        for (let i = 1; i < initialSegments.length; i++) {
            const nextSegmentStartPoint = initialSegments[i][0];
            const nextSegmentEndPoint = initialSegments[i][1];
            const nextDirectionVector = subtractVectors(nextSegmentEndPoint, nextSegmentStartPoint);
            const nextDirection = (Math.sqrt(dotProduct(nextDirectionVector,nextDirectionVector)) < 1e-9)?{x:0,y:0}:normalizeVector(nextDirectionVector);
            const lastDirectionIsValid = Math.abs(lastDirection.x)>1e-9||Math.abs(lastDirection.y)>1e-9;
            const nextDirectionIsValid = Math.abs(nextDirection.x)>1e-9||Math.abs(nextDirection.y)>1e-9;
            let areCollinear = false;
            if (lastDirectionIsValid && nextDirectionIsValid) {
                areCollinear = dotProduct(lastDirection, nextDirection) > (1 - 1e-5);
            }
            const areContiguous = pointsAreEqual(currentMergedEndPoint, nextSegmentStartPoint);
            if (areCollinear && areContiguous) {
                currentMergedEndPoint = nextSegmentEndPoint;
                currentDelta = subtractVectors(currentMergedEndPoint, currentMergedStartPoint);
                lastDirection = (Math.sqrt(dotProduct(currentDelta,currentDelta)) < 1e-9)?{x:0,y:0}:normalizeVector(currentDelta);
        } else {
                if (currentMergedStartPoint && currentMergedEndPoint && !pointsAreEqual(currentMergedStartPoint, currentMergedEndPoint)) {
                    maximalWallSegments.push([currentMergedStartPoint, currentMergedEndPoint]);
                } currentMergedStartPoint = nextSegmentStartPoint;
                currentMergedEndPoint = nextSegmentEndPoint;
                lastDirection = nextDirectionIsValid ? nextDirection : {x:0,y:0};
            }
        }
        if (currentMergedStartPoint && currentMergedEndPoint && !pointsAreEqual(currentMergedStartPoint, currentMergedEndPoint)) {
            maximalWallSegments.push([currentMergedStartPoint, currentMergedEndPoint]);
        }
        if (maximalWallSegments.length > 1) {
            const firstMaxSegment = maximalWallSegments[0];
            const lastMaxSegment = maximalWallSegments[maximalWallSegments.length - 1];
            if (pointsAreEqual(lastMaxSegment[1], firstMaxSegment[0])) {
                const dirLastVector = subtractVectors(lastMaxSegment[1], lastMaxSegment[0]);
                const dirFirstVector = subtractVectors(firstMaxSegment[1], firstMaxSegment[0]);
                const dirLast = (Math.sqrt(dotProduct(dirLastVector,dirLastVector))<1e-9)?{x:0,y:0}:normalizeVector(dirLastVector);
                const dirFirst = (Math.sqrt(dotProduct(dirFirstVector,dirFirstVector))<1e-9)?{x:0,y:0}:normalizeVector(dirFirstVector);
                const lastDirIsValid = Math.abs(dirLast.x)>1e-9||Math.abs(dirLast.y)>1e-9;
                const firstDirIsValid = Math.abs(dirFirst.x)>1e-9||Math.abs(dirFirst.y)>1e-9;
                if (lastDirIsValid && firstDirIsValid && dotProduct(dirLast, dirFirst) > (1 - 1e-5)) {
                    maximalWallSegments[0][0] = lastMaxSegment[0];
                    maximalWallSegments.pop();
                }
            }
        }
    }
    if (maximalWallSegments.length === 0) {
        console.warn("L/W Calc: No maximal wall segments found.");
        return newPairs;
    }
    for (const wallSegment of maximalWallSegments) {
        const wallStartPoint = wallSegment[0];
        const wallEndPoint = wallSegment[1];
        const segmentL = [wallStartPoint, wallEndPoint];
        let vectorDeltaWall = subtractVectors(wallEndPoint, wallStartPoint);
        const wallActualLength = Math.sqrt(dotProduct(vectorDeltaWall, vectorDeltaWall));
        if (wallActualLength < 1e-6) {
            console.warn("L/W Calc: Skipping degenerate maximal wall.", wallSegment);
            continue;
        }
        const vectorParallelToWall = normalizeVector(vectorDeltaWall);
        if (vectorParallelToWall.x === 0 && vectorParallelToWall.y === 0) {
            console.warn("L/W Calc: Normalization of maximal wall failed.", wallSegment);
            continue;
        }
        const vectorPerpendicularToWall = {
            x: -vectorParallelToWall.y,
            y: vectorParallelToWall.x
        };
        const A_coefficient = vectorParallelToWall.y;
        const B_coefficient = -vectorParallelToWall.x;
        const C_coefficient = -(A_coefficient * wallStartPoint.x + B_coefficient * wallStartPoint.y);
        let maxAbsolutePerpendicularDistance = -1;
        let chosenVertexFar = null;
        for (const vertex of roomPoints) {
            const signedDistance = (A_coefficient * vertex.x + B_coefficient * vertex.y + C_coefficient);
            const absoluteDistance = Math.abs(signedDistance);
            if (absoluteDistance > maxAbsolutePerpendicularDistance) {
                maxAbsolutePerpendicularDistance = absoluteDistance; 
                chosenVertexFar = vertex;
            }
        }
        if (!chosenVertexFar) {
            console.warn("L/W Calc: Could not find furthest vertex for wall:", wallSegment);
            continue;
        }
        const segmentH = linePolygonIntersection(chosenVertexFar, vectorPerpendicularToWall, roomPoints);
        if (segmentH) {
            const lengthOfL = calculateDistance(segmentL[0], segmentL[1]); 
            const lengthOfH = calculateDistance(segmentH[0], segmentH[1]);
            if (lengthOfL > 1e-6 && lengthOfH > 1e-6) { 
                newPairs.push({ 
                    lengthSeg: segmentL, 
                    widthSeg: segmentH
                }); 
            } else { 
                console.warn("L/W Calc: L or H zero length.", wallSegment);  
            }
        } else { 
            console.warn("L/W Calc: No valid height segment for wall:", wallSegment); 
        }
    } return newPairs;
}

function redrawCanvas() {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (!currentRoom || !transformParams || !currentRoom.corners || currentRoom.corners.length === 0) {
    console.log("Redraw skipped: No current room, transformParams, or corners.");
    updateDimensionLabels(null, null);
    return;
  }

  if (lengthWidthPairs.length > 0 && currentPairIndex < lengthWidthPairs.length) {
    const currentPair = lengthWidthPairs[currentPairIndex];
    if (currentPair.lengthSeg && currentPair.lengthSeg.length === 2 &&
        currentPair.widthSeg && currentPair.widthSeg.length === 2) {
        const actualLength = calculateDistance(currentPair.lengthSeg[0], currentPair.lengthSeg[1]);
        const actualWidth = calculateDistance(currentPair.widthSeg[0], currentPair.widthSeg[1]);
        updateDimensionLabels(actualLength, actualWidth);
    } else {
        updateDimensionLabels(null, null);
    }
  } else {
    updateDimensionLabels(null, null);
  }

  if (currentView === '3D') {
    const projectedBBox = get3DProjectedBoundingBox(currentRoom.corners, transformParams, lengthWidthPairs, currentPairIndex);
    if (projectedBBox &&
        isFinite(projectedBBox.minX) &&
        isFinite(projectedBBox.maxX) &&
        isFinite(projectedBBox.minY) &&
        isFinite(projectedBBox.maxY)) {
        const projectedWidth = projectedBBox.maxX - projectedBBox.minX; const projectedHeight = projectedBBox.maxY - projectedBBox.minY;
        if (projectedWidth > 1e-6 || projectedHeight > 1e-6) {
            const projectedCenterX = projectedBBox.minX + projectedWidth / 2; 
            const projectedCenterY = projectedBBox.minY + projectedHeight / 2;
            const canvasCenterX = canvasWidth / 2; 
            const canvasCenterY = canvasHeight / 2;
            const translateX = canvasCenterX - projectedCenterX; 
            const translateY = canvasCenterY - projectedCenterY;
            ctx.save(); ctx.translate(translateX, translateY);
            drawRoomShape(currentRoom.corners, transformParams);
            if (lengthWidthPairs.length > 0 && currentPairIndex < lengthWidthPairs.length) { 
                drawLengthWidth(lengthWidthPairs[currentPairIndex], transformParams); 
            }
            ctx.restore();
        } else { 
             drawRoomShape(currentRoom.corners, transformParams);
             if (lengthWidthPairs.length > 0 && currentPairIndex < lengthWidthPairs.length) { 
                drawLengthWidth(lengthWidthPairs[currentPairIndex], transformParams); 
            }
        }
    } else {
        console.warn("3D BBox calculation failed. Drawing without dynamic centering.");
        drawRoomShape(currentRoom.corners, transformParams);
        if (lengthWidthPairs.length > 0 && currentPairIndex < lengthWidthPairs.length) { 
            drawLengthWidth(lengthWidthPairs[currentPairIndex], transformParams); 
        }
    }
  } else { 
    drawRoomShape(currentRoom.corners, transformParams);
    if (lengthWidthPairs.length > 0 && currentPairIndex < lengthWidthPairs.length) { 
        drawLengthWidth(lengthWidthPairs[currentPairIndex], transformParams); 
    }
  }
}

function changeDimensions() {
  if (lengthWidthPairs.length > 0) {
    currentPairIndex = (currentPairIndex + 1) % lengthWidthPairs.length;
    redrawCanvas();
  } else {
    console.log("No length/width pairs to cycle through.");
    updateDimensionLabels(null, null);
  }
}

function toggleView() {
  currentView = (currentView === '2D' ? '3D' : '2D');
  const toggleButton = document.getElementById('toggleViewButton');
  if (toggleButton) { 
    toggleButton.textContent = `Switch to ${currentView === '2D' ? '3D' : '2D'} View`; 
}
  if (currentRoom && currentRoom.corners && currentRoom.corners.length > 0) {
    transformParams = calculateTransformParams(currentRoom.corners);
  } else {
    transformParams = calculateTransformParams([]);
  }
  redrawCanvas();
}

function selectRoom(roomName) {
  const roomToSelect = currentRoomDataStore.find(room => room.name === roomName);
  if (roomToSelect && 
    roomToSelect.corners && 
    roomToSelect.corners.length > 0) {
    currentRoom = roomToSelect;
    transformParams = calculateTransformParams(currentRoom.corners); 
    lengthWidthPairs = calculateAllLengthWidthPairs(currentRoom.corners);
    currentPairIndex = 0;
    if (lengthWidthPairs.length === 0 && 
        currentRoom.corners.length >= 3) {
      console.warn(`No valid L/W pairs found for "${currentRoom.name}".`);
    }
  } else {
    console.error("Room not found or has no processable corners:", roomName);
    if (roomToSelect) { 
        console.log("Problematic room data for selection:", roomToSelect); 
    }
    currentRoom = null; 
    transformParams = calculateTransformParams([]); 
    lengthWidthPairs = []; 
    currentPairIndex = 0;
  }
  redrawCanvas(); 
}

// ##### Init #####
async function initialize() {
  const roomFileConfigs = [
    { name: "simple", path: './data/simple.json' },
    { name: "t_shape", path: './data/t_shape.json' },
    { name: "triangle", path: './data/triangle.json' }
  ];
  
  const changeDimButton = document.getElementById('changeDimButton');
  const toggleViewButton = document.getElementById('toggleViewButton');
  const roomSelector = document.getElementById('roomSelector');

  if (!lengthValueSpan || !widthValueSpan || !changeDimButton || !toggleViewButton || !roomSelector) {
      console.error("One or more UI control/label elements are missing from the HTML.");
      alert("Error: UI elements missing. Check console.");
      return;
  }
  updateDimensionLabels(null, null); 

  try {
    const fetchedRoomsPromises = roomFileConfigs.map(async config => {
      try {
          const response = await fetch(config.path);
          if (!response.ok) { 
            return { 
                name: config.name, 
                corners: [], 
                error: `HTTP error ${response.status}` 
            }; 
        }
          const rawJsonData = await response.json();
          const orderedCorners = convertRawRoomDataToOrderedCorners(rawJsonData, config.name);
          if (orderedCorners.length === 0 && rawJsonData.corners && rawJsonData.corners.length > 0) {
            return { 
                name: config.name, 
                corners: [], 
                error: "Conversion failed" };
          }
          return { 
            name: config.name, corners: orderedCorners 
        };
      } catch (fetchError) { 
        return { 
            name: config.name, 
            corners: [],
            error: `Workspace/Parse error: ${fetchError.message}`
        }; 
      }
    });
    const fetchedRoomsResults = await Promise.all(fetchedRoomsPromises);
    currentRoomDataStore = fetchedRoomsResults.filter(room => !room.error && room.corners && room.corners.length > 0);

    if (fetchedRoomsResults.some(room => room.error)) { 
        alert("Some room data could not be loaded or converted."); 
    }
    roomSelector.innerHTML = ''; 
    if (currentRoomDataStore.length === 0) {
        alert("No valid room data could be loaded.");
        transformParams = calculateTransformParams([]); redrawCanvas(); return;
    }

    currentRoomDataStore.forEach(room => {
      const option = document.createElement('option'); option.value = room.name; option.textContent = room.name; roomSelector.appendChild(option);
    });
    roomSelector.addEventListener('change', (event) => { 
        selectRoom(event.target.value); 
    });
    changeDimButton.addEventListener('click', changeDimensions);
    toggleViewButton.addEventListener('click', toggleView);

    const initialRoomName = currentRoomDataStore[0].name; roomSelector.value = initialRoomName;
    selectRoom(initialRoomName);
  } catch (error) {
    console.error("Initialization failed due to the error:", error); 
    alert(`Fatal error: ${error.message}.`);
    transformParams = calculateTransformParams([]); 
    redrawCanvas();
  }
}
initialize();