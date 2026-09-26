import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { GeistMono } from 'geist/font/mono';
import './fonts/pretendard/pretendard-variable.css';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { PwaRegister } from '@/components/pwa-register';
import { LocaleProvider } from '@/components/providers/locale-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { AppToaster } from '@/components/ui/Toast';

// Self-hosted (like Pretendard) so builds never depend on Google Fonts.
const jetbrainsMono = localFont({
  src: [
    { path: './fonts/jetbrains-mono/jetbrains-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/jetbrains-mono/jetbrains-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-audio-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: 'JH Toolbox',
  description: 'Premium browser-only PDF, image, video, audio, OCR, and data tools.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0c10' },
  ],
};

const themeScript = `
(() => {
  try {
    const saved = localStorage.getItem('jhtoolbox.theme');
    const nextTheme =
      saved === 'dark' || saved === 'light'
        ? saved
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';

    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
  } catch {
    document.documentElement.classList.add('dark');
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistMono.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <PwaRegister />
        <ThemeProvider>
          <LocaleProvider>
            <AppShell>{children}</AppShell>
            <AppToaster />
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
