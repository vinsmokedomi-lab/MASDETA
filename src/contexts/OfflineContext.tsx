import { createContext, ReactNode, useContext } from 'react';

export interface OfflineContextValue {
  isOnline: boolean;
  isOffline: boolean;
  isChecking: boolean;
  checkConnection: () => Promise<boolean>;
}

const OfflineContext = createContext<OfflineContextValue>({
  isOnline: true,
  isOffline: false,
  isChecking: false,
  checkConnection: async () => true,
});

interface OfflineProviderProps {
  isOnline: boolean;
  isChecking: boolean;
  checkConnection: () => Promise<boolean>;
  children: ReactNode;
}

export function OfflineProvider({
  isOnline,
  isChecking,
  checkConnection,
  children,
}: OfflineProviderProps) {
  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isOffline: !isOnline,
        isChecking,
        checkConnection,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function useOfflineStatus(): OfflineContextValue {
  return useContext(OfflineContext);
}
