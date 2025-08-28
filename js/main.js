import { initMap, transitionToARView } from './map-controller.js';

document.addEventListener('DOMContentLoaded', () => {
    let arObject; // To hold a reference to our AR cylinder

    function onTargetSelect(target) {
        const scene = document.querySelector('a-scene');

        // If the cylinder already exists, just update its position
        if (arObject) {
            arObject.setAttribute('gps-entity-place', `latitude: ${target.lat}; longitude: ${target.lng};`);
        } else {
            // Create the cylinder
            arObject = document.createElement('a-cylinder');
            arObject.setAttribute('gps-entity-place', `latitude: ${target.lat}; longitude: ${target.lng};`);
            arObject.setAttribute('radius', '2.5');
            arObject.setAttribute('height', '50');
            arObject.setAttribute('color', 'magenta');

            scene.appendChild(arObject);
        }

        // Switch to AR view
        transitionToARView();
    }

    initMap(onTargetSelect);
});
