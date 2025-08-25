document.addEventListener('DOMContentLoaded', () => {
    const map = L.map('map').setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Test marker to confirm script is running
    L.marker([51.5, -0.09]).addTo(map)
        .bindPopup('A test marker. If you see this, the baseline is working.')
        .openPopup();
});
