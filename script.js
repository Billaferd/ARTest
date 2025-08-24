document.addEventListener('DOMContentLoaded', () => {
    const mapElement = document.getElementById('map');
    const cameraContainer = document.getElementById('camera-container');
    const cameraFeed = document.getElementById('camera-feed');
    const arMarker = document.getElementById('ar-marker');
    const instructions = document.getElementById('instructions');
    const diagnosticsOverlay = document.getElementById('diagnostics');

    let map;
    let userLocation;
    let targetLocation;
    let deviceOrientation;

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
            },
            () => {
                const msg = "Could not get initial location. Using default view.";
                console.log(msg);
                logErrorToOverlay(msg);
            }
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
                }
            );
        } else {
            const msg = "Geolocation not available on this device.";
            instructions.innerHTML = `<p>${msg}</p>`;
            logErrorToOverlay(msg);
        }

        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', (event) => {
                let heading = event.alpha;
                if (typeof event.webkitCompassHeading !== 'undefined') {
                    heading = event.webkitCompassHeading; // More reliable on iOS
                }
                deviceOrientation = heading;
                updateARView();
            });
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
            if (typeof value === 'number') {
                displayValue = value.toFixed(3);
            }
            if (typeof value === 'object' && value !== null) {
                displayValue = JSON.stringify(value, (k, v) => (typeof v === 'number' ? v.toFixed(3) : v), 2);
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
            const xPosition = (-angleDifference / (fov / 2)) * (screenWidth / 2) + (screenWidth / 2);
            arMarker.style.left = `${xPosition}px`;
            arMarker.style.display = 'block';
        } else {
            arMarker.style.display = 'none';
        }

        updateDiagnostics({
            userLocation,
            targetLocation,
            deviceOrientation,
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
