import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        base: {
          DEFAULT: 'rgb(var(--color-base) / <alpha-value>)',
          subtle: 'rgb(var(--color-base-subtle) / <alpha-value>)',
          elevated: 'rgb(var(--color-base-elevated) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--color-border) / 0.08)',
          bright: 'rgb(var(--color-border) / 0.16)',
        },
        ink: {
          DEFAULT: 'rgb(var(--color-ink) / 1)',
          muted: 'rgb(var(--color-ink-muted) / 1)',
          faint: 'rgb(var(--color-ink-faint) / 1)',
        },
        prime: {
          DEFAULT: 'rgb(var(--color-prime) / 1)',
          dim: 'rgb(var(--color-prime-dim) / 1)',
          glow: 'rgb(var(--color-prime) / 0.2)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / 1)',
          dim: 'rgb(var(--color-accent-dim) / 1)',
          glow: 'rgb(var(--color-accent) / 0.2)',
        },
        ok: 'rgb(var(--color-ok) / 1)',
        warn: 'rgb(var(--color-warn) / 1)',
        danger: 'rgb(var(--color-danger) / 1)',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
        display: ['var(--font-cal-sans)', 'var(--font-geist-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-prime': '0 0 24px 0 rgb(var(--color-prime) / 0.22)',
        'glow-accent': '0 0 24px 0 rgb(var(--color-accent) / 0.22)',
        card: 'var(--shadow-card)',
      },
      borderRadius: {
        xl2: '1rem',
        xl3: '1.25rem',
      },
      backgroundImage: {
        'grid-faint':
          "url(\"data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40L40 0M0 0l40 40' stroke='%23ffffff05' stroke-width='1'/%3E%3C/svg%3E\")",
        noise: "url('/noise.png')",
      },
    },
  },
  plugins: [],
};

export default config;
