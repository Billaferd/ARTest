AFRAME.registerComponent('map-sync', {
    init: function () {
        this.camera = this.el.sceneEl.camera.el; // Get the camera entity
        this.tickCount = 0;
        try {
            this.kfX = new KalmanFilter();
            this.kfY = new KalmanFilter();
            this.isFilterAvailable = true;
        } catch (e) {
            this.isFilterAvailable = false;
            console.error("Could not initialize KalmanFilter. Smoothing disabled.", e);
        }
    },

    tick: function () {
        this.tickCount++;
        if (!this.camera || typeof window.rotateMap !== 'function' || this.tickCount < 90) {
            return;
        }

        // Get the camera's rotation around the Y axis (heading) in radians.
        const rawHeadingRad = this.camera.object3D.rotation.y;

        let smoothedHeadingDeg;

        if (this.isFilterAvailable) {
            // Convert angle to a 2D vector, smooth the vector components, then convert back to an angle.
            // This correctly handles the 0/360 degree wrap-around.
            const x = Math.cos(rawHeadingRad);
            const y = Math.sin(rawHeadingRad);
            const filteredX = this.kfX.filter(x);
            const filteredY = this.kfY.filter(y);
            const smoothedHeadingRad = Math.atan2(filteredY, filteredX);
            smoothedHeadingDeg = (THREE.MathUtils.radToDeg(smoothedHeadingRad) * -1 + 360) % 360;
        } else {
            // Fallback to unsmoothed heading if filter is not available
            smoothedHeadingDeg = (THREE.MathUtils.radToDeg(rawHeadingRad) * -1 + 360) % 360;
        }

        // Rotate the map
        window.rotateMap(smoothedHeadingDeg);
    }
});
