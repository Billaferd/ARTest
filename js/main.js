import { initMap, rotateMap } from './map-controller.js';
import { startSensors } from './sensor-controller.js';
import { initUI, updateDiagnostics } from './ui-controller.js';

document.addEventListener('DOMContentLoaded', () => {
    const arObject = document.getElementById('ar-object');

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
        calibrationOffset: 0, // Manual heading correction in degrees
        diagnosticData: {},
        worldAnchor: null, // The origin of our AR world in geographic coordinates
    };

    // --- Initialization ---
    initUI(appState);
    initMap((target) => {
        appState.targetLocation = { lat: target.lat, lng: target.lng };
        appState.targetElevation = target.elevation;
        appState.diagnosticData.targetLocation = { ...appState.targetLocation, elevation: appState.targetElevation };

        // A short timeout seems to be the most reliable way to ensure A-Frame has processed
        // the new entity attributes before we try to make it visible.
        setTimeout(() => {
            arObject.setAttribute('visible', 'true');
        }, 100);

        startSensors(appState, onSensorUpdate);
    });

    function onSensorUpdate() {
        if (appState.deviceOrientation !== undefined) {
            rotateMap(appState.deviceOrientation);
        }
    }

    setInterval(() => updateDiagnostics(appState.diagnosticData), 250);
});
