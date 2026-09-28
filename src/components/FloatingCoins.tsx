/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Decorative "shield the coins" animation used by the "Fresh" theme.
 * Coins drift in from the left, reach the centre encryption line and emerge on
 * the right as ciphertext — inspired by the shield.markets landing page.
 */

import { useMemo } from "react";

const TOKENS = [
  { glyph: "\u20BF", bg: "linear-gradient(135deg, #F7931A, #B36B00)" },
  { glyph: "\u039E", bg: "linear-gradient(135deg, #627EEA, #3C4CB0)" },
  { glyph: "K", bg: "linear-gradient(135deg, #E6007A, #8C0F49)" },
  { glyph: "D", bg: "linear-gradient(135deg, #E6007A, #5A0040)" },
  { glyph: "\u20AE", bg: "linear-gradient(135deg, #26A17B, #0B783E)" },
  { glyph: "S", bg: "linear-gradient(135deg, #9945FF, #14F195)" },
  { glyph: "\u25C6", bg: "linear-gradient(135deg, #8440F2, #4C82FB)" },
];

const HEX = "0123456789ABCDEF";

function randomCipher(): string {
  const len = 8 + Math.floor(Math.random() * 8);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += HEX.charAt(Math.floor(Math.random() * HEX.length));
  }
  return out;
}

interface FloatingCoinsProps {
  count?: number;
}

export default function FloatingCoins({ count = 8 }: FloatingCoinsProps) {
  const coins = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const duration = 20 + Math.random() * 18;
        const delay = -Math.random() * 34;
        return {
          token: TOKENS[i % TOKENS.length],
          top: Math.random() * 86,
          size: 34 + Math.random() * 30,
          duration,
          delay,
          cipher: randomCipher(),
          // cipher appears when the coin reaches the centre (half-way through)
          cipherDelay: delay + duration / 2,
        };
      }),
    [count],
  );

  const particles = useMemo(
    () =>
      Array.from({ length: 22 }, () => ({
        top: Math.random() * 100,
        size: 2 + Math.random() * 3,
        duration: 14 + Math.random() * 18,
        delay: -Math.random() * 24,
      })),
    [],
  );

  return (
    <div className="fresh-coins" aria-hidden="true">
      {/* centre encryption line + shield */}
      <span className="fresh-encryption-line" />
      <span className="fresh-shield">{"\uD83D\uDEE1\uFE0F"}</span>

      {particles.map((p, i) => (
        <span
          key={`p${i}`}
          className="fresh-particle"
          style={{
            top: `${p.top}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}

      {coins.map((c, i) => (
        <span key={`pair${i}`}>
          <span
            className="fresh-coin"
            style={{
              top: `${c.top}%`,
              width: `${c.size}px`,
              height: `${c.size}px`,
              background: c.token.bg,
              fontSize: `${c.size * 0.45}px`,
              animationDuration: `${c.duration}s`,
              animationDelay: `${c.delay}s`,
            }}
          >
            {c.token.glyph}
          </span>
          <span
            className="fresh-cipher"
            style={{
              top: `${c.top + 1}%`,
              animationDuration: `${c.duration}s`,
              animationDelay: `${c.cipherDelay}s`,
            }}
          >
            {c.cipher}
          </span>
        </span>
      ))}
    </div>
  );
}
