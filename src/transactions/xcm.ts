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

  const destination = {
    interior: {
      X1: {
        Parachain: paraid,
      },
    },
    parents: 0,
  };

  const bene = {
    interior: {
      X1: {
        AccountId32: {
          id: destination_address, //0x02ca485f8a1c8b532f7ea5121723588f6a25aae0eeeeeeeeeeeeeeeeeeeeeeee
          network: null,
        },
      },
    },
    parents: 0,
  };

  const asset = {
    fun: {
      Fungible: amount,
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
      return api.tx.xcmPallet.limitedTeleportAssets(
        { V3: destination },
        { V3: bene },
        { V3: [asset] },
        { fee_asset_item: 0 },
        { Unlimited: null },
      );
    
    case "Paseo Assethub":
      // Different tx structure for Assethub
      return api.tx.polkadotXcm.limitedReserveTransferAssets(
        { V3: destination },
        { V3: bene },
        { V3: [asset] },
        0,
        { Unlimited: null },
      );
    
    case "Paseo Hydration":
      // Different tx structure for Hydration
      const hydrationAsset = {
        ...baseAsset,
        id: {
          Concrete: {
            interior: {
              X2: [
                { PalletInstance: 50 },
                { GeneralIndex: 1 }
              ]
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
    
      return api.tx.polkadotXcm.limitedReserveTransferAssets(
        { V3: destination },
        { V3: bene },
        { V3: [asset] },
        0,
        { Unlimited: null },
      );
    
     case "Paseo Hub":
      // Different tx structure for Hydration
      
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



export async function generate_tx(
  api: any,
  from_chain: string,
  to_chain: string,
  destination_address: string,
  amount: string,
) {
  const paraid = xcm_chains.find((item) => item.name === to_chain)?.paraid;

  const destination = {
    interior: {
      X1: {
        Parachain: paraid,
      },
    },
    parents: 0,
  };

  const bene = {
    interior: {
      X1: {
        AccountId32: {
          id: destination_address, //0x02ca485f8a1c8b532f7ea5121723588f6a25aae0eeeeeeeeeeeeeeeeeeeeeeee
          network: null,
        },
      },
    },
    parents: 0,
  };

  const asset = {
    fun: {
      Fungible: amount,
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

  const tx = api.tx.xcmPallet.limitedTeleportAssets(
    { V3: destination },
    { V3: bene },
    { V3: [asset] },
    { fee_asset_item: 0 },
    { Unlimited: null },
  );

  return tx;
}

export const xcm_chains = [
  {
    name: "Paseo Assethub",
    id: "paseo-assethub",
    wsendpoint: "wss://sys.ibp.network/asset-hub-paseo",
    paraid: 1000,
    token: "PAS",
  },
  {
    name: "Paseo Relaychain",
    id: "paseo-relaychain",
    wsendpoint: "wss://paseo-rpc.n.dwellir.com",
    paraid: 0,
    token: "PAS",
  },
  {
    name: "Paseo Hub",
    id: "paseo-hub",
    wsendpoint: "wss://passet-hub-paseo.ibp.network",
    paraid: 1111,
    token: "PAS",
  },
  {
    name: "Paseo Hydration",
    id: "paseo-hydration",
    wsendpoint: "wss://paseo-rpc.play.hydration.cloud",
    paraid: 2034,
    token: "HDX",
  },
  {
    name: "Paseo Pop",
    id: "paseo-pop",
    wsendpoint: "wss://rpc1.paseo.popnetwork.xyz",
    paraid: 4001,
    token: "PAS",
  },
];
