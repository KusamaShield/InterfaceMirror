# Polkadot AssetHub: EVM ↔ Substrate Transaction Flow

## Overview

This document covers how to transfer tokens between EVM and Substrate addresses on Polkadot AssetHub, including the full chain: **EVM Account 0 → Substrate Account 1 → Substrate Account 2**.

---

## RPC Endpoints

| Type | URL | Notes |
|------|-----|-------|
| **WSS (Substrate)** | `wss://polkadot-asset-hub-rpc.polkadot.io` | Native Substrate tx, storage queries |
| **HTTP (EVM)** | `https://polkadot-assethub-rpc.laissez-faire.trade` | EVM calls (`eth_*`) |

> **Paseo AssetHub** does **not** work with polkadot.js due to unknown signed extensions (`AuthorizeValueTransfer`, `EthSetOrigin`, `StorageWeightReclaim`, etc.) that trap the runtime. Devs recommend PAPI instead.

---

## Account Setup

### Account 0 (EVM funder)
- **Private key:** `0xf43afc8ec76904bdfae8e15230d98842bd9e5c298105d9881350a3b3fffde1ae`
- **Address:** `0x13594E535099Aef344807fa8fE7aABe2a371b383`
- **Type:** Ethereum / H160

### Account 1 (Substrate, sr25519)
- **Mnemonic:** `obey blade thrive bring valley unit kid bitter light soon outer magic`
- **Seed:** `0x895be1eeafe82a34eef75f854289e482e61b434f2ceca079790aeac7378f3d91`
- **SS58:** `5GBb8s3oANu6BdbXnHMKTsYREADggZ6vhKG9t5cZRBT8AJST`
- **H160 fallback:** `0x74e539fc4607eae6d4383dac7bbf7124159f3ed3`

> **H160 fallback derivation:** `keccak256(sr25519_pubkey).slice(-20)`

### Account 2 (Substrate, sr25519)
- **SS58:** `5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty`
- Derived from `//Bob`

---

## Key Finding: mapAccount is Required

On Polkadot AssetHub, sending tokens to an H160 address does **not** automatically credit the matching Substrate account. The `revive.mapAccount` extrinsic must be called first to link the two.

### Before mapAccount
```
EVM (H160):   1.0000 DOT
Substrate:    0.0000 DOT  ← NOT synced
```

### After mapAccount
```
EVM (H160):   1.0000 DOT
Substrate:    1.0000 DOT  ← Synced
```

### Calling mapAccount (Node.js)
```js
const api = await ApiPromise.create({
  provider: new WsProvider('wss://polkadot-asset-hub-rpc.polkadot.io')
});
await api.isReady;

const srKeyring = new Keyring({ type: 'sr25519', ss58Format: 42 });
const account1 = srKeyring.addFromSeed(SEED);

// mapAccount takes NO arguments — it maps the caller's fallback H160
const tx = api.tx.revive.mapAccount();
await tx.signAndSend(account1, ({ status }) => {
  if (status.isInBlock) console.log('Mapped!');
});
```

---

## Full Transaction Chain

### Flow
```
Account 0 (EVM)  ──0.1 DOT──▶  Account 1 (Substrate)  ──0.07 DOT──▶  Account 2 (Substrate)
```

### Results

| Account | Type | Start | End | Δ |
|---------|------|-------|-----|---|
| **0** `0x1359...` | EVM | 0.6632 DOT | 0.5624 DOT | −0.1008 |
| **1** `5GBb8s...` | Sub | 2.2984 DOT | 2.3275 DOT | +0.0291 |
| **2** `5FHneW...` | Sub | 0.70 DOT | 0.77 DOT | +0.0700 |

---

## Code Examples

### 1. Send EVM → Substrate (H160)

```js
const { ethers } = require('ethers');

const PRIVATE_KEY = '0xf43afc8ec76904bdfae8e15230d98842bd9e5c298105d9881350a3b3fffde1ae';
const H160_1 = '0x74e539fc4607eae6d4383dac7bbf7124159f3ed3';

const provider = new ethers.JsonRpcProvider(
  'https://polkadot-assethub-rpc.laissez-faire.trade'
);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const tx = await wallet.sendTransaction({
  to: H160_1,
  value: ethers.parseEther('0.1'),
});
await tx.wait();
```

