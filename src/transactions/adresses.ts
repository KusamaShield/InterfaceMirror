/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import { decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import { u8aToHex, hexToU8a, isHex } from "@polkadot/util";

export default function getaccounid32(inputen: string) {
  const publicKey = decodeAddress(inputen);

  // Convert to hex string (0x prefixed)
  return u8aToHex(publicKey);
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
