import { Color } from 'cesium';

export const getVesselCategory = (typeCode) => {
    if (!typeCode) return 'Other';
    const type = Number(typeCode);

    // Core Types
    if (type >= 70 && type < 80) return 'Cargo';
    if (type >= 80 && type < 90) return 'Tanker';
    if (type >= 60 && type < 70) return 'Passenger';
    if (type === 30) return 'Fishing';
    if (type >= 36 && type <= 37) return 'Pleasure';

    // Simplified Groups for filtering/coloring
    if (type === 52 || type === 31 || type === 32) return 'Tug'; // Includes Towing
    if (type >= 40 && type < 50) return 'High Speed';
    if (type >= 50 && type <= 59) return 'Special'; // Pilot, SAR, Law, etc
    if (type >= 33 && type <= 35) return 'Special'; // Dredging, Diving, Military

    return 'Other';
};

export const getVesselDescription = (typeCode) => {
    if (!typeCode) return 'Unknown';
    const type = Number(typeCode);

    // Return specific name if known, otherwise fall back to Category
    switch (type) {
        case 30: return 'Fishing';
        case 31: return 'Towing';
        case 32: return 'Towing (>200m)';
        case 33: return 'Dredging';
        case 34: return 'Diving Ops';
        case 35: return 'Military';
        case 36: return 'Sailing Vessel';
        case 37: return 'Pleasure Craft';
        case 51: return 'Search & Rescue';
        case 52: return 'Tug';
        case 53: return 'Port Tender';
        case 55: return 'Law Enforcement';
        case 58: return 'Medical Ops';
    }

    // Broad ranges
    if (type >= 40 && type < 50) return `High Speed (${type})`;
    if (type >= 60 && type < 70) return `Passenger (${type})`;
    if (type >= 70 && type < 80) return `Cargo (${type})`;
    if (type >= 80 && type < 90) return `Tanker (${type})`;

    return `${getVesselCategory(type)} (${type})`;
};

export const getNavigationalStatus = (statusCode) => {
    switch (statusCode) {
        case 0: return 'Under way using engine';
        case 1: return 'At anchor';
        case 2: return 'Not under command';
        case 3: return 'Restricted manoeuvrability';
        case 4: return 'Constrained by her draught';
        case 5: return 'Moored';
        case 6: return 'Aground';
        case 7: return 'Engaged in Fishing';
        case 8: return 'Under way sailing';
        case 15: return 'Undefined';
        default: return `Status ${statusCode}`;
    }
};

export const getShipColor = (typeCode) => {
    const category = getVesselCategory(typeCode);

    switch (category) {
        case 'Cargo': return Color.LIGHTGREEN;
        case 'Tanker': return Color.INDIANRED;
        case 'Passenger': return Color.SKYBLUE;
        case 'Fishing': return Color.ORANGE;
        case 'Pleasure': return Color.MAGENTA;
        case 'High Speed': return Color.CYAN;
        case 'Tug': return Color.YELLOW;
        case 'Special': return Color.GOLD;
        default: return Color.WHITE;
    }
};

export const getVesselSize = (boat) => {
    const s = boat.static;
    const type = s?.Type || 0;

    // 1. Check physical dimensions if available
    if (s && (s.DimensionA !== undefined || s.DimensionB !== undefined)) {
        const length = (Number(s.DimensionA) || 0) + (Number(s.DimensionB) || 0);
        const width = (Number(s.DimensionC) || 0) + (Number(s.DimensionD) || 0);
        if (length > 0) return length * (width || 20); // Width fallback to 20m
    }

    // 2. Fallback to type-based sizing
    if (type >= 80 && type < 90) return 10000; // Tanker
    if (type >= 70 && type < 80) return 8000;  // Cargo
    if (type >= 60 && type < 70) return 5000;  // Passenger
    if (type === 30) return 1000;              // Fishing
    if (type >= 36 && type <= 37) return 500;  // Pleasure
    return 100;
};
