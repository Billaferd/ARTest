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
    let smoothedOrientation;
    let rawHeading, isAbsolute;
    let magneticDeclination = 0; // Default to 0

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
        if (navigator.geolocation) {
            navigator.geolocation.watchPosition(
                (position) => {
                    userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };

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

            if (smoothedOrientation === undefined) {
                smoothedOrientation = heading;
            } else {
                const smoothingFactor = 0.4; // Increased for more responsiveness
                let diff = heading - smoothedOrientation;

                // Handle wrap-around
                if (diff > 180) { diff -= 360; }
                if (diff < -180) { diff += 360; }

                smoothedOrientation += diff * smoothingFactor;

                // Keep it in the 0-360 range
                smoothedOrientation = (smoothedOrientation + 360) % 360;
            }

            // Apply magnetic declination to get True North heading
            const trueHeading = smoothedOrientation + magneticDeclination;
            deviceOrientation = (trueHeading + 360) % 360;

            updateARView();
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

    function updateARView() {
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
            smoothedOrientation,
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
});
