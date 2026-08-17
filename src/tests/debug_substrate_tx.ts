import { ApiPromise, WsProvider } from "@polkadot/api";
import { ethers } from "ethers";

const WS_RPC = "wss://asset-hub-polkadot-rpc.n.dwellir.com";
const EVM_RPC = "https://polkadot-assethub-rpc.laissez-faire.trade";
const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const TX_HASH = "0x000bb85e4750f85d7b167b8fd57125873eedc62b1edc1e11d837e91a8e4a2e97";

async function main() {
  const wsProvider = new WsProvider(WS_RPC);
  const api = await ApiPromise.create({ provider: wsProvider });

  try {
    // Try to get the extrinsic by hash
    console.log("=== Substrate Extrinsic ===");
    console.log("Hash:", TX_HASH);

    // Check if it's in any recent block
    const header = await api.rpc.chain.getHeader();
    console.log("Latest block:", header.number.toNumber());

    // Scan recent blocks for the extrinsic
    for (let i = 0; i < 20; i++) {
      const blockNum = header.number.toNumber() - i;
      try {
        const blockHash = await api.rpc.chain.getBlockHash(blockNum);
        const signedBlock = await api.rpc.chain.getBlock(blockHash);

        for (const ext of signedBlock.block.extrinsics) {
          const hash = ext.hash.toHex();
          if (hash === TX_HASH) {
            console.log(`\nFound in block ${blockNum}!`);
            console.log("Method:", ext.method.section, ext.method.method);
            console.log("Is signed:", ext.isSigned);

            const events = await api.query.system.events.at(blockHash);
            const myIndex = signedBlock.block.extrinsics.findIndex(e => e.hash.toHex() === TX_HASH);

            // Filter events for this extrinsic
            const phaseIdx = myIndex;
            let evmLogCount = 0;
            for (const record of events) {
              try {
                const phase = record.phase.asApplyExtrinsic?.toNumber();
                if (phase === phaseIdx) {
                  const evt = record.event;
                  const section = evt.section;
                  const method = evt.method;
                  console.log(`  Event: ${section}.${method} data=${evt.data.toHex()}`);

                  // Check for EVM log events
                  if (section === "evm" || section === "ethereum" || section === "revive") {
                    evmLogCount++;
                  }
                }
              } catch {}
            }
            console.log(`\nTotal events for this extrinsic (potentially EVM): ${evmLogCount}`);
          }
        }
      } catch {}
    }

  } finally {
    await api.disconnect();
    wsProvider.disconnect();
    process.exit(0);
  }
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });