declare module '@talismn/connect-components' {
  import { ComponentType } from 'react';

  export interface WalletAccount {
    address: string;
    name?: string;
    source: string;
  }

  export interface Wallet {
    enable: (appName: string) => Promise<void>;
    subscribeAccounts: (callback: (accounts: WalletAccount[]) => void) => Promise<() => void>;
    accounts: WalletAccount[];
  }

  export interface AccountSelectorProps {
    wallets: Wallet[];
    triggerComponent: any;
    onAccountSelected: (account: WalletAccount) => void;
    onWalletSelected: (wallet: Wallet) => void;
  }

  export const AccountSelector: ComponentType<AccountSelectorProps>;
  export const ConnectExtension: any;
  export const WalletSelect: any;
}

declare module '@talismn/connect-wallets' {
  export interface Wallet {
    enable: (appName: string) => Promise<void>;
    subscribeAccounts: (callback: (accounts: WalletAccount[]) => void) => Promise<() => void>;
    accounts: WalletAccount[];
    name: string;
    extension: any;
  }

  export interface WalletAccount {
    address: string;
    name?: string;
    source: string;
  }

  export interface InjectedPolkadotJSAccount {
    address: string;
    genesisHash?: string | null;
    name?: string;
    source: string;
  }

  export class BaseWallet {
    constructor();
    get extension();
    get installed();
    get name();
    get title();
    get logo();
    enable(appName: string);
  }

  export class TalismanWallet extends BaseWallet {}
  export class PolkadotjsWallet extends BaseWallet {}
  export class SubWallet extends BaseWallet {}
  export class NovaWallet extends BaseWallet {}
  export class FearlessWallet extends BaseWallet {}
  export class MantaWallet extends BaseWallet {}
  export class AlephZeroWallet extends BaseWallet {}
  export class EnkryptWallet extends BaseWallet {}
  export class PolkaGate extends BaseWallet {}
}
