import React from 'react';

const BoatInfoPanel = ({ boat, onClose }) => {
    if (!boat) return null;

    const styles = {
        panel: {
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '90%',
            maxWidth: '400px',
            zIndex: 1000,
            padding: '20px',
            borderRadius: '20px',
            backgroundColor: 'rgba(20, 20, 30, 0.85)', // Darker background for contrast
            backdropFilter: 'blur(15px)',
            WebkitBackdropFilter: 'blur(15px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            color: 'white',
            fontFamily: 'Inter, system-ui, sans-serif',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
        },
        header: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            paddingBottom: '10px'
        },
        title: {
            margin: 0,
            fontSize: '1.2rem',
            fontWeight: '700',
            color: '#fff'
        },
        closeBtn: {
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.6)',
            fontSize: '1.5rem',
            cursor: 'pointer',
            padding: '0 5px'
        },
        grid: {
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
            fontSize: '0.9rem'
        },
        label: {
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: '0.75rem',
            marginBottom: '2px'
        },
        value: {
            fontWeight: '500'
        }
    };

    const mmsi = boat.MetaData?.MMSI || boat.static?.Mmsi || 'Unknown';
    const name = boat.MetaData?.ShipName || boat.static?.Name || `Unknown Vessel (${mmsi})`;
    const type = boat.static?.Type || 'Unknown';
    const destination = boat.static?.Destination || 'Unknown';
    const sog = boat.Message?.PositionReport?.Sog !== undefined ? `${boat.Message.PositionReport.Sog} kn` : '-';
    const cog = boat.Message?.PositionReport?.Cog !== undefined ? `${boat.Message.PositionReport.Cog}°` : '-';
    const lat = boat.Message?.PositionReport?.Latitude?.toFixed(4) || '-';
    const lon = boat.Message?.PositionReport?.Longitude?.toFixed(4) || '-';

    return (
        <div style={styles.panel}>
            <div style={styles.header}>
                <h2 style={styles.title}>{name}</h2>
                <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>

            <div style={styles.grid}>
                <div>
                    <div style={styles.label}>DESTINATION</div>
                    <div style={styles.value} title={destination}>{destination}</div>
                </div>
                <div>
                    <div style={styles.label}>TYPE</div>
                    <div style={styles.value}>{type}</div>
                </div>
                <div>
                    <div style={styles.label}>SPEED</div>
                    <div style={styles.value}>{sog}</div>
                </div>
                <div>
                    <div style={styles.label}>COURSE</div>
                    <div style={styles.value}>{cog}</div>
                </div>
                <div>
                    <div style={styles.label}>COORDINATES</div>
                    <div style={styles.value}>{lat}, {lon}</div>
                </div>
                <div>
                    <div style={styles.label}>MMSI</div>
                    <div style={styles.value}>{mmsi}</div>
                </div>
            </div>
        </div>
    );
};

export default BoatInfoPanel;
