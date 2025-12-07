import React, { useMemo } from 'react';
import { View } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import * as turf from '@turf/turf';
import { Feature, LineString, Point, Position, Polygon } from 'geojson';

interface RoadFittedArrowProps {
    routeGeoJSON: Feature | null;
    maneuverPoint: {
        coordinate: [number, number];
        type: string;
        modifier?: string;
        instruction: string;
        uniqueIndex?: number;
    };
    uniqueKey: string | number;
    arrowLength?: number; // Length of arrow in meters
    arrowWidth?: number; // Width of arrow in pixels
    color?: string;
    opacity?: number;
}

interface CurvedArrowGeometry {
    shaft: Feature<LineString>;
    head: Feature<Polygon>;
}

/**
 * Interpolates points along a route segment to get a point at exact distance
 */
function interpolatePointAtDistance(
    fromPoint: Position,
    toPoint: Position,
    targetDistance: number,
    segmentLength: number
): Position {
    const ratio = targetDistance / segmentLength;
    return [
        fromPoint[0] + (toPoint[0] - fromPoint[0]) * ratio,
        fromPoint[1] + (toPoint[1] - fromPoint[1]) * ratio
    ];
}

/**
 * Extracts a segment of the route for arrow placement with EXACT length control.
 * The arrow is CENTERED at the maneuver point - starts before it and ends after it.
 * This way the arrow shows the direction through the turn.
 * Uses interpolation to ensure consistent arrow length regardless of route point density.
 */
