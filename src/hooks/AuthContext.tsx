import React, { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { authenticationSession } from '../services/AuthenticationService';
import type { ApplicationAuthenticationState } from '../services/player/ApplicationAuthenticationSession';

interface AuthContextType extends ApplicationAuthenticationState {
  readonly isRestored: boolean;
  readonly login: typeof authenticationSession.login;
  readonly logout: typeof authenticationSession.logout;
  readonly getToken: typeof authenticationSession.getToken;
  readonly getIsLoggedIn: typeof authenticationSession.getIsLoggedIn;
  readonly refreshToken: typeof authenticationSession.refresh;
}
const MissingAuthProviderMessage = 'useAuth must be used within an AuthProvider';
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const state = useSyncExternalStore(authenticationSession.subscribe, authenticationSession.getSnapshot);
  useEffect(() => { void authenticationSession.restore(); }, []);
  return <AuthContext.Provider value={{ ...state, isRestored: state.restored,
    login: authenticationSession.login, logout: authenticationSession.logout, getToken: authenticationSession.getToken,
    getIsLoggedIn: authenticationSession.getIsLoggedIn, refreshToken: authenticationSession.refresh }}>{children}</AuthContext.Provider>;
};
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error(MissingAuthProviderMessage);
  return context;
};
