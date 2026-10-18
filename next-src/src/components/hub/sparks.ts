// A small canvas particle system for the trends chart: bursts when a new leader arrives or one
// group overtakes another, and a faint trail behind each moving line head.

interface Particle {
  x: number; y: number; vx: number; vy: number;
  born: number; life: number; color: string;
  kind: 'shard' | 'dot'; size: number; spin: number; angle: number; alpha: number;
}

export class Sparks {
  private parts: Particle[] = [];
  private raf = 0;
  private ctx: CanvasRenderingContext2D | null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
  }

  /** Resolve a CSS colour such as var(--s1) against the canvas's own styles. */
  color(value: string): string {
    const match = /^var\((--[\w-]+)\)$/.exec(value);
    return match ? getComputedStyle(this.canvas).getPropertyValue(match[1]).trim() || '#888' : value;
  }

  resize(width: number, height: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Shards and sparks flying out from a point; `power` scales count and speed. */
  burst(x: number, y: number, colors: string[], power = 1) {
    const now = performance.now();
    const n = Math.round(14 * power);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = (0.05 + Math.random() * 0.16) * (0.7 + power * 0.3);
      this.parts.push({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 0.04,
        born: now, life: 650 + Math.random() * 600, color: this.color(colors[i % colors.length]),
        kind: i % 3 === 0 ? 'dot' : 'shard', size: i % 3 === 0 ? 1.2 + Math.random() * 1.4 : 3 + Math.random() * 5,
        spin: (Math.random() - 0.5) * 0.02, angle: a, alpha: 0.95,
      });
    }
    this.start();
  }

  /** A label breaking apart: particles spread along a horizontal span, drifting outward. */
  shred(x0: number, x1: number, y: number, color: string) {
    const now = performance.now(), c = this.color(color);
    for (let i = 0; i < 26; i++) {
      const x = x0 + Math.random() * (x1 - x0);
      this.parts.push({
        x, y: y + (Math.random() - 0.5) * 18, vx: 0.02 + Math.random() * 0.07, vy: (Math.random() - 0.5) * 0.09,
        born: now, life: 500 + Math.random() * 500, color: c,
        kind: i % 2 ? 'dot' : 'shard', size: i % 2 ? 0.9 + Math.random() : 2 + Math.random() * 3,
        spin: (Math.random() - 0.5) * 0.03, angle: Math.random() * Math.PI, alpha: 0.85,
      });
    }
    this.start();
  }

  /** One faint spark drifting back from a moving line head. */
  trail(x: number, y: number, color: string) {
    this.parts.push({
      x, y, vx: -0.015 - Math.random() * 0.04, vy: (Math.random() - 0.5) * 0.035,
      born: performance.now(), life: 700 + Math.random() * 600, color: this.color(color),
      kind: 'dot', size: 0.8 + Math.random() * 1.1, spin: 0, angle: 0, alpha: 0.55,
    });
    this.start();
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.parts = [];
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private start() {
    if (!this.raf) {
      let last = performance.now();
      const frame = (now: number) => {
        this.step(now, Math.min(40, now - last));
        last = now;
        this.raf = this.parts.length ? requestAnimationFrame(frame) : 0;
      };
      this.raf = requestAnimationFrame(frame);
    }
  }

  private step(now: number, dt: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.parts = this.parts.filter(p => now - p.born < p.life);
    for (const p of this.parts) {
      p.vy += 0.00022 * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      const fade = 1 - (now - p.born) / p.life;
      ctx.globalAlpha = p.alpha * fade * fade;
      ctx.strokeStyle = ctx.fillStyle = p.color;
      if (p.kind === 'dot') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const dx = Math.cos(p.angle) * p.size, dy = Math.sin(p.angle) * p.size;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x - dx / 2, p.y - dy / 2);
        ctx.lineTo(p.x + dx / 2, p.y + dy / 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}