function extractRouteSegmentForArrow(
    routeLine: Position[],
    maneuverCoord: [number, number],
    arrowLength: number = 50
): Position[] {
    try {
        const maneuverPoint = turf.point(maneuverCoord);

        // Find the closest point on the route
        let closestIdx = -1;
        let minDist = Infinity;

        for (let i = 0; i < routeLine.length; i++) {
            const dist = turf.distance(
                turf.point(routeLine[i]),
                maneuverPoint,
                { units: 'meters' }
            );
            if (dist < minDist) {
                minDist = dist;
                closestIdx = i;
            }
        }

        // If maneuver point is too far from route, skip
        if (minDist > 100) {
            console.warn(`Maneuver point too far from route: ${minDist.toFixed(0)}m`);
            return [];
        }

        // Arrow should extend MORE after the maneuver point (to show the turn direction)
        // 30% before maneuver, 70% after (into the turn)
        const lengthBefore = arrowLength * 0.3;  // Tail - shorter
        const lengthAfter = arrowLength * 0.4;   // Head - longer, goes into the turn

        // We'll collect points in two separate arrays then combine them
        const pointsBefore: Position[] = [];  // Points BEFORE maneuver (tail of arrow)
        const pointsAfter: Position[] = [];   // Points AFTER maneuver (head of arrow)

        // The maneuver point itself
        const maneuverRoutePoint = routeLine[closestIdx];

        // === COLLECT POINTS BEFORE THE MANEUVER (for the tail of the arrow) ===
        let backwardDist = 0;
        let backwardIdx = closestIdx;

        while (backwardIdx > 0 && backwardDist < lengthBefore) {
            const prevIdx = backwardIdx - 1;
            const segmentDist = turf.distance(
                turf.point(routeLine[prevIdx]),
                turf.point(routeLine[backwardIdx]),
                { units: 'meters' }
            );

            const remainingLength = lengthBefore - backwardDist;

            if (segmentDist <= remainingLength) {
                // Add to FRONT of pointsBefore (we're going backwards)
                pointsBefore.unshift(routeLine[prevIdx]);
                backwardDist += segmentDist;
                backwardIdx = prevIdx;
            } else {
                // Interpolate to get exact length
                const interpolatedPoint = interpolatePointAtDistance(
                    routeLine[backwardIdx],
                    routeLine[prevIdx],
                    remainingLength,
                    segmentDist
                );
                pointsBefore.unshift(interpolatedPoint);
                backwardDist = lengthBefore;
            }
        }

        // === COLLECT POINTS AFTER THE MANEUVER (for the head of the arrow) ===
        let forwardDist = 0;
        let forwardIdx = closestIdx;

        while (forwardIdx < routeLine.length - 1 && forwardDist < lengthAfter) {
            const nextIdx = forwardIdx + 1;
            const segmentDist = turf.distance(
                turf.point(routeLine[forwardIdx]),
                turf.point(routeLine[nextIdx]),
                { units: 'meters' }
            );

            const remainingLength = lengthAfter - forwardDist;

            if (segmentDist <= remainingLength) {
                // Add to END of pointsAfter (we're going forward)
                pointsAfter.push(routeLine[nextIdx]);
                forwardDist += segmentDist;
                forwardIdx = nextIdx;
            } else {
                // Interpolate to get exact length
                const interpolatedPoint = interpolatePointAtDistance(
                    routeLine[forwardIdx],
                    routeLine[nextIdx],
                    remainingLength,
                    segmentDist
                );
                pointsAfter.push(interpolatedPoint);
                forwardDist = lengthAfter;
            }
        }

        // If we couldn't get enough points backward, extend forward more
        if (backwardDist < lengthBefore * 0.3 && forwardIdx < routeLine.length - 1) {
            const extraNeeded = lengthBefore - backwardDist;
            while (forwardIdx < routeLine.length - 1 && forwardDist < lengthAfter + extraNeeded) {
                const nextIdx = forwardIdx + 1;
                const segmentDist = turf.distance(
                    turf.point(routeLine[forwardIdx]),
                    turf.point(routeLine[nextIdx]),
                    { units: 'meters' }
                );
                const remaining = (lengthAfter + extraNeeded) - forwardDist;
                if (segmentDist <= remaining) {
                    pointsAfter.push(routeLine[nextIdx]);
                    forwardDist += segmentDist;
                    forwardIdx = nextIdx;
                } else {
                    const interpolatedPoint = interpolatePointAtDistance(
                        routeLine[forwardIdx],
                        routeLine[nextIdx],
                        remaining,
                        segmentDist
                    );
                    pointsAfter.push(interpolatedPoint);
                    break;
                }
            }
        }

        // If we couldn't get enough points forward, extend backward more
        if (forwardDist < lengthAfter * 0.3 && backwardIdx > 0) {
            const extraNeeded = lengthAfter - forwardDist;
            while (backwardIdx > 0 && backwardDist < lengthBefore + extraNeeded) {
                const prevIdx = backwardIdx - 1;
                const segmentDist = turf.distance(
                    turf.point(routeLine[prevIdx]),
                    turf.point(routeLine[backwardIdx]),
                    { units: 'meters' }
                );
                const remaining = (lengthBefore + extraNeeded) - backwardDist;
                if (segmentDist <= remaining) {
                    pointsBefore.unshift(routeLine[prevIdx]);
                    backwardDist += segmentDist;
                    backwardIdx = prevIdx;
                } else {
                    const interpolatedPoint = interpolatePointAtDistance(
                        routeLine[backwardIdx],
                        routeLine[prevIdx],
                        remaining,
                        segmentDist
                    );
                    pointsBefore.unshift(interpolatedPoint);
                    break;
                }
            }
        }

        // Combine: pointsBefore + maneuverPoint + pointsAfter
        // This ensures correct order: tail -> maneuver -> head (arrow points FORWARD along route)
        const resultPoints: Position[] = [...pointsBefore, maneuverRoutePoint, ...pointsAfter];

        // Debug: log arrow construction details
        const firstPt = resultPoints[0];
        const lastPt = resultPoints[resultPoints.length - 1];
        console.log(`🏹 Arrow at [${maneuverCoord[0].toFixed(4)}, ${maneuverCoord[1].toFixed(4)}]:`, {
            closestIdx,
            routeLength: routeLine.length,
            pointsBefore: pointsBefore.length,
            pointsAfter: pointsAfter.length,
            totalPoints: resultPoints.length,
            backwardDist: backwardDist.toFixed(1),
            forwardDist: forwardDist.toFixed(1),
            lengthBefore,
            lengthAfter,
            firstPoint: `[${firstPt[0].toFixed(4)}, ${firstPt[1].toFixed(4)}]`,
            lastPoint: `[${lastPt[0].toFixed(4)}, ${lastPt[1].toFixed(4)}]`,
        });

        // Ensure we have at least 2 points
        if (resultPoints.length < 2) {
            // Fallback: create a segment using bearing from surrounding points
            if (closestIdx > 0 && closestIdx < routeLine.length - 1) {
                const prevPoint = routeLine[closestIdx - 1];
                const nextPoint = routeLine[closestIdx + 1];
                const currentPoint = routeLine[closestIdx];
                const bearingIn = turf.bearing(turf.point(prevPoint), turf.point(currentPoint));
                const bearingOut = turf.bearing(turf.point(currentPoint), turf.point(nextPoint));

                const startPoint = turf.destination(
                    turf.point(currentPoint),
                    lengthBefore / 1000,
                    bearingIn - 180,
                    { units: 'kilometers' }
                );
                const endPoint = turf.destination(
                    turf.point(currentPoint),
                    lengthAfter / 1000,
                    bearingOut,
                    { units: 'kilometers' }
                );
                return [startPoint.geometry.coordinates, currentPoint, endPoint.geometry.coordinates];
            } else if (closestIdx > 0) {
                const prevPoint = routeLine[closestIdx - 1];
                const currentPoint = routeLine[closestIdx];
                const bearing = turf.bearing(turf.point(prevPoint), turf.point(currentPoint));
                const startPoint = turf.destination(
                    turf.point(currentPoint),
                    lengthBefore / 1000,
                    bearing - 180,
                    { units: 'kilometers' }
                );
                return [startPoint.geometry.coordinates, currentPoint];
            } else if (closestIdx < routeLine.length - 1) {
                const currentPoint = routeLine[closestIdx];
                const nextPoint = routeLine[closestIdx + 1];
                const bearing = turf.bearing(turf.point(currentPoint), turf.point(nextPoint));
                const endPoint = turf.destination(
                    turf.point(currentPoint),
                    lengthAfter / 1000,
                    bearing,
                    { units: 'kilometers' }
                );
                return [currentPoint, endPoint.geometry.coordinates];
            }
        }

        return resultPoints;
    } catch (error) {
        console.warn('Error extracting route segment:', error);
        return [];
    }
}

