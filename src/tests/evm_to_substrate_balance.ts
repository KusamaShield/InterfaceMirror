import { decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

const EVM_RPCS = [
  "https://polkadot-assethub-rpc.laissez-faire.trade",
  "https://eth-rpc.polkadot.io",
  "https://polkadot-assethub-rpc.dotters.network",
  "https://rpc-asset-hub-polkadot.stakeworld.io",
];
const WS_ENDPOINTS = [
  "wss://polkadot-asset-hub-rpc.polkadot.io",
  "wss://asset-hub-polkadot-rpc.n.dwellir.com",
  "wss://rpc-asset-hub-polkadot.stakeworld.io",
];
const CHAIN_ID = Number(process.env.CHAIN_ID || 420420419);
const amountDOT = 0.2;

function ss58ToEth(ss58Address: string): string {
  const substrateBytes = decodeAddress(ss58Address);
  const last12 = substrateBytes.slice(20);
  const isEthDerived = last12.every((b: number) => b === 0xEE);

  let ethBytes: Uint8Array;
  if (isEthDerived) {
    ethBytes = substrateBytes.slice(0, 20);
  } else {
    const hash = ethers.keccak256(substrateBytes);
    ethBytes = ethers.getBytes(hash).slice(-20);
  }

  return "0x" + Buffer.from(ethBytes).toString("hex");
}

function computeFallbackSS58(ethAddress: string): string {
  const ethAddrNoPrefix = ethAddress.replace("0x", "").toLowerCase();
  const substrateHex = "0x" + ethAddrNoPrefix + "ee".repeat(12);
  return encodeAddress(substrateHex, 0);
}

async function connectProvider(rpcs: string[], chainId: number): Promise<ethers.JsonRpcProvider> {
  let lastErr: unknown;
  for (const rpcUrl of rpcs) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, {
        staticNetwork: ethers.Network.from(chainId),
      });
      await provider.getBlockNumber();
      console.log(`Connected to EVM RPC: ${rpcUrl}`);
      return provider;
    } catch (e) {
      lastErr = e;
      console.warn(`EVM RPC ${rpcUrl} failed:`, (e as any)?.message || e);
    }
  }
  throw lastErr ?? new Error("All EVM RPC endpoints unreachable");
}

async function connectWs(endpoints: string[]) {
  let lastErr: unknown;
  for (const endpoint of endpoints) {
    try {
      const wsProvider = new WsProvider(endpoint);
      const api = await ApiPromise.create({ provider: wsProvider });
      await api.isReady;
      console.log(`Connected to WS: ${endpoint}`);
      return api;
    } catch (e) {
      lastErr = e;
      console.warn(`WS ${endpoint} failed:`, (e as any)?.message || e);
    }
  }
  throw lastErr ?? new Error("All WS endpoints unreachable");
}

