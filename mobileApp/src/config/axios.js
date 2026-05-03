import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ✅ Change this to your backend URL
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: 15000,
});

// Request interceptor – attach JWT from AsyncStorage
axiosInstance.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      console.warn('Could not read token from AsyncStorage', e);
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor – clear storage on 401
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.multiRemove(['token', 'user']);
      // Navigation reset is handled by UserContext listener
    }
    return Promise.reject(error);
  },
);

export default axiosInstance;
