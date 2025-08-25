document.addEventListener('DOMContentLoaded', () => {
    const mapElement = document.getElementById('map');
    const cameraContainer = document.getElementById('camera-container');
    const cameraFeed = document.getElementById('camera-feed');
    const arMarker = document.getElementById('ar-marker');
    const instructions = document.getElementById('instructions');
    const diagnosticsOverlay = document.getElementById('diagnostics');
    const compassStatus = document.getElementById('compass-status');

    let map;
    let userLocation;
    let targetLocation;
    let deviceOrientation;
    let magneticDeclination = 0;
    let isDeclinationAvailable = false;

    let diagnosticData = {};
    let logMessages = [];

    function logMessage(message, isError = false) {
        const color = isError ? 'red' : '#00ff00'; // Green for info
        const prefix = isError ? 'ERROR: ' : 'INFO: ';
        const logEntry = `<span style="color: ${color};">${prefix}${message}</span>`;
        if (!logMessages.includes(logEntry)) {
            logMessages.push(logEntry);
        }
    }

    map = L.map('map').setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            const initialLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
            map.setView(initialLocation, 16);
            L.marker(initialLocation).addTo(map).bindPopup("You are here").openPopup();
        }, null, { enableHighAccuracy: true });
    }

    map.on('click', (e) => {
        targetLocation = e.latlng;
        diagnosticData.targetLocation = targetLocation;
        instructions.innerHTML = `<p>Target selected. Look around to find it!</p>`;

        if (window.targetMarker) {
            window.targetMarker.setLatLng(targetLocation);
        } else {
            window.targetMarker = L.marker(targetLocation).addTo(map);
        }

        mapElement.style.display = 'none';
        cameraContainer.style.display = 'block';
        arMarker.style.display = 'block';

        startCamera();
        startSensors();
    });

    function startCamera() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                .then(stream => {
                    cameraFeed.srcObject = stream;
                    cameraFeed.play();
                })
                .catch(err => {
                    logMessage("Could not access camera.", true);
                });
        } else {
            logMessage("Camera not available.", true);
        }
    }

    function startSensors() {
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

        const handleNewHeading = (data, isAbsolute) => {
            let heading;

            if (isAbsolute) {
                if (!advancedSensorReadingReceived) {
                    logMessage('First advanced sensor reading received.');
                    advancedSensorReadingReceived = true;
                }
                // Data is a quaternion from AbsoluteOrientationSensor.
                const euler = quaternionToEuler(data);
                heading = euler.yaw * 180 / Math.PI;
                heading = (heading + 360) % 360;

            } else {
                if (!legacySensorReadingReceived) {
                    logMessage('First legacy sensor reading received.');
                    legacySensorReadingReceived = true;
                }
                // Data is a heading number from legacy events.
                heading = data;
            }

            diagnosticData.rawHeading = heading.toFixed(2);
            diagnosticData.isAbsolute = isAbsolute;

            const compassType = isAbsolute ? 'Advanced' : 'Legacy';
            const headingType = isDeclinationAvailable ? 'True' : 'Magnetic';
            compassStatus.textContent = `Compass: ${compassType} (${headingType})`;
            compassStatus.style.color = isAbsolute ? 'cyan' : 'orange';

            let smoothedHeading;
            if (isFilterAvailable) {
                const headingRad = heading * Math.PI / 180;
                const x = Math.cos(headingRad);
                const y = Math.sin(headingRad);
                const filteredX = kfX.filter(x);
                const filteredY = kfY.filter(y);

                if (isNaN(filteredX) || isNaN(filteredY)) {
                    smoothedHeading = heading;
                } else {
                    const smoothedHeadingRad = Math.atan2(filteredY, filteredX);
                    smoothedHeading = smoothedHeadingRad * 180 / Math.PI;
                    smoothedHeading = (smoothedHeading + 360) % 360;
                }
            } else {
                smoothedHeading = heading;
            }

            diagnosticData.magneticHeading = smoothedHeading.toFixed(2);

            const finalHeading = smoothedHeading + magneticDeclination;
            diagnosticData.trueHeading = ((finalHeading + 360) % 360).toFixed(2);

            // *** NEW: Correct for screen orientation ***
            const screenOrientationAngle = screen.orientation.angle || 0;
            deviceOrientation = (finalHeading - screenOrientationAngle + 360) % 360;
            diagnosticData.screenCorrectedHeading = deviceOrientation.toFixed(2);


            updateARView();
        };

        const setupLegacyListener = () => {
            logMessage('Setting up legacy sensor listener...');
            const handleOrientationEvent = (event) => {
                if (typeof event.webkitCompassHeading !== 'undefined') {
                    handleNewHeading(event.webkitCompassHeading, false);
                    return;
                }
                if (event.absolute === true) {
                    handleNewHeading(event.alpha, false);
                } else {
                    logMessage("Compass is relative, which is not supported.", true);
                    compassStatus.textContent = 'Compass: Relative (unsupported)';
                    compassStatus.style.color = 'red';
                }
            };

            if (typeof window.DeviceOrientationAbsoluteEvent !== 'undefined') {
                logMessage('Listening for deviceorientationabsolute events.');
                window.addEventListener('deviceorientationabsolute', handleOrientationEvent);
            } else if (window.DeviceOrientationEvent) {
                logMessage('Listening for deviceorientation events.');
                window.addEventListener('deviceorientation', handleOrientationEvent);
            } else {
                logMessage("Device orientation events not available.", true);
            }
        };

        const startAdvancedSensor = () => {
            logMessage('Attempting to start AbsoluteOrientationSensor...');
            try {
                const sensor = new AbsoluteOrientationSensor({ frequency: 60 });
                logMessage('Successfully created AbsoluteOrientationSensor object.');

                sensor.onreading = () => {
                    handleNewHeading(sensor.quaternion, true);
                };

                sensor.onerror = (event) => {
                    logMessage(`Advanced Sensor Error: ${event.error.name}. Falling back to legacy listener.`, true);
                    setupLegacyListener();
                };

                sensor.start();
                logMessage('sensor.start() called on advanced sensor.');

            } catch (error) {
                logMessage(`Failed to start advanced sensor: ${error.message}. Falling back to legacy listener.`, true);
                setupLegacyListener();
            }
        };

        if ('AbsoluteOrientationSensor' in window) {
            logMessage('AbsoluteOrientationSensor API is available.');
            startAdvancedSensor();
        } else {
            logMessage('AbsoluteOrientationSensor API not available.');
            setupLegacyListener();
        }

        if (navigator.geolocation) {
            logMessage('Geolocation API is available. Watching position...');
            navigator.geolocation.watchPosition(
                (position) => {
                    if (!userLocation) {
                        logMessage('Received first geolocation update.');
                    }
                    userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    diagnosticData.userLocation = userLocation;

                    if (!map.isUserLocationSet) {
                        map.isUserLocationSet = true;
                        logMessage('Calculating magnetic declination...');
                        if (typeof geomag !== 'undefined') {
                            const field = geomag.field(userLocation.lat, userLocation.lng);
                            magneticDeclination = field.declination;
                            isDeclinationAvailable = true;
                            diagnosticData.magneticDeclination = magneticDeclination.toFixed(2);
                            logMessage(`Magnetic declination set to: ${magneticDeclination.toFixed(2)}`);
                        } else {
                            logMessage('Geomag library not available. Compass will use Magnetic North.', true);
                        }
                    }
                },
                (err) => {
                    logMessage(`Could not get location: ${err.message}`, true);
                },
                { enableHighAccuracy: true }
            );
        } else {
            logMessage("Geolocation API not available.", true);
        }
    }

    function updateDiagnostics(data) {
        let content = '--- Diagnostics ---<br>';
        for (const [key, value] of Object.entries(data)) {
            let displayValue = value;
            if (value === undefined) {
                displayValue = '...';
            } else if (typeof value === 'object' && value !== null) {
                displayValue = JSON.stringify(value, (k, v) => (v && v.toFixed) ? Number(v.toFixed(2)) : v, 2);
            }
            content += `${key}: ${displayValue}<br>`;
        }
        content += '<br>--- Logs ---<br>';
        content += logMessages.join('<br>');
        diagnosticsOverlay.innerHTML = content;
    }

    function updateARView() {
        if (!userLocation || !targetLocation || deviceOrientation === undefined) {
            return;
        }

        const distance = calculateDistance(userLocation, targetLocation);
        const bearing = calculateBearing(userLocation, targetLocation);
        let angleDifference = bearing - deviceOrientation;

        if (angleDifference > 180) angleDifference -= 360;
        if (angleDifference < -180) angleDifference += 360;

        diagnosticData.distance = distance.toFixed(2);
        diagnosticData.bearing = bearing.toFixed(2);
        diagnosticData.angleDifference = angleDifference.toFixed(2);

        if (Math.abs(angleDifference) < 2.0) {
            cameraContainer.classList.add('target-in-view');
        } else {
            cameraContainer.classList.remove('target-in-view');
        }

        const maxMarkerSize = window.innerWidth / 4;
        const minMarkerSize = 30;
        const maxDistanceForScaling = 100;
        const distanceRatio = Math.min(distance / maxDistanceForScaling, 1.0);
        const markerSize = minMarkerSize + distanceRatio * (maxMarkerSize - minMarkerSize);
        diagnosticData.markerSize = markerSize.toFixed(2);

        arMarker.style.borderBottomWidth = `${markerSize}px`;
        arMarker.style.borderLeftWidth = `${markerSize / 2}px`;
        arMarker.style.borderRightWidth = `${markerSize / 2}px`;

        const fov = 60;
        const screenWidth = window.innerWidth;
        if (Math.abs(angleDifference) < fov / 2) {
            const xPosition = (angleDifference / (fov / 2)) * (screenWidth / 2) + (screenWidth / 2);
            arMarker.style.left = `${xPosition}px`;
            arMarker.style.display = 'block';
        } else {
            arMarker.style.display = 'none';
        }
    }

    /**
     * Calculates the distance between two GPS coordinates in kilometers.
     * Uses the Haversine formula.
     * @param {object} start - The starting coordinate {lat, lng}.
     * @param {object} end - The ending coordinate {lat, lng}.
     * @returns {number} The distance in kilometers.
     */
    function calculateDistance(start, end) {
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
    function calculateBearing(start, end) {
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

    function quaternionToEuler(q) {
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

    setInterval(() => updateDiagnostics(diagnosticData), 250);
});
