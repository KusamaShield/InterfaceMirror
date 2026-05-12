import { useEffect, useRef, memo } from "react";
import { createPortal } from "react-dom";

let flyerId = 0;

const FlyingToasters = memo(function FlyingToasters() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const burndness = ["tstLight", "tstMedium", "tstBurnt"];
    type T = { el: HTMLDivElement; x: number; y: number; type: string };
    const flyers: T[] = [];
    const count = 12;

    for (let i = 0; i < count; i++) {
      const type = Math.random() < 0.4 ? "toaster" : "toast";
      const el = document.createElement("div");
      el.id = `flyer-${flyerId++}`;
      el.className = type === "toaster" ? "toaster tstrColor" : "toast " + burndness[Math.floor(Math.random() * 3)];
      el.style.cssText = "position:absolute;width:64px;height:64px;image-rendering:pixelated;pointer-events:none";
      const x = Math.random() * (window.innerWidth + 200) - 100;
      const y = Math.random() * (window.innerHeight - 100);
      el.style.transform = `translate(${x}px,${y}px)`;
      container.appendChild(el);
      flyers.push({ el, x, y, type });
    }

    let frame = 0;
    let running = true;

    function tick() {
      if (!running) return;
      for (const f of flyers) {
        f.x -= 0.5 + Math.random() * 1.5;
        f.y -= (0.5 + Math.random() * 1.5) * 0.3;
        if (f.x < -80) {
          f.x = window.innerWidth + 20;
          f.y = Math.random() * window.innerHeight * 0.7;
          if (f.type === "toast") {
            f.el.className = "toast " + burndness[Math.floor(Math.random() * 3)];
          }
        }
        f.el.style.transform = `translate(${f.x}px,${f.y}px)`;
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      for (const f of flyers) f.el.remove();
    };
  }, []);

  return createPortal(
    <div ref={containerRef} className="flying-toasters-container" />,
    document.body
  );
});

export default FlyingToasters;
