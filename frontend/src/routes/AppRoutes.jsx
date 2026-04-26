import React from 'react';
import { Route, Routes } from 'react-router-dom'; // ✅ Remove BrowserRouter from here
import Login from '../screens/Login';
import Register from '../screens/Register';
import Home from '../screens/Home';
import Project from '../screens/Project';
import UserAuth from '../auth/UserAuth';
import { UserProvider } from '../context/user.context'; // ✅ Import UserProvider

const AppRoutes = () => {
    return (
        <UserProvider> {/* ✅ Wrap with UserProvider HERE */}
            <Routes>
                <Route path="/" element={<UserAuth><Home /></UserAuth>} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/project/:id" element={<UserAuth><Project /></UserAuth>} /> {/* ✅ Add :id param */}
            </Routes>
        </UserProvider>
    );
};

export default AppRoutes;