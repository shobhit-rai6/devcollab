import React from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Login    from '../screens/Login'
import Register from '../screens/Register'
import Home     from '../screens/Home'
import Project  from '../screens/Project'
import UserAuth from '../auth/UserAuth'
import { UserProvider } from '../context/user.context'

// BUG FIX: BrowserRouter must wrap UserProvider (which uses useNavigate).
// Previously UserProvider was in App.jsx outside BrowserRouter, causing
// "useNavigate() may be used only in the context of a <Router>" errors.
const AppRoutes = () => {
    return (
        <BrowserRouter>
            <UserProvider>
                <Routes>
                    <Route path="/"              element={<UserAuth><Home /></UserAuth>} />
                    <Route path="/login"         element={<Login />} />
                    <Route path="/register"      element={<Register />} />
                    <Route path="/project/:id"   element={<UserAuth><Project /></UserAuth>} />
                    {/* Catch-all → redirect to home */}
                    <Route path="*"              element={<UserAuth><Home /></UserAuth>} />
                </Routes>
            </UserProvider>
        </BrowserRouter>
    )
}

export default AppRoutes
