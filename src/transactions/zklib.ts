import { ethers } from "ethers";
import * as snarkjs from "snarkjs";
import { poseidon2, poseidon3 } from "poseidon-lite";
// types/zkp.ts
export interface ZKProof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: string;
  curve: string;
}

export interface FormattedProof {
  a: string[];
  b: string[][];
  c: string[];
}

export interface DepositInfo {
  secret: string;
  asset: string;
  amount: bigint;
  commitment: string;
  nullifier: string;
}

export interface ZKProofResult {
  proof: ZKProof;
  publicSignals: string[];
}

export interface DepositPayload {
  asset: string;
  amount: bigint;
  commitment: string;
}

export interface WithdrawalPayload {
  a: string[];
  b: string[][];
  c: string[];
  publicSignals: string[];
  asset?: string; // For asset-specific withdrawals
}

export class ZKPService {
  private deposits: Map<string, DepositInfo> = new Map();

  constructor() {
    // poseidon-lite doesn't need initialization
  }

  // Generate commitment for deposit
  generateCommitment(secret: string, asset: string, amount: bigint): string {
    const secretBN = BigInt(secret);
    const assetBN = asset === ethers.ZeroAddress ? 0n : BigInt(asset);
    const amountBN = BigInt(amount);
    
    const hash = poseidon3([secretBN, assetBN, amountBN]);
    return hash.toString();
  }

  // Generate nullifier
  generateNullifier(secret: string): string {
    const secretBN = BigInt(secret);
    const hash = poseidon2([secretBN, 1n]);
    return hash.toString();
  }

  toBytes32(value: string): string {
    return ethers.zeroPadValue(ethers.toBeHex(BigInt(value)), 32);
  }

  // Generate deposit payload
  generateDepositPayload(secret: string, asset: string, amount: bigint): DepositPayload {
    const commitment = this.generateCommitment(secret, asset, amount);
    const commitmentBytes32 = this.toBytes32(commitment);

    // Store deposit info for later withdrawal
    this.deposits.set(commitment, {
      secret,
      asset,
      amount,
      commitment,
      nullifier: this.generateNullifier(secret)
    });

    return {
      asset,
      amount,
      commitment: commitmentBytes32
    };
  }

  // Generate ZK proof for withdrawal
  async generateZKProof(
    secret: string,
    asset: string,
    amount: bigint,
    recipient: string,
    circuitWasmPath: string,
    circuitZkeyPath: string
  ): Promise<ZKProofResult> {
    const input = {
      secret: secret.toString(),
      asset: asset === ethers.ZeroAddress ? "0" : BigInt(asset).toString(),
      amount: amount.toString(),
      leafIndex: "0",
      siblings: Array(256).fill("0"),
      recipient: BigInt(recipient).toString()
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      circuitWasmPath,
      circuitZkeyPath
    );

    return { proof, publicSignals };
  }

  // Format proof for Solidity
  formatProofForSolidity(proof: any): FormattedProof {
    return {
      a: [proof.pi_a[0], proof.pi_a[1]],
      b: [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
      c: [proof.pi_c[0], proof.pi_c[1]]
    };
  }

  // Generate withdrawal payload
  async generateWithdrawalPayload(
    commitment: string,
    recipient: string,
    circuitWasmPath: string,
    circuitZkeyPath: string,
    asset?: string
  ): Promise<WithdrawalPayload> {
    const depositInfo = this.deposits.get(commitment);
    if (!depositInfo) {
      throw new Error("Deposit info not found for commitment");
    }

    const { proof, publicSignals } = await this.generateZKProof(
      depositInfo.secret,
      depositInfo.asset,
      depositInfo.amount,
      recipient,
      circuitWasmPath,
      circuitZkeyPath
    );

    const formattedProof = this.formatProofForSolidity(proof);

    const payload: WithdrawalPayload = {
      a: formattedProof.a,
      b: formattedProof.b,
      c: formattedProof.c,
      publicSignals
    };

    if (asset) {
      payload.asset = asset;
    }

    return payload;
  }

  // Generate random secret
  generateRandomSecret(): string {
    return ethers.toBigInt(ethers.randomBytes(32)).toString();
  }

  // Get deposit info by commitment
  getDepositInfo(commitment: string): DepositInfo | undefined {
    return this.deposits.get(commitment);
  }

  // Clear all deposits (for testing/reset)
  clearDeposits(): void {
    this.deposits.clear();
  }
}