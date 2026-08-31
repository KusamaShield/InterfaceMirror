/**
 * Check Dwellir premium WS endpoints — connectivity + state_queryStorage support.
 * Usage: npx tsx src/tests/check_dwellir_storage.ts
 */
import { ApiPromise, WsProvider } from "@polkadot/api";

const API_KEY = "64987a87-5544-491a-8ded-b9a015b82f03";

const ENDPOINTS: Record<string, string> = {
  "Polkadot AH": `wss://api-asset-hub-polkadot.n.dwellir.com/${API_KEY}`,
  "Kusama AH":   `wss://api-asset-hub-kusama.n.dwellir.com/${API_KEY}`,
  "Westend AH":  `wss://api-asset-hub-westend.n.dwellir.com/${API_KEY}`,
  "Paseo AH":    `wss://api-asset-hub-paseo.n.dwellir.com/${API_KEY}`,
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
      new Promise<never>((_, r) => setTimeout(() => r(new Error("timed out")), TIMEOUT_MS)),
    ]);
    return "OK";
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (msg.includes("4003") || msg.includes("unsafe")) return "4003: unsafe";
    return msg.slice(0, 60);
  }
}

async function checkEndpoint(
  name: string,
  url: string,
): Promise<{ name: string; ok: boolean; block?: number; error?: string; queryStorage?: string }> {
  const ws = new WsProvider(url);
  ws.on("error", () => {});
  const api = new ApiPromise({ provider: ws, noInitWarn: true });
  try {
    await Promise.race([
      api.isReady,
      new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), TIMEOUT_MS)),
    ]);
    const header = await api.rpc.chain.getHeader();
    const block = header.number.toNumber();
    console.log(`  ${name}: connected #${block}, testing queryStorage...`);
    const qsResult = await testQueryStorage(api);
    await api.disconnect();
    return { name, ok: true, block, queryStorage: qsResult };
  } catch (e: any) {
    try { await api.disconnect(); } catch (_) {}
    return { name, ok: false, error: e?.message?.slice(0, 60) || String(e).slice(0, 60) };
  }
}

async function main() {
  console.log(`Testing ${Object.keys(ENDPOINTS).length} Dwellir premium endpoints for state_queryStorage\n`);

  const results = [];
  for (const [name, url] of Object.entries(ENDPOINTS)) {
    console.log(`Connecting to ${name}...`);
    results.push(await checkEndpoint(name, url));
  }

  console.log("\n" + "─".repeat(85));
  console.log(`${"Network".padEnd(16)} ${"Connect".padEnd(10)} ${"Block".padEnd(13)} ${"queryStorage".padEnd(12)} Detail`);
  console.log("─".repeat(85));
  for (const r of results) {
    const status = r.ok ? "✅ OK" : "❌ FAIL";
    const block = r.ok ? `#${r.block}`.padEnd(12) : "-".padEnd(12);
    const qsStr = r.queryStorage === "OK" ? "✅ OK" : (r.ok ? "❌ FAIL" : "  -");
    const detail = r.ok ? r.queryStorage : r.error;
    console.log(`${r.name.padEnd(16)} ${status.padEnd(10)} ${block} ${qsStr.padEnd(12)} ${detail}`);
  }
  console.log("─".repeat(85));

  const connected = results.filter((r) => r.ok);
  const qsOk = results.filter((r) => r.queryStorage === "OK");
  console.log(`\nConnected: ${connected.length}/${results.length}`);
  console.log(`queryStorage OK: ${qsOk.length}/${results.length}`);

  if (qsOk.length > 0) {
    console.log(`\nDwellir premium queryStorage endpoints:`);
    for (const r of qsOk) {
      console.log(`  "${r.name}": "${ENDPOINTS[r.name]}",`);
    }
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});