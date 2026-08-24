'use client';

import { useEffect } from 'react';

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function SessionRefresher() {
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/refresh', { method: 'POST' }).catch(() => {});
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  return null;
}
