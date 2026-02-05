/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import { decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import { u8aToHex, hexToU8a, isHex, hexToBn } from "@polkadot/util";

export default function getaccounid32(inputen: string) {
  const publicKey = decodeAddress(inputen);

  // Convert to hex string (0x prefixed)
  return u8aToHex(publicKey);
}

// polkadot api, name of asset
export async function get_foreign_simple(api, assetname, address){

  var asset;
  const usdt = {
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


const usdc = {
  "parents": 2,
  "interior": {
    "X4": [
      {
        "GlobalConsensus": {
          "Polkadot": null
        }
      },
      {
        "Parachain": 1000
      },
      {
        "PalletInstance": 50
      },
      {
        "GeneralIndex": "1337"
      }
    ]
  }
};

const dot = {
  "parents": 2,
  "interior": {
    "X1": [
      {
        "GlobalConsensus": {
          "Polkadot": "NULL"
        }
      }
    ]
  }
};


const wbtc = {
  "parents": 2,
  "interior": {
    "X2": [
      {
        "GlobalConsensus": {
          "Ethereum": 1
        }
      },
      {
        "AccountKey20": {
          "key": "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
          "network": null
        }
      }
    ]
  }
};


  switch (assetname) {
    case "wbtc":
      asset = wbtc;
      break;
    case "dot":
      asset = dot;
      break;
    case "usdt":
      asset = usdt;
      break;
    case "usdc":
      asset = usdc;
      break;
  }
  

  return await getforeignAssetBalance(api, asset, address);

}


/// foreign asset pallet:
async function getforeignAssetBalance(api, asset, address) {
    try {
        console.log(`asset: `, asset);
        console.log(`address: `, address);
       // const asset = ;
        const bal = await api.query.foreignAssets.account(asset, "0xfe65a1a2841217761050ef9c15109755d710cee689f764e8270c3e11292bcd10");
        console.log(`bal: `, bal.toHuman());
        const query = await api.query.foreignAssets.account(asset, address);
        console.log(`query:`, query.toHuman())
        let x = query.toJSON();
        console.log(`x query:`, x);
        if (!x) return 0;
        let balanceRaw = x.balance;
        const balanceBn = hexToBn(balanceRaw, {
            isLe: false,
            isNegative: false
        });
        return balanceBn.toString();
    } catch (error) {
        console.error(`Error fetching asset balance for ${address}:`, error);
        return 0;
    }
}


export function get_blockexplorer(network: string, transactionid: string){

  switch (network){
    case "bitcoincash":
      return "https://blockchair.com/bitcoin-cash/transaction/"+transactionid
    case "paseohub":
      return "https://blockscout-testnet.polkadot.io/tx/"+transactionid
    case "ripple":
      return "https://xrpscan.com/tx/"+transactionid
    case "dash":
      return "https://explorer.dash.org/insight/tx/"+transactionid
    case "atom":
      return "https://atomscan.com/transactions/"+transactionid
    case "stellar":
      return "https://stellarchain.io/transactions/"+transactionid
    case "polygon":
      return "https://polygonscan.com/tx/"+transactionid
    case "vechain":
      return "https://explore.vechain.org/transactions/"+transactionid
    case "BSC":// Binance smart chain
      return "https://bscscan.com/tx/"+transactionid
    case "solana":
      return "https://explorer.solana.com/tx/"+transactionid
    case "zcash":
      return "https://blockbook.zec.zelcore.io/tx/"+transactionid
    case "tron":
      return "https://tronscan.org/#/transaction/"+transactionid
    case "monero":
      return "https://monerohash.com/explorer/tx/"+transactionid
    case "sui":
      return "https://suiscan.xyz/mainnet/tx/"+transactionid
    case "ethereum":
      return "https://etherscan.io/tx/"+transactionid
    case "kusama":
      return "https://blockscout-kusama.polkadot.io/tx/"+transactionid

  }
}


// input ethereum address n get a accountid32 address/append 24 e
export function eth2account32(inputaddress: string) {
  return inputaddress + "eeeeeeeeeeeeeeeeeeeeeeee";
}

export function isEvmAddress(address: string): boolean {
  return address.length === 42 && /(0x)[0-9a-f]{40}$/i.test(address);
}

// check if its a correct polkadot style address
export function ispolkadotaddress(address: string): boolean {
  try {
    encodeAddress(isHex(address) ? hexToU8a(address) : decodeAddress(address));
    return true;
  } catch (error) {
    return false;
  }
}
