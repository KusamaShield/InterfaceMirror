import { decodeAddress } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";

export default function getaccounid32(inputen: string) {
  const publicKey = decodeAddress(inputen);

  // Convert to hex string (0x prefixed)
  return u8aToHex(publicKey);
}

// input ethereum address n get a accountid32 address/append 24 e
export function eth2account32(inputaddress: string) {
  return inputaddress + "eeeeeeeeeeeeeeeeeeeeeeee"
}

export function isEvmAddress(address: string): boolean {
  return address.length === 42 && /(0x)[0-9a-f]{40}$/i.test(address);
}
