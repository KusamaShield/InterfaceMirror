# Polkadot AssetHub Deposit + Withdraw Roundtrip

`src/tests/deposit_and_withdraw_roundtrip.ts`

## Overview

Full roundtrip: deposit 0.5 DOT into the Ficus L1 pool, then withdraw it back to the forwarder. Uses two fresh ECDSA wallets (funded via Substrate fallback), LeanIMT Merkle tree sync, ZK proof generation, and balance sweeping.

Run: `npx tsx src/tests/deposit_and_withdraw_roundtrip.ts`

## Addresses

| Item | Value |
|------|-------|
| Chain | Polkadot AssetHub (chain ID: 420420419) |
| Pool contract | `0x0D694Da746e73D1e255c1894F90e38170db45809` |
| EVM RPC | `https://polkadot-assethub-rpc.laissez-faire.trade/` |
| Substrate WS RPC | `wss://asset-hub-polkadot-rpc.n.dwellir.com` |
| Forwarder SS58 | `5GBb8s3oANu6BdbXnHMKTsYREADggZ6vhKG9t5cZRBT8AJST` |
| Forwarder H160 | `0x74e539fc4607eae6d4383dac7bbf7124159f3ed3` |
| Circuit | `withdraw_phase2_fixed_v7.wasm` (8 public signals) |
| Deployment block | 18697500 |

## Steps

### 1. Generate Deposit Wallet
- Create `ethers.Wallet.createRandom()`
- Compute Substrate fallback: `eth_addr + 0xEE * 12` → encode to SS58

### 2. Fund Deposit Wallet
- Forwarder sends DOT via `balances.transferAllowDeath()` to the fallback SS58
- Waits for `eth_getBalance` to see the funds

### 3. Deposit
- Deposit wallet calls `depositNative(bytes32 commitment)` with 0.5 DOT via `eth_sendRawTransaction`
- Commitment computed via poseidon2: `Poseidon2(Poseidon2(amount,0), Poseidon2(nullifier,secret))`
- Sweep leftover balance from deposit wallet → forwarderH160

### 4. Generate Withdraw Wallet
- Create a second `ethers.Wallet.createRandom()`
- Compute fallback address

### 5. Fund Withdraw Wallet
- Forwarder sends 0.2 DOT to the fallback SS58 (for gas)
- Waits for ETH balance

### 6. Build Merkle Tree
- Uses `buildMerkleTreeFromContract()` from `src/transactions/merkle.ts` (LeanIMT)
- Scans all Deposit/NewCommitment events from deployment block
- Verifies local root matches `currentRoot()`

### 7. Generate ZK Proof
- Uses `withdraw_phase2_fixed_v7` circuit via snarkjs (~18s)
- Context = `keccak256(forwarderH160) % BN254_R`

### 8. Withdraw
- Withdraw wallet calls `withdraw(pA, pB, pC, pubSignals[8], recipient)` via `eth_sendRawTransaction`
- Recipient = forwarderH160
- Sweep leftover balance from withdraw wallet → forwarderH160

### 9. Check Balances
- Prints forwarder H160 EVM balance, forwarder SS58 Substrate balance, pool size

## Token Flow

```
Forwarder (sr25519)                      Pool Contract
     │                                        │
     │  0.7 DOT (Substrate transfer)          │
     ├──────────────────────┐                  │
     │                      ▼                  │
     │              Deposit Wallet (ECDSA)     │
     │                      │                  │
     │                      │ 0.5 DOT deposit  │
     │                      ├─────────────────►│  depositNative()
     │                      │                  │  (0.5 DOT locked)
     │                      │                  │
     │  0.1575 DOT returned │                  │
     │◄─────────────────────┘                  │
     │                                         │
     │  0.2 DOT (Substrate transfer)           │
     ├──────────────────────┐                  │
     │                      ▼                  │
     │             Withdraw Wallet (ECDSA)     │
     │                      │                  │
     │                      │  ZK proof        │
     │                      ├─────────────────►│  withdraw()
     │                      │                  │  (0.5 DOT released)
     │  0.5 DOT released ◄──┼────────────      │
     │                      │                  │
     │  0.1536 DOT returned │                  │
     │◄─────────────────────┘                  │
```

## Current Forwarder State (2026-08-13)

| Metric | Value |
|--------|-------|
| SS58 | `5GBb8s3oANu6BdbXnHMKTsYREADggZ6vhKG9t5cZRBT8AJST` |
| H160 | `0x74e539fc4607eae6d4383dac7bbf7124159f3ed3` |
| Substrate balance | 1.776 DOT |
| EVM balance | 1.766 DOT |
| Nonce | 55 |
| Pool tree size | 43 |

