document.addEventListener('DOMContentLoaded', () => {
    const mapElement = document.getElementById('map');
    const cameraContainer = document.getElementById('camera-container');
    const cameraFeed = document.getElementById('camera-feed');
    const arMarker = document.getElementById('ar-marker');
    const instructions = document.getElementById('instructions');
    const diagnosticsOverlay = document.getElementById('diagnostics');
    const compassStatus = document.getElementById('compass-status');
    const gpsCalCheckbox = document.getElementById('gps-cal-checkbox');

    const GPS_BUFFER_SIZE = 100;
    let gpsLocationBuffer = [];

    let map;
    let userLocation;
    let targetLocation;
    let deviceOrientation;
    let rawHeading, isAbsolute;
    let magneticDeclination = 0; // Default to 0
    let gpsCalibrationOffset = 0;
    let gpsCalInterval = null;

    function logErrorToOverlay(message) {
        diagnosticsOverlay.innerHTML += `<br><span style="color: red;">ERROR: ${message}</span>`;
    }

    // Initialize the map
    map = L.map('map').setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Center map on user's location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const initialLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                map.setView(initialLocation, 16);
                map.isUserLocationSet = true; // Flag to prevent re-centering in watchPosition
                L.marker(initialLocation).addTo(map).bindPopup("You are here").openPopup();

                // Calculate magnetic declination
                if (typeof geomagnetism !== 'undefined') {
                    const model = geomagnetism.model(new Date());
                    const point = model.point([initialLocation.lat, initialLocation.lng]);
                    magneticDeclination = point.decl;
                }
            },
            () => {
                const msg = "Could not get initial location. Using default view.";
                console.log(msg);
                logErrorToOverlay(msg);
            },
            { enableHighAccuracy: true }
        );
    }

    map.on('click', (e) => {
        targetLocation = e.latlng;
        instructions.innerHTML = `<p>Target selected at: ${targetLocation.lat.toFixed(4)}, ${targetLocation.lng.toFixed(4)}</p><p>Look around to find it!</p>`;

        // Add a marker to the map
        if (window.targetMarker) {
            window.targetMarker.setLatLng(targetLocation);
        } else {
            window.targetMarker = L.marker(targetLocation).addTo(map);
        }

        // Switch to AR view
        mapElement.style.display = 'none';
        cameraContainer.style.display = 'block';
        arMarker.style.display = 'block';

        // Start camera and sensors
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
                    console.error("Error accessing camera: ", err);
                    const msg = "Could not access the camera. Please enable camera permissions.";
                    instructions.innerHTML = `<p>${msg}</p>`;
                    logErrorToOverlay(msg);
                });
        } else {
            const msg = "Camera not available on this device.";
            instructions.innerHTML = `<p>${msg}</p>`;
            logErrorToOverlay(msg);
        }
    }

    function startSensors() {
        // Initialize Kalman filters here to prevent loading crash
        const kfX = new KalmanFilter();
        const kfY = new KalmanFilter();

        if (navigator.geolocation) {
            navigator.geolocation.watchPosition(
                (position) => {
                    userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };

                    // Add to GPS buffer
                    gpsLocationBuffer.push(userLocation);
                    if (gpsLocationBuffer.length > GPS_BUFFER_SIZE) {
                        gpsLocationBuffer.shift();
                    }

                    if (!map.isUserLocationSet) {
                        map.setView(userLocation, 16);
                        map.isUserLocationSet = true;
                    }
                },
                (err) => {
                    console.error("Error getting location: ", err);
                    const msg = "Could not get location. Please enable location services.";
                    instructions.innerHTML = `<p>${msg}</p>`;
                    logErrorToOverlay(msg);
                },
                { enableHighAccuracy: true }
            );
        } else {
            const msg = "Geolocation not available on this device.";
            instructions.innerHTML = `<p>${msg}</p>`;
            logErrorToOverlay(msg);
        }

        const handleOrientation = (event) => {
            rawHeading = event.alpha;
            isAbsolute = event.absolute;

            if (compassStatus.innerHTML === '') { // Only set once
                if (isAbsolute) {
                    compassStatus.textContent = 'Compass: Absolute';
                    compassStatus.style.color = 'limegreen';
                } else {
                    compassStatus.textContent = 'Compass: Relative';
                    compassStatus.style.color = 'orange';
                }
            }

            let heading = event.alpha;
            if (typeof event.webkitCompassHeading !== 'undefined') {
                heading = event.webkitCompassHeading; // More reliable on iOS
            }

            // Convert heading to a 2D vector
            const headingRad = heading * Math.PI / 180;
            const x = Math.cos(headingRad);
            const y = Math.sin(headingRad);

            // Filter the vector components
            const filteredX = kfX.filter(x);
            const filteredY = kfY.filter(y);

            // Convert the smoothed vector back to an angle
            const smoothedHeadingRad = Math.atan2(filteredY, filteredX);
            let smoothedHeading = smoothedHeadingRad * 180 / Math.PI;
            smoothedHeading = (smoothedHeading + 360) % 360;

            let finalHeading;
            if (gpsCalCheckbox.checked) {
                // Apply GPS calibration offset
                finalHeading = rawHeading + gpsCalibrationOffset;
            } else {
                // Apply magnetic declination to get True North heading
                finalHeading = smoothedHeading + magneticDeclination;
            }
            deviceOrientation = (finalHeading + 360) % 360;

            updateARView(smoothedHeading);
        };

        // Prioritize the 'absolute' event but fall back to the standard one
        if (typeof window.DeviceOrientationAbsoluteEvent !== 'undefined') {
            window.addEventListener('deviceorientationabsolute', handleOrientation);
        } else if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', handleOrientation);
        } else {
            const msg = "Device orientation not available on this device.";
            instructions.innerHTML = `<p>${msg}</p>`;
            logErrorToOverlay(msg);
        }
    }

    function updateDiagnostics(data) {
        let content = '--- Diagnostics ---<br>';
        for (const [key, value] of Object.entries(data)) {
            let displayValue = value;
            if (typeof value === 'object' && value !== null) {
                displayValue = JSON.stringify(value, null, 2);
            }
            content += `${key}: ${displayValue}<br>`;
        }
        diagnosticsOverlay.innerHTML = content;
    }

    function updateARView(smoothedHeading) {
        if (!userLocation || !targetLocation || deviceOrientation === undefined) {
            return;
        }

        const distance = calculateDistance(userLocation, targetLocation);
        const bearing = calculateBearing(userLocation, targetLocation);
        let angleDifference = bearing - deviceOrientation;

        // Normalize the angle difference to be between -180 and 180
        if (angleDifference > 180) {
            angleDifference -= 360;
        } else if (angleDifference < -180) {
            angleDifference += 360;
        }

        // Add green outline when target is in view
        const inViewThreshold = 2.0; // degrees
        if (Math.abs(angleDifference) < inViewThreshold) {
            cameraContainer.classList.add('target-in-view');
        } else {
            cameraContainer.classList.remove('target-in-view');
        }

        // Dynamic sizing
        const maxMarkerSize = window.innerWidth / 4;
        const minMarkerSize = 30; // in pixels
        const maxDistanceForScaling = 100; // in km

        const distanceRatio = Math.min(distance / maxDistanceForScaling, 1.0);
        const markerSize = minMarkerSize + distanceRatio * (maxMarkerSize - minMarkerSize);

        arMarker.style.borderBottomWidth = `${markerSize}px`;
        arMarker.style.borderLeftWidth = `${markerSize / 2}px`;
        arMarker.style.borderRightWidth = `${markerSize / 2}px`;

        // Assuming a horizontal field of view of 60 degrees
        const fov = 60;
        const screenWidth = window.innerWidth;

        if (Math.abs(angleDifference) < fov / 2) {
            const xPosition = (angleDifference / (fov / 2)) * (screenWidth / 2) + (screenWidth / 2);
            arMarker.style.left = `${xPosition}px`;
            arMarker.style.display = 'block';
        } else {
            arMarker.style.display = 'none';
        }

        const trueHeading = deviceOrientation;

        updateDiagnostics({
            userLocation,
            targetLocation,
            rawHeading,
            magneticHeading: smoothedHeading,
            magneticDeclination,
            trueHeading,
            isAbsolute,
            distance,
            bearing,
            angleDifference,
            markerSize
        });
    }

    function calculateDistance(start, end) {
        const R = 6371; // Radius of the Earth in km
        const toRadians = Math.PI / 180;
        const dLat = (end.lat - start.lat) * toRadians;
        const dLon = (end.lng - start.lng) * toRadians;
        const lat1 = start.lat * toRadians;
        const lat2 = end.lat * toRadians;

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distance in km
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

        return (bearing + 360) % 360; // Normalize to 0-360
    }

    function calculateGpsMajorityVote() {
        if (gpsLocationBuffer.length < 2) {
            return null;
        }

        const bearings = [];
        for (let i = 0; i < gpsLocationBuffer.length - 1; i++) {
            const bearing = calculateBearing(gpsLocationBuffer[i], gpsLocationBuffer[i+1]);
            bearings.push(bearing);
        }

        // Quantize into 8 bins (N, NE, E, SE, S, SW, W, NW)
        const bins = new Array(8).fill(0);
        const binSize = 45; // 360 / 8
        bearings.forEach(b => {
            // Offset by half a bin to center the bins on N, NE, etc.
            const adjustedBearing = (b + binSize / 2) % 360;
            const binIndex = Math.floor(adjustedBearing / binSize);
            bins[binIndex]++;
        });

        // Find the bin with the most votes
        let maxVotes = 0;
        let winningBinIndex = -1;
        for (let i = 0; i < bins.length; i++) {
            if (bins[i] > maxVotes) {
                maxVotes = bins[i];
                winningBinIndex = i;
            }
        }

        if (winningBinIndex !== -1) {
            // Return the center angle of the winning bin
            return winningBinIndex * binSize;
        }

        return null;
    }

    gpsCalCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            // Start polling GPS for calibration
            gpsCalInterval = setInterval(() => {
                const votedDirection = calculateGpsMajorityVote();
                if (votedDirection !== null && rawHeading !== undefined) {
                    gpsCalibrationOffset = votedDirection - rawHeading;
                }
            }, 5000); // Recalculate every 5 seconds
        } else {
            // Stop polling and reset
            if (gpsCalInterval) {
                clearInterval(gpsCalInterval);
            }
            gpsCalibrationOffset = 0;
        }
    });
});
