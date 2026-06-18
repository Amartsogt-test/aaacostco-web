import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export default function PwaUpdater() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Check for updates every 15 minutes
      if (r) {
        setInterval(() => {
          r.update();
        }, 15 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  useEffect(() => {
    if (needRefresh) {
      // Автоматаар шууд шинэчилж хуудсыг дахин ачаалах
      updateServiceWorker(true);
    }
  }, [needRefresh, updateServiceWorker]);

  return null;
}
