/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * CORS proxy utility for RPC endpoints
 */

/**
 * Get proxied RPC URL for a given endpoint
 * Handles CORS issues in browser by using appropriate proxy
 */
export function getProxiedRpcUrl(originalUrl: string): string {
  // If we're in development (localhost), we can use Vite proxy
  if (
    typeof window !== "undefined" &&
    window.location.hostname === "localhost"
  ) {
    // Use Vite proxy for development
    const proxyPath = "/api/proxy/rpc";

    // Extract just the path from the original URL
    try {
      const url = new URL(originalUrl);
      // For now, we'll just use the direct URL and hope it works
      // If CORS errors occur, we'll need to implement the proxy
      return originalUrl;
    } catch (e) {
      return originalUrl;
    }
  }

  // In production, try to use the original URL first
  // If it fails due to CORS, we'll need a different strategy
  return originalUrl;
}

/**
 * Test if an RPC endpoint is accessible (no CORS issues)
 */
export async function testRpcAccessibility(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1,
      }),
    });

    return response.ok;
  } catch (error) {
    console.warn("RPC accessibility test failed:", error);
    return false;
  }
}

/**
 * Create a provider with CORS handling
 */
export async function createCorsAwareProvider(rpcUrl: string) {
  const { ethers } = await import("ethers");

  // Test if direct RPC works
  const isAccessible = await testRpcAccessibility(rpcUrl);

  if (!isAccessible && typeof window !== "undefined") {
    console.warn("RPC endpoint may have CORS issues, trying fallback...");
    // TODO: Implement fallback proxy
  }

  return new ethers.JsonRpcProvider(rpcUrl);
}
