// agent/context/NotificationProvider.tsx
// Toasts et notifications (doc 07 : NotificationProvider).

import React, { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export interface Notification {
  id: number;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

interface NotificationApi {
  notifications: Notification[];
  notify: (n: Omit<Notification, 'id'>) => void;
}

const NotificationContext = createContext<NotificationApi | null>(null);

let nextId = 1;

export function NotificationProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const notify = useCallback((n: Omit<Notification, 'id'>) => {
    const id = nextId++;
    setNotifications((list) => [...list, { ...n, id }]);
    // Auto-dismiss (doc 07 : duration)
    setTimeout(() => setNotifications((list) => list.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, notify }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationApi {
  const api = useContext(NotificationContext);
  if (!api) throw new Error('useNotification doit etre utilise sous <NotificationProvider>');
  return api;
}
