import { ethers, Network } from "ethers";

const RPC = "https://kusama-rpc.laissez-faire.trade";
const POOL = "0xC86A3B1A2EbBEc8d32949A1E75e3BafE50b5f1D4";
const PROXY_ROOT = "15597763764856769573271430453655495310303872168718285148289767915697128732396";

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, 420420418, { staticNetwork: Network.from(420420418) });
  const pool = new ethers.Contract(POOL, ["function currentRoot() view returns (uint256)"], provider);
  const onChainRoot = await pool.currentRoot();
  console.log("On-chain root:", onChainRoot.toString());
  console.log("Proxy root:   ", PROXY_ROOT);
  console.log("Match:", onChainRoot.toString() === PROXY_ROOT);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
