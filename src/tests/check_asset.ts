import { ethers } from "ethers";
import { ApiPromise, WsProvider } from "@polkadot/api";

const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const RPC = "https://polkadot-assethub-rpc.laissez-faire.trade";
const WS = "wss://polkadot-asset-hub-rpc.polkadot.io";

const provider = new ethers.JsonRpcProvider(RPC);
const contract = new ethers.Contract(
  CONTRACT,
  [
    "function getPrecompileAddress(uint256 assetId) external pure returns (address)",
    "function getEscrowBalance(address) external view returns (uint256)",
  ],
  provider
);

async function main() {
  // Get metadata for asset 50000540
  const api = await ApiPromise.create({
    provider: new WsProvider(WS),
    noInitWarn: true,
  });
  const meta = await api.query.assets.metadata(50000540);
  console.log("Asset 50000540 metadata:", JSON.stringify(meta.toJSON(), null, 2));

  // Check balance using the contract's getPrecompileAddress
  const precompile = await contract.getPrecompileAddress(50000540);
  console.log("Precompile address:", precompile);

  const bal = await contract.getEscrowBalance(precompile);
  console.log("Balance:", bal.toString());

  await api.disconnect();
}

main().catch(console.error);