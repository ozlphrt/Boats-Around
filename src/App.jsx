import React, { useEffect, useState, useRef } from 'react';
import GlobeViewer from './components/Map/GlobeViewer';
import AppOverlay from './components/UI/AppOverlay';
import BoatInfoPanel from './components/UI/BoatInfoPanel';
import { LocationService } from './services/LocationService';
import { AISDataService } from './services/AISDataService';

function App() {
  const [userLocation, setUserLocation] = useState(null);
  const [boats, setBoats] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('Initializing');
  const [selectedBoat, setSelectedBoat] = useState(null);
  const [recenterTrigger, setRecenterTrigger] = useState(0);

  const aisServiceRef = useRef(null);
  const locationWatchId = useRef(null);
  const lastSubscriptionLoc = useRef(null);

  // 1. Initialize Services (One-time setup)
  useEffect(() => {
    // Setup AIS Service
    const apiKey = import.meta.env.VITE_AISSTREAM_API_KEY;
    if (apiKey) {
      aisServiceRef.current = new AISDataService(apiKey);
      connectLiveAIS();
    } else {
      console.warn("No API Key found.");
      setConnectionStatus('Missing API Key');
    }

    return () => {
      if (aisServiceRef.current) aisServiceRef.current.disconnect();
    };
  }, []); // Run once on mount

  // 2. Subscription Updates based on Location
  useEffect(() => {
    if (!userLocation || !aisServiceRef.current) return;

    // Check distance to update subscription
    if (lastSubscriptionLoc.current) {
      const dist = Math.sqrt(
        Math.pow(lastSubscriptionLoc.current.lat - userLocation.lat, 2) +
        Math.pow(lastSubscriptionLoc.current.lon - userLocation.lon, 2)
      );
      if (dist < 0.05) return; // Haven't moved enough
    }

    lastSubscriptionLoc.current = userLocation;

    const variance = 2.0; // Large radius
    const bbox = {
      north: userLocation.lat + variance,
      south: userLocation.lat - variance,
      east: userLocation.lon + variance,
      west: userLocation.lon - variance
    };

    aisServiceRef.current.updateSettings(bbox);

  }, [userLocation]);


  const connectLiveAIS = () => {
    setConnectionStatus('Connecting to AIS...');
    aisServiceRef.current.connect(
      (msg) => {
        // ... existing message handling logic ...
        // We need to duplicate the reducer logic or move it to a helper
        // For simplicity, I'll inline a simplified version or reuse the logic
        handleAISMessage(msg);
      },
      (status) => setConnectionStatus(status)
    );
  };

  const handleAISMessage = (msg) => {
    setBoats(prevBoats => {
      const mmsi = msg.MetaData.MMSI;
      const index = prevBoats.findIndex(b => b.MetaData.MMSI === mmsi);
      let updatedBoats = [...prevBoats];

      if (index !== -1) {
        const existingBoat = updatedBoats[index];
        if (msg.MessageType === "PositionReport") {
          updatedBoats[index] = {
            ...existingBoat,
            Message: { ...existingBoat.Message, PositionReport: msg.Message.PositionReport },
            MetaData: msg.MetaData
          };
        } else if (msg.MessageType === "ShipStaticData") {
          updatedBoats[index] = { ...existingBoat, static: msg.Message.ShipStaticData };
        }
      } else {
        if (msg.MessageType === "PositionReport") updatedBoats.push(msg);
        // Only add if we have position or static? 
        // Existing logic allowed static-only to create entry with 0,0 pos
        else if (msg.MessageType === "ShipStaticData") {
          updatedBoats.push({
            MetaData: msg.MetaData,
            Message: { PositionReport: { Latitude: 0, Longitude: 0, Sog: 0 } },
            static: msg.Message.ShipStaticData
          });
        }
      }
      return updatedBoats;
    });
    setConnectionStatus('Connected (Live)');
  };


  // 4. GPS Check on Mount
  useEffect(() => {
    setConnectionStatus('Locating GPS...');
    LocationService.getCurrentLocation(
      (loc) => { setUserLocation(loc); },
      (err) => {
        console.error(err);
        setConnectionStatus('GPS Failed. Try Search.');
      }
    );

    locationWatchId.current = LocationService.watchLocation((loc) => {
      // Only update if we are trusting GPS (implied unless we manually searched? 
      // Actually, let's always update userLocation, but maybe not fly to it if we searched?
      // For now, simple behavior:
      setUserLocation(loc);
    });

    return () => {
      if (locationWatchId.current) navigator.geolocation.clearWatch(locationWatchId.current);
    };
  }, []);


  const handleRecenter = () => {
    setConnectionStatus('Locating GPS...');
    LocationService.getCurrentLocation(
      (loc) => { setUserLocation(loc); setRecenterTrigger(Date.now()); },
      (err) => console.error(err)
    );
  };

  const handleSearch = async (query) => {
    setConnectionStatus(`Searching '${query}'...`);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': 'BoatsAround/1.0' }
      });
      const data = await response.json();
      if (data && data.length > 0) {
        const result = data[0];
        const newLoc = {
          lat: parseFloat(result.lat),
          lon: parseFloat(result.lon),
          heading: 0
        };

        setBoats([]); // Clear previous boats
        setUserLocation(newLoc);
        setRecenterTrigger(Date.now());
        setConnectionStatus(`Arrived: ${result.name || query}`);

        // If in sim mode, this will trigger the effect to restart sim at new loc
        // If in live mode, this will trigger effect to update bbox
      } else {
        setConnectionStatus(`Location '${query}' not found.`);
      }
    } catch (e) {
      console.error(e);
      setConnectionStatus('Search Failed.');
    }
  };

  return (
    <>
      <GlobeViewer
        userLocation={userLocation}
        boats={boats}
        onSelectBoat={setSelectedBoat}
        recenterTrigger={recenterTrigger}
      />
      <AppOverlay
        connectionStatus={connectionStatus}
        boatCount={boats.length}
        onRecenter={handleRecenter}
        onSearch={handleSearch}
      />
      <BoatInfoPanel
        boat={selectedBoat}
        onClose={() => setSelectedBoat(null)}
      />
    </>
  );
}

export default App;
