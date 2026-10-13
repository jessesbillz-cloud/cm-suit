import type { Config } from 'tailwindcss';

// Design tokens (SPEC §7.1). Status colors are NOT here; they come from src/lib/status.ts.
// Near-white page, white cards with a hairline edge and a deep layered shadow, card headers on a faint tint,
// one accent color. The font is self-hosted IBM Plex Sans (public/fonts, @font-face in src/app/styles.css).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: '#E9EDF2',
        card: { DEFAULT: '#FFFFFF', head: '#F8F9FB' },
        // Readable ink only (Jesse, Oct 5: "you like to hide things and put things in super light lettering"): ink for
        // what matters, ink-2 for a second line, ink-3 for small print. Placeholders and disabled use ink-3 at half.
        ink: { DEFAULT: '#111827', 2: '#374151', 3: '#4B5563' },
        line: { DEFAULT: '#DFE3E9', strong: '#C4CAD3' },
        accent: { DEFAULT: '#2563EB', hover: '#1D4ED8', soft: '#EFF6FF' },
        danger: { DEFAULT: '#DC2626', soft: '#FEF2F2' },
        // The one amber highlight: impact claimed (row, box edge, icon).
        impact: { row: '#FFF7E6', edge: '#F3D7A6', ink: '#B45309' },
        // The tool rail: a dark navy strip down the left, so the white work area reads as the page.
        rail: { DEFAULT: '#0F1A2B', hover: '#1B2A40', active: '#24364F', ink: '#D3DBE6', line: '#22324A' },
      },
      boxShadow: {
        // Deep, layered boxes (Jesse, Oct 4 and Oct 12: "deep shadows and very distinct clickable boxes"): a hairline edge,
        // a contact shadow, a short drop and a long soft lift.
        card: '0 0 0 1px rgba(16,24,40,.10), 0 1px 2px rgba(16,24,40,.10), 0 6px 12px -2px rgba(16,24,40,.14), 0 18px 36px -8px rgba(16,24,40,.28)',
        // A clickable card under the pointer: the same box lifted higher.
        lift: '0 0 0 1px rgba(16,24,40,.14), 0 2px 4px rgba(16,24,40,.12), 0 10px 20px -4px rgba(16,24,40,.18), 0 28px 52px -10px rgba(16,24,40,.38)',
        // A clickable box inside a card (a secondary button, a tile, a chip): its own edge and drop, a lift on hover,
        // pressed in on press.
        tile: '0 1px 2px rgba(16,24,40,.16), 0 4px 8px -2px rgba(16,24,40,.18)',
        'tile-hover': '0 2px 4px rgba(16,24,40,.16), 0 10px 20px -4px rgba(16,24,40,.28)',
        press: 'inset 0 1px 3px rgba(16,24,40,.18)',
        // Menus and toasts float highest.
        pop: '0 0 0 1px rgba(16,24,40,.10), 0 6px 12px -2px rgba(16,24,40,.12), 0 24px 48px -8px rgba(16,24,40,.30)',
        control: '0 1px 2px rgba(16,24,40,.10), 0 2px 4px -1px rgba(16,24,40,.06)',
        primary: 'inset 0 1px 0 rgba(255,255,255,.20), 0 1px 2px rgba(16,24,40,.24), 0 4px 10px -3px rgba(37,99,235,.45)',
        'primary-hover': 'inset 0 1px 0 rgba(255,255,255,.20), 0 2px 4px rgba(16,24,40,.24), 0 8px 18px -4px rgba(37,99,235,.55)',
      },
      borderRadius: { card: '10px' },
      fontFamily: { sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'] },
      // The right column grows on wide screens: 420px, 560px from `wide`.
      width: { rail: '96px', 'rail-open': '208px', right: '420px', 'right-wide': '560px' },
      // `tool`: the one width every tool screen is capped at (app/frame/Frame), so the left edge never jumps between
      // tools. `frame`: the main area (a tool plus its padding) and the widest right column together; past it the pair
      // centers on the page. `reading`: an opened item at full width, or alone in its own window.
      maxWidth: { tool: '72rem', frame: '109rem', reading: '56rem' },
      screens: { wide: '1600px' },
    },
  },
  plugins: [],
} satisfies Config;
