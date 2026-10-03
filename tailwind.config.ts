import type { Config } from 'tailwindcss';

// Design tokens (SPEC §7.1). Status colors are NOT here; they come from src/lib/status.ts.
// Near-white page, white cards with a hairline edge and a two-step shadow, card headers on a faint tint,
// one accent color. The font is self-hosted IBM Plex Sans (public/fonts, @font-face in src/app/styles.css).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // A short window (a laptop browser): the rail's places get shorter so a job's tools fit.
      screens: { short: { raw: '(max-height: 820px)' } },
      colors: {
        page: '#EDF0F4',
        card: { DEFAULT: '#FFFFFF', head: '#F8F9FB' },
        ink: { DEFAULT: '#111827', 2: '#586273', 3: '#98A1B0' },
        line: { DEFAULT: '#E2E5EA', strong: '#CDD2DA' },
        accent: { DEFAULT: '#2563EB', hover: '#1D4ED8', soft: '#EFF6FF' },
        danger: { DEFAULT: '#DC2626', soft: '#FEF2F2' },
        // The one amber highlight: impact claimed (row, box edge, icon).
        impact: { row: '#FFF7E6', edge: '#F3D7A6', ink: '#B45309' },
        // The tool rail: a dark navy strip down the left, so the white work area reads as the page.
        rail: { DEFAULT: '#0F1A2B', hover: '#1B2A40', active: '#24364F', ink: '#8D9BB0', line: '#22324A' },
      },
      boxShadow: {
        // Hairline edge + contact shadow + soft lift.
        card: '0 0 0 1px rgba(16,24,40,.09), 0 1px 3px rgba(16,24,40,.10), 0 8px 20px -4px rgba(16,24,40,.14)',
        // Menus and toasts float higher.
        pop: '0 0 0 1px rgba(16,24,40,.08), 0 4px 8px -2px rgba(16,24,40,.10), 0 16px 32px -6px rgba(16,24,40,.18)',
        control: '0 1px 2px rgba(16,24,40,.06)',
        primary: 'inset 0 1px 0 rgba(255,255,255,.18), 0 1px 2px rgba(16,24,40,.22)',
      },
      borderRadius: { card: '10px' },
      fontFamily: { sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'] },
      width: { rail: '96px', 'rail-open': '208px', right: '420px' },
    },
  },
  plugins: [],
} satisfies Config;
