const WebSocket = require('ws');

const API_KEY = "a73d7123681f15fa8d4ff6ff4123bb391fd3845a";
const url = "wss://stream.aisstream.io/v0/stream";

console.log(`Testing connection to ${url}...`);
const ws = new WebSocket(url);

ws.on('open', () => {
    console.log("Connected!");
    const sub = {
        APIKey: API_KEY,
        BoundingBoxes: [[[-90, -180], [90, 180]]], // Global
        FilterMessageTypes: ["PositionReport"]
    };
    console.log("Sending subscription...");
    ws.send(JSON.stringify(sub));
});

ws.on('message', (data) => {
    const msg = JSON.parse(data);
    console.log("Received data type:", msg.MessageType);
    console.log("Success! Closing.");
    ws.close();
});

ws.on('close', (code, reason) => {
    console.log(`Closed: ${code} - ${reason}`);
});

ws.on('error', (err) => {
    console.error("Error:", err.message);
});
