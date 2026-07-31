import { ethers } from 'ethers';

describe('Gas Estimation Utils', () => {
  const TEST_PRIVATE_KEY = '0x' + '11'.repeat(32);
  const TEST_ADDRESS = '0x13594E535099Aef344807fa8fE7aABe2a371b383';
  
  describe('parseEther', () => {
    it('should parse DOT amount to wei correctly', () => {
      const amount = '1.5';
      const wei = ethers.parseEther(amount);
      expect(wei).toBe(1500000000000000000n);
    });

    it('should parse 0.1 DOT correctly', () => {
      const amount = '0.1';
      const wei = ethers.parseEther(amount);
      expect(wei).toBe(100000000000000000n);
    });

    it('should handle large amounts', () => {
      const amount = '100';
      const wei = ethers.parseEther(amount);
      expect(wei).toBe(100000000000000000000n);
    });
  });

  describe('calculateFee', () => {
    const calculateFee = (gasUnits: bigint, gasPrice: bigint): number => {
      return Number(gasUnits * gasPrice) / 1e18;
    };

    it('should calculate fee correctly at 1 gwei', () => {
      const gasUnits = 150000n;
      const gasPrice = 1000000000000n; // 1 gwei
      const fee = calculateFee(gasUnits, gasPrice);
      expect(fee).toBe(0.00015);
    });

    it('should calculate fee correctly at 50 gwei', () => {
      const gasUnits = 150000n;
      const gasPrice = 50000000000n; // 50 gwei
      const fee = calculateFee(gasUnits, gasPrice);
      expect(fee).toBe(0.0075);
    });

    it('should handle 0 gas price', () => {
      const gasUnits = 150000n;
      const gasPrice = 0n;
      const fee = calculateFee(gasUnits, gasPrice);
      expect(fee).toBe(0);
    });
  });

  describe('isEvmAddress validation', () => {
    const isEvmAddress = (address: string): boolean => {
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    };

    it('should validate correct EVM address', () => {
      expect(isEvmAddress(TEST_ADDRESS)).toBe(true);
    });

    it('should reject address without 0x prefix', () => {
      expect(isEvmAddress('13594E535099Aef344807fa8fE7aABe2a371b383')).toBe(false);
    });

    it('should reject address that is too short', () => {
      expect(isEvmAddress('0x13594E535099Aef344807fa8fE7aABe2a371b3')).toBe(false);
    });

    it('should reject address that is too long', () => {
      expect(isEvmAddress('0x13594E535099Aef344807fa8fE7aABe2a371b38300')).toBe(false);
    });

    it('should reject address with invalid characters', () => {
      expect(isEvmAddress('0x13594E535099Aef344807fa8fE7aABe2a371bzzz')).toBe(false);
    });
  });

  describe('commitment generation', () => {
    const generateCommitment = (secret: Uint8Array): string => {
      return ethers.keccak256(secret);
    };

    it('should generate valid commitment from secret', () => {
      const secret = new Uint8Array(32);
      secret.fill(0x42);
      const commitment = generateCommitment(secret);
      expect(commitment).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should generate different commitments for different secrets', () => {
      const secret1 = new Uint8Array(32);
      const secret2 = new Uint8Array(32);
      secret2.fill(0xFF);
      
      const commitment1 = generateCommitment(secret1);
      const commitment2 = generateCommitment(secret2);
      
      expect(commitment1).not.toBe(commitment2);
    });
  });

  describe('note generation', () => {
    const secretToNote = (secret: Uint8Array): string => {
      return Array.from(secret).map(b => b.toString(16).padStart(2, '0')).join('');
    };

    it('should convert secret bytes to hex string', () => {
      const secret = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
      const note = secretToNote(secret);
      expect(note).toBe('12345678');
    });

    it('should handle 32-byte secret', () => {
      const secret = new Uint8Array(32);
      secret.fill(0xAB);
      const note = secretToNote(secret);
      expect(note.length).toBe(64);
      expect(note).toBe('ab'.repeat(32));
    });
  });
});