/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * "Send $TOKEN Privately" headline used by the "Fresh" theme. The token ticker
 * holds on each asset for ~2.5s, then scrolls to the next one.
 */

import { useEffect, useState } from "react";

const TICKERS = [
  "$KSM",
  "$DOT",
  "$USDT",
  "$USDC",
  "$ETH",
  "$BTC",
  "$LTC",
  "$SOL",
  "$SUI",
  "$XMR",
  "$ADA",
  "$BNB",
];

const ITEM_HEIGHT = 34;
const HOLD_MS = 3000;
const SCROLL_MS = 500;

export default function TokenFlow() {
  // Duplicate the first ticker at the end so the reel loops seamlessly.
  const reel = [...TICKERS, TICKERS[0]];
  const [index, setIndex] = useState(0);
  const [noTransition, setNoTransition] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => i + 1), HOLD_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (index === TICKERS.length) {
      // Reached the duplicated first ticker — jump back after the scroll.
      const t = setTimeout(() => {
        setNoTransition(true);
        setIndex(0);
      }, SCROLL_MS);
      return () => clearTimeout(t);
    }
    if (noTransition) {
      const t = setTimeout(() => setNoTransition(false), 30);
      return () => clearTimeout(t);
    }
  }, [index, noTransition]);

  return (
    <div className="token-flow" aria-hidden="true">
      <span className="token-flow-text">Send</span>
      <span className="token-flow-window">
        <span
          className="token-flow-reel"
          style={{
            transform: `translateY(-${index * ITEM_HEIGHT}px)`,
            transition: noTransition
              ? "none"
              : `transform ${SCROLL_MS}ms cubic-bezier(0.65, 0, 0.35, 1)`,
          }}
        >
          {reel.map((ticker, i) => (
            <span
              key={i}
              className="token-flow-token"
              style={{
                height: `${ITEM_HEIGHT}px`,
                lineHeight: `${ITEM_HEIGHT}px`,
              }}
            >
              {ticker}
            </span>
          ))}
        </span>
      </span>
      <span className="token-flow-text">Privately</span>
    </div>
  );
}
