import { ApiPromise, WsProvider } from "@polkadot/api";
import { cryptoWaitReady } from "@polkadot/util-crypto";

async function main() {
  await cryptoWaitReady();
  const api = await ApiPromise.create({
    provider: new WsProvider("wss://asset-hub-polkadot-rpc.n.dwellir.com"),
  });

  const header = await api.rpc.chain.getHeader();
  const finalized = header.number.toNumber();
  console.log(`Finalized block: ${finalized}`);

  const target =
    "0x0134e9c3db571d54b633c22ae17488093488b22a1704f797b4f957d477c766b3";

  for (
    let bn = finalized - 15;
    bn <= finalized;
    bn++
  ) {
    const bh = await api.rpc.chain.getBlockHash(bn);
    const events = await api.query.system.events.at(bh);
    for (const r of events) {
      const ev: any = r.event;
      if (ev.section === "revive" && ev.method === "ContractEmitted") {
        const d = ev.data;
        if (
          d &&
          d[0] &&
          d[0].toString().toLowerCase() ===
            "0x0d694da746e73d1e255c1894f90e38170db45809"
        ) {
          const cmt = d[1].toString();
          console.log(`block ${bn}: ${cmt} ${cmt === target ? " <-- OURS!" : ""
            }`);
        }
      }
    }
  }
  await api.disconnect();
}
main().catch(console.error);