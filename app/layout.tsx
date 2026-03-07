import type { Metadata } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/site-header';
import { PwaRegister } from '@/components/pwa-register';

export const metadata: Metadata = {
  title: 'JH Toolbox',
  description: 'Browser-only PDF, image, video, audio, OCR, and data tools.',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <PwaRegister />
        <div className="app-wrap">
          <SiteHeader />
          <main className="mx-auto w-full max-w-7xl px-4 pb-12 pt-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