async function main() {
  const targetSS58 = process.argv[2] || "5GBb8s3oANu6BdbXnHMKTsYREADggZ6vhKG9t5cZRBT8AJST";
  const privateKey = process.argv[3] || process.env.ETH_PRIVATE_KEY;

  if (!privateKey) {
    console.error("Error: No private key provided. Pass it as an argument or set ETH_PRIVATE_KEY in .env");
    process.exit(1);
  }

  const paddedKey = privateKey.startsWith("0x") ? privateKey : "0x" + privateKey;
  const wallet = new ethers.Wallet(paddedKey);

  console.log("=== EVM → Substrate Balance Test (ss58ToEth) ===\n");
  console.log("Sender ETH:", wallet.address);
  console.log("Target SS58:", targetSS58);

  const targetH160 = ss58ToEth(targetSS58);
  console.log("Target H160 (ss58ToEth):", targetH160);

  const provider = await connectProvider(EVM_RPCS, CHAIN_ID);
  const api = await connectWs(WS_ENDPOINTS);
  const connectedWallet = wallet.connect(provider);

  const decimals = api.registry.chainDecimals?.[0] || 10;
  const tokenSymbol = api.registry.chainTokens?.[0] || "DOT";

  console.log("\n=== Initial Balances ===");
  const senderBalance = await provider.getBalance(connectedWallet.address);
  console.log(`Sender EVM: ${Number(ethers.formatEther(senderBalance)).toFixed(4)} DOT`);

  const targetSS58Before: any = await api.query.system.account(targetSS58);
  const targetSubstrateBefore = BigInt(targetSS58Before.data.free.toString());
  console.log(`Target SS58 Substrate: ${Number(targetSubstrateBefore) / 10 ** decimals} ${tokenSymbol}`);

  const targetH160Before = await provider.getBalance(targetH160);
  console.log(`Target H160 EVM: ${Number(ethers.formatEther(targetH160Before)).toFixed(4)} DOT`);

  console.log("\n=== Sending 0.2 DOT via EVM transfer to ss58ToEth H160 ===");
  const amountWei = ethers.parseEther(amountDOT.toString());

  const nonce = await provider.getTransactionCount(connectedWallet.address);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice!;
  const gasLimit = 21000n;
  const maxCost = amountWei + gasLimit * gasPrice;

  if (senderBalance < maxCost) {
    console.error(`Insufficient balance. Have ${Number(ethers.formatEther(senderBalance))} DOT, need ${Number(ethers.formatEther(maxCost))} DOT`);
    await api.disconnect();
    process.exit(1);
  }

  const tx = await connectedWallet.sendTransaction({
    to: targetH160,
    value: amountWei,
    gasLimit,
    gasPrice,
    nonce,
  });

  console.log("EVM tx sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("EVM tx confirmed in block:", receipt?.blockNumber);

  console.log("\n=== Waiting 5 seconds for indexation ===");
  await new Promise(r => setTimeout(r, 5000));

  console.log("\n=== Final Balances ===");
  const senderBalanceAfter = await provider.getBalance(connectedWallet.address);
  console.log(`Sender EVM: ${Number(ethers.formatEther(senderBalanceAfter)).toFixed(4)} DOT`);

  const targetSS58After: any = await api.query.system.account(targetSS58);
  const targetSubstrateAfter = BigInt(targetSS58After.data.free.toString());
  console.log(`Target SS58 Substrate: ${Number(targetSubstrateAfter) / 10 ** decimals} ${tokenSymbol}`);
  const targetSS58Diff = (targetSubstrateAfter - targetSubstrateBefore) / 10n ** BigInt(decimals);
  console.log(`  -> Change: ${Number(targetSS58Diff).toFixed(4)} ${tokenSymbol}`);

  const targetH160After = await provider.getBalance(targetH160);
  console.log(`Target H160 EVM: ${Number(ethers.formatEther(targetH160After)).toFixed(4)} DOT`);
  const targetH160Diff = Number(ethers.formatEther(targetH160After - targetH160Before));
  console.log(`  -> Change: ${targetH160Diff.toFixed(4)} DOT`);

  console.log("\n=== Summary ===");
  const ss58Received = Number(targetSubstrateAfter - targetSubstrateBefore) / 10 ** decimals;
  const h160Received = Number(targetH160After - targetH160Before) / 1e18;

  console.log(`SS58 ${targetSS58.slice(0, 10)}... received: ${ss58Received.toFixed(4)} DOT`);
  console.log(`H160 ${targetH160.slice(0, 10)}... received: ${h160Received.toFixed(4)} DOT`);

  if (ss58Received >= 0.19) {
    console.log("\n✓ EVM → SS58 Substrate balance WORKS!");
  } else if (h160Received >= 0.19) {
    console.log("\n✗ EVM funds stayed as EVM balance, SS58 unchanged");
  } else {
    console.log("\n? Unexpected result");
  }

  await api.disconnect();
}

main().catch(console.error);
