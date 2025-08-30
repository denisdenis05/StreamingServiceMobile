import { useMemo } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext.tsx';
import { API_URL } from '@env';

export const useApi = () => {
  const { getToken, login, logout } = useAuth();

  const api = useMemo(() => {
    const instance = axios.create({
      baseURL: API_URL,
      withCredentials: true,
    });

    instance.interceptors.request.use(
      async config => {
        const token = await getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      error => Promise.reject(error)
    );

    instance.interceptors.response.use(
      async response => {
        const { url } = response.config;
        if (
          [
            'authentication/login',
            'authentication/register',
            'authentication/refresh-token',
          ].includes(url!) &&
          response.data?.token
        ) {
          await login(response.data.token);
        }
        return response;
      },
      async error => {
        const originalRequest = error.config;

        if (originalRequest?.url?.startsWith('authentication/')) {
          return Promise.reject(error);
        }

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          try {
            const refreshResponse = await instance.post(
              'authentication/refresh-token'
            );
            if (refreshResponse.data?.token) {
              await login(refreshResponse.data.token);
            }
            return instance(originalRequest);
          } catch (refreshError) {
            await logout();
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );

    return instance;
  }, [getToken, login, logout]);

  return api;
};
