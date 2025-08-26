import { logMessage } from './ui-controller.js';

/**
 * Starts the camera feed and attaches it to the video element.
 * @param {HTMLVideoElement} cameraFeed - The video element to display the camera feed.
 */
export function startCamera(cameraFeed) {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(stream => {
                cameraFeed.srcObject = stream;
                cameraFeed.play();
            })
            .catch(err => {
                logMessage("Could not access camera.", true);
            });
    } else {
        logMessage("Camera not available.", true);
    }
}
