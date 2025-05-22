import * as dotenv from 'dotenv'
import { ethers } from 'ethers'
import { ApiPromise, WsProvider } from '@polkadot/api';

import { cryptoWaitReady } from "@polkadot/util-crypto";

// Load environment variables
//dotenv.config()

const providerRPC = {
  moonbase: {
    name: 'moonbase-alpha',
    rpc: 'https://rpc.api.moonbase.moonbeam.network',
    chainId: 1287, // 0x507 in hex,
  },
}

const MOONBEAM_TESTNET_WS = 'wss://moonbase.public.curie.radiumblock.co/ws'


const abi = [
    'function testwithdraw(address asset, uint256 amount) external',
    'function deposit(address asset, uint256 amount, bytes32 commitment) external payable',
    "function testzkverify2(address verifyingKey, bytes32 nullifierhash, bytes proof, uint256[] instances) public view returns (bool)",
    "function testzkverify3(address verifyingKey, bytes32 nullifierhash, bytes proof, uint256[] instances) public returns (bool)",
    "function testzkverify(address verifyingKey, bytes32 nullifierhash, bytes proof, uint256[] instances) public returns (bool)",
  
  ]
  // load config
  const contract_address = "0x14bcbe4380C7759789db1f4f3B936b9D1B86B4e4"
//const verifier_contract = process.env.ZK_VER;
//const halo2artifact = process.env.ZK_KEY;
  
  interface ContractConfig {
    address: string
    abi: string[]
  }
  
  const contractConfig: ContractConfig = {
    address: contract_address,
    abi: abi,
  };
  


  
  export async function gen_tx_no_sig(amount: number, assetid: string, address: string) {
    console.log(`gen_tx_no_sig: `, amount, assetid, address)
    const erc20 = new ethers.Interface([
      'function approve(address,uint256) returns (bool)'
    ]);
    console.log(`erc20`);
  //  const amount = 10000000;
 // const wsProvider = new WsProvider(MOONBEAM_TESTNET_WS);
//  const api = await ApiPromise.create({ provider: wsProvider });
  
  const nonce = 3;//await api.query.system.account(address);
    const approveData = erc20.encodeFunctionData('approve', [
        contract_address,
      amount
    ]);
//  await api.disconnect();
    const approveTx = ethers.Transaction.from({
      to: contract_address,
      data: approveData,
      chainId: providerRPC.moonbase.chainId,
      nonce: nonce,//.toHuman(),
      gasPrice: 210000,
      gasLimit: 1000000n
    });
    console.log(`approveTx return`) ;
    return approveTx;
  }
  


 export async function make_deposit_tx(amount: string, asset: string)  {
    const commitment = "0x1737c785d98e126d3b95062b06473102c0841ffa7881e839f059b68f6beba286";
    const shieldPool = new ethers.Contract(
      contractConfig.address,
      contractConfig.abi
    );
  
    // 3. Create transaction object
    const txData = {
      to: contractConfig.address,
      data: shieldPool.interface.encodeFunctionData('deposit', [
        asset,
        ethers.parseUnits(amount, 18), // Adjust decimals
        commitment
      ]),
    };
    return txData;
  }
  