/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import getaccounid32 from "./adresses";
import { isEvmAddress, eth2account32 } from "./adresses";

export const xcm_routes = [
  {
    from: "Paseo Relaychain",
    to: "paseo-hub",
    path: ["paseo", "paseo-hub"],
  },
];

// supported XCM routes for open HRMP channels
const supportedRoutes = [
  { from: "Paseo Relaychain", to: "Paseo Assethub" },
  { from: "Paseo Relaychain", to: "Paseo Hub" },
  { from: "Paseo Assethub", to: "Paseo Relaychain" },
  { from: "Paseo Assethub", to: "Paseo Hydration" },
  { from: "Paseo Assethub", to: "Paseo Pop" },
  { from: "Paseo Hub", to: "Paseo Relaychain" },
  { from: "Kusama Assethub", to: "Polkadot Assethub" },
  { from: "Polkadot Assethub", to: "Kusama Assethub" },
  { from: "Polkadot Relay", to: "Polkadot Assethub" },
];

interface XcmV3Junction {
  type: string;
  value: any;
}

interface XcmV3Multilocation {
  parents: number;
  interior: {
    type: string;
    value?: XcmV3Junction[];
  };
}

// Mock token IDs for DOT and KSM on Polkadot Asset Hub (pah)
const DOT_TOKEN_ID = "native::pah";
const KSM_TOKEN_ID = "foreign-asset::pah::compressed_location";

// Utility function to convert tokens to plancks (smallest units)
function tokensToPlancks(amount: string, decimals: number): bigint {
  const [integer, fractional = ""] = amount.split(".");
  const fractionalPadded = fractional.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(integer + fractionalPadded);
}

export function eth2accountid32(ethaddress: string) {
  return ethaddress + "eeeeeeeeeeeeeeeeeeeeeeee"; //0x02ca485f8a1c8b532f7ea5121723588f6a25aae0eeeeeeeeeeeeeeeeeeeeeeee
}

// Function to construct the swap call parameters with exact formatting and fee calculation
function constructSwapCallFormatted(
  tokenIdIn: string,
  tokenIdOut: string,
  amountIn: string,
  amountOutMin: string,
) {
  // Determine decimals based on token type
  const tokenInDecimals = tokenIdIn === DOT_TOKEN_ID ? 10 : 12; // DOT has 10 decimals, KSM has 12
  const tokenOutDecimals = tokenIdOut === DOT_TOKEN_ID ? 10 : 12;

  // Convert amounts to plancks
  const totalInPlancks = tokensToPlancks(amountIn, tokenInDecimals);
  const expectedOutPlancks = tokensToPlancks(amountOutMin, tokenOutDecimals);

  // Calculate amounts to exactly match web UI output
  // Web UI shows for 1.8 DOT -> 0.509398 KSM:
  // amount_in: 17946000000 (after 0.3% fee: 1.8 * 0.997 = 1.7946 DOT)
  // amount_out_min: 502176511942 (0.509398 KSM with slippage protection)

  // Input: Apply exact 0.3% fee calculation
  const amountInAfterFee = (totalInPlancks * 997n) / 1000n;

  // Output: Use exact ratio from web UI output
  // 502176511942 / 509398000000 = 0.985823 (approximately 1.42% slippage)
  const exactOutputRatio = (502176511942n * 1000000000000n) / 509398000000n;
  const amountOutMinAfterFee =
    (expectedOutPlancks * exactOutputRatio) / 1000000000000n;

  // Return the formatted output as requested
  return {
    amount_in: {
      name: "amount_in",
      type: "U128",
      value: amountInAfterFee.toString(),
    },
    amount_out_min: {
      name: "amount_out_min",
      type: "U128",
      value: amountOutMinAfterFee.toString(),
    },
  };
}

/* 
	const amountInDOT = "1.4";
	const amountOutMinKSM = "0.396183";
  result output: {
  amount_in: { name: 'amount_in', type: 'U128', value: '13958000000' },
  amount_out_min: { name: 'amount_out_min', type: 'U128', value: '390566506014
' }
}

*/
function convertdotksmamount(amountInDOT: any, amountOutMinKSM: any) {
  // Construct the swap call with exact formatting
  const result = constructSwapCallFormatted(
    DOT_TOKEN_ID,
    KSM_TOKEN_ID,
    amountInDOT,
    amountOutMinKSM,
  );
  return result;
}

