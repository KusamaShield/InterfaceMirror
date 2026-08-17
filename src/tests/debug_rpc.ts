async function rpcCall(rpc: string, method: string, params: any[]) {
  const res = await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return res.json();
}

const EVM = "0x96c2223f6318830F3Ed24eFe0a1E1fdcB64E5d17";
const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const RPCs = ["https://polkadot-assethub-rpc.laissez-faire.trade/", "https://asset-hub-polkadot-rpc.dwellir.com"];

for (const rpc of RPCs) {
  console.log(`\n=== ${new URL(rpc).hostname} ===`);
  const bal = await rpcCall(rpc, "eth_getBalance", [EVM, "latest"]);
  console.log("Balance:", bal.result, bal.error?.message);
  const nonce = await rpcCall(rpc, "eth_getTransactionCount", [EVM, "latest"]);
  console.log("Nonce:", nonce.result, nonce.error?.message);
  const gasPrice = await rpcCall(rpc, "eth_gasPrice", []);
  console.log("Gas price:", gasPrice.result, gasPrice.error?.message);
  const chainId = await rpcCall(rpc, "eth_chainId", []);
  console.log("Chain ID:", chainId.result, chainId.error?.message);
  
  // Try eth_sendRawTransaction with a simple tx
  const txResult = await rpcCall(rpc, "eth_sendRawTransaction", ["0x02f9010d84190f1b4380808477359400830493e0940d694da746e73d1e255c1894f90e38170db45809880de0b6b3a7640000a442ef5fbb0000000000000000000000000000000000000000000000000000000000000001c080a0b7c3e2d4f5a6b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2a0c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1"]);
  console.log("eth_sendRawTransaction:", txResult.result, txResult.error?.message, txResult.error?.code);
}