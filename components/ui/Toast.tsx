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
          background: 'rgb(var(--color-base-elevated) / 1)',
          border: '1px solid rgb(var(--color-border) / 0.12)',
          color: 'rgb(var(--color-ink) / 1)',
          borderRadius: '14px',
          boxShadow: 'var(--shadow-pop)',
          fontFamily: 'inherit',
        },
      }}
    />
  );
}
