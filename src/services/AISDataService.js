export class AISDataService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.socket = null;
        this.onMessage = null;
        this.onStatusChange = null;
        this.isConnected = false;
        this.pendingBoundingBox = null;
        this.connectTimeout = null;
    }

    connect(onMessage, onStatusChange) {
        if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
            console.log("[AIS] Socket already active.");
            return;
        }

        this.onMessage = onMessage;
        console.log("[AIS] Opening WebSocket...");
        // Use custom local relay server
        this.socket = new WebSocket("ws://localhost:3000");

        // WATCHDOG: If not connected in 15 seconds, retry.
        this.connectTimeout = setTimeout(() => {
            if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
                console.warn("[AIS] Connection timed out (stuck in handshaking). Retrying...");
                this.socket.close();
            }
        }, 15000);

        this.socket.onopen = () => {
            console.log("[AIS] WebSocket Connected");
            clearTimeout(this.connectTimeout);
            this.isConnected = true;
            if (this.onStatusChange) this.onStatusChange("Connected");

            if (this.pendingBoundingBox) {
                console.log("[AIS] Sending queued subscription...");
                this.updateSettings(this.pendingBoundingBox);
            }
        };

        this.socket.onmessage = async (event) => {
            try {
                let data = event.data;
                if (data instanceof Blob) {
                    data = await data.text();
                }

                const response = JSON.parse(data);
                if (response.MessageType === "PositionReport" || response.MessageType === "ShipStaticData") {
                    if (this.onMessage) this.onMessage(response);
                }
            } catch (e) {
                console.error("Error parsing AIS message", e);
            }
        };

        this.socket.onclose = (event) => {
            console.log(`[AIS] WebSocket Closed. Code: ${event.code}, Reason: ${event.reason}`);
            this.isConnected = false;

            // Known AISStream Error Codes
            // 4001: Invalid API Key
            // 4002: Invalid Subscription format
            // 4003: Too many connections
            // 4004: Subscription validation error
            let errorMsg = `Disconnected (${event.code})`;

            if (event.code === 4001) errorMsg = "Err: Invalid API Key";
            if (event.code === 4002) errorMsg = "Err: Bad Request (4002)";
            if (event.code === 4003) errorMsg = "Err: Rate Limited (4003)";
            if (event.code === 1006) errorMsg = "Err: Connection Dropped"; // Abnormal

            if (this.onStatusChange) {
                this.onStatusChange(errorMsg);
            }
        };

        this.socket.onerror = (error) => {
            console.error("WebSocket Error:", error);
            // Don't overwrite if onclose handles it better (often error comes before close)
            if (this.onStatusChange) this.onStatusChange("Socket Error");
        };
    }

    updateSettings(boundingBox) {
        this.pendingBoundingBox = boundingBox;

        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.log("[AIS] Socket not ready. Subscription queued for when open.");

            // Auto-reconnect if socket is dead/null
            if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
                const now = Date.now();
                if (this.lastConnectAttempt && (now - this.lastConnectAttempt < 5000)) {
                    console.log("[AIS] Reconnect throttled. Waiting...");
                    return;
                }

                console.log("[AIS] Socket closed. Attempting auto-reconnect...");
                this.connect(this.onMessage, this.onStatusChange);
            }
            return;
        }

        const subscriptionMessage = {
            APIKey: this.apiKey,
            BoundingBoxes: [
                [
                    [boundingBox.south, boundingBox.west],
                    [boundingBox.north, boundingBox.east]
                ]
            ],
            FilterMessageTypes: ["PositionReport", "ShipStaticData"]
        };

        console.log("[AIS] Sending/Updating Subscription...");
        this.socket.send(JSON.stringify(subscriptionMessage));
    }

    disconnect() {
        if (this.connectTimeout) clearTimeout(this.connectTimeout);
        if (this.socket) {
            this.socket.close(1000, "App Unmount");
            this.socket = null;
            this.isConnected = false;
        }
    }
}
