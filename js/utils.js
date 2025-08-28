/**
 * Calculates the distance between two GPS coordinates in kilometers.
 * Uses the Haversine formula.
 * @param {object} start - The starting coordinate {lat, lng}.
 * @param {object} end - The ending coordinate {lat, lng}.
 * @returns {number} The distance in kilometers.
 */
export function calculateDistance(start, end) {
    const R = 6371; // Earth's radius in kilometers
    const toRadians = Math.PI / 180;
    const dLat = (end.lat - start.lat) * toRadians;
    const dLon = (end.lng - start.lng) * toRadians;
    const lat1 = start.lat * toRadians;
    const lat2 = end.lat * toRadians;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Calculates the initial bearing (forward azimuth) from one GPS coordinate to another.
 * @param {object} start - The starting coordinate {lat, lng}.
 * @param {object} end - The ending coordinate {lat, lng}.
 * @returns {number} The bearing in degrees (0-360).
 */
export function calculateBearing(start, end) {
    const toRadians = Math.PI / 180;
    const toDegrees = 180 / Math.PI;
    const lat1 = start.lat * toRadians;
    const lng1 = start.lng * toRadians;
    const lat2 = end.lat * toRadians;
    const lng2 = end.lng * toRadians;
    const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
    const bearing = Math.atan2(y, x) * toDegrees;
    return (bearing + 360) % 360;
}

/**
 * Converts a target's geographic coordinates to a 3D vector relative to an origin point.
 * @param {object} originCoords - The origin's location {lat, lng}.
 * @param {object} targetCoords - The target's location {lat, lng}.
 * @param {number} originElevation - The origin's elevation in meters.
 * @param {number} targetElevation - The target's elevation in meters.
 * @returns {object} The 3D position vector for the scene, compatible with BABYLON.Vector3.
 */
export function getTargetPositionInScene(originCoords, targetCoords, originElevation, targetElevation) {
    const distance = calculateDistance(originCoords, targetCoords) * 1000; // convert km to meters
    const bearing = calculateBearing(originCoords, targetCoords);
    const bearingRad = bearing * (Math.PI / 180);

    // Y is the elevation difference (Up/Down in the scene)
    const y = targetElevation - originElevation;

    // X is the East/West component
    const x = distance * Math.sin(bearingRad);

    // Z is the North/South component.
    // We negate Z because the Babylon.js camera looks down the -Z axis by default.
    // This aligns our scene's coordinate system (North = -Z) with the camera's.
    const z = -distance * Math.cos(bearingRad);

    // Returning a plain object for testability, can be converted to BABYLON.Vector3 later
    return { x, y, z };
}
