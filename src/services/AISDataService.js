export class AISDataService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.socket = null;
        this.onMessage = null;
        this.onStatusChange = null;
        this.isConnected = false;
        this.pendingBoundingBox = null;
        this.connectTimeout = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000; // Start with 1 second
        this.maxReconnectDelay = 30000; // Max 30 seconds
        this.reconnectTimer = null;
        this.lastConnectAttempt = null;
        this.isManuallyDisconnected = false;

        // Throttling for subscription updates (to avoid 4003 Too Many Requests)
        this.lastSubscriptionTime = 0;
        this.subscriptionThrottleMs = 2000; // 2 seconds between updates
        this.pendingSubscriptionTimer = null;
    }

    connect(onMessage, onStatusChange, isScheduledReconnect = false) {
        if (this.isManuallyDisconnected) {
            console.log("[AIS] Manually disconnected, not auto-reconnecting.");
            return;
        }

        if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
            console.log("[AIS] Socket already active.");
            return;
        }

        // Only throttle if there's a recent connection attempt AND it's not a scheduled reconnect
        // (scheduled reconnects should bypass throttle since they're intentional)
        const now = Date.now();
        if (!isScheduledReconnect && this.lastConnectAttempt && (now - this.lastConnectAttempt < 2000)) {
            console.log("[AIS] Connection attempt throttled.");
            return;
        }
        this.lastConnectAttempt = now;

        this.onMessage = onMessage;

        // Detect production environment (GitHub Pages or Vite production build)
        const isProduction = import.meta.env.PROD || window.location.hostname.includes('github.io');
        const AIS_STREAM_URL = 'wss://stream.aisstream.io/v0/stream';
        const PROD_PROXY_URL = import.meta.env.VITE_AISSTREAM_PROXY_URL;

        let socketUrl;
        if (isProduction) {
            if (PROD_PROXY_URL) {
                socketUrl = PROD_PROXY_URL;
                console.log(`[AIS] Opening WebSocket via Production Proxy... (Attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
            } else {
                // Production: Connect directly to AISStream (will likely fail in browser)
                socketUrl = AIS_STREAM_URL;
                console.log(`[AIS] Opening WebSocket (Direct to AISStream - Browser mode)... (Attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
            }
        } else {
            // Development: Use Vite proxy
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            socketUrl = `${protocol}//${window.location.host}/api/socket`;
            console.log(`[AIS] Opening WebSocket via Vite Proxy... (Attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
        }

        try {
            this.socket = new WebSocket(socketUrl);
        } catch (error) {
            console.error("[AIS] Failed to create WebSocket:", error);
            this.scheduleReconnect(onMessage, onStatusChange);
            return;
        }

        // WATCHDOG: If not connected in 15 seconds, retry.
        this.connectTimeout = setTimeout(() => {
            if (this.socket && this.socket.readyState !== WebSocket.OPEN) {
                console.warn("[AIS] Connection timed out (stuck in handshaking). Retrying...");
                if (this.socket) {
                    this.socket.close();
                }
                this.scheduleReconnect(onMessage, onStatusChange);
            }
        }, 15000);

        this.socket.onopen = () => {
            console.log("[AIS] WebSocket Connected");
            clearTimeout(this.connectTimeout);
            this.isConnected = true;
            this.reconnectAttempts = 0; // Reset on successful connection
            this.reconnectDelay = 1000; // Reset delay
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
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
                    console.log(`[AIS] ✓ Received ${response.MessageType} for ${response.MetaData.MMSI}`);
                    if (this.onMessage) this.onMessage(response);
                } else if (response.error) {
                    console.error('[AIS] ❌ Error from AISStream:', response.error);
                    if (this.onStatusChange) {
                        this.onStatusChange(`Error: ${response.error}`);
                    }
                } else {
                    console.log('[AIS] Received message:', response.MessageType || 'Unknown');
                }
            } catch (e) {
                console.error("Error parsing AIS message", e);
            }
        };

        this.socket.onclose = (event) => {
            console.log(`[AIS] WebSocket Closed. Code: ${event.code}, Reason: ${event.reason}`);
            this.isConnected = false;
            clearTimeout(this.connectTimeout);

            // Known AISStream Error Codes
            // 4001: Invalid API Key
            // 4002: Invalid Subscription format
            // 4003: Too many connections
            // 4004: Subscription validation error
            let errorMsg = `Disconnected (${event.code})`;

            if (event.code === 4001) {
                errorMsg = "Err: Invalid API Key";
                // Don't retry on auth errors
                if (this.onStatusChange) this.onStatusChange(errorMsg);
                return;
            }
            if (event.code === 4002) errorMsg = "Err: Bad Request (4002)";
            if (event.code === 4003) errorMsg = "Err: Rate Limited (4003)";
            if (event.code === 1006) {
                errorMsg = "Err: Connection Dropped"; // Abnormal - connection failed
                const isProduction = import.meta.env.PROD || window.location.hostname.includes('github.io');
                const PROD_PROXY_URL = import.meta.env.VITE_AISSTREAM_PROXY_URL;

                if (this.onStatusChange) {
                    if (isProduction) {
                        if (!PROD_PROXY_URL) {
                            this.onStatusChange("MISSING PROXY: Set VITE_AISSTREAM_PROXY_URL env var");
                            console.error("[AIS] ❌ CRITICAL: Production requires a WebSocket proxy.");
                            console.error("[AIS] Deploy the 'proxy-server.cjs' (e.g. to Render) and set VITE_AISSTREAM_PROXY_URL.");
                        } else {
                            this.onStatusChange("Proxy Connection Failed. Check server logs.");
                        }
                    } else {
                        this.onStatusChange("Proxy server not running. Run: npm run start:proxy");
                    }
                }
            } else {
                if (this.onStatusChange) {
                    this.onStatusChange(errorMsg);
                }
            }

            // Auto-reconnect with exponential backoff (unless manually disconnected or auth error)
            if (!this.isManuallyDisconnected && event.code !== 4001 && event.code !== 1000) {
                this.scheduleReconnect(onMessage, onStatusChange);
            }
        };

        this.socket.onerror = (error) => {
            console.error("WebSocket Error:", error);
            // Don't overwrite if onclose handles it better (often error comes before close)
            const isProduction = import.meta.env.PROD || window.location.hostname.includes('github.io');
            if (this.onStatusChange && !this.isConnected) {
                if (isProduction) {
                    this.onStatusChange("Socket Error - Check API key");
                } else {
                    this.onStatusChange("Socket Error - Check proxy server");
                }
            }
        };
    }

    scheduleReconnect(onMessage, onStatusChange) {
        if (this.isManuallyDisconnected) return;

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error(`[AIS] Max reconnect attempts (${this.maxReconnectAttempts}) reached. Stopping.`);
            if (this.onStatusChange) {
                this.onStatusChange(`Connection failed after ${this.maxReconnectAttempts} attempts`);
            }
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);

        console.log(`[AIS] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        if (this.onStatusChange) {
            this.onStatusChange(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        }

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect(onMessage, onStatusChange, true); // Pass true to indicate scheduled reconnect
        }, delay);
    }

    updateSettings(boundingBox) {
        this.pendingBoundingBox = boundingBox;

        // --- Throttling Logic ---
        const now = Date.now();
        const timeSinceLast = now - this.lastSubscriptionTime;

        if (timeSinceLast < this.subscriptionThrottleMs) {
            if (!this.pendingSubscriptionTimer) {
                const waitTime = this.subscriptionThrottleMs - timeSinceLast;
                console.log(`[AIS] Throttling subscription update (waiting ${waitTime}ms)`);
                this.pendingSubscriptionTimer = setTimeout(() => {
                    this.pendingSubscriptionTimer = null;
                    if (this.pendingBoundingBox) {
                        this.updateSettings(this.pendingBoundingBox);
                    }
                }, waitTime);
            }
            return;
        }

        // Clear any pending timer if we are proceeding
        if (this.pendingSubscriptionTimer) {
            clearTimeout(this.pendingSubscriptionTimer);
            this.pendingSubscriptionTimer = null;
        }

        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.log("[AIS] Socket not ready. Subscription queued for when open.");

            // Auto-reconnect if socket is dead/null (but respect manual disconnect)
            if (!this.isManuallyDisconnected && (!this.socket || this.socket.readyState === WebSocket.CLOSED)) {

                // Check throttle for CONNECT attempts (separate from subscription throttle)
                if (this.lastConnectAttempt && (now - this.lastConnectAttempt < 2000)) {
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
        console.log(`[AIS] BBox: [${boundingBox.south.toFixed(2)}, ${boundingBox.west.toFixed(2)}] to [${boundingBox.north.toFixed(2)}, ${boundingBox.east.toFixed(2)}]`);
        console.log(`[AIS] API Key: ${this.apiKey ? (this.apiKey.substring(0, 8) + '...') : 'MISSING'}`);

        if (!this.apiKey || this.apiKey === 'undefined' || this.apiKey === 'null') {
            console.error('[AIS] ⚠️ API KEY IS MISSING! Set VITE_AISSTREAM_API_KEY in .env file');
            if (this.onStatusChange) {
                this.onStatusChange('Missing API Key - Check .env');
            }
        }

        this.socket.send(JSON.stringify(subscriptionMessage));
        this.lastSubscriptionTime = Date.now();
    }

    disconnect() {
        this.isManuallyDisconnected = true;
        if (this.connectTimeout) clearTimeout(this.connectTimeout);
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.socket) {
            this.socket.close(1000, "App Unmount");
            this.socket = null;
            this.isConnected = false;
        }
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
    }
}
