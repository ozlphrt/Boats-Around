
// Digitraffic Service (Finland)
// Fetches live AIS data from https://meri.digitraffic.fi

export class DigitrafficService {
    constructor() {
        this.intervalId = null;
        this.onUpdate = null;
        this.lastFetch = 0;
        this.cache = [];
        this.userLocation = null;
    }

    start(onUpdate, initialLocation) {
        this.onUpdate = onUpdate;
        if (initialLocation) this.userLocation = initialLocation;
        this.fetchData();

        // Poll every 10 seconds (API is cacheable)
        this.intervalId = setInterval(() => {
            this.fetchData();
        }, 10000);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    updateSettings(userLocation) {
        // Called by App when user moves
        this.userLocation = userLocation;
        // Optional: Re-filter cache immediately?
        // if (this.cacheRaw) ... 
        // For now, next fetch (10s) or if we store raw data we could re-emit.
    }

    async fetchData() {
        try {
            console.log("[Digitraffic] Fetching live data...");
            const response = await fetch('https://meri.digitraffic.fi/api/ais/v1/locations');
            if (!response.ok) throw new Error(`API Error: ${response.status}`);

            const data = await response.json();

            // 20 miles ~= 32 km. Let's use 35km radius.
            // 1 deg lat ~= 111 km. 1 deg lon ~= 111 * cos(lat).
            // Rough box check first for speed? Or just simple distance.
            const MAX_DIST_KM = 35;

            let center = this.userLocation;
            // If no user location, maybe don't filter? Or don't return anything?
            // If the user hasn't moved to Finland yet, this might return 0.

            const boats = data.features.filter(f => {
                if (!center) return true; // Return all if no center (or handle differently)

                const coords = f.geometry.coordinates; // [lon, lat]
                const lat = coords[1];
                const lon = coords[0];

                // Simple Haversine-ish or Euclidean approximation for speed
                // Euclidean on lat/lon is bad for large distances, but for filtering "local" it's ok-ish,
                // but let's do a slightly better approx
                const R = 6371; // Earth radius km
                const dLat = (lat - center.lat) * Math.PI / 180;
                const dLon = (lon - center.lon) * Math.PI / 180;
                const a =
                    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(center.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
                    Math.sin(dLon / 2) * Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                const dist = R * c;

                return dist <= MAX_DIST_KM;
            }).map(f => {
                const props = f.properties;
                const coords = f.geometry.coordinates; // [lon, lat]

                return {
                    MetaData: {
                        MMSI: props.mmsi,
                        ShipName: `Vessel ${props.mmsi}`
                    },
                    Message: {
                        PositionReport: {
                            Latitude: coords[1],
                            Longitude: coords[0],
                            Sog: props.sog,
                            Cog: props.cog,
                        }
                    },
                    static: {
                        Type: 70,
                        Destination: "Finland",
                        DimensionA: 50, DimensionB: 10, DimensionC: 0, DimensionD: 0
                    }
                };
            });

            this.cache = boats;
            if (this.onUpdate) this.onUpdate(boats);
            console.log(`[Digitraffic] Updated ${boats.length} vessels.`);

        } catch (e) {
            console.error("[Digitraffic] Fetch failed", e);
        }
    }
}
