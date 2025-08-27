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
 * Converts a quaternion to Euler angles (yaw, pitch, roll).
 * @param {number[]} q - The quaternion as an array [x, y, z, w].
 * @returns {object} An object with { yaw, pitch, roll } in radians.
 */
export function quaternionToEuler(q) {
    const [x, y, z, w] = q;

    // roll (x-axis rotation)
    const sinr_cosp = 2 * (w * x + y * z);
    const cosr_cosp = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinr_cosp, cosr_cosp);

    // pitch (y-axis rotation)
    const sinp = 2 * (w * y - z * x);
    let pitch;
    if (Math.abs(sinp) >= 1) {
        pitch = Math.sign(sinp) * Math.PI / 2; // use 90 degrees if out of range
    } else {
        pitch = Math.asin(sinp);
    }

    // yaw (z-axis rotation)
    const siny_cosp = 2 * (w * z + x * y);
    const cosy_cosp = 1 - 2 * (y * y + z * z);
    const yaw = Math.atan2(siny_cosp, cosy_cosp);

    return { yaw, pitch, roll };
}

/**
 * Converts a target's geographic coordinates to a 3D vector relative to the user.
 * @param {object} userLoc - The user's location {lat, lng}.
 * @param {object} targetLoc - The target's location {lat, lng}.
 * @param {number} userElev - The user's elevation in meters.
 * @param {number} targetElev - The target's elevation in meters.
 * @returns {object} The 3D position vector for the scene, compatible with BABYLON.Vector3.
 */
export function getTargetPositionInScene(userLoc, targetLoc, userElev, targetElev) {
    const distance = calculateDistance(userLoc, targetLoc) * 1000; // convert km to meters
    const bearing = calculateBearing(userLoc, targetLoc);
    const bearingRad = bearing * (Math.PI / 180);

    // Y is the elevation difference (Up/Down in the scene)
    const y = targetElev - userElev;

    // X is the East/West component
    const x = distance * Math.sin(bearingRad);

    // Z is the North/South component.
    // We negate Z because the Babylon.js camera looks down the -Z axis by default.
    // This aligns our scene's coordinate system (North = -Z) with the camera's.
    const z = distance * Math.cos(bearingRad);

    // Returning a plain object for testability, can be converted to BABYLON.Vector3 later
    return { x, y, z };
}
