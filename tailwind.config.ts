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
          DEFAULT: '#0a0a0f',
          subtle: '#111118',
          elevated: '#18181f',
        },
        border: {
          DEFAULT: '#ffffff0f',
          bright: '#ffffff1a',
        },
        ink: {
          DEFAULT: '#f0f0f5',
          muted: '#8888a0',
          faint: '#44445a',
        },
        prime: {
          DEFAULT: '#00e5ff',
          dim: '#00b8cc',
          glow: '#00e5ff33',
        },
        accent: {
          DEFAULT: '#b8ff57',
          dim: '#92cc44',
          glow: '#b8ff5733',
        },
        ok: '#34d399',
        warn: '#fbbf24',
        danger: '#f87171',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
        display: ['var(--font-cal-sans)', 'var(--font-geist-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-prime': '0 0 24px 0 #00e5ff22',
        'glow-accent': '0 0 24px 0 #b8ff5722',
        card: '0 1px 0 0 #ffffff0a, inset 0 1px 0 0 #ffffff06',
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
