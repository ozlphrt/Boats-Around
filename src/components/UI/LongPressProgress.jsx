import React from 'react';

const LongPressProgress = ({ x, y }) => {
    // 60px diameter circle
    const radius = 28;
    const circumference = 2 * Math.PI * radius;

    const styles = {
        container: {
            position: 'absolute',
            left: x,
            top: y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        },
        svg: {
            transform: 'rotate(-90deg)',
            width: '60px',
            height: '60px'
        },
        circleBg: {
            fill: 'none',
            stroke: 'rgba(255, 255, 255, 0.2)',
            strokeWidth: '4'
        },
        circleFg: {
            fill: 'none',
            stroke: '#00f7ff', // Cyan
            strokeWidth: '4',
            strokeDasharray: circumference,
            strokeDashoffset: circumference,
            animation: 'dash 2s linear forwards'
        }
    };

    return (
        <div style={styles.container}>
            <style>
                {`
                    @keyframes dash {
                        to {
                            stroke-dashoffset: 0;
                        }
                    }
                `}
            </style>
            <svg style={styles.svg}>
                <circle
                    cx="30"
                    cy="30"
                    r={radius}
                    style={styles.circleBg}
                />
                <circle
                    cx="30"
                    cy="30"
                    r={radius}
                    style={styles.circleFg}
                />
            </svg>
        </div>
    );
};

export default LongPressProgress;
