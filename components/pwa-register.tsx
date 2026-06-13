'use client';

import { useEffect } from 'react';

const CACHE_PREFIX = 'jhtoolbox-';
const PRESERVED_CACHES = new Set(['jhtoolbox-ffmpeg-core-v1']);

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const cleanup = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map((registration) => {
            if (!registration.scope.startsWith(window.location.origin)) {
              return Promise.resolve(false);
            }

            return registration.unregister();
          }),
        );

        if ('caches' in window) {
          const cacheKeys = await caches.keys();
          await Promise.all(
            cacheKeys
              .filter((cacheKey) => cacheKey.startsWith(CACHE_PREFIX) && !PRESERVED_CACHES.has(cacheKey))
              .map((cacheKey) => caches.delete(cacheKey)),
          );
        }
      } catch {
        // Ignore cleanup failures and let the page continue.
      }
    };

    void cleanup();
  }, []);

  return null;
}
