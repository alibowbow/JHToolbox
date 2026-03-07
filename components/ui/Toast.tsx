'use client';

import { Toaster, toast } from 'sonner';

export { toast };

export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: '#18181f',
          border: '1px solid #ffffff0f',
          color: '#f0f0f5',
          fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
        },
      }}
    />
  );
}
