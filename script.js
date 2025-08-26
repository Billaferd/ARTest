// Helper functions for calculations (exported for testing)

/**
 * Calculates the distance between two GPS coordinates in kilometers.
 * Uses the Haversine formula.
 * @param {object} start - The starting coordinate {lat, lng}.
 * @param {object} end - The ending coordinate {lat, lng}.
 * @returns {number} The distance in kilometers.
 */
function calculateDistance(start, end) {
    const R = 6371; // Earth's radius in kilometers
    const toRadians = Math.PI / 180;
    const dLat = (end.lat - start.lat) * toRadians;
    const dLon = (end.lng - start.lng) * toRadians;
    const lat1 = start.lat * toRadians;
    const lat2 = end.lat * toRadians;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Calculates the initial bearing (forward azimuth) from one GPS coordinate to another.
 * @param {object} start - The starting coordinate {lat, lng}.
 * @param {object} end - The ending coordinate {lat, lng}.
 * @returns {number} The bearing in degrees (0-360).
 */
function calculateBearing(start, end) {
    const toRadians = Math.PI / 180;
    const toDegrees = 180 / Math.PI;
    const lat1 = start.lat * toRadians;
    const lng1 = start.lng * toRadians;
    const lat2 = end.lat * toRadians;
    const lng2 = end.lng * toRadians;
    const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
    const bearing = Math.atan2(y, x) * toDegrees;
    return (bearing + 360) % 360;
}

/**
 * Converts a quaternion to Euler angles (yaw, pitch, roll).
 * @param {number[]} q - The quaternion as an array [x, y, z, w].
 * @returns {object} An object with { yaw, pitch, roll } in radians.
 */
function quaternionToEuler(q) {
    const [x, y, z, w] = q;

    // roll (x-axis rotation)
    const sinr_cosp = 2 * (w * x + y * z);
    const cosr_cosp = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinr_cosp, cosr_cosp);

    // pitch (y-axis rotation)
    const sinp = 2 * (w * y - z * x);
    let pitch;
    if (Math.abs(sinp) >= 1) {
        pitch = Math.sign(sinp) * Math.PI / 2; // use 90 degrees if out of range
    } else {
        pitch = Math.asin(sinp);
    }

    // yaw (z-axis rotation)
    const siny_cosp = 2 * (w * z + x * y);
    const cosy_cosp = 1 - 2 * (y * y + z * z);
    const yaw = Math.atan2(siny_cosp, cosy_cosp);

    return { yaw, pitch, roll };
}

/**
 * Converts a target's geographic coordinates to a 3D vector relative to the user.
 * @param {object} userLoc - The user's location {lat, lng}.
 * @param {object} targetLoc - The target's location {lat, lng}.
 * @param {number} userElev - The user's elevation in meters.
 * @param {number} targetElev - The target's elevation in meters.
 * @returns {object} The 3D position vector for the scene, compatible with BABYLON.Vector3.
 */
function getTargetPositionInScene(userLoc, targetLoc, userElev, targetElev) {
    const distance = calculateDistance(userLoc, targetLoc) * 1000; // convert km to meters
    const bearing = calculateBearing(userLoc, targetLoc);
    const bearingRad = bearing * (Math.PI / 180);

    // Y is the elevation difference (Up/Down in the scene)
    const y = targetElev - userElev;

    // X is the East/West component
    const x = distance * Math.sin(bearingRad);

    // Z is the North/South component.
    // We negate Z because the Babylon.js camera looks down the -Z axis by default.
    // This aligns our scene's coordinate system (North = -Z) with the camera's.
    const z = -distance * Math.cos(bearingRad);

    // Returning a plain object for testability, can be converted to BABYLON.Vector3 later
    return { x, y, z };
}


