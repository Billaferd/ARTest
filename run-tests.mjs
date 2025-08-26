import assert from 'assert';
import {
    calculateDistance,
    calculateBearing,
    quaternionToEuler,
    getTargetPositionInScene
} from './js/utils.js';

// Helper for comparing floating point numbers
function assertAlmostEqual(actual, expected, tolerance = 1e-6, message = '') {
    const check = Math.abs(actual - expected) < tolerance;
    assert(check, `Expected ${actual} to be close to ${expected} with tolerance ${tolerance}. ${message}`);
}

function runTests() {
    console.log('Running tests...');

    // --- calculateDistance ---
    console.log('Testing calculateDistance...');
    const point = { lat: 51.5, lng: -0.12 };
    assert.strictEqual(calculateDistance(point, point), 0, 'calculateDistance: Same point');

    const paris = { lat: 48.8566, lng: 2.3522 };
    const london = { lat: 51.5074, lng: -0.1278 };
    assertAlmostEqual(calculateDistance(paris, london), 343.5, 1, 'calculateDistance: Paris to London');

    const santiago = { lat: -33.4489, lng: -70.6693 };
    const sydney = { lat: -33.8688, lng: 151.2093 };
    assertAlmostEqual(calculateDistance(santiago, sydney), 11347, 1, 'calculateDistance: Santiago to Sydney (Southern Hemisphere)');

    const equatorPoint1 = { lat: 0, lng: 0 };
    const equatorPoint2 = { lat: 0, lng: 1 };
    assertAlmostEqual(calculateDistance(equatorPoint1, equatorPoint2), 111.3, 1, 'calculateDistance: Along equator');

    console.log('✓ calculateDistance tests passed.');

    // --- calculateBearing ---
    console.log('Testing calculateBearing...');
    const northStart = { lat: 50, lng: 0 };
    const northEnd = { lat: 51, lng: 0 };
    assertAlmostEqual(calculateBearing(northStart, northEnd), 0, 1, 'calculateBearing: North');

    const eastStart = { lat: 50, lng: 0 };
    const eastEnd = { lat: 50, lng: 1.76 };
    assertAlmostEqual(calculateBearing(eastStart, eastEnd), 90, 1, 'calculateBearing: East');

    const southStart = { lat: 51, lng: 0 };
    const southEnd = { lat: 50, lng: 0 };
    assertAlmostEqual(calculateBearing(southStart, southEnd), 180, 1, 'calculateBearing: South');

    const westStart = { lat: 50, lng: 0 };
    const westEnd = { lat: 50, lng: -1.76 };
    assertAlmostEqual(calculateBearing(westStart, westEnd), 270, 1, 'calculateBearing: West');

    console.log('✓ calculateBearing tests passed.');

    // --- quaternionToEuler ---
    console.log('Testing quaternionToEuler...');
    const identityQ = [0, 0, 0, 1];
    const identityE = quaternionToEuler(identityQ);
    assertAlmostEqual(identityE.yaw, 0, 1e-6, 'quaternionToEuler: Identity yaw');
    assertAlmostEqual(identityE.pitch, 0, 1e-6, 'quaternionToEuler: Identity pitch');
    assertAlmostEqual(identityE.roll, 0, 1e-6, 'quaternionToEuler: Identity roll');

    // Test a 90-degree rotation around Y-axis (should affect pitch)
    const pitchQ = [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)];
    const pitchE = quaternionToEuler(pitchQ);
    assertAlmostEqual(pitchE.pitch, Math.PI / 2, 1e-6, 'quaternionToEuler: 90-degree Y-axis rotation (pitch)');

    // Test a 90-degree rotation around Z-axis (should affect yaw)
    const yawQ = [0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)];
    const yawE = quaternionToEuler(yawQ);
    assertAlmostEqual(yawE.yaw, Math.PI / 2, 1e-6, 'quaternionToEuler: 90-degree Z-axis rotation (yaw)');

    // Test a 90-degree rotation around X-axis (should affect roll)
    const rollQ = [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)];
    const rollE = quaternionToEuler(rollQ);
    assertAlmostEqual(rollE.roll, Math.PI / 2, 1e-6, 'quaternionToEuler: 90-degree X-axis rotation (roll)');

    // Gimbal lock test (pitch is +/- 90 degrees)
    const gimbalLockQ = [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)]; // 90 deg pitch
    const gimbalLockE = quaternionToEuler(gimbalLockQ);
    assertAlmostEqual(gimbalLockE.pitch, Math.PI / 2, 1e-6, 'quaternionToEuler: Gimbal lock pitch');

    console.log('✓ quaternionToEuler tests passed.');

    // --- getTargetPositionInScene ---
    console.log('Testing getTargetPositionInScene...');
    const user = { lat: 50, lng: 0 };
    const targetNorth = { lat: 50.0089, lng: 0 }; // Approx 989m North
    const posNorth = getTargetPositionInScene(user, targetNorth, 0, 0);
    assertAlmostEqual(posNorth.x, 0, 1, 'getTargetPositionInScene: North x');
    assertAlmostEqual(posNorth.y, 0, 1, 'getTargetPositionInScene: North y');
    assertAlmostEqual(posNorth.z, -989, 1, 'getTargetPositionInScene: North z');

    const targetEast = { lat: 50, lng: 0.0159 }; // Approx 1137m East
    const posEast = getTargetPositionInScene(user, targetEast, 10, 20);
    assertAlmostEqual(posEast.x, 1137, 1, 'getTargetPositionInScene: East x');
    assertAlmostEqual(posEast.y, 10, 1, 'getTargetPositionInScene: East y');
    assertAlmostEqual(posEast.z, 0, 1, 'getTargetPositionInScene: East z');

    const targetSouth = { lat: 49.9911, lng: 0 }; // Approx 989m South
    const posSouth = getTargetPositionInScene(user, targetSouth, 5, -5);
    assertAlmostEqual(posSouth.x, 0, 1, 'getTargetPositionInScene: South x');
    assertAlmostEqual(posSouth.y, -10, 1, 'getTargetPositionInScene: South y');
    assertAlmostEqual(posSouth.z, 989, 1, 'getTargetPositionInScene: South z');

    const targetWest = { lat: 50, lng: -0.0159 }; // Approx 1137m West
    const posWest = getTargetPositionInScene(user, targetWest, 0, 0);
    assertAlmostEqual(posWest.x, -1137, 1, 'getTargetPositionInScene: West x');
    assertAlmostEqual(posWest.y, 0, 1, 'getTargetPositionInScene: West y');
    assertAlmostEqual(posWest.z, 0, 1, 'getTargetPositionInScene: West z');

    console.log('✓ getTargetPositionInScene tests passed.');

    console.log('\nAll tests passed!');
}

try {
    runTests();
} catch (error) {
    console.error('Test failed:');
    console.error(error);
    process.exit(1);
}
