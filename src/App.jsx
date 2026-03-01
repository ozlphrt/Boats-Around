import React, { useEffect, useState, useRef, useCallback } from 'react';
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

// Progressive radius steps in Nautical Miles
const RADIUS_STEPS = [1, 2, 5, 10, 25, 50];

function App() {
  const [userLocation, setUserLocation] = useState(DEFAULT_LOCATION);
  const [focalPoint, setFocalPoint] = useState(DEFAULT_LOCATION);
  const [locationSource, setLocationSource] = useState('default'); // 'default', 'gps', 'search', 'map'
  const [searchRadius, setSearchRadius] = useState(RADIUS_STEPS[0]);
  const [boats, setBoats] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('Initializing');
  const [selectedBoat, setSelectedBoat] = useState(null);
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [isTrackingUser, setIsTrackingUser] = useState(true);
  const [locationPermissionRequested, setLocationPermissionRequested] = useState(false);
  const [enabledVesselTypes, setEnabledVesselTypes] = useState({
    Cargo: true, Tanker: true, Passenger: true, 'High Speed': true,
    Tug: true, Special: true, Fishing: true, Pleasure: true, Other: true
  });
  const [showLabels, setShowLabels] = useState(true);

  const aisServiceRef = useRef(null);
  const locationWatchId = useRef(null);
  const isTrackingUserRef = useRef(true);
  const lastSubscriptionRef = useRef({ lat: 0, lon: 0, radius: 0 });

  // Sync ref with state
  useEffect(() => {
    isTrackingUserRef.current = isTrackingUser;
  }, [isTrackingUser]);

  // 1. Initialize AIS Service
  useEffect(() => {
    const apiKey = import.meta.env.VITE_AISSTREAM_API_KEY;
    if (apiKey && apiKey !== 'undefined') {
      aisServiceRef.current = new AISDataService(apiKey);
      aisServiceRef.current.connect(
        (msg) => handleAISMessage(msg),
        (status) => setConnectionStatus(status)
      );
    } else {
      setConnectionStatus('Missing API Key - Set in .env');
    }

    // Auto-request location on mount
    const timer = setTimeout(() => {
      requestLocationPermission();
    }, 1000);

    return () => {
      if (aisServiceRef.current) aisServiceRef.current.disconnect();
      clearTimeout(timer);
    };
  }, []);

  // 2. Progressive Subscription Logic (Debounced)
  useEffect(() => {
    if (!aisServiceRef.current) return;

    const handler = setTimeout(() => {
      const updateSubscription = () => {
        // Only update if focal point or radius changed significantly
        const dist = Math.sqrt(
          Math.pow(lastSubscriptionRef.current.lat - focalPoint.lat, 2) +
          Math.pow(lastSubscriptionRef.current.lon - focalPoint.lon, 2)
        );

        // Radius in degrees approx (1nm = 1/60 degrees)
        const variance = searchRadius / 60;

        // If we moved less than 10% of current radius and radius hasn't changed, skip
        if (dist < (variance * 0.1) && lastSubscriptionRef.current.radius === searchRadius) return;

        lastSubscriptionRef.current = { ...focalPoint, radius: searchRadius };

        const bbox = {
          north: focalPoint.lat + variance,
          south: focalPoint.lat - variance,
          east: focalPoint.lon + (variance / Math.cos(focalPoint.lat * Math.PI / 180)),
          west: focalPoint.lon - (variance / Math.cos(focalPoint.lat * Math.PI / 180))
        };

        console.log(`[App] 🛰️ Subscribing: ${searchRadius}NM radius around ${focalPoint.lat.toFixed(4)}, ${focalPoint.lon.toFixed(4)}`, JSON.stringify(bbox));
        aisServiceRef.current.updateSettings(bbox);
      };

      updateSubscription();
    }, 1000); // 1s Debounce to prevent rate limiting

    return () => clearTimeout(handler);
  }, [focalPoint, searchRadius]);

  // 3. Expansion Logic
  useEffect(() => {
    const canExpand = boats.length < 100;
    if (canExpand) {
      const nextRadiusIndex = RADIUS_STEPS.indexOf(searchRadius) + 1;
      if (nextRadiusIndex < RADIUS_STEPS.length) {
        // Speed up expansion if 0 boats found (5s vs 16s)
        const delay = boats.length === 0 ? 5000 : 16000;
        const timer = setTimeout(() => {
          console.log(`[App] 📈 Expanding search radius to ${RADIUS_STEPS[nextRadiusIndex]}NM (current count: ${boats.length})`);
          setSearchRadius(RADIUS_STEPS[nextRadiusIndex]);
        }, delay);
        return () => clearTimeout(timer);
      }
    }
  }, [boats.length < 100, boats.length === 0, searchRadius]);

  const handleAISMessage = (msg) => {
    setBoats(prevBoats => {
      const mmsi = msg.MetaData.MMSI;
      const index = prevBoats.findIndex(b => b.MetaData.MMSI === mmsi);
      let updatedBoats = [...prevBoats];

      if (index !== -1) {
        const existingBoat = updatedBoats[index];
        const innerMsg = msg.Message[msg.MessageType];

        if (msg.MessageType.includes("PositionReport") && innerMsg) {
          updatedBoats[index] = {
            ...existingBoat,
            MessageType: msg.MessageType,
            Message: { ...existingBoat.Message, [msg.MessageType]: innerMsg },
            MetaData: msg.MetaData.ShipName?.trim() ? { ...msg.MetaData, ShipName: msg.MetaData.ShipName.trim() } : msg.MetaData,
            lastUpdate: Date.now()
          };
        } else if (msg.MessageType === "ShipStaticData") {
          updatedBoats[index] = {
            ...existingBoat,
            MessageType: msg.MessageType,
            static: { ...msg.Message.ShipStaticData, Name: msg.Message.ShipStaticData.Name?.trim() },
            MetaData: msg.Message.ShipStaticData.Name?.trim() ? { ...existingBoat.MetaData, ShipName: msg.Message.ShipStaticData.Name.trim() } : existingBoat.MetaData,
            lastUpdate: Date.now()
          };
        }
      } else {
        if (msg.MessageType.includes("PositionReport") || msg.MessageType === "ShipStaticData" || msg.MessageType === "AidsToNavigationReport") {
          const innerMsg = msg.Message[msg.MessageType];
          const shipName = (msg.MessageType === "ShipStaticData" ? msg.Message.ShipStaticData?.Name : msg.MetaData?.ShipName)?.trim();

          updatedBoats.push({
            ...msg,
            MetaData: { ...msg.MetaData, ShipName: shipName || `Vessel ${mmsi}` },
            static: msg.MessageType === "ShipStaticData" ? { ...msg.Message.ShipStaticData, Name: shipName } : null,
            lastUpdate: Date.now()
          });
        }
      }

      // Prune if exceeds 2000
      if (updatedBoats.length > 2000 && updatedBoats.length % 100 === 0) {
        updatedBoats.sort((a, b) => (b.lastUpdate || 0) - (a.lastUpdate || 0));
        return updatedBoats.slice(0, 1500);
      }
      return updatedBoats;
    });
    setConnectionStatus('Connected (Live)');
  };

  const handleCameraChange = useCallback((lat, lon) => {
    setFocalPoint(prev => {
      // Only update if moved significantly (more than 0.001 deg)
      if (Math.abs(prev.lat - lat) < 0.001 && Math.abs(prev.lon - lon) < 0.001) return prev;

      console.log(`[App] 🎯 Map Center: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      // Reset radius expansion on new focal point
      setTimeout(() => {
        setSearchRadius(RADIUS_STEPS[0]);
        setBoats([]);
        setLocationSource('map');
        setIsTrackingUser(false);
      }, 0);
      return { lat, lon, heading: 0 };
    });
  }, []);

  const requestLocationPermission = () => {
    if (locationPermissionRequested) return;
    setLocationPermissionRequested(true);
    setConnectionStatus('Locating GPS...');

    LocationService.getCurrentLocation(
      (loc) => {
        setUserLocation(loc);
        setFocalPoint(loc);
        setLocationSource('gps');
        setConnectionStatus('GPS Located');
        locationWatchId.current = LocationService.watchLocation((loc) => {
          if (isTrackingUserRef.current) {
            setUserLocation(loc);
            setLocationSource('gps');
          }
        });
      },
      (err) => {
        setUserLocation(DEFAULT_LOCATION);
        setFocalPoint(DEFAULT_LOCATION);
        setLocationSource('default');
        setConnectionStatus('Using Default Location');
      }
    );
  };

  const handleRecenter = () => {
    if (!locationPermissionRequested) {
      requestLocationPermission();
      return;
    }
    setIsTrackingUser(true);
    LocationService.getCurrentLocation((loc) => {
      setUserLocation(loc);
      setFocalPoint(loc);
      setLocationSource('gps');
      setRecenterTrigger(Date.now());
      setSearchRadius(RADIUS_STEPS[0]);
      setBoats([]);
    });
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
        const newLoc = { lat: parseFloat(result.lat), lon: parseFloat(result.lon), heading: 0 };
        setBoats([]);
        setSearchRadius(RADIUS_STEPS[0]);
        setIsTrackingUser(false);
        setUserLocation(newLoc);
        setFocalPoint(newLoc);
        setLocationSource('search');
        setRecenterTrigger(Date.now());
        setConnectionStatus(`Arrived: ${result.name || query}`);
      } else {
        setConnectionStatus(`Location '${query}' not found.`);
      }
    } catch (e) { setConnectionStatus('Search Failed.'); }
  };

  return (
    <>
      <GlobeViewer
        userLocation={userLocation}
        locationSource={locationSource}
        boats={boats}
        selectedBoat={selectedBoat}
        onSelectBoat={setSelectedBoat}
        onLocationUpdate={(loc) => {
          setUserLocation(loc);
          setFocalPoint(loc);
          setLocationSource('gps');
          setSearchRadius(RADIUS_STEPS[0]);
          setBoats([]);
        }}
        onCameraChange={handleCameraChange}
        recenterTrigger={recenterTrigger}
        enabledVesselTypes={enabledVesselTypes}
        showLabels={showLabels}
      />
      <AppOverlay
        connectionStatus={connectionStatus}
        boatCount={boats.length}
        searchRadius={searchRadius}
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
