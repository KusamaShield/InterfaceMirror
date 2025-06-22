import getaccounid32 from "./adresses";
import isEvmAddress from "./adresses";

export const xcm_routes = [
  {
    from: "Paseo Relaychain",
    to: "paseo-hub",
    path: ["paseo", "paseo-hub"],
  },
];

export async function generate_tx2(
  api: any,
  from_chain: string,
  to_chain: string,
  destination_address: string,
  amount: string,
) {
  const paraid = xcm_chains.find((item) => item.name === to_chain)?.paraid;
  console.log(`inside generate_tx2`);
  console.log(
    `api, from_chain, to_chain, destination_address, amount:`,
    from_chain,
    to_chain,
    destination_address,
    amount,
  );
  const from_chain_info = xcm_chains.find((item) => item.name === from_chain);

  const token_decimals = from_chain_info.decimals;
  const adjustedAmount = (
    parseFloat(amount) * Math.pow(10, token_decimals)
  ).toString();

  const destination = {
    interior: {
      X1: {
        Parachain: paraid,
      },
    },
    parents: 0,
  };

  var accountdest;
  if (isEvmAddress(destination_address)) {
  } else {
    accountdest = {
      AccountId32: {
        id: getaccounid32(destination_address), //0x02ca485f8a1c8b532f7ea5121723588f6a25aae0eeeeeeeeeeeeeeeeeeeeeeee
        network: null,
      },
    };
  }
  const bene = {
    interior: {
      X1: accountdest,
    },
    parents: 0,
  };

  const asset = {
    fun: {
      Fungible: adjustedAmount,
    },
    id: {
      Concrete: {
        interior: {
          Here: null,
        },
        parents: 0,
      },
    },
  };
  switch (from_chain) {
    case "Paseo Relaychain":
      console.log(`from Paseo Relaychain`);
      return api.tx.xcmPallet.limitedTeleportAssets(
        { V3: destination },
        { V3: bene },
        { V3: [asset] },
        { fee_asset_item: 0 },
        { Unlimited: null },
      );

    case "Paseo Assethub":
      console.log(`from Paseo Assethub`);
      // Different tx structure for Assethub
      if (to_chain == "Paseo Relaychain") {
        const asset = {
          fun: {
            Fungible: adjustedAmount,
          },
          id: {
            Concrete: {
              interior: {
                Here: null,
              },
              parents: 1,
            },
          },
        };
        console.log(`bene, asset:`, bene, asset);
        return api.tx.polkadotXcm.teleportAssets(
          {
            V3: {
              interior: {
                Here: null,
              },
              parents: 1,
            },
          },
          {
            V3: {
              interior: {
                X1: {
                  AccountId32: {
                    id: getaccounid32(destination_address), //0x02ca485f8a1c8b532f7ea5121723588f6a25aae0eeeeeeeeeeeeeeeeeeeeeeee
                    network: null,
                  },
                },
              },
              parents: 0,
            },
          },
          { V3: [asset] },
          0,
        );
      } else {
        const bene = {
          interior: {
            X1: {
              AccountId32: {
                id: "0x2a3c9fcdc01b1e9c640398dd84437f1a46f4d0797f09192189ef5f0e3f915c38",
                network: null,
              },
            },
          },
          parents: 0,
        };
        const adjustedAmount = (
          parseFloat(amount) * Math.pow(10, 10)
        ).toString();
        const asset = {
          fun: {
            Fungible: adjustedAmount,
          },
          id: {
            Concrete: {
              interior: {
                Here: null,
              },
              parents: 1,
            },
          },
        };
        return api.tx.polkadotXcm.limitedReserveTransferAssets(
          {
            V3: {
              parents: 1,
              interior: {
                X1: {
                  Parachain: paraid,
                },
              },
            },
          },
          { V3: bene },
          { V3: [asset] },
          0,
          { Unlimited: null },
        );
      }

    case "Paseo Hydration":
      console.log(`from Paseo Hydration`);
      // Different tx structure for Hydration
      const hydrationAsset = {
        ...baseAsset,
        id: {
          Concrete: {
            interior: {
              X2: [{ PalletInstance: 50 }, { GeneralIndex: 1 }],
            },
            parents: 0,
          },
        },
      };
      return api.tx.polkadotXcm.limitedReserveTransferAssets(
        { V3: destination },
        { V3: bene },
        { V3: [hydrationAsset] },
        0,
        { Unlimited: null },
      );
    case "Paseo Pop":
      // Different tx structure for Hydration
      console.log(`from Paseo Pop`);
      return api.tx.polkadotXcm.limitedReserveTransferAssets(
        { V3: destination },
        { V3: bene },
        { V3: [asset] },
        0,
        { Unlimited: null },
      );

    case "Paseo Hub":
      console.log(`from Paseo Hub`);
      if (to_chain == "Paseo Relaychain") {
        const asset = {
          fun: {
            Fungible: adjustedAmount,
          },
          id: {
            Concrete: {
              interior: {
                Here: null,
              },
              parents: 1,
            },
          },
        };
        console.log(`bene, asset:`, bene, asset);
        return api.tx.polkadotXcm.teleportAssets(
          {
            V3: {
              interior: {
                Here: null,
              },
              parents: 1,
            },
          },
          {
            V3: {
              interior: {
                X1: {
                  AccountId32: {
                    id: getaccounid32(destination_address), //0x02ca485f8a1c8b532f7ea5121723588f6a25aae0eeeeeeeeeeeeeeeeeeeeeeee
                    network: null,
                  },
                },
              },
              parents: 0,
            },
          },
          { V3: [asset] },
          0,
        );
      }
      return api.tx.polkadotXcm.limitedReserveTransferAssets(
        { V3: destination },
        { V3: bene },
        { V3: [asset] },
        0,
        { Unlimited: null },
      );

    default:
      throw new Error(`Unsupported from_chain: ${from_chain}`);
  }
}

export const xcm_chains = [
  {
    name: "Paseo Assethub",
    id: "paseo-assethub",
    wsendpoint: "wss://sys.ibp.network/asset-hub-paseo",
    paraid: 1000,
    decimals: 10,
    token: "PAS",
  },
  {
    name: "Paseo Relaychain",
    id: "paseo-relaychain",
    wsendpoint: "wss://paseo-rpc.n.dwellir.com",
    paraid: 0,
    decimals: 10,
    token: "PAS",
  },
  {
    name: "Paseo Hub",
    id: "paseo-hub",
    wsendpoint: "wss://passet-hub-paseo.ibp.network",
    paraid: 1111,
    decimals: 10,
    token: "PAS",
  },
  {
    name: "Paseo Hydration",
    id: "paseo-hydration",
    wsendpoint: "wss://paseo-rpc.play.hydration.cloud",
    paraid: 2034,
    decimals: 12,
    token: "HDX",
  },
  {
    name: "Paseo Pop",
    id: "paseo-pop",
    wsendpoint: "wss://rpc1.paseo.popnetwork.xyz",
    paraid: 4001,
    decimals: 10,
    token: "PAS",
  },
];
