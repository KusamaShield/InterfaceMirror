import { get_foreign_simple } from "../transactions/adresses";

import { ApiPromise, WsProvider } from "@polkadot/api";


async function getApi(ws: string) {
  const wsProvider = new WsProvider(ws);
  const api = await ApiPromise.create({
    provider: wsProvider,
    noInitWarn: true,
  });
  return api;
}

async function foreign_asset_check() { 
    const api = await getApi("wss://asset-hub-kusama.dotters.network");
    const address = "0x246044e82dcb430908830f90e8c668b02544004d66eab58af5124b953ef57d37";
    const asset = {
  "parents": 2,
  "interior": {
    "X4": [
      {
        "GlobalConsensus": {
          "Polkadot": "NULL"
        }
      },
      {
        "Parachain": 1000
      },
      {
        "PalletInstance": 50
      },
      {
        "GeneralIndex": "1984"
      }
    ]
  }
};
  const bal = await api.query.foreignAssets.account(asset, "0xfe65a1a2841217761050ef9c15109755d710cee689f764e8270c3e11292bcd10");
  console.log(`bal foreign:`, bal.toHuman());
  console.log(`bal: `, bal.toHuman().balance ); 
  const x = await get_foreign_simple(api, "usdt", "0xfe65a1a2841217761050ef9c15109755d710cee689f764e8270c3e11292bcd10");
   console.log(`x output:`, x);
    const nn = bal.toJSON().balance.toString();
     if (nn != x) {
    throw new Error(`Assertion failed: ${nn} !== ${x}`);
  }
    console.log(`all good`);
    await api.disconnect();
    
}


await foreign_asset_check();