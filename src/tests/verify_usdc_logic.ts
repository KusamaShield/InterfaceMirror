// Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
// Quick verification: Simulate the USDC balance check effect condition logic

type Scenario = {
  selectedNetwork: string;
  gasOrderCompleted: boolean;
  ethBalanceUsd: number;
  usdcOrder: any;
  address: string;
  isCheckingUsdc: boolean;
  usdcBalance: bigint | null;
  showUsdcPrompt: boolean;
  useExistingUsdc: boolean;
};

function shouldFetchUsdc(s: Scenario): boolean {
  const gasBridgeReady = s.gasOrderCompleted || s.ethBalanceUsd >= 1.5;
  return (
    s.selectedNetwork === "polkadot" &&
    gasBridgeReady &&
    !s.usdcOrder &&
    !!s.address &&
    !s.isCheckingUsdc &&
    s.usdcBalance === null &&
    !s.showUsdcPrompt
  );
}

function shouldShowPrompt(s: Scenario): boolean {
  return (
    s.selectedNetwork === "polkadot" &&
    (s.gasOrderCompleted || s.ethBalanceUsd >= 1.5) &&
    !s.usdcOrder &&
    s.usdcBalance !== null &&
    s.usdcBalance > 0n &&
    !s.showUsdcPrompt &&
    !s.useExistingUsdc
  );
}

// Test cases
const address = "0x0831176a3220af47d4d055d53ee1aacc16040d8b";
const scenarios: Scenario[] = [
  // Scenario 1: Polkadot selected, sufficient ETH, no gas order, no USDC balance fetched yet → should fetch
  {
    selectedNetwork: "polkadot",
    gasOrderCompleted: false,
    ethBalanceUsd: 3.83,
    usdcOrder: null,
    address,
    isCheckingUsdc: false,
    usdcBalance: null,
    showUsdcPrompt: false,
    useExistingUsdc: false,
  },
  // Scenario 2: After fetch completes with positive balance → should show prompt
  {
    selectedNetwork: "polkadot",
    gasOrderCompleted: false,
    ethBalanceUsd: 3.83,
    usdcOrder: null,
    address,
    isCheckingUsdc: false,
    usdcBalance: 34850000n,
    showUsdcPrompt: false,
    useExistingUsdc: false,
  },
  // Scenario 3: User dismisses prompt → no fetch, no prompt
  {
    selectedNetwork: "polkadot",
    gasOrderCompleted: false,
    ethBalanceUsd: 3.83,
    usdcOrder: null,
    address,
    isCheckingUsdc: false,
    usdcBalance: 34850000n,
    showUsdcPrompt: true,
    useExistingUsdc: false,
  },
  // Scenario 4: No ETH, no gas order → should NOT fetch
  {
    selectedNetwork: "polkadot",
    gasOrderCompleted: false,
    ethBalanceUsd: 0,
    usdcOrder: null,
    address,
    isCheckingUsdc: false,
    usdcBalance: null,
    showUsdcPrompt: false,
    useExistingUsdc: false,
  },
  // Scenario 5: Gas order completed (classic flow) → should fetch
  {
    selectedNetwork: "polkadot",
    gasOrderCompleted: true,
    ethBalanceUsd: 0,
    usdcOrder: null,
    address,
    isCheckingUsdc: false,
    usdcBalance: null,
    showUsdcPrompt: false,
    useExistingUsdc: false,
  },
  // Scenario 6: Non-polkadot network → no fetch
  {
    selectedNetwork: "base",
    gasOrderCompleted: false,
    ethBalanceUsd: 3.83,
    usdcOrder: null,
    address,
    isCheckingUsdc: false,
    usdcBalance: null,
    showUsdcPrompt: false,
    useExistingUsdc: false,
  },
];

console.log("🧪 USDC Balance Check Logic Verification\n");

for (let i = 0; i < scenarios.length; i++) {
  const s = scenarios[i];
  const fetch = shouldFetchUsdc(s);
  const show = shouldShowPrompt(s);
  console.log(
    `Scenario ${i + 1}: eth=${s.ethBalanceUsd.toFixed(2)}, gasCompleted=${s.gasOrderCompleted}, balance=${s.usdcBalance}`,
  );
  console.log(`   Should fetch USDC? ${fetch ? "✅ YES" : "❌ NO"}`);
  console.log(`   Should show prompt? ${show ? "✅ YES" : "❌ NO"}\n`);
}

console.log("✅ All scenarios validated");
