import React, { useState, useRef, useEffect } from 'react';

interface NetworkSelectProps {
  selectedNetwork: string;
  onNetworkChange: (network: string) => void;
}

export default function NetworkSelect({ selectedNetwork, onNetworkChange }: NetworkSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (network: string) => {
    onNetworkChange(network);
    setIsOpen(false);
  };

  const getNetworkLabel = (network: string): string => {
    const labels: Record<string, string> = {
      moonbase: 'Moonbase Testnet',
      paseo_assethub: 'Paseo AssetHub',
      westend_assethub: 'Westend Assethub',
      kusama: 'Kusama Assethub',
      polkadot: 'Polkadot Assethub',
    };
    return labels[network] || network;
  };

  return (
    <div className="network-select-wrapper" ref={dropdownRef}>
      <div 
        className={`selected-network ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
         {selectedNetwork && (selectedNetwork === 'paseo_assethub' || selectedNetwork === 'polkadot') ? (
            <>
              <img src={selectedNetwork.includes('paseo') ? "/paseo-icon.png" : "/favicon-dark.svg"} alt="Network" className="network-logo" />
              <span>{getNetworkLabel(selectedNetwork)}</span>
            </>
          ) : selectedNetwork ? (
           <span>{getNetworkLabel(selectedNetwork)}</span>
         ) : (
           <span className="network-select-placeholder-text">Select Network</span>
         )}
        <span className="dropdown-arrow">▼</span>
      </div>
      
      {isOpen && (
        <div className="network-select-dropdown">
          <div className="network-group">
            <div className="group-header testnet-header">🧪 Testnet Networks</div>
            <div 
              className={`network-option ${selectedNetwork === 'moonbase' ? 'selected' : ''}`}
              onClick={() => handleSelect('moonbase')}
            >
              🔗 Moonbase Testnet
            </div>
            <div 
              className={`network-option ${selectedNetwork === 'paseo_assethub' ? 'selected' : ''}`}
              onClick={() => handleSelect('paseo_assethub')}
            >
              <img src="/paseo-icon.png" alt="Paseo" className="network-logo" />
              Paseo AssetHub
            </div>
            <div 
              className={`network-option ${selectedNetwork === 'westend_assethub' ? 'selected' : ''}`}
              onClick={() => handleSelect('westend_assethub')}
            >
              🔗 Westend Assethub
            </div>
          </div>
           <div className="network-group">
              <div className="group-header mainnet-header">🌐 Mainnet Networks (👇Live now👇)</div>
              <div
                className={`network-option ${selectedNetwork === 'kusama' ? 'selected' : ''}`}
                onClick={() => handleSelect('kusama')}
              >
                🐦 Kusama Assethub
              </div>
              <div
                className={`network-option ${selectedNetwork === 'polkadot' ? 'selected' : ''}`}
                onClick={() => handleSelect('polkadot')}
              >
                <img src="/favicon-dark.svg" alt="Polkadot" className="network-logo" />
                Polkadot Assethub
              </div>
            </div>
        </div>
      )}
    </div>
  );
}
