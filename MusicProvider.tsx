import React, { createContext, useContext, ReactNode } from 'react';
import { useQueue } from './src/services/AudioPlayerService.ts';

type MusicContextType = ReturnType<typeof useQueue>;

const MusicContext = createContext<MusicContextType | null>(null);

interface MusicProviderProps {
  children: ReactNode;
}

export function MusicProvider({ children }: MusicProviderProps) {
  const queueState = useQueue();

  return (
    <MusicContext.Provider value={queueState}>{children}</MusicContext.Provider>
  );
}

export function useMusicQueue() {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error('useMusicQueue must be used within a MusicProvider');
  }
  return context;
}

export function useMusicQueueOptional() {
  return useContext(MusicContext);
}
