// Headless runner for src/tests/nym_polkadot_balance.ts.
//
// Nym requires a browser (WASM + Web Worker), so this drives Chromium over CDP
// against the Vite dev server and prints the test result. Requires the dev
// server to be running (`npm run dev`).
//
//   npm run nymtest
//
import { createRequire } from "module";
import { spawn } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import http from "http";

const require = createRequire(import.meta.url);
const WS = require("ws");

const PAGE = process.env.NYM_TEST_URL || "http://127.0.0.1:5173/nym-test.html";
const CDP_PORT = Number(process.env.NYM_CDP_PORT || 9222);
const TIMEOUT_MS = Number(process.env.NYM_TEST_TIMEOUT_MS || 300000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (url) =>
  new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });

function fmt(arg) {
  if (arg == null) return String(arg);
  if (arg.value !== undefined)
    return typeof arg.value === "string" ? arg.value : JSON.stringify(arg.value);
  if (arg.unserializableValue !== undefined) return String(arg.unserializableValue);
  if (arg.description) return arg.description;
  return JSON.stringify(arg);
}

async function assertDevServer() {
  try {
    await getJson(PAGE.replace(/\/[^/]*$/, "/") + "?probe=1").catch(() => null);
  } catch {
    /* ignore */
  }
  try {
    const res = await fetch(PAGE);
    if (!res.ok) throw new Error(String(res.status));
  } catch (e) {
    console.error(`[nymtest] dev server not reachable at ${PAGE} — run 'npm run dev' first`);
    process.exit(1);
  }
}

async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      return await getJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
    } catch {
      await sleep(500);
    }
  }
  throw new Error("Chromium CDP endpoint never came up");
}

async function main() {
  await assertDevServer();

  const profile = mkdtempSync(join(tmpdir(), "nym-test-chrome-"));
  const chrome = spawn(
    process.env.CHROMIUM_BIN || "chromium",
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
  const cleanup = () => {
    try {
      chrome.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  };
  process.on("exit", cleanup);

  const version = await waitForCdp();
  const ws = new WS(version.webSocketDebuggerUrl, {
    perMessageDeflate: false,
    maxPayload: 64 * 1024 * 1024,
  });
  await new Promise((res, rej) => {
    ws.on("open", res);
    ws.on("error", rej);
  });

  let id = 0;
  const pending = new Map();
  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      return;
    }
    if (msg.method === "Runtime.consoleAPICalled") {
      console.log(`[page.${msg.params.type}] ${(msg.params.args || []).map(fmt).join(" ")}`);
    } else if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      console.log(`[page.exception] ${d.exception?.description || d.text}`);
    }
  });

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
    });

  const target = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  await send("Runtime.enable", {}, sessionId);
  await send("Page.enable", {}, sessionId);
  await send("Page.navigate", { url: PAGE }, sessionId);
  console.log("[nymtest] navigating to", PAGE);

  const t0 = Date.now();
  while (Date.now() - t0 < TIMEOUT_MS) {
    await sleep(3000);
    try {
      const { result } = await send(
        "Runtime.evaluate",
        {
          expression:
            "JSON.stringify({done: !!window.__NYM_TEST_DONE__, r: window.__NYM_TEST_RESULT__ || null})",
          returnByValue: true,
        },
        sessionId,
      );
      const val = JSON.parse(result.value || "{}");
      if (val.done) {
        console.log("\n[nymtest] === RESULT ===");
        console.log(JSON.stringify(val.r, null, 2));
        cleanup();
        process.exit(val.r?.error ? 1 : 0);
      }
    } catch {
      /* page still loading */
    }
  }
  console.log("[nymtest] TIMEOUT waiting for result");
  cleanup();
  process.exit(1);
}

main().catch((e) => {
  console.error("[nymtest] fatal:", e);
  process.exit(1);
});