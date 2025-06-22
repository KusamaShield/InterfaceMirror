import { decodeAddress } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";

export default function getaccounid32(inputen: string) {
  const publicKey = decodeAddress(inputen);

  // Convert to hex string (0x prefixed)
  return u8aToHex(publicKey);
}


export function isEvmAddress(address: string): boolean {
  return address.length === 42 && /(0x)[0-9a-f]{40}$/i.test(address);
}