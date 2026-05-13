import axios from 'axios';

const axiosInstance = axios.create({
    baseURL:         import.meta.env.VITE_API_URL || 'http://localhost:3000',
    headers:         { 'Content-Type': 'application/json' },
    withCredentials: true
});

// Attach token to every request
axiosInstance.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
    },
    (error) => Promise.reject(error)
);

// Handle 401 globally
axiosInstance.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // BUG FIX: the original code always redirected to /login on 401,
            // which caused an infinite redirect loop when the login request
            // itself returned 401 (wrong password). Now we only redirect if
            // the user was previously authenticated.
            const hadToken = !!localStorage.getItem('token');
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            if (hadToken && !window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default axiosInstance;
