/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import React from 'react';

interface SwapStatusData {
  id: string;
  status: string;
  time: {
    reg: number;
    start: number | null;
    finish: number | null;
    update: number;
    expiration: number;
    left: number;
  };
  from: {
    code: string;
    coin: string;
    network: string;
    name: string;
    amount: string;
    address: string;
    tx: {
      id: string | null;
      amount: string | null;
      fee: string | null;
      ccyfee: string | null;
      confirmations: string | null;
      timeBlock: number | null;
      timeReg: number | null;
    };
  };
  
  to: {
    code: string;
    coin: string;
    network: string;
    name: string;
    amount: string;
    address: string;
    tx: {
      id: string | null;
      amount: string | null;
      fee: string | null;
      ccyfee: string | null;
      confirmations: string | null;
      timeBlock: number | null;
      timeReg: number | null;
    };
  };
  emergency?: {
    status: string[];
    choice: string;
    repeat: string;
  };
}

interface SwapStatusTrackerProps {
  statusData: SwapStatusData | null;
  fromCurrency: string;
  toCurrency: string;
  isPolling: boolean;
}

const SwapStatusTracker: React.FC<SwapStatusTrackerProps> = ({
  statusData,
  fromCurrency,
  toCurrency,
  isPolling
}) => {
  const getStatusInfo = (status: string) => {
    const statusMap: { [key: string]: { label: string; description: string; color: string; icon: string } } = {
      'NEW': {
        label: 'Order Created',
        description: 'Waiting for deposit transaction',
        color: '#3b82f6',
        icon: '🆕'
      },
      'PENDING': {
        label: 'Transaction Received',
        description: 'Pending confirmation on blockchain',
        color: '#f59e0b',
        icon: '⏳'
      },
      'EXCHANGE': {
        label: 'Exchange in Progress',
        description: 'Transaction confirmed, processing exchange',
        color: '#8b5cf6',
        icon: '🔄'
      },
      'WITHDRAW': {
        label: 'Sending Funds',
        description: 'Sending tokens to your address',
        color: '#06b6d4',
        icon: '📤'
      },
      'DONE': {
        label: 'Swap Completed',
        description: 'Successfully completed!',
        color: '#10b981',
        icon: '✅'
      },
      'EXPIRED': {
        label: 'Order Expired',
        description: 'Order has expired',
        color: '#ef4444',
        icon: '⏰'
      },
      'EMERGENCY': {
        label: 'Manual Review Required',
        description: 'Customer choice required',
        color: '#dc2626',
        icon: '🚨'
      }
    };
    
    return statusMap[status] || {
      label: 'Unknown Status',
      description: 'Unknown status',
      color: '#6b7280',
      icon: '❓'
    };
  };

  const getProgressPercentage = (status: string) => {
    const progressMap: { [key: string]: number } = {
      'NEW': 20,
      'PENDING': 40,
      'EXCHANGE': 60,
      'WITHDRAW': 80,
      'DONE': 100,
      'EXPIRED': 0,
      'EMERGENCY': 0
    };
    return progressMap[status] || 0;
  };

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleString();
  };

  const formatTimeLeft = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const truncateHash = (hash: string | null) => {
    if (!hash) return 'N/A';
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(label.includes('hash') ? 'Tx copied!' : 'Address copied!');
      console.log(`${label} copied to clipboard: ${text}`);
    } catch (err) {
      console.error('Failed to copy: ', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast(label.includes('hash') ? 'Tx copied!' : 'Address copied!');
    }
  };

  const showToast = (message: string) => {
    // Create toast element
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
      pointer-events: none;
    `;

    // Add animation keyframes
    if (!document.getElementById('toast-styles')) {
      const style = document.createElement('style');
      style.id = 'toast-styles';
      style.textContent = `
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes slideOut {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    // Remove toast after 2 seconds
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 2000);
  };

  if (!statusData) {
    return (
      <div className="swap-status-tracker">
        <div className="status-header">
          <h3>Swap Status</h3>
          <div className="loading-indicator">
            {isPolling && <div className="spinner">🔄</div>}
          </div>
        </div>
        <p>No status data available</p>
      </div>
    );
  }

  const statusInfo = getStatusInfo(statusData.status);
  const progress = getProgressPercentage(statusData.status);

  return (
    <div className="swap-status-tracker">
      <style>{`
        .swap-status-tracker {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 20px;
          margin: 20px 0;
          color: white;
          max-width: 100%;
          overflow: hidden;
          box-sizing: border-box;
        }

        .status-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .status-header h3 {
          margin: 0;
          color: white;
          font-size: 1.2rem;
        }

        .loading-indicator {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .spinner {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .current-status {
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 15px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          margin-bottom: 20px;
        }

        .status-icon {
          font-size: 2rem;
        }

        .status-text h4 {
          margin: 0 0 5px 0;
          color: ${statusInfo.color};
          font-size: 1.1rem;
        }

        .status-text p {
          margin: 0;
          color: #d1d5db;
          font-size: 0.9rem;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 20px;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, ${statusInfo.color}, ${statusInfo.color}aa);
          width: ${progress}%;
          transition: width 0.5s ease;
        }

        .order-info {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
          margin-bottom: 20px;
        }

        .info-card {
          background: rgba(255, 255, 255, 0.05);
          padding: 12px;
          border-radius: 6px;
        }

        .info-card h5 {
          margin: 0 0 8px 0;
          color: #9ca3af;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .info-card p {
          margin: 0;
          color: white;
          font-size: 0.9rem;
        }

        .transaction-details {
          margin-top: 20px;
          overflow: hidden;
        }

        .transaction-details h4 {
          margin: 0 0 15px 0;
          color: white;
          font-size: 1rem;
        }

        .tx-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }

        @media (max-width: 768px) {
          .tx-grid {
            grid-template-columns: 1fr;
            gap: 10px;
          }
        }

        .tx-section {
          background: rgba(255, 255, 255, 0.05);
          padding: 15px;
          border-radius: 8px;
          overflow: hidden;
          word-wrap: break-word;
          min-width: 0;
        }

        .tx-section h5 {
          margin: 0 0 10px 0;
          color: #9ca3af;
          font-size: 0.9rem;
        }

        .tx-detail {
          display: flex;
          justify-content: space-between;
          margin-bottom: 6px;
          font-size: 0.8rem;
          gap: 8px;
        }

        .tx-detail .label {
          color: #9ca3af;
          flex-shrink: 0;
          min-width: fit-content;
        }

        .tx-detail .value {
          color: white;
          font-family: monospace;
          text-align: right;
          overflow: hidden;
          text-overflow: ellipsis;
          word-break: break-all;
          max-width: 120px;
        }

        .hash-link {
          color: #60a5fa;
          text-decoration: none;
          cursor: pointer;
          border: 1px solid rgba(96, 165, 250, 0.3);
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(96, 165, 250, 0.1);
          transition: all 0.2s ease;
          display: inline-block;
          font-size: 11px;
          position: relative;
        }

        .hash-link:hover {
          color: #93c5fd;
          background: rgba(96, 165, 250, 0.2);
          border-color: rgba(96, 165, 250, 0.5);
          transform: translateY(-1px);
        }

        .hash-link:active {
          transform: translateY(0);
        }

        .copy-icon {
          margin-left: 4px;
          font-size: 10px;
          opacity: 0.7;
        }

        .destination-address {
          background: rgba(255, 255, 255, 0.05);
          padding: 12px;
          border-radius: 6px;
          margin-top: 10px;
        }

        .destination-address h5 {
          margin: 0 0 8px 0;
          color: #9ca3af;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .address-display {
          font-family: monospace;
          font-size: 12px;
          color: #10b981;
          word-break: break-all;
          cursor: pointer;
          padding: 6px 8px;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: 4px;
          transition: all 0.2s ease;
        }

        .address-display:hover {
          background: rgba(16, 185, 129, 0.2);
          border-color: rgba(16, 185, 129, 0.5);
        }

        .time-info {
          margin-top: 15px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 6px;
        }

        .time-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 5px;
          font-size: 0.8rem;
        }

        .time-left {
          color: ${statusData.time.left < 300 ? '#ef4444' : '#10b981'};
          font-weight: bold;
        }

        .emergency-warning {
          background: rgba(220, 38, 38, 0.1);
          border: 1px solid rgba(220, 38, 38, 0.3);
          padding: 15px;
          border-radius: 8px;
          margin-top: 15px;
        }

        .emergency-warning h4 {
          margin: 0 0 10px 0;
          color: #dc2626;
        }
      `}</style>

      <div className="status-header">
        <h3>Swap Status</h3>
        <div className="loading-indicator">
          {isPolling && <div className="spinner">🔄</div>}
          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
            ID: {statusData.id}
          </span>
        </div>
      </div>

      <div className="current-status">
        <div className="status-icon">{statusInfo.icon}</div>
        <div className="status-text">
          <h4>{statusInfo.label}</h4>
          <p>{statusInfo.description}</p>
        </div>
      </div>

      <div className="progress-bar">
        <div className="progress-fill"></div>
      </div>

      <div className="order-info">
        <div className="info-card">
          <h5>From</h5>
          <p>{statusData.from.amount} {statusData.from.code}</p>
          <p style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
            {statusData.from.name}
          </p>
        </div>
        <div className="info-card">
          <h5>To</h5>
          <p>{statusData.to.amount} {statusData.to.code}</p>
          <p style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
            {statusData.to.name}
          </p>
        </div>
      </div>

      <div className="destination-address">
        <h5>Destination Address</h5>
        <div 
          className="address-display"
          onClick={() => copyToClipboard(statusData.to.address, 'Destination address')}
          title={`Click to copy: ${statusData.to.address}`}
        >
          {statusData.to.address}
          <span className="copy-icon" style={{ marginLeft: '8px' }}>📋</span>
        </div>
        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
          Click to copy destination address
        </div>
      </div>

      <div className="time-info">
        <div className="time-row">
          <span>Order Created:</span>
          <span>{formatTime(statusData.time.reg)}</span>
        </div>
        {statusData.time.start && (
          <div className="time-row">
            <span>Started:</span>
            <span>{formatTime(statusData.time.start)}</span>
          </div>
        )}
        {statusData.time.finish && (
          <div className="time-row">
            <span>Completed:</span>
            <span>{formatTime(statusData.time.finish)}</span>
          </div>
        )}
        {statusData.time.left > 0 && statusData.status !== 'DONE' && (
          <div className="time-row">
            <span>Time Remaining:</span>
            <span className="time-left">{formatTimeLeft(statusData.time.left)}</span>
          </div>
        )}
      </div>

      <div className="transaction-details">
        <h4>Transaction Details</h4>
        <div className="tx-grid">
          <div className="tx-section">
            <h5>Deposit Transaction ({statusData.from.code})</h5>
            {statusData.from.tx.id ? (
              <>
                <div className="tx-detail">
                  <span className="label">Hash:</span>
                  <span 
                    className="value hash-link" 
                    onClick={() => copyToClipboard(statusData.from.tx.id!, 'Deposit transaction hash')}
                    title={`Click to copy: ${statusData.from.tx.id}`}
                  >
                    {truncateHash(statusData.from.tx.id)}
                    <span className="copy-icon">📋</span>
                  </span>
                </div>
                <div className="tx-detail">
                  <span className="label">Amount:</span>
                  <span className="value">{statusData.from.tx.amount}</span>
                </div>
                <div className="tx-detail">
                  <span className="label">Fee:</span>
                  <span className="value">{statusData.from.tx.fee} {statusData.from.tx.ccyfee}</span>
                </div>
                <div className="tx-detail">
                  <span className="label">Confirmations:</span>
                  <span className="value">{statusData.from.tx.confirmations}</span>
                </div>
              </>
            ) : (
              <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Waiting for deposit...</p>
            )}
          </div>

          <div className="tx-section">
            <h5>Withdrawal Transaction ({statusData.to.code})</h5>
            {statusData.to.tx.id ? (
              <>
                <div className="tx-detail">
                  <span className="label">Hash:</span>
                  <span 
                    className="value hash-link" 
                    onClick={() => copyToClipboard(statusData.to.tx.id!, 'Withdrawal transaction hash')}
                    title={`Click to copy: ${statusData.to.tx.id}`}
                  >
                    {truncateHash(statusData.to.tx.id)}
                    <span className="copy-icon">📋</span>
                  </span>
                </div>
                <div className="tx-detail">
                  <span className="label">Amount:</span>
                  <span className="value">{statusData.to.tx.amount}</span>
                </div>
                <div className="tx-detail">
                  <span className="label">Fee:</span>
                  <span className="value">{statusData.to.tx.fee} {statusData.to.tx.ccyfee}</span>
                </div>
                <div className="tx-detail">
                  <span className="label">Confirmations:</span>
                  <span className="value">{statusData.to.tx.confirmations}</span>
                </div>
              </>
            ) : (
              <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Pending...</p>
            )}
          </div>
        </div>
      </div>

      {statusData.emergency && statusData.emergency.status.length > 0 && (
        <div className="emergency-warning">
          <h4>⚠️ Emergency Status</h4>
          <p>Manual intervention required. Please contact support.</p>
          <p>Choice: {statusData.emergency.choice}</p>
        </div>
      )}
    </div>
  );
};

export default SwapStatusTracker;