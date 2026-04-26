import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../context/user.context';

const UserAuth = ({ children }) => {
    const { user, loading: contextLoading } = useContext(UserContext); // ✅ Get loading from context
    const [localLoading, setLocalLoading] = useState(true);
    const navigate = useNavigate();
    const token = localStorage.getItem('token');

    useEffect(() => {
        // ✅ Wait for context to finish loading
        if (contextLoading) {
            return; // Don't do anything while context is loading
        }

        // ✅ Check authentication status
        if (!token || !user) {
            navigate('/login');
        } else {
            setLocalLoading(false);
        }
    }, [token, user, navigate, contextLoading]); // ✅ Add proper dependencies

    // ✅ Show loading while either context is loading or we're checking auth
    if (contextLoading || localLoading) {
        return (
            <div className="h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    // ✅ Only render children if authenticated
    return token && user ? <>{children}</> : null;
};

export default UserAuth;