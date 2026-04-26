import React, { createContext, useState, useEffect } from 'react';
import axios from '../config/axios';
import { useNavigate } from 'react-router-dom';

// Create the UserContext
export const UserContext = createContext();

// Create a provider component
export const UserProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true); // ✅ Add loading state
    const navigate = useNavigate();

    // ✅ Load user from localStorage on initial render
    useEffect(() => {
        const loadUser = () => {
            const token = localStorage.getItem('token');
            const storedUser = localStorage.getItem('user');
            
            if (token && storedUser) {
                setUser(JSON.parse(storedUser));
            }
            setLoading(false); // ✅ Always set loading to false when done
        };

        loadUser();
    }, []);

    // LOGIN FUNCTION
    const login = (userData, token) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
    };

    // LOGOUT FUNCTION
    const logout = async () => {
        try {
            const token = localStorage.getItem('token');
            if (token) {
                await axios.get('/users/logout');
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setUser(null);
            navigate('/login');
        }
    };

    return (
        <UserContext.Provider value={{ 
            user, 
            setUser, 
            login, 
            logout,
            loading // ✅ Provide loading state
        }}>
            {children}
        </UserContext.Provider>
    );
};

// Custom hook
export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) {
        throw new Error('useUser must be used within a UserProvider');
    }
    return context;
};