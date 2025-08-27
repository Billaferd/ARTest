import { logMessage } from './ui-controller.js';
import { quaternionToEuler, rotateVectorByQuaternion } from './utils.js';

/**
 * Initializes and starts listening to device sensors (orientation and geolocation).
 * @param {object} appState - The application state object to update with sensor data.
 * @param {function} onUpdate - Callback function to run when new data is available.
 */
export function startSensors(appState, onUpdate) {
    logMessage('Starting sensor initialization...');
    let kfX, kfY;
    let isFilterAvailable = false;

    try {
        kfX = new KalmanFilter();
        kfY = new KalmanFilter();
        isFilterAvailable = true;
        logMessage('Kalman filters initialized successfully.');
    } catch (e) {
        logMessage(`KalmanFilter not available. Error: ${e.message}. Proceeding without smoothing.`, true);
    }

    let advancedSensorReadingReceived = false;
    let legacySensorReadingReceived = false;

    const handleNewHeading = (event, isAbsolute) => {
        let trueHeading;
        let magneticHeadingForDiagnostics;
        let pitch;

        if (isAbsolute) {
            if (!advancedSensorReadingReceived) {
                logMessage('First advanced sensor reading received.');
                advancedSensorReadingReceived = true;
            }
            // --- New, more robust heading calculation ---
            // We rotate a 'forward' vector by the device's orientation quaternion.
            // The angle of the resulting vector in the world's horizontal plane is the heading.
            const q = event; // event is the quaternion array
            const deviceForward = [0, 0, -1]; // The direction the back of the phone points
            const worldForward = rotateVectorByQuaternion(deviceForward, q);

            // The world coordinate system is East-North-Up (ENU).
            // The heading is the angle in the East-North plane (X-Y plane of the world).
            const headingRad = Math.atan2(worldForward[0], worldForward[1]); // atan2(east, north)
            const magneticHeading = (headingRad * 180 / Math.PI + 360) % 360;

            // We still need pitch, which we can get from the old Euler conversion.
            // It's less sensitive to issues than yaw was.
            const euler = quaternionToEuler(q);
            pitch = euler.pitch * (180 / Math.PI);

            trueHeading = (magneticHeading + appState.magneticDeclination + 360) % 360;
            magneticHeadingForDiagnostics = magneticHeading;
            appState.diagnosticData.rawHeading = magneticHeading.toFixed(2);
        } else {
            if (!legacySensorReadingReceived) {
                logMessage('First legacy sensor reading received.');
                legacySensorReadingReceived = true;
            }
            const magneticHeading = event.webkitCompassHeading || event.alpha;
            pitch = event.beta;
            trueHeading = magneticHeading + appState.magneticDeclination;
            magneticHeadingForDiagnostics = magneticHeading;
            appState.diagnosticData.rawHeading = magneticHeading.toFixed(2);
        }

        appState.diagnosticData.isAbsolute = isAbsolute;
        const compassType = isAbsolute ? 'Advanced' : 'Legacy';
        const headingType = appState.isDeclinationAvailable ? 'True' : 'Magnetic';
        const compassStatus = document.getElementById('compass-status');
        compassStatus.textContent = `Compass: ${compassType} (${headingType})`;
        compassStatus.style.color = isAbsolute ? 'cyan' : 'orange';

        let smoothedHeading;
        if (isFilterAvailable) {
            const headingRad = trueHeading * Math.PI / 180;
            const x = Math.cos(headingRad);
            const y = Math.sin(headingRad);
            const filteredX = kfX.filter(x);
            const filteredY = kfY.filter(y);
            const smoothedHeadingRad = Math.atan2(filteredY, filteredX);
            smoothedHeading = (smoothedHeadingRad * 180 / Math.PI + 360) % 360;
        } else {
            smoothedHeading = trueHeading;
        }

        appState.diagnosticData.magneticHeading = (magneticHeadingForDiagnostics).toFixed(2);
        appState.diagnosticData.trueHeading = smoothedHeading.toFixed(2);

        let finalHeading = smoothedHeading;
        // The screen orientation correction is only needed for the legacy `deviceorientation` event,
        // as the `AbsoluteOrientationSensor` provides a world-based orientation directly.
        // The correction should be additive.
        if (!isAbsolute) {
            const screenOrientationAngle = screen.orientation.angle || 0;
            finalHeading = (smoothedHeading + screenOrientationAngle + 360) % 360;
        }

        // Apply manual calibration offset
        const calibratedHeading = (finalHeading + appState.calibrationOffset + 360) % 360;

        appState.deviceOrientation = calibratedHeading;
        appState.devicePitch = pitch;
        appState.diagnosticData.screenCorrectedHeading = appState.deviceOrientation.toFixed(2);
        appState.diagnosticData.pitch = appState.devicePitch.toFixed(2);

        onUpdate(); // Notify the main app that there's new data
    };

    const setupLegacyListener = () => {
        logMessage('Setting up legacy sensor listener...');
        const handleOrientationEvent = (event) => {
            if (typeof event.webkitCompassHeading !== 'undefined' || event.alpha !== null) {
                handleNewHeading(event, false);
            } else {
                logMessage("Compass data not available in event.", true);
                document.getElementById('compass-status').textContent = 'Compass: Error';
                document.getElementById('compass-status').style.color = 'red';
            }
        };

        if (typeof window.DeviceOrientationAbsoluteEvent !== 'undefined') {
            window.addEventListener('deviceorientationabsolute', handleOrientationEvent);
        } else if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', handleOrientationEvent);
        } else {
            logMessage("Device orientation events not available.", true);
        }
    };

    const startAdvancedSensor = () => {
        logMessage('Attempting to start AbsoluteOrientationSensor...');
        try {
            const sensor = new AbsoluteOrientationSensor({ frequency: 60 });
            sensor.onreading = () => handleNewHeading(sensor.quaternion, true);
            sensor.onerror = (event) => {
                logMessage(`Advanced Sensor Error: ${event.error.name}. Falling back to legacy listener.`, true);
                setupLegacyListener();
            };
            sensor.start();
        } catch (error) {
            logMessage(`Failed to start advanced sensor: ${error.message}. Falling back to legacy listener.`, true);
            setupLegacyListener();
        }
    };

    // The AbsoluteOrientationSensor is preferred, but we provide a fallback to the legacy
    // DeviceOrientationEvent if the advanced sensor fails for any reason.
    try {
        startAdvancedSensor();
    } catch (error) {
        logMessage(`Could not start advanced sensor: ${error.message}. Trying legacy sensors.`, true);
        setupLegacyListener();
    }

    if (navigator.geolocation) {
        logMessage('Geolocation API is available. Watching position...');
        navigator.geolocation.watchPosition(
            async (position) => {
                const firstUpdate = !appState.userLocation;
                appState.userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };

                if (firstUpdate) {
                    // This is the first time we have a location, so set the world anchor
                    appState.worldAnchor = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    };
                    logMessage(`World anchor set at: ${appState.worldAnchor.lat.toFixed(6)}, ${appState.worldAnchor.lng.toFixed(6)}`);

                    logMessage('Received first geolocation update. Fetching elevation...');
                    appState.userElevation = await getElevation(appState.userLocation.lat, appState.userLocation.lng);
                    appState.diagnosticData.userLocation = { ...appState.userLocation, elevation: appState.userElevation };

                    logMessage('Calculating magnetic declination...');
                    if (typeof geomag !== 'undefined') {
                        const field = geomag.field(appState.userLocation.lat, appState.userLocation.lng);
                        appState.magneticDeclination = field.declination;
                        appState.isDeclinationAvailable = true;
                        appState.diagnosticData.magneticDeclination = appState.magneticDeclination.toFixed(2);
                        logMessage(`Magnetic declination set to: ${appState.magneticDeclination.toFixed(2)}`);
                    } else {
                        logMessage('Geomag library not available. Compass will use Magnetic North.', true);
                    }
                } else {
                     appState.diagnosticData.userLocation = { ...appState.userLocation, elevation: appState.userElevation };
                }

                onUpdate();
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
