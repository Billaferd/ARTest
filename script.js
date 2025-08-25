document.addEventListener('DOMContentLoaded', () => {
    const map = L.map('map').setView([0, 0], 2);
    let isMapCentered = false;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (position) => {
                const userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };

                if (!isMapCentered) {
                    map.setView(userLocation, 16);
                    L.marker(userLocation).addTo(map).bindPopup("You are here.").openPopup();
                    isMapCentered = true;
                }
            },
            (err) => {
                // Can't show an error overlay as it's not in the HTML yet.
                // We'll just log to console for now.
                console.error(`ERROR(${err.code}): ${err.message}`);
            },
            {
                enableHighAccuracy: true
            }
        );
    } else {
        console.error("Geolocation is not supported by this browser.");
    }
});
