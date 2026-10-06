import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "/api",
  timeout: 15000
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("user-center:token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("user-center:token");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error: unknown, fallback = "请求失败，请稍后重试"): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || error.message || fallback;
  }
  return fallback;
}

export function downloadWithAuth(url: string) {
  return api.get(url.replace(/^\/api/, ""), { responseType: "blob" });
}