/**
 * Creates a simple curved arrow that follows the road
 * Line follows the curve, triangle head at the end pointing in direction of travel
 */
function createCurvedArrowGeometry(
    routeSegment: Position[],
    maneuverType: string,
    modifier?: string
): CurvedArrowGeometry | null {
    if (!routeSegment || routeSegment.length < 2) {
        return null;
    }

    try {
        // Create the curved shaft that follows the road
        const shaft = turf.lineString(routeSegment);

        // Get the last two points to determine arrow head direction
        const lastPoint = routeSegment[routeSegment.length - 1];
        const secondLastPoint = routeSegment[routeSegment.length - 2];

        // Calculate bearing for arrow head (direction of travel)
        const bearing = turf.bearing(
            turf.point(secondLastPoint),
            turf.point(lastPoint)
        );

        // Create triangle head pointing FORWARD (in direction of bearing)
        const headLength = 12; // Length of triangle from base to tip in meters
        const headWidth = 10;  // Width of triangle base in meters
        const headLengthKm = headLength / 1000;
        const headWidthKm = headWidth / 1000;

        // Tip of the arrow is AHEAD of the last point (in direction of travel)
        const tipPoint = turf.destination(
            turf.point(lastPoint),
            headLengthKm * 0.5,
            bearing,
            { units: 'kilometers' }
        ).geometry.coordinates;

        // Base of the triangle is at the last point of the shaft, perpendicular to bearing
        const leftBase = turf.destination(
            turf.point(lastPoint),
            headWidthKm / 2,
            bearing - 90,  // Perpendicular left
            { units: 'kilometers' }
        ).geometry.coordinates;

        const rightBase = turf.destination(
            turf.point(lastPoint),
            headWidthKm / 2,
            bearing + 90,  // Perpendicular right
            { units: 'kilometers' }
        ).geometry.coordinates;

        // Create triangle polygon: tip at front, base at back
        const head = turf.polygon([[
            tipPoint,
            leftBase,
            rightBase,
            tipPoint // Close the polygon
        ]]);

        return { shaft, head };
    } catch (error) {
        console.warn('Error creating curved arrow:', error);
        return null;
    }
}

/**
 * Standard arrow length in meters - consistent for all maneuver types
 * This ensures all arrows look uniform on the map
 * Needs to be long enough to show the turn direction
 */
const STANDARD_ARROW_LENGTH = 70; // meters - longer to capture turns

/**
 * Get arrow configuration based on maneuver type
 * Now uses consistent length for all types to ensure uniform appearance
 */
function getArrowConfig(type: string, modifier?: string) {
    // Base config with standard length
    const baseConfig = {
        length: STANDARD_ARROW_LENGTH,
        width: 4,
        color: '#EA4335'  // Red
    };

    // Only vary width slightly based on importance
    const configs: Record<string, any> = {
        'turn': {
            ...baseConfig,
            width: 5
        },
        'sharp turn': {
            ...baseConfig,
            width: 5
        },
        'slight turn': {
            ...baseConfig,
            width: 4
        },
        'merge': {
            ...baseConfig,
            width: 4
        },
        'fork': {
            ...baseConfig,
            width: 4
        },
        'roundabout': {
            ...baseConfig,
            width: 5
        },
        'ramp': {
            ...baseConfig,
            width: 4
        },
        'continue': {
            ...baseConfig,
            width: 3
        },
        'depart': {
            ...baseConfig,
            width: 4
        },
        'arrive': {
            ...baseConfig,
            width: 5
        }
    };

    // Check for modifiers
    if (modifier?.includes('sharp')) {
        return configs['sharp turn'];
    }
    if (modifier?.includes('slight')) {
        return configs['slight turn'];
    }

    return configs[type] || baseConfig;
}

