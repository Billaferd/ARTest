AFRAME.registerComponent('arrow-indicator', {
    schema: {
        target: { type: 'selector' },
        camera: { type: 'selector', default: 'a-camera' }
    },

    init: function () {
        this.camera3D = this.data.camera.object3D;
        this.target3D = this.data.target.object3D;
        this.frustum = new THREE.Frustum();
        this.matrix = new THREE.Matrix4();
        this.targetPos = new THREE.Vector3();
        this.screenPos = new THREE.Vector3();
    },

    tick: function () {
        const { target, camera } = this.data;

        if (!target || !camera || !target.object3D.visible) {
            this.el.style.display = 'none';
            return;
        }

        // Update frustum
        this.matrix.multiplyMatrices(this.camera3D.projectionMatrix, this.camera3D.matrixWorldInverse);
        this.frustum.setFromProjectionMatrix(this.matrix);

        // Check if target is visible
        this.target3D.getWorldPosition(this.targetPos);
        if (this.frustum.containsPoint(this.targetPos)) {
            this.el.style.display = 'none';
            return;
        }

        // If not visible, show arrow and calculate rotation
        this.el.style.display = 'flex';

        // Project target's world position to screen space
        this.screenPos.copy(this.targetPos);
        this.screenPos.project(this.camera3D);

        const isBehind = this.screenPos.z > 1;

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        // screenPos.x and screenPos.y are in NDC (-1 to 1). Convert to screen coordinates.
        const screenX = centerX * (1 + this.screenPos.x);
        const screenY = centerY * (1 - this.screenPos.y);

        let angleRad;
        if (isBehind) {
            // Point away from the projected position if it's behind the camera
            angleRad = Math.atan2(centerY - screenY, centerX - screenX);
        } else {
            // Point towards the projected position if it's in front but off-screen
            angleRad = Math.atan2(screenY - centerY, screenX - centerX);
        }

        // Convert radians to degrees and offset by 90 degrees to align arrow
        const angleDeg = THREE.MathUtils.radToDeg(angleRad) + 90;

        this.el.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;
    }
});
