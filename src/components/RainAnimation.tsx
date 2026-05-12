import { useEffect, useRef, memo } from "react";
import { createPortal } from "react-dom";

interface RainModeProps {
  particleCount: number;
  particleSize: number;
  fallingSpeed: number;
  uploadedImage: string | null;
}

const RainAnimation = memo(function RainAnimation({ particleCount, particleSize, fallingSpeed, uploadedImage }: RainModeProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const particles: HTMLDivElement[] = [];
    const img = uploadedImage || "/toolbox.png";

    for (let i = 0; i < particleCount; i++) {
      const el = document.createElement("div");
      el.className = "rain-particle";
      el.style.width = particleSize + "px";
      el.style.height = particleSize + "px";
      el.style.left = Math.random() * 100 + "%";
      el.style.top = "-" + (Math.random() * 100 + 50) + "px";
      el.style.backgroundImage = `url(${img})`;
      el.style.filter = `hue-rotate(${Math.random() * 360}deg) brightness(${0.7 + Math.random() * 0.5})`;
      el.style.opacity = String(0.3 + Math.random() * 0.7);
      el.style.animation = `fall ${3 / fallingSpeed + Math.random() * 2}s linear infinite`;
      el.style.animationDelay = Math.random() * 5 + "s";
      container.appendChild(el);
      particles.push(el);
    }

    return () => {
      particles.forEach((p) => p.remove());
    };
  }, [particleCount, particleSize, fallingSpeed, uploadedImage]);

  return createPortal(
    <div ref={containerRef} className="rain-container" />,
    document.body
  );
});

export default RainAnimation;
