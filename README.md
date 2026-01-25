# BoatsAround

Live Boat Traffic Visualization in 3D using Cesium and AIS data.

## Setup

### Prerequisites

- Node.js 18+ 
- AISStream API Key (set in `.env` as `VITE_AISSTREAM_API_KEY`)

### Installation

```bash
npm install
```

### Running the Application

**Important:** The WebSocket proxy server must be running for AIS data to work.

#### Option 1: Run both servers together (recommended)
```bash
npm run dev:full
```
This starts both the proxy server (port 3001) and Vite dev server (port 5173).

#### Option 2: Run separately
Terminal 1 - Proxy server:
```bash
npm run start:proxy
```

Terminal 2 - Vite dev server:
```bash
npm run dev
```

### Environment Variables

**Required:** Create a `.env` file in the root directory:

```bash
# Copy the example file
cp .env.example .env

# Then edit .env and add your API key
VITE_AISSTREAM_API_KEY=your_actual_api_key_here
```

**Get an API key:**
1. Visit https://aisstream.io/
2. Sign up for a free account
3. Copy your API key
4. Paste it into `.env`
5. Restart the dev server

**Without an API key**, the app will connect but receive no vessel data.

## Features

- Real-time AIS vessel tracking
- 3D globe visualization with Cesium
- GPS location tracking (requires user permission)
- Search for ports and locations
- Vessel type classification and color coding

## Development

- `npm run dev` - Start Vite dev server only
- `npm run start:proxy` - Start WebSocket proxy server only
- `npm run dev:full` - Start both servers concurrently
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
