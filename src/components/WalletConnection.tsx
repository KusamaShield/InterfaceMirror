import React, { useState } from 'react';
import { web3Accounts, web3Enable } from '@polkadot/extension-dapp';
import type { InjectedAccountWithMeta } from '@polkadot/extension-inject/types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface WalletConnectionProps {
  isWalletConnected: boolean;
  accounts: InjectedAccountWithMeta[];
  selectedAccount: InjectedAccountWithMeta | null;
  showAccountSelect: boolean;
  onAccountsLoaded: (accounts: InjectedAccountWithMeta[]) => void;
  onAccountSelected: (account: InjectedAccountWithMeta) => void;
  onShowAccountSelect: (show: boolean) => void;
  onDisconnect: () => void;
}

export const WalletConnection: React.FC<WalletConnectionProps> = ({
  isWalletConnected,
  accounts,
  selectedAccount,
  showAccountSelect,
  onAccountsLoaded,
  onAccountSelected,
  onShowAccountSelect,
  onDisconnect,
}) => {
  const { toast } = useToast();

  const connectWallet = async () => {
    try {
      // Enable multiple wallet extensions
      const extensions = await web3Enable('Polkadot Remarks App');
      
      if (extensions.length === 0) {
        toast({
          title: "No Wallet Found",
          description: "Please install Talisman, Polkadot.js, or another compatible wallet",
          variant: "destructive",
        });
        return;
      }

      console.log('Available extensions:', extensions.map(ext => ext.name));

      const allAccounts = await web3Accounts();
      
      if (allAccounts.length === 0) {
        toast({
          title: "No Accounts Found",
          description: "Please create accounts in your wallet or make sure they are unlocked",
          variant: "destructive",
        });
        return;
      }

      console.log('Found accounts:', allAccounts.length);
      
      // Filter accounts to show both Polkadot and Ethereum accounts
      const validAccounts = allAccounts.filter(account => {
        // Accept accounts from supported sources
        const supportedSources = ['polkadot-js', 'talisman', 'subwallet-js'];
        return supportedSources.includes(account.meta.source || '');
      });

      if (validAccounts.length === 0) {
        // If no accounts match our filter, use all accounts
        onAccountsLoaded(allAccounts);
      } else {
        onAccountsLoaded(validAccounts);
      }
      
      const accountsToUse = validAccounts.length > 0 ? validAccounts : allAccounts;
      
      if (accountsToUse.length === 1) {
        onAccountSelected(accountsToUse[0]);
        toast({
          title: "Wallet Connected",
          description: `Connected to ${accountsToUse[0].meta.name || 'Unknown Account'}`,
        });
      } else {
        onShowAccountSelect(true);
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      toast({
        title: "Connection Failed",
        description: "Failed to connect to wallet. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getAccountDisplayInfo = (account: InjectedAccountWithMeta) => {
    const isEthereumAccount = account.address.startsWith('0x');
    const accountType = isEthereumAccount ? 'Ethereum' : 'Polkadot';
    const walletSource = account.meta.source || 'Unknown';
    
    return {
      name: account.meta.name || `${accountType} Account`,
      address: account.address,
      type: accountType,
      source: walletSource,
      displayAddress: isEthereumAccount 
        ? `${account.address.slice(0, 8)}...${account.address.slice(-6)}`
        : `${account.address.slice(0, 8)}...${account.address.slice(-8)}`
    };
  };

  if (showAccountSelect) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-purple-200 mb-4">
          Found {accounts.length} accounts in your wallets:
        </div>
        {accounts.map((account, index) => {
          const displayInfo = getAccountDisplayInfo(account);
          return (
            <Button
              key={account.address}
              onClick={() => onAccountSelected(account)}
              className="w-full justify-start bg-white/5 hover:bg-white/10 text-white border border-white/20 p-4 h-auto"
              variant="outline"
            >
              <div className="text-left w-full">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{displayInfo.name}</div>
                    <div className="text-purple-300 text-sm font-mono">
                      {displayInfo.displayAddress}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-purple-400 capitalize">{displayInfo.source}</div>
                    <div className="text-xs text-purple-400">{displayInfo.type}</div>
                  </div>
                </div>
              </div>
            </Button>
          );
        })}
        <Button
          onClick={() => onShowAccountSelect(false)}
          variant="outline"
          className="w-full border-white/20 text-purple-200 hover:bg-white/10 hover:text-white"
        >
          Back
        </Button>
      </div>
    );
  }

  if (!isWalletConnected) {
    return (
      <div className="space-y-4">
        <Button 
          onClick={connectWallet}
          className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105"
          size="lg"
        >
          Connect Wallet
        </Button>
        
        <div className="text-center text-sm text-purple-300">
          Supports Talisman, Polkadot.js, SubWallet and other Polkadot wallets
          <br />
          <span className="text-xs text-purple-400">Both Polkadot and Ethereum accounts supported</span>
        </div>
      </div>
    );
  }

  const displayInfo = selectedAccount ? getAccountDisplayInfo(selectedAccount) : null;

  return (
    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-sm font-medium text-purple-200">Connected Account</div>
          {displayInfo && (
            <div className="mt-2">
              <div className="text-white font-medium">{displayInfo.name}</div>
              <div className="text-purple-300 text-sm font-mono">
                {displayInfo.displayAddress}
              </div>
              <div className="text-xs text-purple-400 mt-1">
                {displayInfo.type} • {displayInfo.source}
              </div>
            </div>
          )}
        </div>
        <div className="flex space-x-2">
          {accounts.length > 1 && (
            <Button
              onClick={() => onShowAccountSelect(true)}
              variant="outline"
              size="sm"
              className="border-white/20 text-purple-200 hover:bg-white/10 hover:text-white"
            >
              Switch Account
            </Button>
          )}
          <Button
            onClick={onDisconnect}
            variant="outline"
            size="sm"
            className="border-white/20 text-purple-200 hover:bg-white/10 hover:text-white"
          >
            Disconnect
          </Button>
        </div>
      </div>
    </div>
  );
};