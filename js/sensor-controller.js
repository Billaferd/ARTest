import { logMessage } from './ui-controller.js';

/**
 * Initializes and starts listening to device sensors (geolocation only).
 * Orientation sensors are now handled entirely by AR.js.
 * @param {object} appState - The application state object to update with sensor data.
 */
export function startSensors(appState) {
    logMessage('Initializing geolocation sensor...');

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            async (position) => {
                const firstUpdate = !appState.userLocation;
                appState.userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                appState.diagnosticData.userLocation = { ...appState.userLocation };

                if (firstUpdate) {
                    logMessage('Received first geolocation update. Fetching elevation and declination...');

                    appState.userElevation = await getElevation(appState.userLocation.lat, appState.userLocation.lng);
                    appState.diagnosticData.userLocation.elevation = appState.userElevation;

                    if (typeof geomag !== 'undefined') {
                        const field = geomag.field(appState.userLocation.lat, appState.userLocation.lng);
                        appState.magneticDeclination = field.declination;
                        appState.isDeclinationAvailable = true;
                        appState.diagnosticData.magneticDeclination = appState.magneticDeclination.toFixed(2);
                        logMessage(`Magnetic declination set to: ${appState.magneticDeclination.toFixed(2)}`);
                    } else {
                        logMessage('Geomag library not available.', true);
                    }
                }
            },
            (err) => logMessage(`Could not get location: ${err.message}`, true),
            { enableHighAccuracy: true }
        );
    } else {
        logMessage("Geolocation API not available.", true);
    }
}

/**
 * Fetches elevation data for a given coordinate.
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 * @returns {Promise<number>} The elevation in meters.
 */
export async function getElevation(lat, lng) {
    try {
        const response = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (data.elevation && data.elevation.length > 0) {
            logMessage(`Elevation for ${lat.toFixed(2)}, ${lng.toFixed(2)}: ${data.elevation[0]}m`);
            return data.elevation[0];
        }
        logMessage(`Elevation data not found for ${lat.toFixed(2)}, ${lng.toFixed(2)}.`, true);
        return 0;
    } catch (error) {
        logMessage(`Failed to fetch elevation: ${error.message}`, true);
        return 0;
    }
}
