import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const UserContext = createContext();

export const UserProvider = ({ children }) => {
    const [user, setUser]       = useState(null);
    const [loading, setLoading] = useState(true);

    // Rehydrate session from AsyncStorage on startup
    useEffect(() => {
        const rehydrate = async () => {
            try {
                const token      = await AsyncStorage.getItem('token');
                const storedUser = await AsyncStorage.getItem('user');
                if (token && storedUser) {
                    setUser(JSON.parse(storedUser));
                }
            } catch {
                // Corrupted storage — wipe and start fresh
                await AsyncStorage.multiRemove(['token', 'user']);
            } finally {
                setLoading(false);
            }
        };
        rehydrate();
    }, []);

    const login = async (userData, token) => {
        await AsyncStorage.setItem('token', token);
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        // AppNavigator auto-switches to the authenticated stack on state change
    };

    const logout = async () => {
        try {
            // Best-effort server-side session invalidation
            const { default: axios } = await import('../config/axios');
            await axios.get('/users/logout');
        } catch { /* ignore — local clear is enough */ }
        finally {
            await AsyncStorage.multiRemove(['token', 'user']);
            setUser(null);
            // AppNavigator auto-switches to the Login stack on state change
        }
    };

    return (
        <UserContext.Provider value={{ user, setUser, login, logout, loading }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) throw new Error('useUser must be used within a UserProvider');
    return context;
};
