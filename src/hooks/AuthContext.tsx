import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthContextType {
  isLoggedIn: boolean;
  token: string | null;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
  getIsLoggedIn: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEYS = {
  token: 'auth_token',
  isLoggedIn: 'auth_isLoggedIn',
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  // Load from persistent storage on mount
  useEffect(() => {
    const loadAuthState = async () => {
      try {
        const storedToken = await AsyncStorage.getItem(STORAGE_KEYS.token);
        const storedLoggedIn = await AsyncStorage.getItem(
          STORAGE_KEYS.isLoggedIn
        );

        if (storedToken) {
          setToken(storedToken);
        }
        if (storedLoggedIn === 'true') {
          setIsLoggedIn(true);
        }
      } catch (e) {
        console.error('Failed to load auth state:', e);
      }
    };
    loadAuthState();
  }, []);

  // Save login
  const login = async (newToken: string) => {
    setIsLoggedIn(true);
    setToken(newToken);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.token, newToken);
      await AsyncStorage.setItem(STORAGE_KEYS.isLoggedIn, 'true');
    } catch (e) {
      console.error('Failed to persist login:', e);
    }
  };

  // Clear everything
  const logout = async () => {
    setIsLoggedIn(false);
    setToken(null);
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.token);
      await AsyncStorage.setItem(STORAGE_KEYS.isLoggedIn, 'false');
    } catch (e) {
      console.error('Failed to clear auth state:', e);
    }
  };

  // Safe getters
  const getToken = async (): Promise<string | null> => {
    if (token) return token;
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.token);
    } catch (e) {
      console.error('Failed to get token:', e);
      return null;
    }
  };

  const getIsLoggedIn = async (): Promise<boolean> => {
    if (isLoggedIn) return true;
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.isLoggedIn);
      return stored === 'true';
    } catch (e) {
      console.error('Failed to get isLoggedIn:', e);
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{ isLoggedIn, token, login, logout, getToken, getIsLoggedIn }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
