/**
 * Check Polkadot AssetHub WS endpoint health.
 * Usage: npx tsx src/tests/check_ws_endpoints.ts
 */
import { ApiPromise, WsProvider } from "@polkadot/api";

const ENDPOINTS: Record<string, string> = {
  Dwellir: "wss://asset-hub-polkadot-rpc.n.dwellir.com",
  "Gatotech Unlimited": "wss://asset-hub-polkadot.gatotech.network",
  Helixstreet: "wss://rpc-asset-hub-polkadot.helixstreet.io",
  LuckyFriday: "wss://rpc-asset-hub-polkadot.luckyfriday.io",
  OnFinality: "wss://statemint.api.onfinality.io/public-ws",
  Parity: "wss://polkadot-asset-hub-rpc.polkadot.io",
  Stakeworld: "wss://rpc-asset-hub-polkadot.stakeworld.io",
};

const TIMEOUT_MS = 10000;

async function checkEndpoint(
  name: string,
  url: string,
): Promise<{ name: string; url: string; ok: boolean; block?: number; error?: string }> {
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
    await api.disconnect();
    return { name, url, ok: true, block };
  } catch (e: any) {
    try {
      await api.disconnect();
    } catch (_) {}
    return { name, url, ok: false, error: e?.message || String(e) };
  }
}

async function main() {
  console.log(`Checking ${Object.keys(ENDPOINTS).length} Polkadot AssetHub WS endpoints (${TIMEOUT_MS / 1000}s timeout)...\n`);

  const results = await Promise.all(
    Object.entries(ENDPOINTS).map(([name, url]) => checkEndpoint(name, url)),
  );

  console.log("─".repeat(80));
  console.log(`${"Provider".padEnd(22)} ${"Status".padEnd(10)} Block / Error`);
  console.log("─".repeat(80));
  for (const r of results) {
    const status = r.ok ? "✅ OK" : "❌ FAIL";
    const detail = r.ok ? `#${r.block}` : r.error;
    console.log(`${r.name.padEnd(22)} ${status.padEnd(10)} ${detail}`);
  }
  console.log("─".repeat(80));

  const ok = results.filter((r) => r.ok);
  console.log(`\n${ok.length}/${results.length} endpoints reachable.`);

  if (ok.length > 0) {
    console.log(`\nWorking endpoints:`);
    console.log(ok.map((r) => `  "wss://${new URL(r.url).host}${new URL(r.url).pathname}",`).join("\n"));
  }

  process.exit(ok.length > 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});