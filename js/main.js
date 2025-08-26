import { initMap, rotateMap } from './map-controller.js';
import { startCamera } from './camera-controller.js';
import { initBabylonScene, updateARView } from './ar-controller.js';
import { startSensors } from './sensor-controller.js';
import { initUI, updateDiagnostics } from './ui-controller.js';

document.addEventListener('DOMContentLoaded', () => {
    // DOM Element selectors
    const cameraFeed = document.getElementById('camera-feed');
    const renderCanvas = document.getElementById('renderCanvas');

    // Main application state
    const appState = {
        userLocation: null,
        userElevation: undefined,
        targetLocation: null,
        targetElevation: undefined,
        deviceOrientation: undefined,
        devicePitch: undefined,
        magneticDeclination: 0,
        isDeclinationAvailable: false,
        diagnosticData: {}
    };

    // --- Initialization ---
    initUI();
    initMap((target) => {
        appState.targetLocation = { lat: target.lat, lng: target.lng };
        appState.targetElevation = target.elevation;
        appState.diagnosticData.targetLocation = { ...appState.targetLocation, elevation: appState.targetElevation };

        startCamera(cameraFeed);
        startSensors(appState, onSensorUpdate);

        if (!window.babylonInitialized) {
            initBabylonScene(renderCanvas);
            window.babylonInitialized = true;
        }
    });

    function onSensorUpdate() {
        if (appState.deviceOrientation !== undefined) {
            rotateMap(appState.deviceOrientation);
        }
        updateARView(appState);
    }

    setInterval(() => updateDiagnostics(appState.diagnosticData), 250);
});
