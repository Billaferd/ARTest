let map;
let targetMarker;

/**
 * Initializes the Leaflet map.
 * @param {function} onTargetSelect - Callback for when a user selects a target.
 */
export function initMap(onTargetSelect) {
    map = L.map('map', {
        rotate: true // Enable rotation features
    }).setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Get user's initial location to center the map
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            const initialLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
            map.setView(initialLocation, 16);
            L.marker(initialLocation).addTo(map).bindPopup("You are here").openPopup();
        }, null, { enableHighAccuracy: true });
    }

    map.on('click', (e) => {
        const targetLocation = e.latlng;

        if (targetMarker) {
            targetMarker.setLatLng(targetLocation);
        } else {
            targetMarker = L.marker(targetLocation).addTo(map);
        }

        onTargetSelect(targetLocation);
    });
}

/**
 * Transitions the UI from map view to AR view.
 */
export function transitionToARView() {
    const mapElement = document.getElementById('map');
    const cameraContainer = document.getElementById('camera-container');

    mapElement.classList.add('collapsed');
    cameraContainer.style.display = 'block';

    // After the CSS transition, invalidate the map size so it redraws correctly.
    setTimeout(() => {
        if (map) {
            map.invalidateSize();
        }
    }, 550); // A little after the transition ends (0.5s)
}

/**
 * Rotates the map to match a given heading.
 * This is exposed on the window object so that A-Frame components can call it.
 * @param {number} heading - The heading in degrees.
 */
function rotateMap(heading) {
    if (map && map.setBearing) {
        map.setBearing(heading);
    }
}
window.rotateMap = rotateMap;
