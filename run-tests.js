const assert = require('assert');
const {
    calculateDistance,
    calculateBearing,
    quaternionToEuler,
    getTargetPositionInScene
} = require('./script.js');

// Helper for comparing floating point numbers
function assertAlmostEqual(actual, expected, tolerance = 1e-6, message = '') {
    assert(Math.abs(actual - expected) < tolerance, `Expected ${actual} to be close to ${expected}. ${message}`);
}

function runTests() {
    console.log('Running tests...');

    // --- calculateDistance ---
    const point = { lat: 51.5, lng: -0.12 };
    assert.strictEqual(calculateDistance(point, point), 0, 'calculateDistance: Same point');

    const paris = { lat: 48.8566, lng: 2.3522 };
    const london = { lat: 51.5074, lng: -0.1278 };
    assertAlmostEqual(calculateDistance(paris, london), 343.5, 1, 'calculateDistance: Paris to London');
    console.log('✓ calculateDistance tests passed.');

    // --- calculateBearing ---
    const northStart = { lat: 50, lng: 0 };
    const northEnd = { lat: 51, lng: 0 };
    assertAlmostEqual(calculateBearing(northStart, northEnd), 0, 1, 'calculateBearing: North');

    const eastStart = { lat: 50, lng: 0 };
    const eastEnd = { lat: 50, lng: 1.76 };
    assertAlmostEqual(calculateBearing(eastStart, eastEnd), 90, 1, 'calculateBearing: East');

    const southStart = { lat: 51, lng: 0 };
    const southEnd = { lat: 50, lng: 0 };
    assertAlmostEqual(calculateBearing(southStart, southEnd), 180, 1, 'calculateBearing: South');
    console.log('✓ calculateBearing tests passed.');

    // --- quaternionToEuler ---
    const identityQ = [0, 0, 0, 1];
    const identityE = quaternionToEuler(identityQ);
    assert.strictEqual(identityE.yaw, 0, 'quaternionToEuler: Identity yaw');
    assert.strictEqual(identityE.pitch, 0, 'quaternionToEuler: Identity pitch');
    assert.strictEqual(identityE.roll, 0, 'quaternionToEuler: Identity roll');

    // Test a 90-degree rotation around X-axis (should affect roll, now used for heading)
    const rollQ = [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)];
    const rollE = quaternionToEuler(rollQ);
    assertAlmostEqual(rollE.roll, Math.PI / 2, 1e-6, 'quaternionToEuler: 90-degree X-axis rotation (roll/heading)');

    // Test a small rotation around X-axis to check for wrapping issues
    const smallAngleRad = 2 * Math.PI / 180; // 2 degrees
    const smallRollQ = [Math.sin(smallAngleRad / 2), 0, 0, Math.cos(smallAngleRad / 2)];
    const smallRollE = quaternionToEuler(smallRollQ);
    assertAlmostEqual(smallRollE.roll, smallAngleRad, 1e-6, 'quaternionToEuler: Small X-axis rotation');
    console.log('✓ quaternionToEuler tests passed.');

    // --- getTargetPositionInScene ---
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