## Test Run Result (last roundtrip)

```
=== Step 2: Fund Deposit Wallet ===
Forwarder balance: 1.8668 DOT
Funding deposit wallet with: 0.7 DOT
Deposit Substrate balance: 0.7000 DOT
ETH balance appeared: 0.6900 DOT

=== Step 3: Deposit to Pool ===
Pool size before: 41
Deposit wallet ETH balance: 0.69 DOT
Deposit amount: 0.5 DOT
Gas limit: 19725 Gas price: 800 gwei Nonce: 0
Deposit tx: 0xe95f...  → SUCCESS (gas: 19,678)
Pool size after: 42

Sweeping 0.1574576 DOT from deposit wallet to forwarder...

=== Step 5: Fund Withdraw Wallet ===
Forwarder balance: 1.3234 DOT
Funding withdraw wallet with: 0.2 DOT
Withdraw Substrate balance: 0.2000 DOT
ETH balance appeared: 0.1900 DOT

=== Step 6: Build Merkle Tree ===
Tree size: 42, root matches chain root ✅
Leaf index: 41

=== Step 7: Generate ZK Proof ===
Done in 17.7s

=== Step 8: Withdraw ===
Withdraw wallet DOT before: 0.19
Gas limit: 24603 Gas price: 800 gwei Nonce: 0
Withdraw tx: 0x6dcb...  → SUCCESS (gas: 24,556)

Sweeping 0.1535552 DOT from withdraw wallet to forwarder...

=== Step 9: Check Balances ===
Forwarder H160 EVM balance: 1.7660 DOT
Forwarder SS58 Substrate balance: 1.7760 DOT
Pool size: 43
```

## Token Flow (last run)

| # | From | To | Method | Amount (DOT) |
|---|------|----|--------|--------------|
| 1 | Forwarder Substrate | Deposit wallet | `balances.transferAllowDeath` | +0.7000 |
| 2 | Deposit wallet | Pool contract | `depositNative()` | 0.5000 (locked) |
| 3 | Deposit wallet | Forwarder H160 | sweep (ETH transfer) | 0.1575 (returned) |
| 4 | Forwarder Substrate | Withdraw wallet | `balances.transferAllowDeath` | +0.2000 |
| 5 | Pool contract | Forwarder H160 | `withdraw()` | 0.5000 (released) |
| 6 | Withdraw wallet | Forwarder H160 | sweep (ETH transfer) | 0.1536 (returned) |

**Totals:**
- Forwarder sent out: 0.7000 + 0.2000 = **0.9000 DOT**
- Forwarder received back: 0.1575 + 0.5000 + 0.1536 = **0.8111 DOT**
- Forwarder balance delta: 1.8668 → 1.7760 = **-0.0908 DOT**

| Burned | Gas | Fee (DOT) |
|--------|-----|-----------|
| Deposit tx | 19,678 | 0.0157 |
| Deposit sweep | ~21,000 | 0.0168 |
| Withdraw tx | 24,556 | 0.0196 |
| Withdraw sweep | ~21,000 | 0.0168 |
| **Total burned** | **~86,234** | **~0.069** |

**Discrepancy** (0.0908 sent − 0.069 burned = 0.0218): existential deposit / ED fluctuation on AssetHub unified accounts.

## Gas Costs (per transaction)

| Transaction | Gas Used | Fee (DOT) |
|-------------|----------|-----------|
| Deposit | ~19,700 | ~0.0158 |
| Withdraw | ~24,600 | ~0.0197 |
| Sweep (simple transfer) | 21,000 | ~0.0168 |
| **Total roundtrip** | **~86,300** | **~0.069** |

Gas price: 800 gwei (0.0000008 DOT per gas unit)

One roundtrip (0.5 DOT deposit + withdraw + sweeps) costs ~0.09 DOT in gas.

## Key Points

- **Two separate ECDSA wallets** — one for deposit, one for withdraw. Neither needs to map accounts.
- **funded via Substrate fallback**: `eth_addr + 0xEE * 12` → `balances.transferAllowDeath()`
- **H160 derivation for sr25519**: `keccak256(decodeAddress(ss58)).slice(-40)`
- **Gas price is high** (800 gwei) on this chain — 21k gas = 0.017 DOT for a simple transfer
- **Tree sync uses LeanIMT** from `src/transactions/merkle.ts` — 1:1 port of `InternalLeanIMT.sol _insert()`
- **Balance sweeping** returns all leftover DOT to the forwarder after each step