// Main application logic - only run in a browser
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        const mapElement = document.getElementById('map');
    const cameraContainer = document.getElementById('camera-container');
    const cameraFeed = document.getElementById('camera-feed');
    const instructions = document.getElementById('instructions');
    const diagnosticsOverlay = document.getElementById('diagnostics');
    const compassStatus = document.getElementById('compass-status');
    const arrowContainer = document.getElementById('arrow-container');

    let map;
    let userLocation, userElevation;
    let targetLocation, targetElevation;
    let deviceOrientation, devicePitch;
    let magneticDeclination = 0;
    let isDeclinationAvailable = false;

    // Babylon.js variables
    let engine;
    let scene;
    let arCamera;
    let lightPillar;

    let diagnosticData = {};
    let logMessages = [];

    function logMessage(message, isError = false) {
        const color = isError ? 'red' : '#00ff00'; // Green for info
        const prefix = isError ? 'ERROR: ' : 'INFO: ';
        const logEntry = `<span style="color: ${color};">${prefix}${message}</span>`;
        if (!logMessages.includes(logEntry)) {
            logMessages.push(logEntry);
        }
    }

    map = L.map('map').setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            const initialLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
            map.setView(initialLocation, 16);
            L.marker(initialLocation).addTo(map).bindPopup("You are here").openPopup();
        }, null, { enableHighAccuracy: true });
    }

    map.on('click', async (e) => {
        targetLocation = e.latlng;
        targetElevation = await getElevation(targetLocation.lat, targetLocation.lng);
        diagnosticData.targetLocation = { ...targetLocation, elevation: targetElevation };
        instructions.innerHTML = `<p>Target selected. Look around to find it!</p>`;

        if (window.targetMarker) {
            window.targetMarker.setLatLng(targetLocation);
        } else {
            window.targetMarker = L.marker(targetLocation).addTo(map);
        }

        mapElement.style.display = 'none';
        cameraContainer.style.display = 'block';

        startCamera();
        startSensors();
        if (!engine) { // Check if babylon is already initialized
            initBabylonScene();
        }
    });

    function startCamera() {
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

    function startSensors() {
        logMessage('Starting sensor initialization...');
        let kfX, kfY;
        let isFilterAvailable = false;

        try {
            kfX = new KalmanFilter();
            kfY = new KalmanFilter();
            isFilterAvailable = true;
            logMessage('Kalman filters initialized successfully.');
        } catch (e) {
            logMessage(`KalmanFilter not available. Error: ${e.message}. Proceeding without smoothing.`, true);
        }

        let advancedSensorReadingReceived = false;
        let legacySensorReadingReceived = false;

        const handleNewHeading = (event, isAbsolute) => {
            let trueHeading; // This will be our final, True North heading.
            let magneticHeadingForDiagnostics;
            let pitch;

            if (isAbsolute) {
                // The AbsoluteOrientationSensor provides orientation relative to True North.
                if (!advancedSensorReadingReceived) {
                    logMessage('First advanced sensor reading received.');
                    advancedSensorReadingReceived = true;
                }

                // 1. Convert quaternion to Euler angles.
                // Note on axis conventions:
                // - The AbsoluteOrientationSensor provides orientation relative to a standard East-North-Up coordinate system.
                // - Our quaternionToEuler function calculates angles based on a ZYX rotation order.
                // - In this context:
                //   - Rotation around Y-axis (vertical) is `euler.pitch`, which we use for the compass heading.
                //   - Rotation around X-axis (forward/backward tilt) is `euler.roll`, which we use for the device pitch.
                const euler = quaternionToEuler(event);
                const compassHeadingDegrees = euler.pitch * (180 / Math.PI);
                pitch = euler.roll * (180 / Math.PI); // This is the device's forward/backward tilt.

                // 2. Convert the counter-clockwise angle to a clockwise compass bearing.
                let compassHeading = (360 - compassHeadingDegrees) % 360;
                trueHeading = compassHeading;
                magneticHeadingForDiagnostics = trueHeading - magneticDeclination;
                diagnosticData.rawHeading = compassHeadingDegrees.toFixed(2);

            } else {
                // The legacy deviceorientation event provides a magnetic heading.
                if (!legacySensorReadingReceived) {
                    logMessage('First legacy sensor reading received.');
                    legacySensorReadingReceived = true;
                }
                const magneticHeading = event.webkitCompassHeading || event.alpha;
                pitch = event.beta; // pitch from legacy sensor
                trueHeading = magneticHeading + magneticDeclination;
                magneticHeadingForDiagnostics = magneticHeading;
                diagnosticData.rawHeading = magneticHeading.toFixed(2);
            }

            diagnosticData.isAbsolute = isAbsolute;

            const compassType = isAbsolute ? 'Advanced' : 'Legacy';
            const headingType = isDeclinationAvailable ? 'True' : 'Magnetic';
            compassStatus.textContent = `Compass: ${compassType} (${headingType})`;
            compassStatus.style.color = isAbsolute ? 'cyan' : 'orange';

            // Kalman filter should be applied to the most consistent value before final corrections.
            // Applying to trueHeading here.
            let smoothedHeading;
            if (isFilterAvailable) {
                // Kalman filter works better on Cartesian coordinates
                const headingRad = trueHeading * Math.PI / 180;
                const x = Math.cos(headingRad);
                const y = Math.sin(headingRad);
                const filteredX = kfX.filter(x);
                const filteredY = kfY.filter(y);
                const smoothedHeadingRad = Math.atan2(filteredY, filteredX);
                smoothedHeading = (smoothedHeadingRad * 180 / Math.PI + 360) % 360;
            } else {
                smoothedHeading = trueHeading;
            }


            diagnosticData.magneticHeading = (magneticHeadingForDiagnostics).toFixed(2);
            diagnosticData.trueHeading = smoothedHeading.toFixed(2);

            // Correct for screen orientation
            const screenOrientationAngle = screen.orientation.angle || 0;
            deviceOrientation = (smoothedHeading - screenOrientationAngle + 360) % 360;
            devicePitch = pitch; // Store the pitch
            diagnosticData.screenCorrectedHeading = deviceOrientation.toFixed(2);
            diagnosticData.pitch = devicePitch.toFixed(2);


            updateARView();
        };

        const setupLegacyListener = () => {
            logMessage('Setting up legacy sensor listener...');
            const handleOrientationEvent = (event) => {
                if (typeof event.webkitCompassHeading !== 'undefined' || event.alpha !== null) {
                    handleNewHeading(event, false);
                } else {
                    logMessage("Compass data not available in event.", true);
                    compassStatus.textContent = 'Compass: Error';
                    compassStatus.style.color = 'red';
                }
            };

            if (typeof window.DeviceOrientationAbsoluteEvent !== 'undefined') {
                logMessage('Listening for deviceorientationabsolute events.');
                window.addEventListener('deviceorientationabsolute', handleOrientationEvent);
            } else if (window.DeviceOrientationEvent) {
                logMessage('Listening for deviceorientation events.');
                window.addEventListener('deviceorientation', handleOrientationEvent);
            } else {
                logMessage("Device orientation events not available.", true);
            }
        };

        const startAdvancedSensor = () => {
            logMessage('Attempting to start AbsoluteOrientationSensor...');
            try {
                const sensor = new AbsoluteOrientationSensor({ frequency: 60 });
                logMessage('Successfully created AbsoluteOrientationSensor object.');

                sensor.onreading = () => {
                    handleNewHeading(sensor.quaternion, true);
                };

                sensor.onerror = (event) => {
                    logMessage(`Advanced Sensor Error: ${event.error.name}. Falling back to legacy listener.`, true);
                    setupLegacyListener();
                };

                sensor.start();
                logMessage('sensor.start() called on advanced sensor.');

            } catch (error) {
                logMessage(`Failed to start advanced sensor: ${error.message}. Falling back to legacy listener.`, true);
                setupLegacyListener();
            }
        };

        if ('AbsoluteOrientationSensor' in window) {
            logMessage('AbsoluteOrientationSensor API is available.');
            startAdvancedSensor();
        } else {
            logMessage('AbsoluteOrientationSensor API not available.');
            setupLegacyListener();
        }

        if (navigator.geolocation) {
            logMessage('Geolocation API is available. Watching position...');
            navigator.geolocation.watchPosition(
                async (position) => {
                    const firstUpdate = !userLocation;
                    userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };

                    if (firstUpdate) {
                        logMessage('Received first geolocation update. Fetching elevation...');
                        userElevation = await getElevation(userLocation.lat, userLocation.lng);
                        diagnosticData.userLocation = { ...userLocation, elevation: userElevation };
                    } else {
                        diagnosticData.userLocation = { ...userLocation, elevation: userElevation };
                    }


                    if (!map.isUserLocationSet) {
                        map.isUserLocationSet = true;
                        logMessage('Calculating magnetic declination...');
                        if (typeof geomag !== 'undefined') {
                            const field = geomag.field(userLocation.lat, userLocation.lng);
                            magneticDeclination = field.declination;
                            isDeclinationAvailable = true;
                            diagnosticData.magneticDeclination = magneticDeclination.toFixed(2);
                            logMessage(`Magnetic declination set to: ${magneticDeclination.toFixed(2)}`);
                        } else {
                            logMessage('Geomag library not available. Compass will use Magnetic North.', true);
                        }
                    }
                },
                (err) => {
                    logMessage(`Could not get location: ${err.message}`, true);
                },
                { enableHighAccuracy: true }
            );
        } else {
            logMessage("Geolocation API not available.", true);
        }
    }

    function updateDiagnostics(data) {
        let content = '--- Diagnostics ---<br>';
        for (const [key, value] of Object.entries(data)) {
            let displayValue = value;
            if (value === undefined) {
                displayValue = '...';
            } else if (typeof value === 'object' && value !== null) {
                displayValue = JSON.stringify(value, (k, v) => (v && v.toFixed) ? Number(v.toFixed(2)) : v, 2);
            }
            content += `${key}: ${displayValue}<br>`;
        }
        content += '<br>--- Logs ---<br>';
        content += logMessages.join('<br>');
        diagnosticsOverlay.innerHTML = content;
    }

    function updateARView() {
        // This function is now the main AR render loop
        if (!userLocation || !targetLocation || deviceOrientation === undefined || devicePitch === undefined || !scene) {
            return;
        }

        // --- Update 3D Model Position ---
        if (lightPillar && userElevation !== undefined && targetElevation !== undefined) {
            // Ensure the pillar is visible
            if (!lightPillar.isEnabled()) {
                lightPillar.setEnabled(true);
                logMessage('Light pillar is now visible.');
            }

            // Get the target's position in the 3D scene relative to the user
            const pos = getTargetPositionInScene(userLocation, targetLocation, userElevation, targetElevation);
            lightPillar.position = new BABYLON.Vector3(pos.x, pos.y, pos.z);


            diagnosticData.targetPosition3D = {
                x: pos.x.toFixed(2),
                y: pos.y.toFixed(2),
                z: pos.z.toFixed(2)
            };
        }

        // --- Update Camera Rotation ---
        if (arCamera) {
            // Convert device orientation (degrees) to radians for Babylon.js
            // Yaw is heading, corresponds to rotation around Y axis. Negate for Babylon's convention.
            const yawRad = -deviceOrientation * (Math.PI / 180);
            // Pitch is up/down tilt, corresponds to rotation around X axis.
            const pitchRad = devicePitch * (Math.PI / 180);

            // Create a quaternion from the yaw and pitch. Roll is ignored.
            const rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(yawRad, pitchRad, 0);
            arCamera.rotationQuaternion = rotationQuaternion;
        }

        // --- (Optional) Update Diagnostics ---
        const distance = calculateDistance(userLocation, targetLocation) * 1000;
        diagnosticData.distance = (distance / 1000).toFixed(2) + ' km';
        const bearing = calculateBearing(userLocation, targetLocation);
        diagnosticData.bearing = bearing.toFixed(2);

        // --- Arrow Indicator Logic ---
        if (lightPillar && arCamera) {
            const frustumPlanes = BABYLON.Frustum.GetPlanes(scene.getTransformMatrix());
            const isVisible = lightPillar.isInFrustum(frustumPlanes);

            if (!isVisible) {
                // Target is NOT in view
                arrowContainer.style.display = 'flex'; // Show arrow
                cameraContainer.classList.remove('target-in-view');

                const targetVector = lightPillar.getAbsolutePosition();

                // Check if the target is behind the camera.
                const cameraDirection = arCamera.getForwardRay().direction;
                const toTarget = targetVector.subtract(arCamera.position);
                const dotProduct = BABYLON.Vector3.Dot(cameraDirection, toTarget);
                const isBehind = dotProduct < 0;

                // Project the target's 3D position onto the 2D screen
                const screenPoint = BABYLON.Vector3.Project(
                    targetVector,
                    BABYLON.Matrix.Identity(),
                    scene.getTransformMatrix(),
                    arCamera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
                );

                let angleDeg;

                if (isBehind) {
                    // If the target is behind, project the point from the opposite side of the screen center
                    const centerX = window.innerWidth / 2;
                    const centerY = window.innerHeight / 2;
                    const oppositeX = centerX + (centerX - screenPoint.x);
                    const oppositeY = centerY + (centerY - screenPoint.y);
                    const angleRad = Math.atan2(oppositeY - centerY, oppositeX - centerX);
                    angleDeg = angleRad * 180 / Math.PI + 90;
                } else {
                    // Standard angle calculation for when the target is off-screen but in front.
                    const centerX = window.innerWidth / 2;
                    const centerY = window.innerHeight / 2;
                    const angleRad = Math.atan2(screenPoint.y - centerY, screenPoint.x - centerX);
                    angleDeg = angleRad * 180 / Math.PI + 90; // +90 to correct for arrow's default orientation
                }

                // Apply the rotation to the arrow
                arrowContainer.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;

            } else {
                // Target IS in view
                arrowContainer.style.display = 'none'; // Hide arrow
                cameraContainer.classList.add('target-in-view');
            }
        }
    }

    async function getElevation(lat, lng) {
        try {
            const response = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (data.elevation && data.elevation.length > 0) {
                logMessage(`Elevation for ${lat.toFixed(2)}, ${lng.toFixed(2)}: ${data.elevation[0]}m`);
                return data.elevation[0];
            } else {
                logMessage(`Elevation data not found for ${lat.toFixed(2)}, ${lng.toFixed(2)}.`, true);
                return 0; // Fallback to 0 if no elevation data is available
            }
        } catch (error) {
            logMessage(`Failed to fetch elevation: ${error.message}`, true);
            return 0; // Fallback to 0 on error
        }
    }

    function initBabylonScene() {
        const canvas = document.getElementById('renderCanvas');
        engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        scene = new BABYLON.Scene(engine);

        // Make the scene background transparent
        scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);

        // Create a camera that we will control manually
        arCamera = new BABYLON.FreeCamera("arCamera", new BABYLON.Vector3(0, 0, 0), scene);

        // Create a basic light
        const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
        light.intensity = 0.8;

        // Create the 'light pillar' model
        lightPillar = BABYLON.MeshBuilder.CreateCylinder("pillar", {
            height: 50, // The pillar is tall
            diameter: 5
        }, scene);

        const pillarMaterial = new BABYLON.StandardMaterial("pillarMaterial", scene);
        pillarMaterial.emissiveColor = new BABYLON.Color3(0, 1, 0.5); // A cyan-green glow
        pillarMaterial.disableLighting = true; // Make it self-illuminated
        lightPillar.material = pillarMaterial;

        // Initially hide the pillar until we have a target
        lightPillar.setEnabled(false);

        // Start the render loop
        engine.runRenderLoop(() => {
            if (scene) {
                scene.render();
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            engine.resize();
        });

        logMessage('Babylon.js scene initialized.');
    }

    setInterval(() => updateDiagnostics(diagnosticData), 250);
    });
}

// Export functions for testing if in a Node.js-like environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateDistance,
        calculateBearing,
        quaternionToEuler,
        getTargetPositionInScene
    };
}
