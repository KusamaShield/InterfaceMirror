import { ethers } from "ethers";
import { readFileSync, writeFileSync } from "fs";

const RPC_URL = "http://localhost:8545";
const ALITH_KEY = "0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133";

const ABI = [
  { inputs: [], stateMutability: "nonpayable", type: "constructor" },
  {
    inputs: [{ internalType: "uint256[2]", name: "inputs", type: "uint256[2]" }],
    name: "hash",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "pure",
    type: "function",
  },
];

function getBytecode(): string {
  const buf = readFileSync("/home/pi/rust/PoseidonPolkaVM/pos.polkavm");
  return "0x" + Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(ALITH_KEY, provider);

  console.log("Deployer:", wallet.address);
  const bal = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(bal));

  const bytecode = getBytecode();
  console.log("Bytecode length:", bytecode.length / 2 - 1, "bytes");

  const factory = new ethers.ContractFactory(ABI, bytecode, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const addr = await contract.getAddress();
  console.log("Poseidon deployed at:", addr);

  // Test hash
  const result = await contract.hash([1n, 2n]);
  console.log("hash(1,2) =", result.toString());

  writeFileSync("/tmp/poseidon_address.txt", addr);
  console.log("Address saved to /tmp/poseidon_address.txt");
}

main().catch(e => { console.error(e); process.exit(1); });