### 2. Substrate Transfer (Account 1 → Account 2)

```js
const { ApiPromise, WsProvider } = require('@polkadot/api');
const { Keyring } = require('@polkadot/keyring');
const { cryptoWaitReady } = require('@polkadot/util-crypto');

await cryptoWaitReady();

const api = await ApiPromise.create({
  provider: new WsProvider('wss://polkadot-asset-hub-rpc.polkadot.io')
});
await api.isReady;

const srKeyring = new Keyring({ type: 'sr25519', ss58Format: 42 });
const account1 = srKeyring.addFromSeed(
  '0x895be1eeafe82a34eef75f854289e482e61b434f2ceca079790aeac7378f3d91'
);
const account2 = srKeyring.createFromUri('//Bob');

const tx = api.tx.balances.transferKeepAlive(account2.address, 700000000); // 0.07 DOT
await tx.signAndSend(account1, ({ status, txHash, events }) => {
  if (status.isInBlock) {
    console.log('✅', txHash.toHex());
  }
});
```

### 3. Compute H160 Fallback from sr25519

```js
const { Keyring } = require('@polkadot/keyring');
const { cryptoWaitReady } = require('@polkadot/util-crypto');
const { keccak_256 } = require('@noble/hashes/sha3');

await cryptoWaitReady();

const srKeyring = new Keyring({ type: 'sr25519', ss58Format: 42 });
const account = srKeyring.addFromSeed('0x895b...');

const hash = keccak_256(account.publicKey);
const h160 = '0x' + Buffer.from(hash.slice(-20)).toString('hex');
console.log('H160:', h160);
// → 0x74e539fc4607eae6d4383dac7bbf7124159f3ed3
```

### 4. Query Both EVM and Substrate Balances

```js
const { ethers } = require('ethers');

// EVM side
const provider = new ethers.JsonRpcProvider(
  'https://polkadot-assethub-rpc.laissez-faire.trade'
);
const evmBal = await provider.getBalance('0x74e5...');

// Substrate side
const api = await ApiPromise.create({
  provider: new WsProvider('wss://polkadot-asset-hub-rpc.polkadot.io')
});
const subBal = await api.query.system.account(account1.address);

console.log('EVM:', ethers.formatEther(evmBal), 'DOT');
console.log('Sub:', Number(subBal.data.free) / 1e10, 'DOT');
```

---

## Paseo AssetHub: Known Issue

Paseo AssetHub has **new signed extensions** that polkadot.js does not handle:

- `AuthorizeValueTransfer`
- `AuthorizeCall`
- `AsPgas`
- `AsRingAlias`
- `AsDotnsGateway`
- `RestrictOrigins`
- `EthSetOrigin`
- `StorageWeightReclaim`

This causes a `wasm trap: wasm unreachable instruction executed` error in `TaggedTransactionQueue_validate_transaction` for **all** native Substrate extrinsics.

**Workaround:** Use [PAPI](https://polkadot-api.github.io/polkadot-api/) instead of polkadot.js, or test on Polkadot AssetHub mainnet.

---

## Block Subscription Script

Located at `/home/pi/zk/swap/proxy/subscribe_blocks.py` — monitors new blocks and prints pallet calls:

```python
from substrateinterface import SubstrateInterface

substrate = SubstrateInterface(url='wss://asset-hub-paseo-rpc.n.dwellir.com')

while True:
    block = substrate.get_block(substrate.get_chain_head())
    for ext in block.get('extrinsics', []):
        call = ext.value.get('call', {})
        print(f"{call.get('call_module')}.{call.get('call_function')}")
    time.sleep(6)
```

---

## File Locations

| File | Purpose |
|------|---------|
| `src/tests/test_substrate_transfer_paseo.ts` | Node.js test for Paseo transfers |
| `/home/pi/zk/swap/proxy/subscribe_blocks.py` | Python block subscription |
| `/home/pi/zk/swap/proxy/test_substrate_transfer.py` | Python EVM+Substrate tests |