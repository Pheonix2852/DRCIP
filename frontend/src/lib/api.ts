import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('drcip-auth');
  if (token) {
    try {
      const { token: authToken } = JSON.parse(token);
      if (authToken) {
        config.headers.Authorization = `Bearer ${authToken}`;
      }
    } catch {
      // ignore parse errors
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const err = error as {
      response?: { status?: number };
      config?: { url?: string; headers?: { Authorization?: unknown } };
    };
    const status = err.response?.status;
    const url = err.config?.url ?? "";
    // Only force-logout when a *token-bearing* protected request returns 401.
    // Login/logout failures must never wipe an existing session.
    const isAuthCall = url.includes("/auth/login") || url.includes("/auth/logout");
    const hadToken = Boolean(err.config?.headers?.Authorization);
    if (status === 401 && hadToken && !isAuthCall) {
      localStorage.removeItem("drcip-auth");
      // Notify the application of session loss via a custom event
      window.dispatchEvent(new Event("auth:logout"));
    }
    return Promise.reject(error);
  }
);

export default api;