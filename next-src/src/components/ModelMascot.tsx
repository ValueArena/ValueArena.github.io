'use client';

/**
 * Hand-crafted 16x16 pixel-art mascots for each model family, drawn on an
 * integer grid with crispEdges to match ValueArena's 16-bit pixel aesthetic.
 */

interface SpriteSpec {
  palette: Record<string, string>;
  rows: string[];
}

const SPRITES: Record<string, SpriteSpec> = {
  // Anthropic / Claude: terracotta-coral scholar owl
  Anthropic: {
    palette: {
      o: '#3c251c',
      b: '#d98a64',
      l: '#f0b896',
      c: '#f7efe3',
      e: '#1f1916',
      y: '#e8b95b',
    },
    rows: [
      '....oo....oo....',
      '...obbo..obbo...',
      '..obbbbbbbbbbo..',
      '..obcclbbclbbo..',
      '..obcelbbelbbo..',
      '..obcclbbclbbo..',
      '..obbbbyybbbbo..',
      '...obbbbbbbbo...',
      '..obbbllllbbbo..',
      '..obbbllllbbbo..',
      '..obbbllllbbbo..',
      '...obbbbbbbbo...',
      '....obbbbbbo....',
      '....oy....yo....',
      '...oyy....yyo...',
      '................',
    ],
  },
  // OpenAI / GPT: mint-emerald sprout bot
  OpenAI: {
    palette: {
      o: '#1f362c',
      b: '#69b392',
      l: '#a7dbc2',
      c: '#eef7f1',
      e: '#16261f',
      y: '#e8c468',
    },
    rows: [
      '.......oo.......',
      '......oyyo......',
      '.......oo.......',
      '....oooooooo....',
      '...obbbbbbbbo...',
      '..obllllllllbo..',
      '..oblccllcclbo..',
      '..oblcelleclbo..',
      '..obllllllllbo..',
      '..obbbbbbbbbbo..',
      '...obbbccbbbo...',
      '...obbbbbbbbo...',
      '....oobbbboo....',
      '....oo....oo....',
      '...ooo....ooo...',
      '................',
    ],
  },
  // Google / Gemini: sky-blue twin-star spirit
  Google: {
    palette: {
      o: '#1f334a',
      b: '#6fa4dc',
      l: '#b3d4f5',
      c: '#f2f7fc',
      e: '#162333',
      y: '#f0ce74',
    },
    rows: [
      '.......oo.......',
      '......oyyo......',
      '.....oyccyo.....',
      '......oyyo......',
      '....oooooooo....',
      '...obllllllbo...',
      '..obllllllllbo..',
      '..oblccllcclbo..',
      '..oblcelleclbo..',
      '..obllllllllbo..',
      '..obbbbbbbbbbo..',
      '...obbbllbbbo...',
      '....obbbbbbo....',
      '.....oo..oo.....',
      '....oo....oo....',
      '................',
    ],
  },
  // DeepSeek: ocean-indigo pixel whale with water spout
  DeepSeek: {
    palette: {
      o: '#1c2b48',
      b: '#5c8ce0',
      l: '#a5c4f5',
      c: '#eef4fc',
      e: '#141e33',
      w: '#8ecae6',
    },
    rows: [
      '.....w....w.....',
      '....w.w..w.w....',
      '.......ww.......',
      '................',
      '....oooooooo....',
      '..oobbbbbbbbo...',
      '.obbbbbbbbbbbbo.',
      '.obbbllbbbbbbbo.',
      '.obbelbbbbbbbbo.',
      '.obbbbbbbbbbbooo',
      '.obccccccccboobo',
      '..obccccccbbooo.',
      '...oooooooooo...',
      '................',
      '................',
      '................',
    ],
  },
  // Meta / Llama / Muse: periwinkle pixel llama
  Meta: {
    palette: {
      o: '#272c4d',
      b: '#8fa3e0',
      l: '#c4d0f5',
      c: '#f4f6fc',
      e: '#1b1e33',
    },
    rows: [
      '....oo....oo....',
      '....obo..obo....',
      '....obboobbo....',
      '....obllllbo....',
      '....obleelbo....',
      '....obllllbo....',
      '....obccccbo....',
      '....obbbbbbo....',
      '....obbbbbboo...',
      '...obbbbbbbbbo..',
      '...oblllllllbo..',
      '...obbbbbbbbbo..',
      '...obo....obo...',
      '...obo....obo...',
      '...oo......oo...',
      '................',
    ],
  },
  // Kimi / Moonshot: teal-silver moon rabbit
  Kimi: {
    palette: {
      o: '#203836',
      b: '#7eb2ab',
      l: '#bddbd6',
      c: '#f3f8f7',
      e: '#172826',
      y: '#edd07a',
    },
    rows: [
      '....oo....oo....',
      '...obbo..obbo...',
      '...oblo..oblo...',
      '...oblo..oblo...',
      '...obbo..obbo...',
      '..oobbbbbbbboo..',
      '..obllllllllbo..',
      '..oblelllllebo..',
      '..oblllyylllbo..',
      '...obbbbbbbbo...',
      '..obbbccccbbbo..',
      '..obbbccccbbbo..',
      '...obbbbbbbbo...',
      '....oo....oo....',
      '...ooo....ooo...',
      '................',
    ],
  },
  // xAI / Grok: sleek slate astro-visor cat
  xAI: {
    palette: {
      o: '#1f2224',
      b: '#6e7573',
      l: '#aeb5b0',
      v: '#26292c',
      y: '#e8b44c',
    },
    rows: [
      '...oo......oo...',
      '..obbo....obbo..',
      '..obbbboobbbbo..',
      '..obllllllllbo..',
      '..obvvvvvvvvbo..',
      '..obvvyvvvyvbo..',
      '..obvvvvvvvvbo..',
      '..obllllllllbo..',
      '...obbbbbbbbo...',
      '..obbbllllbbbo..',
      '..obbbllllbbbo..',
      '...obbbbbbbbo...',
      '....obbbbbbo....',
      '....oo....oo....',
      '...ooo....ooo...',
      '................',
    ],
  },
  // GLM / Zhipu: sage-slate lantern frog
  GLM: {
    palette: {
      o: '#253136',
      b: '#8499a3',
      l: '#bdcdd4',
      c: '#f0f5f7',
      e: '#182124',
      y: '#e8c468',
    },
    rows: [
      '................',
      '...ooo....ooo...',
      '..obcbo..obcbo..',
      '..obebo..obebo..',
      '..obbbboobbbbo..',
      '.obllllllllllbo.',
      '.obbbbbbbbbbbbo.',
      '.obbccccccccbbo.',
      '.obbccccccccbbo.',
      '..obbbbbbbbbbbo.',
      '..obbllbbllbbbo.',
      '...obbbbbbbbo...',
      '..ooo......ooo..',
      '.oyyo......oyyo.',
      '..oo........oo..',
      '................',
    ],
  },
  // Qwen: lavender wizard bear
  Qwen: {
    palette: {
      o: '#312545',
      b: '#a488c7',
      l: '#d2c2e8',
      c: '#f6f2fa',
      e: '#211830',
      y: '#edd07a',
    },
    rows: [
      '.......oo.......',
      '......obbo......',
      '.....obyybo.....',
      '...oooooooooo...',
      '..obbo....obbo..',
      '..obbbboobbbbo..',
      '..obllllllllbo..',
      '..oblelllllebo..',
      '..oblllcclllbo..',
      '...obbbbbbbbo...',
      '..obbbllllbbbo..',
      '..obbbllllbbbo..',
      '...obbbbbbbbo...',
      '....oo....oo....',
      '...ooo....ooo...',
      '................',
    ],
  },
  // Mistral: golden-amber Le Chat
  Mistral: {
    palette: {
      o: '#422c14',
      b: '#e5b25d',
      l: '#f5d79b',
      c: '#fcf5e6',
      e: '#261a0c',
      s: '#c9783a',
    },
    rows: [
      '...oo......oo...',
      '..obbo....obbo..',
      '..obbsboobsbbo..',
      '..obllllllllbo..',
      '..obllelllelbo..',
      '..oblllcclllbo..',
      '...obbbbbbbbo...',
      '..obbsllllsbbo..',
      '..obbbllllbbbo..',
      '..obbsllllsbbo..',
      '...obbbbbbbbo...',
      '....obbbbbbo....',
      '....oo....oo....',
      '...ooo....ooo...',
      '................',
      '................',
    ],
  },
  // Default / Other: vintage ValueArena pixel CRT buddy
  Other: {
    palette: {
      o: '#29332b',
      b: '#9db09a',
      l: '#ccd9c8',
      v: '#2d3b32',
      y: '#e8c468',
    },
    rows: [
      '................',
      '..oooooooooooo..',
      '.obllllllllllbo.',
      '.oblvvvvvvvvblo.',
      '.oblvvyvvvyvblo.',
      '.oblvvvvvvvvblo.',
      '.oblvvyvvvyvblo.',
      '.oblvvvvvvvvblo.',
      '.obllllllllllbo.',
      '.obbbbbbbbbbbbo.',
      '..oooooooooooo..',
      '....obbbbbbo....',
      '...oooooooooo...',
      '....oo....oo....',
      '................',
      '................',
    ],
  },
};

const MASCOT_ART: Record<string, string> = {
  Anthropic: '/assets/art/mascots/anthropic.webp',
  OpenAI: '/assets/art/mascots/openai.webp',
  Google: '/assets/art/mascots/google.webp',
  DeepSeek: '/assets/art/mascots/deepseek.webp',
  Meta: '/assets/art/mascots/meta.webp',
  Kimi: '/assets/art/mascots/kimi.webp',
  xAI: '/assets/art/mascots/xai.webp',
  GLM: '/assets/art/mascots/glm.webp',
};

export function ModelMascot({ lab, size = 52 }: { lab: string; size?: number }) {
  const src = MASCOT_ART[lab];
  if (src) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        className="arena-mascot"
        src={src}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        decoding="async"
      />
    );
  }
  const spec = SPRITES[lab] ?? SPRITES.Other;
  const rects: { x: number; y: number; fill: string }[] = [];
  spec.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const fill = spec.palette[ch];
      if (fill) rects.push({ x, y, fill });
    }
  });
  return (
    <svg
      className="arena-mascot"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width="1" height="1" fill={r.fill} />
      ))}
    </svg>
  );
}
