import axios, { AxiosError } from 'axios';
import toast from 'react-hot-toast';

export const tokenStorageKey = 'usercenter.token';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? '/api',
  timeout: 15000
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(tokenStorageKey);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string }>) => {
    const status = error.response?.status;
    const message = error.response?.data?.message ?? '网络请求失败，请检查服务后重试';
    if (status === 401) localStorage.removeItem(tokenStorageKey);
    if (!error.config?.url?.includes('/auth/me')) toast.error(message);
    return Promise.reject(error);
  }
);
