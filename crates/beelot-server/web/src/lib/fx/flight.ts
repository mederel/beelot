// The flights of the table: a packet of card backs from the dealer to a seat, and the offsets cards travel. Everything is
// the Web Animations API on elements made for the flight and removed after it, so nothing waits on CSS classes, and the
// content security policy (no inline style) is kept: positions are set through the CSSOM.
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const centre = (box: Box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });

export function boxOf(element: Element | null | undefined): Box | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return rect.width || rect.height ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
}

// Flies `size` card backs from `from` to `to` inside `layer` (a fixed, full-screen element), and resolves when they land.
export function flyPacket(layer: HTMLElement, from: Box, to: Box, size: number, duration: number, cardWidth: number): Promise<void> {
  const packet = document.createElement("div");
  packet.className = "deal-packet";
  packet.style.setProperty("--cw", `${cardWidth}px`);
  for (let card = 0; card < size; card += 1) {
    const back = document.createElement("i");
    back.className = "deal-back";
    back.style.setProperty("--n", String(card));
    packet.append(back);
  }
  layer.append(packet);
  const start = centre(from);
  const end = centre(to);
  const half = cardWidth / 2;
  const place = (x: number, y: number, scale: number, rotate: number) => `translate(${x - half}px, ${y - half * 1.4}px) rotate(${rotate}deg) scale(${scale})`;
  const spin = (Math.random() - 0.5) * 50;
  const lift = Math.min(80, Math.hypot(end.x - start.x, end.y - start.y) * 0.18);
  const flight = packet.animate(
    [
      { transform: place(start.x, start.y, 0.55, 0), opacity: 0 },
      { transform: place((start.x + end.x) / 2, (start.y + end.y) / 2 - lift, 0.8, spin), opacity: 1, offset: 0.5 },
      { transform: place(end.x, end.y, 0.62, spin * 0.2), opacity: 1, offset: 0.88 },
      { transform: place(end.x, end.y, 0.5, 0), opacity: 0 }
    ],
    { duration, easing: "cubic-bezier(.25,.7,.3,1)", fill: "forwards" }
  );
  return flight.finished.then(
    () => packet.remove(),
    () => packet.remove()
  );
}

export const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
