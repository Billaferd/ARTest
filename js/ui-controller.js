// State for the UI
let logMessages = [];
let instructionTimeout;

// DOM Elements
const instructions = document.getElementById('instructions');
const diagnosticsOverlay = document.getElementById('diagnostics');
const toggleDiagnosticsBtn = document.getElementById('toggle-diagnostics-btn');
const buildTimestampDiv = document.getElementById('build-timestamp');
const dynamicDiagnosticsDiv = document.getElementById('dynamic-diagnostics');

/**
 * Logs a message to the diagnostics panel.
 * @param {string} message - The message to log.
 * @param {boolean} isError - Whether the message is an error.
 */
export function logMessage(message, isError = false) {
    const color = isError ? 'red' : '#00ff00'; // Green for info
    const prefix = isError ? 'ERROR: ' : 'INFO: ';
    const logEntry = `<span style="color: ${color};">${prefix}${message}</span>`;
    if (!logMessages.includes(logEntry)) {
        logMessages.push(logEntry);
    }
    // We will have a separate function to update the diagnostics display
}

/**
 * Updates the entire diagnostics panel with the latest data.
 * @param {object} data - The diagnostic data object.
 */
export function updateDiagnostics(data) {
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
    dynamicDiagnosticsDiv.innerHTML = content;
}

/**
 * Shows an instruction message to the user.
 * @param {string} message - The message to show.
 * @param {boolean} persistent - If true, the message will not fade out.
 */
export function showInstruction(message, persistent = false) {
    // Clear any existing fade-out timer
    if (instructionTimeout) {
        clearTimeout(instructionTimeout);
        instructionTimeout = null;
    }

    instructions.innerHTML = `<p>${message}</p>`;
    instructions.style.display = 'block';
    instructions.style.opacity = 1;

    if (!persistent) {
        instructionTimeout = setTimeout(() => {
            hideInstruction();
        }, 5000); // Fades out after 5 seconds
    }
}

/**
 * Hides the instruction message.
 */
export function hideInstruction() {
    instructions.style.opacity = 0;
    // We can hide it completely after the transition
    setTimeout(() => {
        instructions.style.display = 'none';
    }, 500);
}


/**
 * Initializes the UI controllers, such as button clicks.
 * @param {object} appState - The main application state.
 */
export function initUI(appState) {
    // Set the build timestamp
    // NOTE: This is a manually updated timestamp.
    const buildTimestamp = 'Aug 27 2025, 17:09 UTC';
    buildTimestampDiv.innerHTML = `Build: ${buildTimestamp}<br><br>`;
    buildTimestampDiv.style.textAlign = 'center';
    buildTimestampDiv.style.fontWeight = 'bold';

    // Set up diagnostics toggle button
    toggleDiagnosticsBtn.addEventListener('click', () => {
        diagnosticsOverlay.classList.toggle('hidden');
    });

    // Set up calibration slider
    const headingOffsetSlider = document.getElementById('heading-offset');
    const headingOffsetValue = document.getElementById('heading-offset-value');

    headingOffsetSlider.addEventListener('input', (e) => {
        const offset = parseFloat(e.target.value);
        appState.calibrationOffset = offset;
        headingOffsetValue.textContent = offset.toFixed(1);
        appState.diagnosticData.calibrationOffset = offset.toFixed(1);
    });


    // Collapse diagnostics by default
    diagnosticsOverlay.classList.add('hidden');

    // Initial instruction
    showInstruction("Click on the map to select a target location.", true);
}
