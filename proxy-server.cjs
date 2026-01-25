const WebSocket = require('ws');
const { createServer } = require('http');

const PORT = 3001;
const API_URL = "wss://stream.aisstream.io/v0/stream";

const server = createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', (clientWs) => {
    console.log("Client connected to proxy");

    const upstreamWs = new WebSocket(API_URL);

    upstreamWs.on('open', () => {
        console.log("Connected to Upstream AISStream");
    });

    upstreamWs.on('message', (data) => {
        if (clientWs.readyState === WebSocket.OPEN) {
            // console.log("Forwarding message from upstream to client"); // Too noisy
            clientWs.send(data);
        }
    });

    upstreamWs.on('close', (code, reason) => {
        console.log(`Upstream closed: ${code} - ${reason}`);
        clientWs.close(code, reason);
    });

    upstreamWs.on('error', (err) => {
        console.error("Upstream error:", err.message);
        clientWs.close();
    });

    clientWs.on('message', (data) => {
        console.log("Received message from client:", data.toString());
        // Forward subscription messages from client to upstream
        if (upstreamWs.readyState === WebSocket.OPEN) {
            console.log("Forwarding message to upstream");
            upstreamWs.send(data);
        } else {
            console.log("Upstream not ready, queuing message");
            upstreamWs.once('open', () => {
                console.log("Forwarding queued message");
                upstreamWs.send(data);
            });
        }
    });

    clientWs.on('close', () => {
        console.log("Client disconnected");
        upstreamWs.close();
    });
});

server.listen(PORT, () => {
    console.log(`Relay Server running on ws://localhost:${PORT}`);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
