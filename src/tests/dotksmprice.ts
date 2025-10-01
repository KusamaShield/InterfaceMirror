import { ApiPromise, WsProvider } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";

// RPC endpoint for Polkadot Asset Hub
const POLKADOT_RPC = "wss://polkadot-asset-hub-rpc.polkadot.io/";

async function getApi(ws: string) {
  const wsProvider = new WsProvider(ws);
  const api = await ApiPromise.create({
    provider: wsProvider,
    noInitWarn: true,
  });
  return api;
}

// Get DOT to KSM exchange rate
async function getDotToKsmRate() {
  console.log("Starting DOT to KSM exchange rate query...");

  try {
    const api = await getApi(POLKADOT_RPC);
    await api.isReady;
    console.log("✅ Connected to Polkadot Asset Hub");

    // First, let's check available pools
    console.log("\n📊 Checking available liquidity pools...");
    const pools = await api.query.assetConversion.pools.entries();

    console.log(`Found ${pools.length} pools total`);

    // Display first few pools for reference
    pools.slice(0, 5).forEach(([key, value], index) => {
      const poolKey = key.args[0].toString();
      const poolValue = value.toString();
      console.log(`${index + 1}. Pool key: ${poolKey.substring(0, 100)}...`);
      console.log(`   Value: ${poolValue}`);
    });

    // DOT MultiLocation (on Polkadot Asset Hub) - using same format as ksm.ts
    const dotMultiLocation = api
      .createType("StagingXcmV4Location", {
        parents: 1, // DOT is parent native chain token
        interior: {
          here: null,
        },
      })
      .toU8a();

    // KSM MultiLocation (as foreign asset from Kusama) - using exact format from ksm.ts
    const ksmMultiLocation = api
      .createType("StagingXcmV4Location", {
        parents: 2, // KSM comes from Kusama (different consensus)
        interior: {
          X1: [{ GlobalConsensus: "Kusama" }],
        },
      })
      .toU8a();

    console.log("\n📍 MultiLocations created:");
    console.log(
      "DOT:",
      api
        .createType("StagingXcmV4Location", {
          parents: 1,
          interior: { here: null },
        })
        .toHuman(),
    );
    console.log(
      "KSM:",
      api
        .createType("StagingXcmV4Location", {
          parents: 2,
          interior: { X1: [{ GlobalConsensus: "Kusama" }] },
        })
        .toHuman(),
    );

    // Try to get price for 1 DOT to KSM (1 DOT = 10^10 Planck)
    const amount = api.createType("u128", 10000000000).toU8a();
    const bool = api.createType("bool", false).toU8a();

    // Concatenate Uint8Arrays
    const encodedInput = new Uint8Array(
      dotMultiLocation.length +
        ksmMultiLocation.length +
        amount.length +
        bool.length,
    );
    encodedInput.set(dotMultiLocation, 0);
    encodedInput.set(ksmMultiLocation, dotMultiLocation.length);
    encodedInput.set(amount, dotMultiLocation.length + ksmMultiLocation.length);
    encodedInput.set(
      bool,
      dotMultiLocation.length + ksmMultiLocation.length + amount.length,
    );

    const encodedInputHex = u8aToHex(encodedInput);

    console.log("\n💱 Querying price for 1 DOT to KSM...");

    try {
      // Try exact tokens for tokens
      const response = await api.rpc.state.call(
        "AssetConversionApi_quote_price_exact_tokens_for_tokens",
        encodedInputHex,
      );
      const decodedPrice = api.createType("Option<u128>", response);

      if (decodedPrice.isSome) {
        const price = decodedPrice.unwrap();
        const ksmAmount = Number(price) / 1000000000000; // Convert Planck to KSM
        console.log(`✅ Exchange Rate: 1 DOT = ${price.toString()} KSM Planck`);
        console.log(`✅ Exchange Rate: 1 DOT = ${ksmAmount.toFixed(6)} KSM`);

        // Also show the reverse rate
        if (ksmAmount > 0) {
          const reverseRate = 1 / ksmAmount;
          console.log(
            `✅ Exchange Rate: 1 KSM = ${reverseRate.toFixed(6)} DOT`,
          );
        }
      } else {
        console.log("❌ No direct DOT→KSM pool found");
        console.log(
          "\n💡 Note: DOT and KSM are native tokens on different chains.",
        );
        console.log(
          "   Cross-chain swaps require XCM transfers between Polkadot and Kusama.",
        );
        console.log(
          "   This UI supports swaps within the same chain (Asset Hub assets).",
        );
      }
    } catch (error: any) {
      console.log("❌ Error querying direct price:", error.message);
      console.log(
        "\n💡 This is expected - DOT and KSM are on different parachains.",
      );
      console.log("   Cross-chain swaps require XCM integration.");

      // Try alternative approach - check for assets that might be available
      await checkAvailableAssets(api);
    }

    await api.disconnect();
    console.log("\n🔌 Disconnected from Polkadot Asset Hub");
  } catch (error: any) {
    console.error("❌ Error:", error.message);
  }
}

// Check what assets are available for swapping
async function checkAvailableAssets(api: ApiPromise) {
  console.log("\n🔍 Checking available assets on Polkadot Asset Hub...");

  // Look for assets that might have pools with DOT
  const pools = await api.query.assetConversion.pools.entries();

  const dotPools = pools.filter(([key, value]) => {
    const poolKey = key.args[0].toString();
    return poolKey.includes('"parents":1') && poolKey.includes('"here":null');
  });

  if (dotPools.length > 0) {
    console.log(`Found ${dotPools.length} pools involving DOT:`);
    dotPools.slice(0, 5).forEach(([key, value], index) => {
      const poolKey = key.args[0].toString();
      console.log(`${index + 1}. ${poolKey}`);
    });
  }

  console.log("\n💡 Available swap pairs on Polkadot Asset Hub:");
  console.log("   - DOT ↔ Various assets (USDT, USDC, etc.)");
  console.log("   - For KSM swaps, use Kusama Asset Hub instead");
  console.log("   - Cross-chain DOT↔KSM requires XCM bridge");
}

// Run the main function
console.log("🚀 DOT to KSM Exchange Rate Query");
console.log("==================================");
getDotToKsmRate().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
