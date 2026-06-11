import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("https://eth-asset-hub-paseo.dotters.network");

const leanIMT = "0x1966D29734941f556E2d80B3ADD1c107bdFb17bE";

const abi = [
  "function size() view returns (uint256)",
  "function root() view returns (uint256)",
  "function sideNodes(uint256) view returns (uint256)",
];

const imt = new ethers.Contract(leanIMT, abi, provider);

const size = Number(await imt.size());
const root = (await imt.root()).toString();
const depth = Math.ceil(Math.log2(size + 1));

console.log("Tree size:", size);
console.log("Tree depth:", depth);
console.log("Root:", root);

console.log("\nSide nodes:");
for (let i = 0; i <= depth + 2; i++) {
  const sn = (await imt.sideNodes(i)).toString();
  console.log(`  Level ${i}: ${sn}`);
}

const leafIndex = 33;
console.log(`\nLeaf ${leafIndex} binary: ${leafIndex.toString(2)}`);
console.log("Siblings:");
for (let l = 0; l < 10; l++) {
  const bit = (BigInt(leafIndex) >> BigInt(l)) & 1n;
  const sn = (await imt.sideNodes(l)).toString();
  const sibling = bit ? sn : "0";
  console.log(`  Level ${l}: bit=${bit}, sideNode=${sn.slice(0, 20)}..., sibling=${sibling.slice(0, 20)}...`);
}