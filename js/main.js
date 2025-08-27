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

        const scene = document.querySelector('a-scene');
        if (scene.hasLoaded) {
            arObject.setAttribute('gps-new-entity-place', `latitude: ${target.lat}; longitude: ${target.lng}`);
            arObject.setAttribute('visible', 'true');
        } else {
            scene.addEventListener('loaded', () => {
                arObject.setAttribute('gps-new-entity-place', `latitude: ${target.lat}; longitude: ${target.lng}`);
                arObject.setAttribute('visible', 'true');
            });
        }


        startSensors(appState, onSensorUpdate);
    });

    function onSensorUpdate() {
        if (appState.deviceOrientation !== undefined) {
            rotateMap(appState.deviceOrientation);
        }
    }

    setInterval(() => updateDiagnostics(appState.diagnosticData), 250);
});
