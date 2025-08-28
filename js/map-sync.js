import { rotateMap } from './map-controller.js';

AFRAME.registerComponent('map-sync', {
    init: function () {
        this.camera = this.el.camera.el; // Get the camera entity
        this.logElement = document.getElementById('ar-heading-log');
        if (!this.camera) {
            console.error("map-sync: Camera not found!");
        }
        if (!this.logElement) {
            console.error("map-sync: Log element not found!");
        }
    },

    tick: function () {
        if (!this.camera) return;

        const headingRad = this.camera.object3D.rotation.y;
        const headingDeg = (THREE.MathUtils.radToDeg(headingRad) * -1 + 360) % 360;

        if (this.logElement) {
            this.logElement.innerHTML = `--- AR Heading ---<br>
                Rad: ${headingRad.toFixed(4)}<br>
                Deg: ${headingDeg.toFixed(2)}`;
        }

        rotateMap(headingDeg);
    }
});