// reference: https://polkadot.js.org/apps/?rpc=wss%3A%2F%2Fasset-hub-polkadot.dotters.network#/extrinsics/decode/0x1f0b040202090300a10f0400010100f621771ddf37d482210b8c59617952eb1c2b40cfec55df47215231365186a05704040201090300076e27f2cd070000000000
// KSM assethub Pollkadot to Kusama AH transfer
export async function KSM2ah(
  api: any,
  swapamount: any,
  destamount: any,
  destination_address: string,
) {
  const converted_amount = convertdotksmamount(swapamount, destamount);
  console.log(
    `[KSM2ah] called with input:`,
    converted_amount.amount_out_min.value,
    destination_address,
  );

  // convert address
  var destaddress;
  if (isEvmAddress(destination_address)) {
    destaddress = eth2account32(destination_address);
  } else {
    destaddress = getaccounid32(destination_address);
  }
  console.log(`destination address set as: `, destaddress);
  const k2 = {
    V4: {
      parents: 2, // KSM comes from Kusama (different consensus)
      interior: {
        X2: [{ GlobalConsensus: "Kusama" }, { Parachain: 1000 }],
      },
    },
  };

  const beneficiary = {
    V4: {
      interior: {
        X1: [
          {
            AccountId32: {
              id: destaddress, //destination_address,
              network: null,
            },
          },
        ],
      },
      parents: 0,
    },
  };

  const versionedAssets7 = {
    V4: [
      {
        fun: { Fungible: converted_amount.amount_out_min.value },
        id: {
          parents: 2,
          interior: {
            X1: [{ GlobalConsensus: "Kusama" }],
          },
        },
      },
    ],
  };

  console.log(`KSM2ah function output:`, k2, beneficiary, versionedAssets7);
  return api.tx.polkadotXcm.transferAssets(
    k2,
    beneficiary,
    versionedAssets7,
    0,
    { Unlimited: null },
  );
}

// generate a dot to ksm swap tx
export async function generate_dot2ksm(
  api: any,
  amountin: any,
  amountout: any,
  destination_address: string,
) {
  console.log(`[generate_dot2ksm]`, amountin, amountout, destination_address);
  const converted_amount = convertdotksmamount(amountin, amountout);
  const ksmMultiLocation = api
    .createType("StagingXcmV4Location", {
      parents: 2, // KSM comes from Kusama (different consensus)
      interior: {
        X1: [{ GlobalConsensus: "Kusama" }],
      },
    })
    .toU8a();

  const dotMultiLocation = api
    .createType("StagingXcmV4Location", {
      parents: 1, // DOT is parent native chain token
      interior: {
        here: null,
      },
    })
    .toU8a();

  console.log(
    `assetConversion.swapExactTokensForTokens: `,
    [dotMultiLocation, ksmMultiLocation],
    converted_amount.amount_in.value, // tokens selling
    converted_amount.amount_out_min.value, //tokens to get
    destination_address,
  );
  return api.tx.assetConversion.swapExactTokensForTokens(
    [dotMultiLocation, ksmMultiLocation],
    converted_amount.amount_in.value, // tokens selling
    converted_amount.amount_out_min.value, //tokens to get
    destination_address,
    true,
  );
}

export async function generate_tx2(
  api: any,
  from_chain: string,
  to_chain: string,
  destination_address: string,
  amount: string,
) {
  const isRouteSupported = supportedRoutes.some(
    (route) => route.from === from_chain && route.to === to_chain,
  );

  if (!isRouteSupported) {
    throw new Error(
      `UNSUPPORTED ROUTE: ${from_chain} → ${to_chain}. ` +
        `Check supported routes at https://kusamashield.codeberg.page/xcm.html`,
    );
  }
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

  if (!from_chain_info) {
  throw new Error(`Chain configuration not found for: ${from_chain}`);
}

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
    //case "Kusama Assethub": // KSM > Polkadot ah
    case "Polkadot Assethub": // Polkadot Assethub > Kusama Assethub
      return api.tx.polkadotXcm.transferAssetsUsingTypeAndThen(
        { V4: {} },
        { V4: {} },
        { LocalReserve: null },
        {},
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
                id: getaccounid32(destination_address), //"0x2a3c9fcdc01b1e9c640398dd84437f1a46f4d0797f09192189ef5f0e3f915c38",
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
      const baseAsset = {
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
