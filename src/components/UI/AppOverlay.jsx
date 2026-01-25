import React, { useState } from 'react';

const AppOverlay = ({ connectionStatus, boatCount, onRecenter, onSearch }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [showApiDetails, setShowApiDetails] = useState(false);

    const handleApiClick = () => {
        setShowApiDetails(true);
        setTimeout(() => setShowApiDetails(false), 3000);
    };

    // --- Status Color Logic ---
    const getStatusColor = () => {
        if (connectionStatus.startsWith('Connected')) return '#4ade80'; // Green
        if (connectionStatus.startsWith('Locating') || connectionStatus.startsWith('Connecting') || connectionStatus === 'Initializing') return '#fbbf24'; // Yellow
        return '#f87171'; // Red
    };
    const statusColor = getStatusColor();

    const styles = {
        // Root container - allows clicking through to map
        overlay: {
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 1000
        },
        // --- Top Left: Search & GPS ---
        topLeftContainer: {
            position: 'absolute',
            top: '20px',
            left: '20px',
            pointerEvents: 'auto', // Re-enable clicks
            display: 'flex',
            gap: '8px', // CLOSER GAP (was 12px)
            alignItems: 'center'
        },
        // --- Bottom Left: Status ---
        bottomLeftContainer: {
            position: 'absolute',
            bottom: '30px',
            left: '20px',
            pointerEvents: 'auto' // Re-enable clicks
        },
        // --- Satellite Status Pill ---
        statusPill: {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            padding: '4px 12px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
            cursor: 'default',
            transition: 'all 0.3s'
        },
        statusIcon: {
            color: statusColor,
            display: 'flex',
            alignItems: 'center'
        },
        statusText: {
            color: 'white',
            fontSize: '0.75rem',
            fontWeight: '600',
            fontFamily: 'Inter, system-ui, sans-serif',
            letterSpacing: '0.5px'
        },
        // --- GPS Button (Standalone) ---
        gpsBtn: {
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: 'rgba(20, 20, 30, 0.6)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: 'white', // STANDARD COLOR (was blue)
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
            transition: 'transform 0.2s, background 0.2s'
        },
        // --- Search Container (Standalone) ---
        searchContainer: {
            display: 'flex',
            alignItems: 'center',
            height: '44px',
            backgroundColor: 'rgba(20, 20, 30, 0.6)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '12px',
            padding: '0 4px 0 12px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
            width: '260px'
        },
        input: {
            flex: 1,
            border: 'none',
            background: 'transparent',
            outline: 'none',
            color: 'white',
            fontSize: '0.9rem',
            fontFamily: 'Inter, system-ui, sans-serif',
            minWidth: 0
        },
        searchBtn: {
            padding: '8px',
            color: 'rgba(255, 255, 255, 0.6)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center'
        }
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            onSearch(searchQuery);
        }
    };

    return (
        <div style={styles.overlay}>
            {/* Top Left: GPS + Search + Mode Switch */}
            <div style={styles.topLeftContainer}>
                {/* GPS Button */}
                <button
                    style={styles.gpsBtn}
                    onClick={onRecenter}
                    title="Locate Me"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
                    </svg>
                </button>

                {/* Search Box */}
                <form style={styles.searchContainer} onSubmit={handleSearchSubmit}>
                    <input
                        style={styles.input}
                        placeholder="Search port..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <button type="submit" style={styles.searchBtn}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                    </button>
                </form>


            </div>

            {/* Bottom Left: Status Pill */}
            <div style={styles.bottomLeftContainer}>
                <div
                    style={{ ...styles.statusPill, cursor: 'pointer' }}
                    title={connectionStatus}
                    onClick={handleApiClick}
                >
                    {showApiDetails ? (
                        <span style={styles.statusText}>{connectionStatus}</span>
                    ) : (
                        <>
                            <div style={styles.statusIcon}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2a10 10 0 0 0-7.07 17.07L12 22l7.07-2.93A10 10 0 0 0 12 2z"></path>
                                    <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"></path>
                                    <line x1="12" y1="2" x2="12" y2="4"></line>
                                </svg>
                            </div>
                            <span style={styles.statusText}>API</span>
                            <span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 4px' }}>|</span>
                            {/* Styled Vessels text to match API */}
                            <span style={{ ...styles.statusText, fontWeight: '600' }}>{boatCount} Vessels</span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AppOverlay;
