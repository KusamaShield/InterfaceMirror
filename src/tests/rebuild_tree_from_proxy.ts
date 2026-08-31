/**
 * Rebuild the Merkle tree from the Flask proxy's pre-computed leaf list
 * and verify the root against on-chain currentRoot().
 *
 * The proxy maintains a persistent tree cache synced by background monitors
 * that track both eth_getLogs AND revive.ContractEmitted (Substrate) events.
 *
 * Usage: npx tsx src/tests/rebuild_tree_from_proxy.ts [network]
 *
 * Examples:
 *   npx tsx src/tests/rebuild_tree_from_proxy.ts polkadot
 *   npx tsx src/tests/rebuild_tree_from_proxy.ts paseo
 */
import { ethers } from "ethers";
import { LeanIMT } from "../transactions/merkle";

const PROXY_URL = "http://127.0.0.1:5000";

const NETWORK_CONFIG: Record<string, { rpc: string; pool: string; chainId: number }> = {
  polkadot: {
    rpc: "https://polkadot-assethub-rpc.laissez-faire.trade",
    pool: "0x0D694Da746e73D1e255c1894F90e38170db45809",
    chainId: 420420419,
  },
  paseo: {
    rpc: "https://eth-asset-hub-paseo.laissez-faire.trade",
    pool: "0xbcE09D4De052b2816df1285663ac89528DF45380",
    chainId: 420420421,
  },
};

async function main() {
  const network = process.argv[2] || "polkadot";
  const config = NETWORK_CONFIG[network];
  if (!config) {
    console.error(`Unknown network: ${network}. Valid: ${Object.keys(NETWORK_CONFIG).join(", ")}`);
    process.exit(1);
  }

  console.log(`=== Proxy Tree Rebuild: ${network} ===\n`);

  // ── Step 1: Fetch leaves from the proxy ───────────────────────────────

  const t0 = Date.now();
  const resp = await fetch(`${PROXY_URL}/tree-leaves/${network}`);
  if (!resp.ok) {
    console.error(`❌ Proxy request failed: ${resp.status} ${resp.statusText}`);
    process.exit(1);
  }
  const data = await resp.json();
  if (data.error) {
    console.error(`❌ Proxy error: ${data.error}`);
    process.exit(1);
  }

  const fetchMs = Date.now() - t0;
  const leafCount = data.leaves.length;

  console.log(`Proxy response in ${fetchMs}ms:`);
  console.log(`  Network:       ${data.network}`);
  console.log(`  Proxy root:    ${data.root}`);
  console.log(`  Leaves:        ${leafCount}`);
  console.log(`  Depth:         ${data.depth}`);
  console.log(`  Cached block:  ${data.cached_block}`);
  console.log(`  Synced at:     ${data.synced_at ? new Date(data.synced_at * 1000).toISOString() : "unknown"}`);

  if (leafCount === 0) {
    console.error("❌ No leaves returned. Is the pool empty or has the proxy not synced yet?");
    process.exit(1);
  }

  // ── Step 2: Build LeanIMT locally from the leaf list ───────────────────

  console.log(`\nBuilding LeanIMT from ${leafCount} leaves...`);
  const t1 = Date.now();

  const tree = new LeanIMT();
  for (const leafStr of data.leaves) {
    tree.insert(BigInt(leafStr));
  }

  const buildMs = Date.now() - t1;
  const localRoot = tree.root.toString();
  const proxyRoot = data.root;

  console.log(`  Done in ${buildMs}ms`);
  console.log(`  Local root:    ${localRoot}`);
  console.log(`  Local size:    ${tree.size}`);
  console.log(`  Proxy root:    ${proxyRoot}`);
  console.log(`  Root match:    ${localRoot === proxyRoot ? "✅" : "❌ (mismatch with proxy root!)"}`);

  // ── Step 3: Verify against on-chain currentRoot() ─────────────────────

  console.log(`\nVerifying against on-chain currentRoot()...`);
  const provider = new ethers.JsonRpcProvider(config.rpc, config.chainId, {
    staticNetwork: ethers.Network.from(config.chainId),
  });

  const poolIface = new ethers.Interface([
    "function currentRoot() external view returns (uint256)",
    "function treeSize() external view returns (uint256)",
  ]);

  let chainRoot = "0";
  let chainSize = 0;
  try {
    const rootResult = await provider.call({
      to: config.pool,
      data: poolIface.encodeFunctionData("currentRoot"),
    });
    chainRoot = BigInt(rootResult).toString();
    const sizeResult = await provider.call({
      to: config.pool,
      data: poolIface.encodeFunctionData("treeSize"),
    });
    chainSize = parseInt(sizeResult, 16);
  } catch (e: any) {
    console.error(`  EVM RPC call failed: ${e.shortMessage || e.message}`);
  }

  console.log(`  Chain root:    ${chainRoot}`);
  console.log(`  Chain size:    ${chainSize}`);

  const rootMatchesChain = localRoot === chainRoot;
  const sizeMatchesChain = tree.size === chainSize;

  // ── Summary ────────────────────────────────────────────────────────────

  console.log(`\n${"=".repeat(60)}`);
  console.log(` SUMMARY`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  Total time:    ${Date.now() - t0}ms`);
  console.log(`  Leaves:        ${leafCount}`);
  console.log(`  Proxy root:    ${proxyRoot}`);
  console.log(`  Local root:    ${localRoot}`);
  console.log(`  Chain root:    ${chainRoot}`);
  console.log(`  Proxy → Local: ${localRoot === proxyRoot ? "✅" : "❌"}`);
  console.log(`  Local → Chain: ${rootMatchesChain ? "✅" : "❌"}`);
  console.log(`  Size → Chain:  ${tree.size} vs ${chainSize} ${sizeMatchesChain ? "✅" : "❌"}`);

  if (!rootMatchesChain) {
    console.log(`\n⚠️  Local root doesn't match chain. This could mean:`);
    console.log(`    • The proxy cache is stale (try the next block)`);
    console.log(`    • New deposits arrived between the proxy snapshot and now`);
    console.log(`    • There are leaves on-chain that neither eth_getLogs nor`);
    console.log(`      revive.ContractEmitted captured`);
  }

  process.exit(rootMatchesChain ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});