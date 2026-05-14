import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from '../config/axios';
import { useNavigate } from 'react-router-dom';

export const UserContext = createContext();

export const UserProvider = ({ children }) => {
    const [user, setUser]       = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    // Rehydrate user from localStorage on initial render
    useEffect(() => {
        try {
            const token       = localStorage.getItem('token');
            const storedUser  = localStorage.getItem('user');
            if (token && storedUser) {
                setUser(JSON.parse(storedUser));
            }
        } catch {
            // BUG FIX: corrupt localStorage JSON shouldn't crash the app
            localStorage.removeItem('user');
            localStorage.removeItem('token');
        } finally {
            setLoading(false);
        }
    }, []);

    const login = (userData, token) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
    };

    const logout = async () => {
        try {
            await axios.get('/users/logout');
        } catch {
            // Even if the server call fails, clear local state
        } finally {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setUser(null);
            navigate('/login');
        }
    };

    return (
        <UserContext.Provider value={{ user, setUser, login, logout, loading }}>
            {children}
        </UserContext.Provider>
    );
};

// BUG FIX: useContext was imported but UserContext wasn't used in the hook —
// both are now properly included.
export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) throw new Error('useUser must be used within a UserProvider');
    return context;
};
