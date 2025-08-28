import { getElevation } from './sensor-controller.js';
import { showInstruction, hideInstruction } from './ui-controller.js';

let map;
let targetMarker;

/**
 * Initializes the Leaflet map.
 * @param {function} onTargetSelect - Callback function for when a target is selected.
 */
export function initMap(onTargetSelect) {
    map = L.map('map', {
        rotate: true
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

    map.on('click', async (e) => {
        const targetLocation = e.latlng;
        const targetElevation = await getElevation(targetLocation.lat, targetLocation.lng);

        if (targetMarker) {
            targetMarker.setLatLng(targetLocation);
        } else {
            targetMarker = L.marker(targetLocation).addTo(map);
        }

        // Hide instructions and transition the UI
        hideInstruction();
        transitionToARView();

        // Callback to the main app
        onTargetSelect({ ...targetLocation, elevation: targetElevation });
    });
}

/**
 * Transitions the UI from map view to AR view.
 */
function transitionToARView() {
    const mapElement = document.getElementById('map');
    const cameraContainer = document.getElementById('camera-container');

    mapElement.classList.add('collapsed');
    cameraContainer.style.display = 'block';

    // A short delay to allow the camera to initialize before showing new instructions
    setTimeout(() => {
        showInstruction("Look around to find the target", false);
    }, 1000);

    // After the CSS transition, invalidate the map size so it redraws correctly.
    setTimeout(() => {
        if (map) {
            map.invalidateSize();
        }
    }, 550); // A little after the transition ends (0.5s)
}

/**
 * Rotates the map to match the device's heading.
 * @param {number} heading - The device's current heading in degrees.
 */
export function rotateMap(heading) {
    if (map && map.setBearing) {
        map.setBearing(heading);
    }
}
window.rotateMap = rotateMap; // Expose for non-module scripts
