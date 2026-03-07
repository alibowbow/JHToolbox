import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { PwaRegister } from '@/components/pwa-register';
import { LocaleProvider } from '@/components/providers/locale-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { AppToaster } from '@/components/ui/Toast';

const calSans = localFont({
  src: '../public/fonts/CalSans-SemiBold.woff2',
  variable: '--font-cal-sans',
  display: 'swap',
  weight: '600',
});

export const metadata: Metadata = {
  title: 'JH Toolbox',
  description: 'Premium browser-only PDF, image, video, audio, OCR, and data tools.',
  manifest: '/manifest.webmanifest',
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
      className={`${GeistSans.variable} ${GeistMono.variable} ${calSans.variable}`}
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
