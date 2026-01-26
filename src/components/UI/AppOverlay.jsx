import React, { useState, useEffect, useRef } from 'react';

const AppOverlay = ({ connectionStatus, boatCount, onRecenter, onSearch, locationPermissionRequested, onRequestLocation, enabledVesselTypes, onToggleVesselType, showLabels, onToggleLabels }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [showApiDetails, setShowApiDetails] = useState(false);
    const [showLegend, setShowLegend] = useState(true);
    const legendTimerRef = useRef(null);

    // Auto-hide initial legend after 5 seconds
    useEffect(() => {
        const timer = setTimeout(() => {
            setShowLegend(false);
        }, 5000);
        return () => clearTimeout(timer);
    }, []);

    const handleApiClick = () => {
        setShowApiDetails(true);
        setTimeout(() => setShowApiDetails(false), 3000);
    };

    const handleLegendClick = () => {
        // Clear any existing timer
        if (legendTimerRef.current) {
            clearTimeout(legendTimerRef.current);
        }

        // Show legend
        setShowLegend(true);

        // Auto-hide after 5 seconds
        legendTimerRef.current = setTimeout(() => {
            setShowLegend(false);
            legendTimerRef.current = null;
        }, 5000);
    };

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (legendTimerRef.current) {
                clearTimeout(legendTimerRef.current);
            }
        };
    }, []);

    // --- Status Color Logic ---
    const getStatusColor = () => {
        if (connectionStatus.startsWith('Connected')) return '#4ade80'; // Green
        if (connectionStatus.startsWith('Locating') || connectionStatus.startsWith('Connecting') || connectionStatus === 'Initializing') return '#fbbf24'; // Yellow
        if (connectionStatus.includes('Err:') || connectionStatus.includes('Failed') || connectionStatus.includes('Dropped')) return '#f87171'; // Red
        if (connectionStatus.includes('Missing') || connectionStatus.includes('not running')) return '#f87171'; // Red
        return '#fbbf24'; // Default to yellow
    };
    const statusColor = getStatusColor();

    // Enhanced status message for better UX
    const getStatusMessage = () => {
        const isProduction = window.location.hostname.includes('github.io') || !window.location.hostname.includes('localhost');

        if (connectionStatus.includes('Err: Connection Dropped') || connectionStatus.includes('Socket Error')) {
            return isProduction
                ? 'Production Proxy Unreachable. Check Render status.'
                : 'Proxy server not running. Run: npm run start:proxy';
        }
        if (connectionStatus.includes('Missing API Key')) {
            return 'Set VITE_AISSTREAM_API_KEY in .env';
        }
        if (connectionStatus.includes('Connecting')) {
            return isProduction ? 'Connecting via Render Proxy...' : 'Connecting via Vite Proxy...';
        }
        return connectionStatus;
    };

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
            fontSize: '16px',
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
        },
        // --- Legend ---
        legendContainer: {
            position: 'absolute',
            bottom: '30px',
            right: '20px',
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            pointerEvents: 'auto',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)'
        },
        legendItem: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        },
        legendColor: {
            width: '10px',
            height: '10px',
            borderRadius: '2px'
        },
        legendText: {
            color: 'white',
            fontSize: '0.75rem',
            fontWeight: '600',
            fontFamily: 'Inter, system-ui, sans-serif',
            letterSpacing: '0.5px'
        },
        // --- Info Icon Button ---
        infoIconBtn: {
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: 'rgba(20, 20, 30, 0.6)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
            transition: 'transform 0.2s, background 0.2s'
        },
        // --- Toggle Checkbox ---
        toggleContainer: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            userSelect: 'none'
        },
        checkbox: {
            width: '16px',
            height: '16px',
            borderRadius: '4px',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
        },
        checkboxChecked: {
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
            border: '2px solid rgba(255, 255, 255, 0.5)'
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
                    onClick={locationPermissionRequested ? onRecenter : onRequestLocation}
                    title={locationPermissionRequested ? "Locate Me" : "Enable Location"}
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
                    title={getStatusMessage()}
                    onClick={handleApiClick}
                >
                    {showApiDetails ? (
                        <span style={styles.statusText}>{getStatusMessage()}</span>
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

                            {/* Retry button icon if failed */}
                            {(connectionStatus.includes('Failed') || connectionStatus.includes('Dropped') || connectionStatus.includes('Unreachable') || connectionStatus.includes('Error')) && (
                                <>
                                    <span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 4px' }}>|</span>
                                    <div
                                        style={{ ...styles.statusIcon, color: '#fbbf24', cursor: 'pointer' }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            window.location.reload(); // Simple retry for now
                                        }}
                                        title="Reload to retry connection"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M23 4v6h-6"></path>
                                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                                        </svg>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Bottom Right: Legend or Info Icon */}
            {showLegend ? (
                <div style={styles.legendContainer}>
                    {/* Vessel Labels Toggle */}
                    <div
                        style={styles.toggleContainer}
                        onClick={() => onToggleLabels(!showLabels)}
                    >
                        <div style={{
                            ...styles.checkbox,
                            ...(showLabels ? styles.checkboxChecked : {})
                        }}>
                            {showLabels && (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                            )}
                        </div>
                        <span style={styles.legendText}>Vessel Labels</span>
                    </div>

                    {/* Separator */}
                    <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.1)', margin: '4px 0' }}></div>

                    {/* Vessel Type Toggles */}
                    {[
                        { label: 'Cargo', color: '#90EE90' }, // LIGHTGREEN
                        { label: 'Tanker', color: '#CD5C5C' }, // INDIANRED
                        { label: 'Passenger', color: '#87CEEB' }, // SKYBLUE
                        { label: 'High Speed', color: '#00FFFF' }, // CYAN
                        { label: 'Tug', color: '#FFFF00' }, // YELLOW
                        { label: 'Special', color: '#FFD700' }, // GOLD
                        { label: 'Fishing', color: '#FFA500' }, // ORANGE
                        { label: 'Pleasure', color: '#FF00FF' }, // MAGENTA
                        { label: 'Other', color: '#FFFFFF' }   // WHITE
                    ].map((item) => {
                        const isEnabled = enabledVesselTypes[item.label] !== false;
                        return (
                            <div
                                key={item.label}
                                style={styles.toggleContainer}
                                onClick={() => {
                                    onToggleVesselType(prev => ({
                                        ...prev,
                                        [item.label]: !isEnabled
                                    }));
                                }}
                            >
                                <div style={{
                                    ...styles.checkbox,
                                    ...(isEnabled ? styles.checkboxChecked : {})
                                }}>
                                    {isEnabled && (
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12"></polyline>
                                        </svg>
                                    )}
                                </div>
                                <div style={styles.legendItem}>
                                    <div style={{ ...styles.legendColor, backgroundColor: item.color, opacity: isEnabled ? 1 : 0.3 }} />
                                    <span style={{ ...styles.legendText, opacity: isEnabled ? 1 : 0.5 }}>{item.label}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div style={{ position: 'absolute', bottom: '30px', right: '20px', pointerEvents: 'auto' }}>
                    <button
                        style={styles.infoIconBtn}
                        onClick={handleLegendClick}
                        title="Show settings"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"></path>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
};

export default AppOverlay;
