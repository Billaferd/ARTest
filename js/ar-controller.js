import { getTargetPositionInScene, calculateDistance, calculateBearing } from './utils.js';
import { logMessage } from './ui-controller.js';

let engine;
let scene;
let arCamera;
let lightPillar;
let isTargetPlaced = false;

/**
 * Initializes the Babylon.js scene.
 * @param {HTMLCanvasElement} canvas - The canvas element to render the scene on.
 */
export function initBabylonScene(canvas) {
    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    scene = new BABYLON.Scene(engine);

    // Make the scene background transparent
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);

    // Create a camera that we will control manually
    arCamera = new BABYLON.FreeCamera("arCamera", new BABYLON.Vector3(0, 0, 0), scene);
    arCamera.attachControl(canvas, false); // We will control it manually


    // Create a basic light
    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.8;

    // Create the 'light pillar' model
    lightPillar = BABYLON.MeshBuilder.CreateCylinder("pillar", {
        height: 50, // The pillar is tall
        diameter: 5
    }, scene);

    const pillarMaterial = new BABYLON.StandardMaterial("pillarMaterial", scene);
    pillarMaterial.emissiveColor = new BABYLON.Color3(0, 1, 0.5); // A cyan-green glow
    pillarMaterial.disableLighting = true; // Make it self-illuminated
    lightPillar.material = pillarMaterial;

    // Initially hide the pillar until we have a target
    lightPillar.setEnabled(false);

    // Start the render loop
    engine.runRenderLoop(() => {
        if (scene) {
            scene.render();
        }
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        engine.resize();
    });

    logMessage('Babylon.js scene initialized.');
}

/**
 * The main AR render loop. Updates the 3D scene based on sensor and location data.
 * @param {object} appState - The current state of the application.
 */
export function updateARView(appState) {
    const { userLocation, targetLocation, deviceOrientation, devicePitch, userElevation, targetElevation, worldAnchor } = appState;

    if (!userLocation || !targetLocation || deviceOrientation === undefined || devicePitch === undefined || !scene) {
        return;
    }

    // --- Update World based on User Position and Orientation ---
    // In this AR model, the camera stays at (0,0,0) and the world moves around it.

    // 1. Update Camera Pitch (Up/Down Rotation)
    // The user should be able to look up and down. Yaw (left/right) is handled by rotating the world.
    if (arCamera) {
        const pitch = BABYLON.Tools.ToRadians(devicePitch);
        arCamera.rotation = new BABYLON.Vector3(pitch, 0, 0); // Yaw is locked to 0
    }

    // 2. Update Light Pillar Position and World Rotation
    // This moves the pillar in the scene to reflect its real-world position relative to the user,
    // and rotates it around the camera to match the compass heading.
    if (userLocation && targetLocation && userElevation !== undefined && targetElevation !== undefined) {
        // First, calculate the target's position vector relative to the user in a static, North-oriented frame.
        const pos = getTargetPositionInScene(userLocation, targetLocation, userElevation, targetElevation);
        const pillarVector = new BABYLON.Vector3(pos.x, pos.y, pos.z);

        // Next, create a rotation matrix that rotates the world around the camera (Y-axis)
        // based on the device's compass heading.
        const headingRad = BABYLON.Tools.ToRadians(deviceOrientation);
        const rotationMatrix = BABYLON.Matrix.RotationY(headingRad);

        // Apply this rotation to the pillar's position vector.
        const rotatedPillarVector = BABYLON.Vector3.TransformCoordinates(pillarVector, rotationMatrix);

        // Update the light pillar's position with the rotated vector.
        lightPillar.position = rotatedPillarVector;

        // Ensure the pillar is visible now that we have a position for it.
        if (!lightPillar.isEnabled()) {
            lightPillar.setEnabled(true);
            logMessage('Target has been placed in the AR world.');
        }

        const diagPos = lightPillar.position;
        appState.diagnosticData.targetPosition3D = { x: diagPos.x.toFixed(2), y: diagPos.y.toFixed(2), z: diagPos.z.toFixed(2) };
        appState.diagnosticData.cameraPosition = { x: '0.00', y: '0.00', z: '0.00' }; // Camera is always at origin
    }


    // --- Arrow Indicator Logic ---
    const arrowContainer = document.getElementById('arrow-container');
    const cameraContainer = document.getElementById('camera-container');

    if (lightPillar && arCamera) {
        const frustumPlanes = BABYLON.Frustum.GetPlanes(scene.getTransformMatrix());
        const isVisible = lightPillar.isInFrustum(frustumPlanes);

        if (!isVisible) {
            arrowContainer.style.display = 'flex';
            cameraContainer.classList.remove('target-in-view');

            const targetVector = lightPillar.getAbsolutePosition();
            const cameraDirection = arCamera.getForwardRay().direction;
            const toTarget = targetVector.subtract(arCamera.position);
            const dotProduct = BABYLON.Vector3.Dot(cameraDirection, toTarget);
            const isBehind = dotProduct < 0;

            const screenPoint = BABYLON.Vector3.Project(
                targetVector,
                BABYLON.Matrix.Identity(),
                scene.getTransformMatrix(),
                arCamera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
            );

            let angleDeg;
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            if (isBehind) {
                const oppositeX = centerX + (centerX - screenPoint.x);
                const oppositeY = centerY + (centerY - screenPoint.y);
                const angleRad = Math.atan2(oppositeY - centerY, oppositeX - centerX);
                angleDeg = angleRad * 180 / Math.PI + 90;
            } else {
                const angleRad = Math.atan2(screenPoint.y - centerY, screenPoint.x - centerX);
                angleDeg = angleRad * 180 / Math.PI + 90;
            }

            arrowContainer.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;
        } else {
            arrowContainer.style.display = 'none';
            cameraContainer.classList.add('target-in-view');
        }
    }

    // --- Update Diagnostics ---
    const distance = calculateDistance(userLocation, targetLocation);
    appState.diagnosticData.distance = (distance).toFixed(2) + ' km';
    const bearing = calculateBearing(userLocation, targetLocation);
    appState.diagnosticData.bearing = bearing.toFixed(2);
}
