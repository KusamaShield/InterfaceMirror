import { ethers, getAddress } from "ethers";

// Network config - adjust as needed
const RPC_URL = "https://paseo-assethub-rpc.laissez-faire.trade/";
const SHIELD_ADDRESS = "0xbce09d4d2dbe234ff7598e1f8282aa6b3f6ffe20";

// Use proper checksummed address
const shieldAddress = getAddress(SHIELD_ADDRESS);

// Minimal ABI for depositNative
const ABI = ["function depositNative(bytes32 commitment) external payable"];

async function testGasEstimate(amount: string) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(shieldAddress, ABI, provider);
  const depositAmount = ethers.parseEther(amount);

  // Generate valid commitment
  const secretBytes = ethers.randomBytes(31);
  const secretHex = "0x" + Array.from(secretBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const secretBN = BigInt(secretHex);
  const { poseidon2 } = await import("poseidon-lite");
  const nullifier = poseidon2([secretBN, 1n]);
  const precommitment = poseidon2([nullifier, secretBN]);
  const valueAssetHash = poseidon2([depositAmount.toString(), 0n]);
  const commitment = poseidon2([valueAssetHash, precommitment]);
  const commitmentHex = "0x" + commitment.toString(16).padStart(64, '0');

  console.log(`\n=== Testing amount: ${amount} DOT ===`);
  console.log("depositAmount wei:", depositAmount.toString());
  console.log("commitmentHex:", commitmentHex);

  // Get gas price
  let gasPriceWei: bigint;
  try {
    const feeData = await provider.getFeeData();
    gasPriceWei = feeData.gasPrice || 50000000000n;
    console.log("gasPrice wei:", gasPriceWei.toString());
    console.log("gasPrice gwei:", Number(ethers.formatUnits(gasPriceWei, "gwei")).toFixed(2));
  } catch (e) {
    gasPriceWei = 50000000000n;
    console.log("Using fallback gasPrice: 50 gwei");
  }

  // Estimate gas
  let gasUnits: bigint;
  try {
    gasUnits = await contract.depositNative.estimateGas(commitmentHex, { value: depositAmount });
    console.log("Estimated gas units:", gasUnits.toString());
  } catch (e) {
    console.log("estimateGas FAILED:", e);
    gasUnits = 50000n;
    console.log("Using default gas: 50000");
  }

  const totalCost = gasUnits * gasPriceWei;
  const costEth = Number(ethers.formatEther(totalCost));
  console.log(`Total cost: ${costEth.toFixed(6)} ETH/DOT`);
  console.log(`Formatted: ${costEth} DOT`);
}

async function main() {
  const amounts = ["0.5", "1", "10", "100", "1000", "10000"];

  for (const amount of amounts) {
    await testGasEstimate(amount);
  }
}

main().catch(console.error);