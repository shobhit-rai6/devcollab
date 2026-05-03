import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from '../config/axios';

export const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Rehydrate session from AsyncStorage on launch
  useEffect(() => {
    const loadUser = async () => {
      try {
        const [token, stored] = await AsyncStorage.multiGet(['token', 'user']);
        const tokenVal = token[1];
        const userVal  = stored[1];
        if (tokenVal && userVal) {
          setUser(JSON.parse(userVal));
        }
      } catch (e) {
        console.warn('Error loading user from storage', e);
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  const login = useCallback(async (userData, token) => {
    await AsyncStorage.setItem('token', token);
    await AsyncStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    try {
      await axios.get('/users/logout');
    } catch (e) {
      // Ignore logout endpoint errors
    } finally {
      await AsyncStorage.multiRemove(['token', 'user']);
      setUser(null);
    }
  }, []);

  return (
    <UserContext.Provider value={{ user, setUser, login, logout, loading }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used inside UserProvider');
  return ctx;
};
