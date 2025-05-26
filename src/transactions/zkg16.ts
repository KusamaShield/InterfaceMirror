//const snarkjs = require("snarkjs");                 
//import * as snarkjs from "snarkjs/build/snarkjs.min.js";
import * as _snarkjs from 'snarkjs';
export const snarkjs = _snarkjs;

export const westend_zk = "0x34D6A8507ACdfcf7445Ac19B6a57d90Bfd70AdbD";
export const westend_pool = "0xB446A4991636Fda68134F0113D15D9a35623527e";//"0x826fFaAf81935C0Ae225E54F22DB91D03bbf745a";//"0xfA626d66591bB57bac666cBe89D2c335CCdC7ff9";
                                                    
function toethhex(inputen: string) {
  return  '0x'+BigInt(inputen).toString(16);
  }


export async function generateCommitment(secret: string) {
 // const poseidon = await circomlibjs.buildPoseidon();
//  const hash = poseidon.F.toString(poseidon([10]));     
  //console.log(hash);                                    

const { proof, publicSignals } = await snarkjs.groth16.fullProve({
  "in": [
    secret,
    "67890"
  ]
}, "possy.wasm", "possy_0000.zkey");

const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);

  const formattedCall = [
    [toethhex(proof.pi_a[0]), toethhex(proof.pi_a[1])],
    [
      [toethhex(proof.pi_b[0][0]), toethhex(proof.pi_b[0][1])],
      [toethhex(proof.pi_b[1][0]), toethhex(proof.pi_b[1][1])]
    ],
    [toethhex(proof.pi_c[0]), toethhex(proof.pi_c[1])],
    publicSignals.map(signal => toethhex(signal)) // Ensure public signals are in hex
  ];
  const solcall = formattedCall;//JSON.stringify(formattedCall);
  
return JSON.parse("[" + calldata + "]");
}
