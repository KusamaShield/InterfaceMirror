/**
 * Check Paseo AssetHub WS endpoint health — connectivity + state_queryStorage support.
 * Usage: npx tsx src/tests/check_paseo_endpoints.ts
 */
import { ApiPromise, WsProvider } from "@polkadot/api";

const ENDPOINTS: Record<string, string> = {
  IBP1: "wss://sys.ibp.network/asset-hub-paseo",
  IBP2: "wss://asset-hub-paseo.dotters.network",
  Dwellir: "wss://asset-hub-paseo-rpc.dwellir.com",
  StakeWorld: "wss://pas-rpc.stakeworld.io/assethub",
  TurboFlakes: "wss://sys.turboflakes.io/asset-hub-paseo",
};

const TIMEOUT_MS = 15000;

const STORAGE_KEY = "0x26aa394eea5630e07c48ae0c9558cef780d41e5e16056765bc8461851072c9d7";

process.on("unhandledRejection", () => {});

async function testQueryStorage(api: ApiPromise): Promise<string> {
  try {
    const header = await api.rpc.chain.getHeader();
    const latest = header.number.toNumber();
    const from = Math.max(latest - 500, 1);
    const fromHash = await api.rpc.chain.getBlockHash(from);
    const toHash = await api.rpc.chain.getBlockHash(Math.min(from + 499, latest));
    await Promise.race([
      api.rpc.state.queryStorage([STORAGE_KEY], fromHash, toHash),
      new Promise<never>((_, r) => setTimeout(() => r(new Error("queryStorage timed out")), TIMEOUT_MS)),
    ]);
    return "OK";
  } catch (e: any) {
    return e?.message || String(e);
  }
}

async function checkEndpoint(
  name: string,
  url: string,
): Promise<{ name: string; url: string; ok: boolean; block?: number; error?: string; queryStorage?: string }> {
  const ws = new WsProvider(url);
  const api = new ApiPromise({ provider: ws, noInitWarn: true });
  try {
    await Promise.race([
      api.isReady,
      new Promise<never>((_, r) =>
        setTimeout(() => r(new Error("timeout")), TIMEOUT_MS),
      ),
    ]);
    const header = await api.rpc.chain.getHeader();
    const block = header.number.toNumber();
    console.log(`  ${name}: connected, block #${block}, testing state_queryStorage...`);
    const qsResult = await testQueryStorage(api);
    await api.disconnect();
    return { name, url, ok: true, block, queryStorage: qsResult };
  } catch (e: any) {
    try { await api.disconnect(); } catch (_) {}
    return { name, url, ok: false, error: e?.message || String(e) };
  }
}

async function main() {
  console.log(`Checking ${Object.keys(ENDPOINTS).length} Paseo AssetHub WS endpoints (${TIMEOUT_MS / 1000}s timeout)...\n`);

  const results = [];
  for (const [name, url] of Object.entries(ENDPOINTS)) {
    console.log(`Connecting to ${name}...`);
    results.push(await checkEndpoint(name, url));
  }

  console.log("\n" + "─".repeat(90));
  console.log(`${"Provider".padEnd(16)} ${"Connect".padEnd(10)} Block       ${"queryStorage".padEnd(10)} Detail`);
  console.log("─".repeat(90));
  for (const r of results) {
    const status = r.ok ? "✅ OK" : "❌ FAIL";
    const block = r.ok ? `#${r.block}` : "-";
    const qsStr = r.ok ? (r.queryStorage === "OK" ? "✅ OK" : "❌ FAIL") : "  -";
    const detail = r.ok ? r.queryStorage : r.error;
    console.log(`${r.name.padEnd(16)} ${status.padEnd(10)} ${block.padEnd(11)} ${qsStr.padEnd(10)} ${detail}`);
  }
  console.log("─".repeat(90));

  const connected = results.filter((r) => r.ok);
  const qsOk = results.filter((r) => r.ok && r.queryStorage === "OK");
  console.log(`\nConnected: ${connected.length}/${results.length}`);
  console.log(`queryStorage OK: ${qsOk.length}/${results.length}`);

  if (connected.length > 0) {
    console.log(`\nWorking endpoints (connected):`);
    for (const r of connected) {
      console.log(`  "${r.name}": "${r.url}",  // #${r.block} queryStorage=${r.queryStorage?.slice(0, 30)}`);
    }
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});