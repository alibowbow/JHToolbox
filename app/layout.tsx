import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { PwaRegister } from '@/components/pwa-register';
import { LocaleProvider } from '@/components/providers/locale-provider';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${calSans.variable} dark`}
      suppressHydrationWarning
    >
      <body className="min-h-screen">
        <PwaRegister />
        <LocaleProvider>
          <AppShell>{children}</AppShell>
          <AppToaster />
        </LocaleProvider>
      </body>
    </html>
  );
}
