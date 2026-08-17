import { ethers } from "ethers";

async function main() {
  const rpc = "https://polkadot-assethub-rpc.laissez-faire.trade/";
  const provider = new ethers.JsonRpcProvider(rpc, 420420419, { staticNetwork: ethers.Network.from(420420419) });
  const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";

  // Withdraw calldata from last run
  const calldata = "0x613ce1571dd3e38ebfcbfdbb6ed9ea939a75fc95ab0e40d55d77419d3b5c3a6f349f99f612f3286b421ed517c514f861de9ca00fa3dccfff97bf8e8f92cf95ac99d913b41c13f6085df9300c4b347f467f79e49c3d91a4c86a0fe17cf9e33d2879c82b49165dba4aa9e3ab8e08c7b1d26286eb2a76ac89394bacf8f7516847e5c8654c9b0f3fc092d2a12753a51611368d7f71e87d05b64f9744f81d15da7e8703f4fba21133b156c6794538ca630a1a1e8ac6210bc4dd6d835e5b05f038705c6c3aa3b6075899e4eeff14942ce8d1dfc01207529f5fe7bbc60b73b3be10c388486f40b612f61a6865fbab064511642f92a53dc37ef65007374f4d4c3efadf04a524a7f0" + "0000000000000000000000000000000000000000000000000000000000000000" + "0000000000000000000000000000000000000000000000000000000000000000" + "00000000000000000000000000000000000000000000000006f05b59d3b20000" + "0000000000000000000000000000000000000000000000000000000000000080" + "260addb08b77c833051799c9cb0ba9e426672f64fecb91ce77b268ed288b5af3" + "24fbdc8a7530f49d2d7e8dab578dc9a185fe3ee38552094da3834597a4854348" + "0000000000000000000000000000000000000000000000000000000000000000" + "00000000000000000000000074e539fc4607eae6d4383dac7bbf7124159f3ed3";

  try {
    const gas = await provider.estimateGas({ to: CONTRACT, data: calldata });
    console.log("Estimated gas:", gas.toString());
  } catch (e: any) {
    console.log("estimateGas error:", e.shortMessage || e.message);
    if (e.revert) console.log("revert reason:", e.revert);
    if (e.data) console.log("revert data:", e.data);
  }

  try {
    const res = await provider.call({ to: CONTRACT, data: calldata });
    console.log("eth_call result:", res);
  } catch (e: any) {
    console.log("eth_call error:", e.shortMessage || e.message);
    if (e.revert) console.log("revert reason:", e.revert);
    if (e.data) console.log("revert data:", e.data);
  }
}

main().catch(console.error);