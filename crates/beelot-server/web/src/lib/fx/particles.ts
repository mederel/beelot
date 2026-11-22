// Bursts of particles for the celebrations (US-090, US-093): honey hexagons, confetti strips and sparks, drawn on one
// canvas that covers the screen while they fly and is removed after. A burst never blocks the game.
export type BurstKind = "confetti" | "large-confetti" | "light-confetti" | "stars" | "sparks";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  colour: string;
  shape: "hex" | "strip" | "spark" | "star";
  life: number;
  max: number;
}

const COLOURS = ["#ffc22e", "#ffe08a", "#ff9f1c", "#a48bff", "#4ff0bd", "#ff8098", "#ffffff"];
const HONEY = ["#ffc22e", "#ffe08a", "#ff9f1c", "#fff0c2"];

let canvas: HTMLCanvasElement | null = null;
let particles: Particle[] = [];
let frame = 0;

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "burst-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.append(canvas);
  }
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * ratio;
  canvas.height = window.innerHeight * ratio;
  const context = canvas.getContext("2d");
  context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}

function hexagon(context: CanvasRenderingContext2D, size: number) {
  context.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i;
    context.lineTo(Math.cos(angle) * size, Math.sin(angle) * size);
  }
  context.closePath();
  context.fill();
}

function star(context: CanvasRenderingContext2D, size: number) {
  context.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 ? size * 0.45 : size;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  context.closePath();
  context.fill();
}

function tick() {
  const context = canvas?.getContext("2d");
  if (!context || !canvas) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter((particle) => particle.life < particle.max);
  for (const particle of particles) {
    particle.life += 1;
    particle.vy += particle.shape === "spark" ? 0.05 : 0.18;
    particle.vx *= 0.985;
    particle.vy *= 0.985;
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.rotation += particle.spin;
    const fade = Math.min(1, (particle.max - particle.life) / 30);
    context.save();
    context.globalAlpha = fade;
    context.translate(particle.x, particle.y);
    context.rotate(particle.rotation);
    context.fillStyle = particle.colour;
    if (particle.shape === "hex") hexagon(context, particle.size);
    else if (particle.shape === "star") star(context, particle.size);
    else if (particle.shape === "spark") {
      context.beginPath();
      context.arc(0, 0, particle.size, 0, Math.PI * 2);
      context.fill();
    } else {
      context.scale(1, Math.cos(particle.life * 0.2));
      context.fillRect(-particle.size, -particle.size * 0.35, particle.size * 2, particle.size * 0.7);
    }
    context.restore();
  }
  if (particles.length) frame = requestAnimationFrame(tick);
  else {
    canvas.remove();
    canvas = null;
    frame = 0;
  }
}

// A burst from (x, y), in screen pixels. The effects level decides elsewhere whether to call it.
export function burst(kind: BurstKind, x = window.innerWidth / 2, y = window.innerHeight * 0.45): void {
  if (!ensureCanvas()) return;
  const counts: Record<BurstKind, number> = { "large-confetti": 160, confetti: 90, "light-confetti": 45, stars: 40, sparks: 28 };
  const count = counts[kind];
  for (let i = 0; i < count; i += 1) {
    const angle = kind === "large-confetti" || kind === "confetti" ? -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1 : Math.random() * Math.PI * 2;
    const speed = (kind === "sparks" ? 3 : kind === "large-confetti" ? 11 : 8) * (0.45 + Math.random() * 0.75);
    const shape: Particle["shape"] = kind === "stars" ? "star" : kind === "sparks" ? "spark" : Math.random() < 0.45 ? "hex" : "strip";
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: shape === "spark" ? 2 + Math.random() * 2.5 : 4 + Math.random() * 5,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      colour: (kind === "sparks" || kind === "stars" ? HONEY : COLOURS)[Math.floor(Math.random() * (kind === "sparks" || kind === "stars" ? HONEY.length : COLOURS.length))],
      shape,
      life: 0,
      max: 70 + Math.random() * 60
    });
  }
  if (!frame) frame = requestAnimationFrame(tick);
}
