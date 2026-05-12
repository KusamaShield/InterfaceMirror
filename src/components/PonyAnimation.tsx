import { useEffect, useRef, memo } from "react";
import { createPortal } from "react-dom";

const PONY_SPRITES: [string, string][] = [
["aloe","stand_aloe_left.gif"],
["apple bloom","stand_left.gif"],
["applejack","stand_aj_right.gif"],
["applejack (filly)","stand_left.gif"],
["berry punch","stand_berry_right.gif"],
["braeburn","stand_left.gif"],
["caesar","stand_left.gif"],
["changeling","stand_pinkiepie_left.gif"],
["cheerilee","stand_cheerilee_left.gif"],
["cheerilee (80s)","stand_80s_cherilee_left.gif"],
["cloudchaser","stand_cloudchaser_right.gif"],
["coco pommel","stand_coco_left.gif"],
["davenport","stand_left.gif"],
["diamond mint","stand_left.gif"],
["diamond tiara","stand_left.gif"],
["doctor whooves","stand_left.gif"],
["doctor whooves (fan character)","stand_left.gif"],
["fluttershy","stand_fluttershy_left.gif"],
["gummy","stand_gummy_right.gif"],
["hoity-toity","stand_left.gif"],
["lotus","stand_lotus_right.gif"],
["mayor mare","stand_left.gif"],
["mysterious mare do well","stand_left.gif"],
["nightmare moon","stand_left.gif"],
["pinkamena diane pie","stand_pinkamena_left.gif"],
["pinkie pie","stand_pinkiepie_left.gif"],
["pipsqueak","stand_left.gif"],
["pokey pierce","stand_left.gif"],
["princess cadance","stand_left.gif"],
["princess cadance (teenager)","stand_left.gif"],
["princess celestia","stand_left.gif"],
["princess celestia (alternate filly)","stand_left.gif"],
["princess celestia (filly)","stand_left.gif"],
["princess luna (filly)","stand_left.gif"],
["princess luna (season 1)","stand_left.gif"],
["rainbow dash","stand_rainbow_right.gif"],
["rainbow dash (filly)","stand_filly_dash_right.gif"],
["rarity","stand_rarity_left.gif"],
["scootaloo","stand_left.gif"],
["sheriff silverstar","stand_left.gif"],
["shining armor","stand_left.gif"],
["silver spoon","stand_left.gif"],
["soigne folio","stand_left.gif"],
["stella","stand_left.gif"],
["surprise","stand_surprise_left.gif"],
["sweetie belle","stand_left.gif"],
["trixie","stand_left.gif"],
["twilight sparkle","stand_twilight_left.gif"],
["zecora","stand_zecora_left.gif"],
];

function ponySrc(name: string, sprite: string): string {
  const enc = name.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/ /g, "%20");
  return `/ponies/ponies/${enc}/${sprite}`;
}

const Ponies = memo(function Ponies() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const shuffled = [...PONY_SPRITES].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 15);

    type Pony = { el: HTMLImageElement; x: number; y: number; dx: number; dy: number; spd: number };
    const ponies: Pony[] = [];

    for (const [name, sprite] of selected) {
      const img = document.createElement("img");
      img.src = ponySrc(name, sprite);
      img.style.cssText = "position:absolute;width:80px;height:80px;image-rendering:pixelated;pointer-events:none";
      const angle = Math.random() * Math.PI * 2;
      const spd = 0.5 + Math.random() * 1.5;
      const x = Math.random() * (window.innerWidth + 200) - 100;
      const y = Math.random() * (window.innerHeight - 100);
      img.style.transform = `translate(${x}px,${y}px)`;
      container.appendChild(img);
      ponies.push({ el: img, x, y, dx: Math.cos(angle), dy: Math.sin(angle), spd });
    }

    let frame = 0;
    function tick() {
      for (const p of ponies) {
        p.x += p.dx * p.spd;
        p.y += p.dy * p.spd;
        const m = 100;
        if (p.x < -m) p.x = window.innerWidth + m;
        else if (p.x > window.innerWidth + m) p.x = -m;
        if (p.y < -m) p.y = window.innerHeight + m;
        else if (p.y > window.innerHeight + m) p.y = -m;
        p.el.style.transform = `translate(${p.x}px,${p.y}px)`;
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      for (const p of ponies) p.el.remove();
    };
  }, []);

  return createPortal(
    <div ref={containerRef} style={{
      position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
      pointerEvents: "none", zIndex: 9997, overflow: "hidden"
    }} />,
    document.body
  );
});

export default Ponies;
