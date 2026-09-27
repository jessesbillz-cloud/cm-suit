import type { Config } from 'tailwindcss';

// Design tokens (SPEC §7.1). Status colors are NOT here; they come from src/lib/status.ts.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: '#F7F8FA',
        card: '#FFFFFF',
        ink: { DEFAULT: '#111827', 2: '#6B7280', 3: '#9CA3AF' },
        line: '#E5E7EB',
        accent: { DEFAULT: '#2563EB', hover: '#1D4ED8', soft: '#EFF6FF' },
        danger: { DEFAULT: '#DC2626', soft: '#FEF2F2' },
        impact: { row: '#FFF7E6' },
      },
      boxShadow: { card: '0 1px 2px rgba(0,0,0,.06), 0 2px 8px rgba(0,0,0,.06)' },
      borderRadius: { card: '8px' },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      width: { rail: '56px', 'rail-open': '208px', right: '420px' },
    },
  },
  plugins: [],
} satisfies Config;
