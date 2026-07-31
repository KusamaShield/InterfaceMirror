/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import { ethers } from "ethers";

// Mirror of the gas units defaults from App.tsx
const DEFAULT_GAS_UNITS: Record<string, { shield: bigint; unshield: bigint }> =
  {
    paseo_assethub: { shield: 20000n, unshield: 40000n },
    paseo_assethub_v2: { shield: 25000n, unshield: 50000n },
    polkadot: { shield: 50000n, unshield: 100000n },
    westend_assethub: { shield: 150000n, unshield: 300000n },
    kusama: { shield: 200000n, unshield: 400000n },
  };

// Mirror of NETWORKS rpcEndpoints from App.tsx
const NETWORK_RPCS: Record<string, string> = {
  moonbase: "https://moonbase.public.curie.radiumblock.co/http",
  westend_assethub: "https://westend-asset-hub-eth-rpc.polkadot.io",
  paseo_assethub: "https://kusama-rpc.laissez-faire.trade/",
  polkadot: "https://eth-rpc.polkadot.io/",
  kusama: "https://eth-rpc-kusama.polkadot.io/",
  base: "https://mainnet.base.org",
};

const NETWORK_ASSETS: Record<string, string> = {
  moonbase: "DEV",
  westend_assethub: "WND",
  paseo_assethub: "PAS",
  polkadot: "DOT",
  kusama: "KSM",
  base: "ETH",
};

/**
 * Estimate gas cost for a given network and tab.
 * Mirrors the logic in App.tsx's gas price useEffect.
 */
async function estimateGasCost(
  network: string,
  activeTab: "shield" | "unshield",
  recentGasUnits: bigint | null,
): Promise<string> {
  const rpcUrl = NETWORK_RPCS[network];
  if (!rpcUrl) return "no rpc";

  // Fetch gas price from RPC
  let gasPriceWei: bigint;
  try {
    const resp = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_gasPrice",
        params: [],
      }),
      signal: AbortSignal.timeout(10000),
    });
    const json: any = await resp.json();
    if (json.error) throw new Error(json.error.message);
    gasPriceWei = BigInt(json.result);
  } catch {
    gasPriceWei = ethers.parseUnits("1", "gwei");
  }

  // Determine gas units (same logic as App.tsx)
  let gasUnits: bigint;
  if (recentGasUnits !== null) {
    gasUnits = recentGasUnits;
  } else {
    const defaults = DEFAULT_GAS_UNITS[network];
    if (defaults) {
      gasUnits = activeTab === "unshield" ? defaults.unshield : defaults.shield;
    } else {
      gasUnits = 200000n;
    }
  }

  const totalCost = gasUnits * gasPriceWei;
  return Number(ethers.formatEther(totalCost)).toFixed(6);
}

async function main() {
  const testNetworks = [
    "paseo_assethub",
    "westend_assethub",
    "polkadot",
    "kusama",
    "moonbase",
  ];
  const testTabs: ("shield" | "unshield")[] = ["shield", "unshield"];

  console.log("=== Gas Estimation Tests ===\n");

  for (const network of testNetworks) {
    const asset = NETWORK_ASSETS[network] || "?";
    console.log(`--- ${network} (${asset}) ---`);

    for (const tab of testTabs) {
      // Default gas units (no prior transaction data)
      const defaultCost = await estimateGasCost(network, tab, null);
      console.log(`  ${tab} (default):    ~${defaultCost} ${asset}`);

      // With recent gas units (simulating a prior transaction)
      const recentUnits = tab === "shield" ? 18000n : 38000n;
      const recentCost = await estimateGasCost(network, tab, recentUnits);
      console.log(`  ${tab} (recent):     ~${recentCost} ${asset}`);
    }
    console.log("");
  }

  // Test: gas cost should be deterministic for same inputs
  console.log("=== Determinism Check ===");
  const a = await estimateGasCost("paseo_assethub", "shield", null);
  const b = await estimateGasCost("paseo_assethub", "shield", null);
  console.log(
    `  Same inputs yield same result: ${a === b ? "PASS" : "FAIL"} (${a} vs ${b})`,
  );

  // Test: shield vs unshield cost ratio
  console.log("\n=== Shield vs Unshield Ratio ===");
  for (const network of testNetworks) {
    const shieldCost = await estimateGasCost(network, "shield", null);
    const unshieldCost = await estimateGasCost(network, "unshield", null);
    const shieldVal = parseFloat(shieldCost);
    const unshieldVal = parseFloat(unshieldCost);
    const ratio = unshieldVal / shieldVal;
    console.log(
      `  ${network}: unshield/shield ratio = ${ratio.toFixed(2)}x (${shieldCost} vs ${unshieldCost})`,
    );
  }

  // Test: recent gas units reduce cost vs defaults
  console.log("\n=== Recent Gas Units Effect ===");
  const defaultCost = await estimateGasCost("paseo_assethub", "shield", null);
  const recentCostVal = await estimateGasCost(
    "paseo_assethub",
    "shield",
    10000n,
  );
  const smaller = parseFloat(recentCostVal) < parseFloat(defaultCost);
  console.log(
    `  Default: ${defaultCost} PAS, Recent (10k): ${recentCostVal} PAS`,
  );
  console.log(`  Recent < Default: ${smaller ? "PASS" : "FAIL"}`);
}

await main().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
