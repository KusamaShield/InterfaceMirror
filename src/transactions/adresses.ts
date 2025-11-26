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
