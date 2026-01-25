export class LocationService {
    static getCurrentLocation(successCallback, errorCallback) {
        if (!navigator.geolocation) {
            errorCallback("Geolocation is not supported by your browser");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                successCallback({
                    lat: position.coords.latitude,
                    lon: position.coords.longitude,
                    heading: position.coords.heading
                });
            },
            () => {
                errorCallback("Unable to retrieve your location");
            },
            {
                enableHighAccuracy: true,
                maximumAge: 60000, // Accept cached position up to 60s old
                timeout: 10000    // Wait max 10s
            }
        );
    }

    static watchLocation(successCallback, errorCallback) {
        if (!navigator.geolocation) return null;

        return navigator.geolocation.watchPosition(
            (position) => {
                successCallback({
                    lat: position.coords.latitude,
                    lon: position.coords.longitude,
                    heading: position.coords.heading
                });
            },
            (err) => {
                console.warn(err);
                if (errorCallback) errorCallback(err);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 10000,
                timeout: 5000
            }
        );
    }
}
