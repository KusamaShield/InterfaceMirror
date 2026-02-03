# Interface

Kusama Shield User interface

## Note:
Use with **Google Chrome and Talisman browser wallet**

## Documentation:     
https://kusamashield.codeberg.page

## Landing page:    
https://shield.markets   

# Supported Browser Wallets:    

## Polkadot/Substrate Wallets

These wallets are supported via `@talismn/connect-wallets`:

| Wallet | Description |
|--------|-------------|
| Talisman | Multi-chain wallet for Polkadot & Ethereum |
| Nova Wallet | Mobile-first Polkadot wallet |
| SubWallet | Comprehensive Polkadot ecosystem wallet |
| Manta Wallet | Privacy-focused wallet for Manta Network |
| PolkaGate | Polkadot browser extension wallet |
| Fearless Wallet | DeFi wallet for Polkadot ecosystem |
| Enkrypt | Multi-chain browser extension by MEW |
| Polkadot.js | Official Polkadot browser extension |
| Aleph Zero Wallet | Wallet for Aleph Zero network |

## EVM Wallets

These wallets are supported via Reown AppKit (formerly WalletConnect):

| Wallet | Description |
|--------|-------------|
| MetaMask | Popular Ethereum browser extension |
| WalletConnect | QR code-based mobile wallet connection |
| Coinbase Wallet | Coinbase's self-custody wallet |
| Trust Wallet | Multi-chain mobile wallet |
| Rainbow | Ethereum wallet with NFT support |
| Zerion | DeFi-focused wallet |
| And 300+ more | Via WalletConnect protocol |

Find exact amount here:     
https://walletguide.walletconnect.network/?chains=eip155%3A1   

> **Note:** WalletConnect-based connections require a valid `VITE_WALLETCONNECT_PROJECT_ID` environment variable.



### License: 
MIT, see LICENSE file.

### Clone: 
```shell
git clone https://codeberg.org/KusamaShield/Interface && cd Interface/
```

### Install:

#### Build wasm packages: 
```shell
cargo install wasm-pack
wasm-pack build --target web
rm -rf public/pkg/
cp -r pkg/ public/
```

#### Install node packages:
```shell
npm install -f
```



### Run:  
```shell
npm run dev
```
### Test link:


### Screenshots:  
![](mainui.png)

## Tested on:  
Linux + Google Chrome + Talisman Browser Wallet


### Supported Chains:      
#### Testnet:   
-  [x] Moonbase Testnet  
-  [x] Westend Assethub  
-  [x] Paseo hub
#### Mainnet:  
-  [x] Kusama Assethub    

## Project supported by:   
![](./kusama-logo.png)      


