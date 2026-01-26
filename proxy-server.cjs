const express = require('express');
const path = require('path');
const { createServer } = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3001;
const API_URL = "wss://stream.aisstream.io/v0/stream";

const app = express();
const server = createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback to index.html for SPA (Single Page Application) routing
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

wss.on('connection', (clientWs) => {
    console.log("Client connected to proxy");

    const upstreamWs = new WebSocket(API_URL);

    upstreamWs.on('open', () => {
        console.log("Connected to Upstream AISStream");
    });

    upstreamWs.on('message', (data) => {
        if (clientWs.readyState === WebSocket.OPEN) {
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
        if (upstreamWs.readyState === WebSocket.OPEN) {
            upstreamWs.send(data);
        } else {
            upstreamWs.once('open', () => {
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
    console.log(`Consolidated Server running on port ${PORT}`);
    console.log(`Web interface: http://localhost:${PORT}`);
    console.log(`WebSocket: ws://localhost:${PORT}`);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
