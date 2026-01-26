import React, { useEffect, useState, useRef } from 'react';
import GlobeViewer from './components/Map/GlobeViewer';
import AppOverlay from './components/UI/AppOverlay';
import BoatInfoPanel from './components/UI/BoatInfoPanel';
import { LocationService } from './services/LocationService';
import { AISDataService } from './services/AISDataService';

// Default location fallback (English Channel - busy maritime area)
const DEFAULT_LOCATION = {
  lat: 50.5,
  lon: 0.5,
  heading: 0
};

function App() {
  const [userLocation, setUserLocation] = useState(DEFAULT_LOCATION);
  const [boats, setBoats] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('Initializing');
  const [selectedBoat, setSelectedBoat] = useState(null);
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [isTrackingUser, setIsTrackingUser] = useState(true);
  const [locationPermissionRequested, setLocationPermissionRequested] = useState(false);
  const [enabledVesselTypes, setEnabledVesselTypes] = useState({
    Cargo: true,
    Tanker: true,
    Passenger: true,
    'High Speed': true,
    Tug: true,
    Special: true,
    Fishing: true,
    Pleasure: true,
    Other: true
  });
  const [showLabels, setShowLabels] = useState(true);

  const aisServiceRef = useRef(null);
  const locationWatchId = useRef(null);
  const lastSubscriptionLoc = useRef(null);
  const isTrackingUserRef = useRef(true);

  // Sync ref with state
  useEffect(() => {
    isTrackingUserRef.current = isTrackingUser;
  }, [isTrackingUser]);


  // 1. Initialize Services (One-time setup)
  useEffect(() => {
    // Setup AIS Service
    const apiKey = import.meta.env.VITE_AISSTREAM_API_KEY;
    if (apiKey && apiKey !== 'undefined') {
      console.log(`[App] API Key configured: ${apiKey.substring(0, 8)}...`);
      aisServiceRef.current = new AISDataService(apiKey);
      connectLiveAIS();
    } else {
      console.error("[App] ⚠️ No API Key found! Create .env file with VITE_AISSTREAM_API_KEY=your_key");
      console.error("[App] Get API key from: https://aisstream.io/");
      setConnectionStatus('Missing API Key - Set in .env');
    }

    return () => {
      if (aisServiceRef.current) aisServiceRef.current.disconnect();
    };
  }, []); // Run once on mount

  // 1.5. Auto-request GPS location removed to comply with browser policy
  // Users must now trigger this via the "Enable Location" button
  useEffect(() => {
    // Small delay to ensure viewer is ready
    const timer = setTimeout(() => {
      if (!locationPermissionRequested) {
        requestLocationPermission();
      }
    }, 500);

    return () => clearTimeout(timer);
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

    const variance = 2.0; // Large radius (~220km radius)
    const bbox = {
      north: userLocation.lat + variance,
      south: userLocation.lat - variance,
      east: userLocation.lon + variance,
      west: userLocation.lon - variance
    };

    console.log(`[App] 📍 Location: ${userLocation.lat.toFixed(4)}, ${userLocation.lon.toFixed(4)}`);
    console.log(`[App] 🗺️ Subscribing to ${(variance * 111).toFixed(0)}km radius`);

    if (aisServiceRef.current) aisServiceRef.current.updateSettings(bbox);

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
          const shipName = msg.MetaData?.ShipName?.trim();
          updatedBoats[index] = {
            ...existingBoat,
            Message: { ...existingBoat.Message, PositionReport: msg.Message.PositionReport },
            MetaData: shipName ? { ...msg.MetaData, ShipName: shipName } : msg.MetaData,
            lastUpdate: Date.now()
          };
        } else if (msg.MessageType === "ShipStaticData") {
          const shipName = msg.Message.ShipStaticData?.Name?.trim();
          console.log(`[App] ℹ️ Static Data for ${mmsi}:`, msg.Message.ShipStaticData); // DEBUG LOG
          updatedBoats[index] = {
            ...existingBoat,
            static: { ...msg.Message.ShipStaticData, Name: shipName },
            MetaData: shipName ? { ...existingBoat.MetaData, ShipName: shipName } : existingBoat.MetaData,
            lastUpdate: Date.now()
          };
        }
      } else {
        if (msg.MessageType === "PositionReport") {
          const mmsi = msg.MetaData?.MMSI;
          const shipName = msg.MetaData?.ShipName?.trim();
          updatedBoats.push({
            ...msg,
            MetaData: { ...msg.MetaData, ShipName: shipName || `Vessel ${mmsi}` },
            lastUpdate: Date.now()
          });
        } else if (msg.MessageType === "ShipStaticData") {
          const mmsi = msg.MetaData?.MMSI;
          const shipName = msg.Message.ShipStaticData?.Name?.trim() || msg.MetaData?.ShipName?.trim();
          updatedBoats.push({
            MetaData: { ...msg.MetaData, ShipName: shipName || `Vessel ${mmsi}` },
            Message: { PositionReport: { Latitude: 0, Longitude: 0, Sog: 0 } },
            static: { ...msg.Message.ShipStaticData, Name: shipName },
            lastUpdate: Date.now()
          });
        }
      }

      // Periodically prune state if it exceeds 2000 vessels
      // (This prevents memory bloat when panning around large areas)
      if (updatedBoats.length > 2000) {
        // Only prune once every 100 additions to avoid constant sorting
        if (updatedBoats.length % 100 === 0) {
          console.log(`[App] Pruning state... (${updatedBoats.length} -> 1500)`);
          updatedBoats.sort((a, b) => (b.lastUpdate || 0) - (a.lastUpdate || 0));
          return updatedBoats.slice(0, 1500);
        }
      }

      if (updatedBoats.length !== prevBoats.length && updatedBoats.length % 50 === 0) {
        console.log(`[App] 🚢 Boat count: ${updatedBoats.length} (${updatedBoats.length > prevBoats.length ? '+' : ''}${updatedBoats.length - prevBoats.length})`);
      }
      return updatedBoats;
    });
    setConnectionStatus('Connected (Live)');
  };


  // 4. GPS Location - Auto-request on startup, fallback to default if denied
  const requestLocationPermission = () => {
    if (locationPermissionRequested) return; // Already requested

    setLocationPermissionRequested(true);
    setConnectionStatus('Locating GPS...');

    LocationService.getCurrentLocation(
      (loc) => {
        setUserLocation(loc);
        setConnectionStatus('GPS Located');

        // Start watching location after successful initial request
        locationWatchId.current = LocationService.watchLocation((loc) => {
          // Only update userLocation & trigger recenter if we are in tracking mode
          setUserLocation(prev => {
            if (isTrackingUserRef.current) {
              return loc;
            }
            return prev;
          });
        });
      },
      (err) => {
        console.warn("[App] GPS unavailable, using default location:", err);
        // Use default location if GPS fails
        setUserLocation(DEFAULT_LOCATION);
        setConnectionStatus('Using Default Location');
        setLocationPermissionRequested(false); // Allow retry
      }
    );
  };

  // Cleanup location watch on unmount
  useEffect(() => {
    return () => {
      if (locationWatchId.current) navigator.geolocation.clearWatch(locationWatchId.current);
    };
  }, []);


  const handleRecenter = () => {
    // If location permission not yet requested, request it
    if (!locationPermissionRequested) {
      requestLocationPermission();
      return;
    }

    setConnectionStatus('Locating GPS...');
    setIsTrackingUser(true); // Re-enable tracking
    LocationService.getCurrentLocation(
      (loc) => { setUserLocation(loc); setRecenterTrigger(Date.now()); },
      (err) => {
        console.error(err);
        setConnectionStatus('GPS Failed. Try Search.');
      }
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
        setIsTrackingUser(false); // Stop tracking GPS after search
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
        selectedBoat={selectedBoat}
        onSelectBoat={setSelectedBoat}
        onLocationUpdate={setUserLocation}
        recenterTrigger={recenterTrigger}
        enabledVesselTypes={enabledVesselTypes}
        showLabels={showLabels}
      />
      <AppOverlay
        connectionStatus={connectionStatus}
        boatCount={boats.length}
        onRecenter={handleRecenter}
        onSearch={handleSearch}
        locationPermissionRequested={locationPermissionRequested}
        onRequestLocation={requestLocationPermission}
        enabledVesselTypes={enabledVesselTypes}
        onToggleVesselType={setEnabledVesselTypes}
        showLabels={showLabels}
        onToggleLabels={setShowLabels}
      />
      <BoatInfoPanel
        boat={selectedBoat}
        onClose={() => setSelectedBoat(null)}
      />
    </>
  );
}

export default App;
