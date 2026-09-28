import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        /* ------------------------------------------------
           DRCIP Design System Token Mapping
           DESIGN_SYSTEM.md §5 — v3.1
           Colours use `rgb(var(--X-rgb) / <alpha-value>)` so
           Tailwind opacity modifiers (bg-primary/90, etc.)
           resolve correctly against the CSS variables.
           ------------------------------------------------ */

        /* Brand core */
        canvas: 'rgb(var(--brand-canvas-rgb) / <alpha-value>)',
        'surface-cool': 'rgb(var(--surface-cool-rgb) / <alpha-value>)',
        surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
        ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
        'text-secondary': 'rgb(var(--text-secondary-rgb) / <alpha-value>)',
        'text-muted': 'rgb(var(--text-muted-rgb) / <alpha-value>)',
        border: 'rgb(var(--border-rgb) / <alpha-value>)',

        /* Brand cobalt */
        'cobalt-deep': 'rgb(var(--brand-cobalt-deep-rgb) / <alpha-value>)',
        'cobalt-electric': 'rgb(var(--brand-cobalt-electric-rgb) / <alpha-value>)',

        /* Semantic: severity */
        'severity-critical': 'rgb(var(--severity-critical-rgb) / <alpha-value>)',
        'severity-high': 'rgb(var(--severity-high-rgb) / <alpha-value>)',
        'severity-medium': 'rgb(var(--severity-medium-rgb) / <alpha-value>)',
        'severity-low': 'rgb(var(--severity-low-rgb) / <alpha-value>)',

        /* Semantic: status */
        'status-success': 'rgb(var(--status-success-rgb) / <alpha-value>)',
        'status-warning': 'rgb(var(--status-warning-rgb) / <alpha-value>)',
        'status-info': 'rgb(var(--status-info-rgb) / <alpha-value>)',
        'status-error': 'rgb(var(--status-error-rgb) / <alpha-value>)',
        'status-unavailable': 'rgb(var(--status-unavailable-rgb) / <alpha-value>)',

        /* ------------------------------------------------
           shadcn/ui standard token mapping
           Maps standard shadcn class names to DRCIP tokens
           so existing components work without per-page edits.
           ------------------------------------------------ */

        background: 'rgb(var(--brand-canvas-rgb) / <alpha-value>)',
        foreground: 'rgb(var(--ink-rgb) / <alpha-value>)',

        card: {
          DEFAULT: 'rgb(var(--surface-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--ink-rgb) / <alpha-value>)',
        },

        primary: {
          DEFAULT: 'rgb(var(--brand-cobalt-deep-rgb) / <alpha-value>)',
          foreground: '#FFFFFF',
        },

        secondary: {
          DEFAULT: 'rgb(var(--surface-cool-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--ink-rgb) / <alpha-value>)',
        },

        muted: {
          DEFAULT: 'rgb(var(--surface-cool-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--text-muted-rgb) / <alpha-value>)',
        },

        accent: {
          DEFAULT: 'rgb(var(--surface-cool-rgb) / <alpha-value>)',
          foreground: 'rgb(var(--ink-rgb) / <alpha-value>)',
        },

        destructive: {
          DEFAULT: 'rgb(var(--status-error-rgb) / <alpha-value>)',
          foreground: '#FFFFFF',
        },

        input: 'rgb(var(--border-rgb) / <alpha-value>)',
        ring: 'rgb(var(--brand-cobalt-electric-rgb) / <alpha-value>)',

        /* ------------------------------------------------
           Legacy drcip.* colors — mapped to design tokens
           Preserves backward compatibility for components
           still referencing bg-drcip-primary etc.
           ------------------------------------------------ */
        drcip: {
          primary: 'rgb(var(--brand-cobalt-deep-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--surface-cool-rgb) / <alpha-value>)',
          accent: 'rgb(var(--brand-cobalt-electric-rgb) / <alpha-value>)',
          warning: 'rgb(var(--status-warning-rgb) / <alpha-value>)',
          critical: 'rgb(var(--severity-critical-rgb) / <alpha-value>)',
          high: 'rgb(var(--severity-high-rgb) / <alpha-value>)',
          medium: 'rgb(var(--severity-medium-rgb) / <alpha-value>)',
          low: 'rgb(var(--severity-low-rgb) / <alpha-value>)',
/* shadcn/ui standard token mapping. `background` resolves to the
           cool operational surface; the public homepage uses `bg-canvas`. */
        background: 'rgb(var(--surface-cool-rgb) / <alpha-value>)',
          surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
        },
      },

      fontFamily: {
        /* Design System §6 — Typography roles */
        display: ['Sora', 'system-ui', 'sans-serif'],
        heading: ['Manrope', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'Cascadia Code', 'Source Code Pro', 'Menlo', 'Consolas', 'monospace'],
      },

      borderRadius: {
        'drcip-sm': 'var(--radius-sm)',
        'drcip-md': 'var(--radius-md)',
        'drcip-lg': 'var(--radius-lg)',
      },

      boxShadow: {
        'drcip-sm': 'var(--shadow-sm)',
        'drcip-md': 'var(--shadow-md)',
        'drcip-lg': 'var(--shadow-lg)',
      },

      maxWidth: {
        'drcip': 'var(--container-max)',
      },
    },
  },
  plugins: [],
}

export default config