/**
 * Road-fitted arrow component with simple visual style
 * Curves with the road but uses simple line + triangle design
 */
export const RoadFittedArrow: React.FC<RoadFittedArrowProps> = ({
                                                                    routeGeoJSON,
                                                                    maneuverPoint,
                                                                    uniqueKey,
                                                                    arrowLength,
                                                                    arrowWidth,
                                                                    color,
                                                                    opacity = 1.0
                                                                }) => {
    const arrowGeometry = useMemo(() => {
        if (!routeGeoJSON || !routeGeoJSON.geometry || routeGeoJSON.geometry.type !== 'LineString') {
            console.warn('Invalid route GeoJSON for arrow:', uniqueKey);
            return null;
        }

        const routeCoords = routeGeoJSON.geometry.coordinates;

        // Get arrow configuration
        const config = getArrowConfig(maneuverPoint.type, maneuverPoint.modifier);
        const finalLength = arrowLength || config.length;

        // Extract segment centered at maneuver point
        const segment = extractRouteSegmentForArrow(
            routeCoords,
            maneuverPoint.coordinate,
            finalLength
        );

        if (segment.length === 0) {
            console.warn(`No valid segment for arrow at`, maneuverPoint.coordinate);
            return null;
        }

        // Create curved arrow that follows the road
        const geometry = createCurvedArrowGeometry(
            segment,
            maneuverPoint.type,
            maneuverPoint.modifier
        );

        if (!geometry) {
            console.warn(`Failed to create arrow for ${maneuverPoint.type} at`, maneuverPoint.coordinate);
        }

        return geometry;
    }, [routeGeoJSON, maneuverPoint, arrowLength]);

    if (!arrowGeometry) {
        return null;
    }

    const arrowConfig = getArrowConfig(maneuverPoint.type, maneuverPoint.modifier);
    const arrowColor = color || arrowConfig.color;
    const finalWidth = arrowWidth || arrowConfig.width;
    const sourceId = `arrow-source-${uniqueKey}`;

    return (
        <>
            {/* White outline for shaft - for better visibility */}
            <Mapbox.ShapeSource
                id={`${sourceId}-shaft-outline`}
                shape={arrowGeometry.shaft}
            >
                <Mapbox.LineLayer
                    id={`${sourceId}-shaft-outline-layer`}
                    style={{
                        lineColor: 'white',
                        lineWidth: finalWidth + 3,
                        lineCap: 'round',
                        lineJoin: 'round',
                        lineOpacity: opacity * 0.8
                    }}
                />
            </Mapbox.ShapeSource>

            {/* Arrow shaft (curved line following the road) */}
            <Mapbox.ShapeSource
                id={`${sourceId}-shaft`}
                shape={arrowGeometry.shaft}
            >
                <Mapbox.LineLayer
                    id={`${sourceId}-shaft-layer`}
                    style={{
                        lineColor: arrowColor,
                        lineWidth: finalWidth,
                        lineCap: 'round',
                        lineJoin: 'round',
                        lineOpacity: opacity
                    }}
                />
            </Mapbox.ShapeSource>

            {/* Arrow head (triangle) - white outline */}
            <Mapbox.ShapeSource
                id={`${sourceId}-head-outline`}
                shape={arrowGeometry.head}
            >
                <Mapbox.FillLayer
                    id={`${sourceId}-head-outline-fill-layer`}
                    style={{
                        fillColor: 'white',
                        fillOpacity: opacity * 0.8
                    }}
                />
                <Mapbox.LineLayer
                    id={`${sourceId}-head-outline-line-layer`}
                    style={{
                        lineColor: 'white',
                        lineWidth: 3,
                        lineOpacity: opacity * 0.8
                    }}
                />
            </Mapbox.ShapeSource>

            {/* Arrow head (triangle) - colored fill */}
            <Mapbox.ShapeSource
                id={`${sourceId}-head`}
                shape={arrowGeometry.head}
            >
                <Mapbox.FillLayer
                    id={`${sourceId}-head-fill-layer`}
                    style={{
                        fillColor: arrowColor,
                        fillOpacity: opacity
                    }}
                />
                <Mapbox.LineLayer
                    id={`${sourceId}-head-line-layer`}
                    style={{
                        lineColor: arrowColor,
                        lineWidth: 1,
                        lineOpacity: opacity
                    }}
                />
            </Mapbox.ShapeSource>
        </>
    );
};

export default RoadFittedArrow;