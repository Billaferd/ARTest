document.addEventListener('DOMContentLoaded', () => {
    const mapElement = document.getElementById('map');
    const cameraContainer = document.getElementById('camera-container');
    const cameraFeed = document.getElementById('camera-feed');
    const arMarker = document.getElementById('ar-marker');
    const instructions = document.getElementById('instructions');

    let map;
    let userLocation;
    let targetLocation;
    let deviceOrientation;

    // Initialize the map
    map = L.map('map').setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

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
                    instructions.innerHTML = '<p>Could not access the camera. Please enable camera permissions.</p>';
                });
        } else {
            instructions.innerHTML = '<p>Camera not available on this device.</p>';
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
                    instructions.innerHTML = '<p>Could not get location. Please enable location services.</p>';
                }
            );
        } else {
            instructions.innerHTML = '<p>Geolocation not available on this device.</p>';
        }

        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', (event) => {
                // alpha: rotation around z-axis
                deviceOrientation = event.alpha;
                updateARView();
            });
        } else {
            instructions.innerHTML = '<p>Device orientation not available on this device.</p>';
        }
    }

    function updateARView() {
        if (!userLocation || !targetLocation || deviceOrientation === undefined) {
            return;
        }

        const bearing = calculateBearing(userLocation, targetLocation);
        let angleDifference = bearing - deviceOrientation;

        // Normalize the angle difference to be between -180 and 180
        if (angleDifference > 180) {
            angleDifference -= 360;
        } else if (angleDifference < -180) {
            angleDifference += 360;
        }

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
