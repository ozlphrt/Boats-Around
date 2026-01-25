
// Simulation Service
// Generates and moves mock boats realistically

export class SimulationService {
    constructor() {
        this.boats = [];
        this.intervalId = null;
        this.onUpdate = null;
        this.center = null;
    }

    start(centerLoc, onUpdate) {
        this.center = centerLoc;
        this.onUpdate = onUpdate;

        // Initial generation
        if (this.boats.length === 0) {
            this.boats = this.generateBoats(centerLoc, 20);
        } else {
            // Re-center logic if needed, or just let them roam? 
            // For now, let's keep existing boats if they exist, or maybe respawn if too far?
            // Let's just respawn for simplicity on "Start"
            this.boats = this.generateBoats(centerLoc, 20);
        }

        this.onUpdate(this.boats);

        // Start Loop
        this.intervalId = setInterval(() => {
            this.updatePositions();
        }, 1000); // 1Hz update
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    generateBoats(center, count) {
        const boats = [];
        for (let i = 0; i < count; i++) {
            const latOffset = (Math.random() - 0.5) * 0.1; // ~10km spread
            const lonOffset = (Math.random() - 0.5) * 0.1;

            const heading = Math.random() * 360;
            const speed = 5 + Math.random() * 20; // 5-25 knots

            boats.push({
                // Internal Sim Props
                _sim: {
                    lat: center.lat + latOffset,
                    lon: center.lon + lonOffset,
                    speed: speed, // knots
                    heading: heading,
                    turnRate: (Math.random() - 0.5) * 2 // degrees per second
                },
                // API Structure Match
                MetaData: {
                    MMSI: 900000000 + i,
                    ShipName: `Simulated Vessel ${i + 1}`,
                },
                Message: {
                    PositionReport: {
                        Latitude: center.lat + latOffset,
                        Longitude: center.lon + lonOffset,
                        Sog: speed,
                        Cog: heading,
                    }
                },
                static: {
                    Type: this.getRandomType(),
                    Destination: "Unknown",
                    DimensionA: 50 + Math.random() * 200,
                    DimensionB: 15, DimensionC: 10, DimensionD: 10
                }
            });
        }
        return boats;
    }

    getRandomType() {
        const types = [30, 60, 70, 80]; // Fish, Passenger, Cargo, Tanker
        return types[Math.floor(Math.random() * types.length)];
    }

    updatePositions() {
        const dt = 1; // 1 second

        this.boats = this.boats.map(boat => {
            const sim = boat._sim;

            // Update Heading (slight wander)
            sim.heading += sim.turnRate * dt;
            if (Math.random() < 0.05) sim.turnRate = (Math.random() - 0.5) * 2; // Change turn rate occasionally

            // Normalize Heading
            sim.heading = (sim.heading + 360) % 360;

            // Move
            // 1 knot = 1.852 km/h
            // degrees per km approx 0.009 (very rough, lat dependent)

            const speedKmh = sim.speed * 1.852;
            const distKm = (speedKmh * dt) / 3600;

            // Simple conversions
            const dy = distKm * Math.cos(sim.heading * Math.PI / 180);
            const dx = distKm * Math.sin(sim.heading * Math.PI / 180);

            sim.lat += dy / 111; // 1 deg lat = 111km
            sim.lon += dx / (111 * Math.cos(sim.lat * Math.PI / 180));

            return {
                ...boat,
                Message: {
                    ...boat.Message,
                    PositionReport: {
                        ...boat.Message.PositionReport,
                        Latitude: sim.lat,
                        Longitude: sim.lon,
                        Cog: sim.heading,
                        Sog: sim.speed
                    }
                }
            };
        });

        if (this.onUpdate) this.onUpdate(this.boats);
    }
}
