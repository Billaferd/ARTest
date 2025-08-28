import { rotateMap } from './map-controller.js';

AFRAME.registerComponent('map-sync', {
    init: function () {
        this.camera = this.el.camera.el; // Get the camera entity
        if (!this.camera) {
            console.error("map-sync: Camera not found!");
        }
    },

    tick: function () {
        if (!this.camera) return;

        // Get the camera's rotation around the Y axis (heading) in radians.
        const headingRad = this.camera.object3D.rotation.y;

        // Convert radians to degrees.
        // A-Frame/Three.js rotation is counter-clockwise, so we might need to invert it.
        // And we want a 0-360 degree compass heading.
        // This conversion may need fine-tuning, but it's a good start.
        const headingDeg = (THREE.MathUtils.radToDeg(headingRad) * -1 + 360) % 360;

        // Rotate the map.
        rotateMap(headingDeg);
    }
});
