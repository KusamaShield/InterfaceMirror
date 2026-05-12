import { useEffect, useRef, memo } from "react";
import { createPortal } from "react-dom";

const FlameAnimation = memo(function FlameAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const elements: HTMLElement[] = [];

    const flameColors = ["#ff4500", "#ff6347", "#ff8c00", "#ffd700", "#ff6600", "#ff3300"];

    for (let i = 0; i < 30; i++) {
      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.bottom = Math.random() * 20 + "%";
      el.style.left = Math.random() * 100 + "%";
      el.style.width = Math.random() * 40 + 10 + "px";
      el.style.height = Math.random() * 60 + 20 + "px";
      el.style.borderRadius = "50% 50% 50% 50% / 60% 60% 40% 40%";
      el.style.background = `radial-gradient(ellipse at center, ${flameColors[Math.floor(Math.random() * flameColors.length)]}, transparent)`;
      el.style.animation = `flicker ${1 + Math.random() * 2}s ease-in-out infinite`;
      el.style.animationDelay = Math.random() * 2 + "s";
      el.style.pointerEvents = "none";
      container.appendChild(el);
      elements.push(el);
    }

    for (let i = 0; i < 20; i++) {
      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.bottom = Math.random() * 30 + "%";
      el.style.left = Math.random() * 100 + "%";
      el.style.width = "4px";
      el.style.height = "4px";
      el.style.borderRadius = "50%";
      el.style.background = `rgba(255, ${150 + Math.floor(Math.random() * 100)}, 0, ${0.6 + Math.random() * 0.4})`;
      el.style.animation = `ember-rise ${2 + Math.random() * 3}s ease-out infinite`;
      el.style.animationDelay = Math.random() * 3 + "s";
      el.style.pointerEvents = "none";
      el.style.boxShadow = "0 0 6px rgba(255, 100, 0, 0.8)";
      container.appendChild(el);
      elements.push(el);
    }

    return () => {
      elements.forEach((e) => e.remove());
    };
  }, []);

  return createPortal(
    <div ref={containerRef} className="flame-container" />,
    document.body
  );
});

export default FlameAnimation;
