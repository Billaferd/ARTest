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
        const kfX = new KalmanFilter();
        const kfY = new KalmanFilter();

        const handleNewHeading = (heading, isAbsolute) => {
            diagnosticData.rawHeading = heading;
            diagnosticData.isAbsolute = isAbsolute;

            if (compassStatus.innerHTML === '' || compassStatus.style.color !== 'cyan') {
                if (isAbsolute) {
                    compassStatus.textContent = 'Compass: Absolute';
                    compassStatus.style.color = 'limegreen';
                } else {
                    compassStatus.textContent = 'Compass: Relative';
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
            const handleOrientationEvent = (event) => {
                // Prefer webkitCompassHeading as it's absolute
                if (typeof event.webkitCompassHeading !== 'undefined') {
                    handleNewHeading(event.webkitCompassHeading, true);
                    return;
                }

                // Fallback to alpha, but only if it's absolute
                if (event.absolute === true) {
                    handleNewHeading(event.alpha, true);
                } else {
                    const message = "Compass is relative, which is not supported by this AR experience.";
                    if (!diagnosticsOverlay.innerHTML.includes(message)) {
                        logErrorToOverlay(message);
                        compassStatus.textContent = 'Compass: Relative (unsupported)';
                        compassStatus.style.color = 'red';
                    }
                }
            };
            if (typeof window.DeviceOrientationAbsoluteEvent !== 'undefined') {
                window.addEventListener('deviceorientationabsolute', handleOrientationEvent);
            } else if (window.DeviceOrientationEvent) {
                window.addEventListener('deviceorientation', handleOrientationEvent);
            } else {
                logErrorToOverlay("Device orientation not available.");
            }
        };

        const startAdvancedSensor = () => {
            try {
                const sensor = new AbsoluteOrientationSensor({ frequency: 60 });
                sensor.onreading = () => {
                    compassStatus.textContent = 'Compass: Advanced';
                    compassStatus.style.color = 'cyan';
                    const q = sensor.quaternion;
                    const yaw = Math.atan2(2 * (q[3] * q[2] + q[0] * q[1]), 1 - 2 * (q[1] * q[1] + q[2] * q[2]));
                    let heading = yaw * 180 / Math.PI;
                    if (heading < 0) heading += 360;
                    handleNewHeading(heading, true);
                };
                sensor.onerror = (event) => {
                    logErrorToOverlay(`Advanced Sensor Error: ${event.error.name}`);
                    setupLegacyListener();
                };
                sensor.start();
            } catch (error) {
                logErrorToOverlay(`Advanced Sensor failed to start: ${error.message}`);
                setupLegacyListener();
            }
        };

        if ('AbsoluteOrientationSensor' in window) {
            Promise.all([
                navigator.permissions.query({ name: "accelerometer" }),
                navigator.permissions.query({ name: "magnetometer" }),
                navigator.permissions.query({ name: "gyroscope" }),
            ]).then((results) => {
                if (results.every((result) => result.state === "granted")) {
                    startAdvancedSensor();
                } else {
                    logErrorToOverlay("Permissions not granted for advanced sensor. Falling back.");
                    setupLegacyListener();
                }
            }).catch(err => {
                logErrorToOverlay("Error querying permissions. Falling back.");
                setupLegacyListener();
            });
        } else {
            setupLegacyListener();
        }

        if (navigator.geolocation) {
            navigator.geolocation.watchPosition(
                (position) => {
                    userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    diagnosticData.userLocation = userLocation;

                    if (!map.isUserLocationSet) {
                        map.isUserLocationSet = true; // Only do this once
                        if (typeof geomagnetism !== 'undefined') {
                            const model = geomagnetism.model(new Date());
                            const point = model.point([userLocation.lat, userLocation.lng]);
                            magneticDeclination = point.decl;
                            diagnosticData.magneticDeclination = magneticDeclination;
                        }
                    }
                },
                (err) => {
                    logErrorToOverlay("Could not get location.");
                },
                { enableHighAccuracy: true }
            );
        } else {
            logErrorToOverlay("Geolocation not available.");
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
