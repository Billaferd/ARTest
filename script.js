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

    let diagnosticData = {};

    function logErrorToOverlay(message) {
        diagnosticsOverlay.innerHTML += `<br><span style="color: red;">ERROR: ${message}</span>`;
    }

    map = L.map('map').setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Get initial location to center map
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
        startSensors(); // Sensors are now started on click
    });

    function startCamera() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                .then(stream => {
                    cameraFeed.srcObject = stream;
                    cameraFeed.play();
                })
                .catch(err => {
                    logErrorToOverlay("Could not access camera.");
                });
        } else {
            logErrorToOverlay("Camera not available.");
        }
    }

    function startSensors() {
        logErrorToOverlay('Starting sensor initialization...');
        let kfX, kfY;

        try {
            kfX = new KalmanFilter();
            kfY = new KalmanFilter();
            logErrorToOverlay('Kalman filters initialized successfully.');
        } catch (e) {
            logErrorToOverlay(`CRITICAL: Failed to initialize KalmanFilter. Error: ${e.message}. The application cannot proceed.`);
            return;
        }

        let advancedSensorReadingReceived = false;
        let legacySensorReadingReceived = false;

        const handleNewHeading = (data, isAbsolute) => {
            let heading;

            if (isAbsolute) {
                if (!advancedSensorReadingReceived) {
                    logErrorToOverlay('First advanced sensor reading received.');
                    advancedSensorReadingReceived = true;
                }
                // Data is a quaternion from AbsoluteOrientationSensor
                const q = data;
                const yaw = Math.atan2(2 * (q[3] * q[2] + q[0] * q[1]), 1 - 2 * (q[1] * q[1] + q[2] * q[2]));
                heading = yaw * 180 / Math.PI;
                heading = 360 - heading; // Invert as per previous findings
                heading = (heading + 360) % 360;
            } else {
                if (!legacySensorReadingReceived) {
                    logErrorToOverlay('First legacy sensor reading received.');
                    legacySensorReadingReceived = true;
                }
                // Data is a heading number from legacy events
                heading = data;
            }

            diagnosticData.rawHeading = heading.toFixed(2);
            diagnosticData.isAbsolute = isAbsolute;

            if (compassStatus.innerHTML === '' || compassStatus.style.color !== 'cyan') {
                if (isAbsolute) {
                    compassStatus.textContent = 'Compass: Advanced';
                    compassStatus.style.color = 'cyan';
                } else {
                    compassStatus.textContent = 'Compass: Legacy';
                    compassStatus.style.color = 'orange';
                }
            }

            const headingRad = heading * Math.PI / 180;
            const x = Math.cos(headingRad);
            const y = Math.sin(headingRad);

            const filteredX = kfX.filter(x);
            const filteredY = kfY.filter(y);

            let smoothedHeading;
            if (isNaN(filteredX) || isNaN(filteredY)) {
                smoothedHeading = heading;
            } else {
                const smoothedHeadingRad = Math.atan2(filteredY, filteredX);
                smoothedHeading = smoothedHeadingRad * 180 / Math.PI;
                smoothedHeading = (smoothedHeading + 360) % 360;
            }
            diagnosticData.magneticHeading = smoothedHeading;

            const finalHeading = smoothedHeading + magneticDeclination;
            deviceOrientation = (finalHeading + 360) % 360;
            diagnosticData.trueHeading = deviceOrientation;

            updateARView();
        };

        const setupLegacyListener = () => {
            logErrorToOverlay('Setting up legacy sensor listener...');
            const handleOrientationEvent = (event) => {
                if (typeof event.webkitCompassHeading !== 'undefined') {
                    handleNewHeading(event.webkitCompassHeading, false); // Assuming legacy is not absolute unless specified
                    return;
                }
                if (event.absolute === true) {
                    handleNewHeading(event.alpha, false);
                } else {
                    const message = "Compass is relative, which is not supported.";
                    if (!diagnosticsOverlay.innerHTML.includes(message)) {
                        logErrorToOverlay(message);
                        compassStatus.textContent = 'Compass: Relative (unsupported)';
                        compassStatus.style.color = 'red';
                    }
                }
            };

            if (typeof window.DeviceOrientationAbsoluteEvent !== 'undefined') {
                logErrorToOverlay('Listening for deviceorientationabsolute events.');
                window.addEventListener('deviceorientationabsolute', handleOrientationEvent);
            } else if (window.DeviceOrientationEvent) {
                logErrorToOverlay('Listening for deviceorientation events.');
                window.addEventListener('deviceorientation', handleOrientationEvent);
            } else {
                logErrorToOverlay("Device orientation events not available.");
            }
        };

        const startAdvancedSensor = () => {
            logErrorToOverlay('Attempting to start AbsoluteOrientationSensor...');
            try {
                const sensor = new AbsoluteOrientationSensor({ frequency: 60 });
                logErrorToOverlay('Successfully created AbsoluteOrientationSensor object.');

                sensor.onreading = () => {
                    handleNewHeading(sensor.quaternion, true);
                };

                sensor.onerror = (event) => {
                    logErrorToOverlay(`Advanced Sensor Error: ${event.error.name}. Falling back to legacy listener.`);
                    setupLegacyListener();
                };

                sensor.start();
                logErrorToOverlay('sensor.start() called on advanced sensor.');

            } catch (error) {
                logErrorToOverlay(`Failed to start advanced sensor: ${error.message}. Falling back to legacy listener.`);
                setupLegacyListener();
            }
        };

        if ('AbsoluteOrientationSensor' in window) {
            logErrorToOverlay('AbsoluteOrientationSensor API is available.');
            startAdvancedSensor();
        } else {
            logErrorToOverlay('AbsoluteOrientationSensor API not available.');
            setupLegacyListener();
        }

        if (navigator.geolocation) {
            logErrorToOverlay('Geolocation API is available. Watching position...');
            navigator.geolocation.watchPosition(
                (position) => {
                    if (!userLocation) {
                        logErrorToOverlay('Received first geolocation update.');
                    }
                    userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    diagnosticData.userLocation = userLocation;

                    if (!map.isUserLocationSet) {
                        map.isUserLocationSet = true;
                        logErrorToOverlay('Calculating magnetic declination...');
                        if (typeof geomagnetism !== 'undefined') {
                            const model = geomagnetism.model(new Date());
                            const point = model.point([userLocation.lat, userLocation.lng]);
                            magneticDeclination = point.decl;
                            diagnosticData.magneticDeclination = magneticDeclination;
                            logErrorToOverlay(`Magnetic declination set to: ${magneticDeclination.toFixed(2)}`);
                        } else {
                            logErrorToOverlay('Geomagnetism library not available.');
                        }
                    }
                },
                (err) => {
                    logErrorToOverlay(`Could not get location: ${err.message}`);
                },
                { enableHighAccuracy: true }
            );
        } else {
            logErrorToOverlay("Geolocation API not available.");
        }
    }

    function updateDiagnostics(data) {
        let content = '--- Diagnostics ---<br>';
        for (const [key, value] of Object.entries(data)) {
            let displayValue = value;
            if (value === undefined) {
                displayValue = '...';
            } else if (typeof value === 'object' && value !== null) {
                displayValue = JSON.stringify(value, null, 2);
            }
            content += `${key}: ${displayValue}<br>`;
        }
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

        diagnosticData.distance = distance;
        diagnosticData.bearing = bearing;
        diagnosticData.angleDifference = angleDifference;

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
        diagnosticData.markerSize = markerSize;

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

    function calculateDistance(start, end) {
        const R = 6371;
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

    function calculateBearing(start, end) {
        const toRadians = Math.PI / 180;
        const lat1 = start.lat * toRadians;
        const lng1 = start.lng * toRadians;
        const lat2 = end.lat * toRadians;
        const lng2 = end.lng * toRadians;
        const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) -
                  Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
        const bearing = Math.atan2(y, x) / toRadians;
        return (bearing + 360) % 360;
    }

    setInterval(() => updateDiagnostics(diagnosticData), 250);
});
