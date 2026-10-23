import type { Config } from 'tailwindcss';

// Design tokens (SPEC §7.1). Status colors are NOT here; they come from src/lib/status.ts.
// The look (Jesse, Oct 23: "deep shadow boxes, bold hard lines ... like it was purposely designed"): a light gray page,
// white boxes with a crisp edge and a deep layered shadow, square-ish corners, a black rail and top bar with a thin red
// line, one accent (a deep red), black primary buttons. The type pairs a condensed display face for titles, section
// heads, rail labels and buttons (`font-display`, the `heading` class in src/app/styles.css) with a plain sans for body
// and data. Both self-hosted (public/fonts, @font-face in src/app/styles.css).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: '#E8E9EB',
        card: { DEFAULT: '#FFFFFF', head: '#F5F5F6' },
        // Readable ink only (Jesse, Oct 5: "you like to hide things and put things in super light lettering"): ink for
        // what matters, ink-2 for a second line, ink-3 for small print. Placeholders and disabled use ink-3 at half.
        ink: { DEFAULT: '#16181B', 2: '#3B3E43', 3: '#53565B' },
        // line: a static box's edge and dividers. strong: a field's edge.
        line: { DEFAULT: '#D1D3D4', strong: '#A7A9AC' },
        // The one accent: the selected place, focus, links, counts, the bar's thin line. Not a failure: failures keep
        // lib/status's deeper red and always carry their word.
        accent: { DEFAULT: '#C91235', hover: '#A30E2B', soft: '#FBECEF' },
        danger: { DEFAULT: '#B42318', soft: '#FEF3F2' },
        // The one amber highlight: impact claimed (row, box edge, icon).
        impact: { row: '#FFF7E6', edge: '#F3D7A6', ink: '#B45309' },
        // The rail and the top bar: one black strip down the left and across the top.
        rail: { DEFAULT: '#141618', hover: '#24272B', active: '#2F3338', ink: '#D1D3D4', line: '#34383D' },
      },
      boxShadow: {
        // Deep, layered boxes (Jesse, Oct 4, Oct 12, Oct 23): a crisp 1.5px edge, a contact shadow, a drop and a long
        // soft lift.
        card: '0 0 0 1.5px #CBCDCF, 0 2px 3px rgba(16,18,20,.12), 0 10px 18px -6px rgba(16,18,20,.22), 0 26px 44px -14px rgba(16,18,20,.36)',
        // A clickable card under the pointer: a black edge, lifted higher.
        lift: '0 0 0 2px #16181B, 0 4px 6px rgba(16,18,20,.16), 0 16px 28px -8px rgba(16,18,20,.30), 0 34px 60px -16px rgba(16,18,20,.45)',
        // A clickable box (ui/box CLICK_BOX, secondary buttons, tiles; the edge is its own border): a hard contact
        // line and a drop; deeper on hover; pressed in on press.
        tile: '0 1px 0 rgba(16,18,20,.28), 0 3px 6px -1px rgba(16,18,20,.20), 0 10px 18px -8px rgba(16,18,20,.34)',
        'tile-hover': '0 2px 0 rgba(16,18,20,.30), 0 8px 14px -4px rgba(16,18,20,.26), 0 22px 34px -12px rgba(16,18,20,.46)',
        press: 'inset 0 2px 4px rgba(16,18,20,.26)',
        // Menus and toasts float highest.
        pop: '0 0 0 1.5px #16181B, 0 8px 14px -4px rgba(16,18,20,.22), 0 30px 56px -12px rgba(16,18,20,.45)',
        control: '0 1px 2px rgba(16,18,20,.12)',
        // A filled button (black primary, a picked chip): a hard bottom line and a deep drop.
        primary: 'inset 0 1px 0 rgba(255,255,255,.14), 0 1px 0 rgba(0,0,0,.45), 0 4px 10px -2px rgba(16,18,20,.38), 0 12px 22px -10px rgba(16,18,20,.50)',
        'primary-hover':
          'inset 0 1px 0 rgba(255,255,255,.14), 0 2px 0 rgba(0,0,0,.45), 0 8px 16px -4px rgba(16,18,20,.42), 0 22px 34px -12px rgba(16,18,20,.55)',
      },
      // Square-ish corners everywhere: a card 8px, a big box no rounder than 10px.
      borderRadius: { card: '8px', xl: '10px', '2xl': '12px' },
      fontFamily: {
        sans: ['Roboto', 'system-ui', 'sans-serif'],
        display: ['Oswald', '"Arial Narrow"', 'Roboto', 'sans-serif'],
      },
      // The right column opens wide enough to read a page of a PDF: a third of the window, 420px to 800px.
      width: { rail: '96px', 'rail-open': '208px', right: 'clamp(420px, 32vw, 800px)' },
      // Tool screens use the whole main area (Jesse, Oct 23: "open to the max viewing"). `reading`: the most a form or a
      // page of text spreads at full screen or alone in its own window (a file there fills the window).
      maxWidth: { reading: '72rem' },
      transitionDuration: { DEFAULT: '150ms' },
    },
  },
  plugins: [],
} satisfies Config;
