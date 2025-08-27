import { getTargetPositionInScene, calculateDistance, calculateBearing } from './utils.js';
import { logMessage } from './ui-controller.js';

let engine;
let scene;
let arCamera;
let lightPillar;

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
    const { userLocation, targetLocation, deviceOrientation, devicePitch, userElevation, targetElevation } = appState;

    if (!userLocation || !targetLocation || deviceOrientation === undefined || devicePitch === undefined || !scene) {
        return;
    }

    // --- Update Camera Rotation ---
    if (arCamera) {
        // We need to convert the true heading (0° = North, 90° = East) into a Babylon.js rotation.
        // A standard FreeCamera with rotation (0,0,0) looks towards +Z.
        // Our scene is set up so that North is in the -Z direction.
        // So, a heading of 0° (North) must correspond to a camera rotation of 180° (Math.PI) around the Y-axis.
        // A heading of 90° (East) must correspond to a camera rotation of 90° around the Y-axis.
        const yaw = Math.PI - BABYLON.Tools.ToRadians(deviceOrientation);
        const pitch = BABYLON.Tools.ToRadians(devicePitch);
        arCamera.rotation = new BABYLON.Vector3(pitch, yaw, 0);
    }

    // --- Update 3D Model Position ---
    if (lightPillar && userElevation !== undefined && targetElevation !== undefined) {
        if (!lightPillar.isEnabled()) {
            lightPillar.setEnabled(true);
            logMessage('Light pillar is now visible.');
        }

        const pos = getTargetPositionInScene(userLocation, targetLocation, userElevation, targetElevation);
        lightPillar.position = new BABYLON.Vector3(pos.x, pos.y, pos.z);

        appState.diagnosticData.targetPosition3D = { x: pos.x.toFixed(2), y: pos.y.toFixed(2), z: pos.z.toFixed(2) };
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
