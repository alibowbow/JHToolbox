'use client';

import { Toaster, toast } from 'sonner';
import { useTheme } from '@/components/providers/theme-provider';

export { toast };

export function AppToaster() {
  const { theme } = useTheme();

  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'rgb(var(--color-base-elevated) / 0.96)',
          border: '1px solid rgb(var(--color-border) / 0.12)',
          color: 'rgb(var(--color-ink) / 1)',
          boxShadow: 'var(--shadow-card)',
          fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
        },
      }}
    />
  );
}
