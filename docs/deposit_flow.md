# Polkadot AssetHub Deposit Flow

## Overview

Deposit DOT into the Ficus L1 pool on Polkadot AssetHub using a Substrate forwarder account with sr25519 keys. The forwarder funds a one-time-use ECDSA wallet which submits the deposit via `eth_sendRawTransaction`.

## Working Flow (Path B)

### Steps

```
1. Generate a fresh ECDSA wallet (ethers.Wallet.createRandom())
2. Compute the Substrate fallback AccountId32:
     eth_addr_bytes (20 bytes) + 0xEE * 12 (12 bytes) = 32 bytes
3. Forwarder sends DOT to the fallback address via balances.transferAllowDeath()
4. Wait for eth_getBalance to show the transferred DOT (~4 seconds / 1 block)
5. Submit deposit via eth_sendRawTransaction (EIP-1559) to the pool contract
```

### AccountId32 Fallback Format

**Correct:** `eth_address_bytes + 0xEE * 12` (padding **after** the address)

```ts
const ethAddrNoPrefix = ethWallet.address.replace("0x", "").toLowerCase(); // 40 hex chars
const substrateHex = "0x" + ethAddrNoPrefix + "ee".repeat(12);            // 64 hex chars total
const substrateSS58 = encodeAddress(substrateHex, 0);
```

**Wrong:** `0xEE * 12 + eth_address_bytes` (padding before — this format does NOT sync balances)

### Key Script (`src/tests/deposit_polkadot.ts`)

- Auto-checks forwarder balance before funding
- Caps fund amount to available balance minus 0.5 DOT reserve
- Uses raw `eth_getBalance` RPC calls for reliable balance detection
- Handles dispatch errors properly

## Configuration

| Parameter | Value |
|-----------|-------|
| Chain ID | 420420419 |
| Pool Contract | `0x0D694Da746e73D1e255c1894F90e38170db45809` |
| Pool Function | `depositNative(bytes32 commitment)` |
| ETH RPC | `https://polkadot-assethub-rpc.laissez-faire.trade/` |
| Substrate WS RPC | `wss://asset-hub-polkadot-rpc.n.dwellir.com` |
| Deposit amount | 0.1 DOT (configurable) |

## What We Tried That Did NOT Work

### Path A: `revive.call` with sr25519 (Substrate-native)

```ts
api.tx.revive.call(dest, value, weightLimit, storageDepositLimit, data)
```

`revive.call` transfers `value` to the contract's **Substrate** balance, not to
**EVM `msg.value`**. The pool contract requires `msg.value > 0`
(`require(msg.value > 0, "Amount > 0")`), so `revive.call` always reverts with
`ContractReverted / Amount > 0`.

Attempted workarounds that still failed:
- Pre-funding the contract's Substrate address
- Calling `batchMapAccounts` before the call
- Using different function selectors (0x58d5cfaf)

### `revive.ethTransact` — RPC-only, cannot be signed

```ts
api.tx.revive.ethTransact(payload)
```

The source code confirms this always returns `CallFiltered` for signed
extrinsics:

```rust
// substrate/frame/revive/src/lib.rs:1149
pub fn eth_transact(origin: OriginFor<T>, payload: Vec<u8>) {
    Err(frame_system::Error::CallFiltered::<T>.into())
}
```

It is designed to be called only by the Ethereum RPC server (behind
`eth_sendRawTransaction`), not by user-signed Substrate extrinsics.

## Transaction Flow Diagram

```
┌─────────────┐     Substrate transfer      ┌──────────────────┐
│  Forwarder   │ ──────────────────────────► │  Fallback Acct   │
│  (sr25519)   │   to eth_addr + 0xEE*12     │  (AccountId32)   │
└─────────────┘                              └────────┬─────────┘
                                                      │ auto-mapped
                                                      ▼
                                              ┌──────────────────┐
                                              │   ECDSA Wallet   │
                                              │  (eth address)   │
                                              └────────┬─────────┘
                                                       │ eth_sendRawTransaction
                                                       ▼
                                              ┌──────────────────┐
                                              │  Pool Contract   │
                                              │  depositNative() │
                                              └──────────────────┘
```

## Important Notes

1. **AutoMap is enabled** on Polkadot AssetHub — accounts are auto-mapped on
   creation, so no `mapAccount` call is needed.
2. **Substrate balance ≠ EVM balance** — the Substrate transfer to the fallback
   AccountId32 does sync to EVM balance automatically (with the correct padding
   format).
3. **One wallet per deposit** — the script generates a new ECDSA wallet for each
   deposit. The private key is printed in the deposit note and should be stored
   for potential recovery.
4. **Forwarder must keep 0.5 DOT reserve** — the script auto-caps the fund
   amount to prevent draining the forwarder.