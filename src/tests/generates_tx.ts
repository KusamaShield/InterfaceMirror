import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
// snowbridge has a UI for this: https://app.snowbridge.network/kusama

const PA = "wss://statemint.api.onfinality.io";
const KA = "wss://asset-hub-polkadot.dotters.network";

// KSM on PA to KA: https://assethub-polkadot.subscan.io/extrinsic/9745588-2

async function connect(wsurl) {
  const wsProvider = new WsProvider(wsurl);
  const api = await ApiPromise.create({ provider: wsProvider });
  return api;
}

// https://assethub-polkadot.subscan.io/extrinsic/9742421-2?tab=xcm_transfer
// DOT Polkadot Ah > Kusama Ah
async function p2k() {
  const api = await connect(PA);
  const dest = {};
  const assets = {};

  return api.tx.polkadotXcm.transferAssetsUsingTypeAndThen(
    { V4: dest },
    { V4: assets },
    { LocalReserve: null },
    {},
  );
}

// DOT TX https://assethub-kusama.subscan.io/tx/0x6106f3c5423170a22f3d9e0676dd3aac85f52d57a661f3e1ab0f547f5738efa5
// Kusama Ah > Polkadot Ah
async function k2p() {
  const api = await connect(KA);
}

async function main() {
  console.log(`start`);
  console.log(`Polkadot Ah > Kusama Ah`);
  await p2k();
  console.log(`Kusama Ah > Polkadot Ah`);
  await k2p();
  console.log(`EOL`);
}

await main().finally();
