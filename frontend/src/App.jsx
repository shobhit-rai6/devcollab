import React from 'react'
import AppRoutes from './routes/AppRoutes'

// BUG FIX: The original code wrapped AppRoutes in <UserProvider> here AND
// AppRoutes also wrapped its content in another <UserProvider>. This caused
// a nested context issue where the inner provider's state shadowed the outer
// one, making logout unreliable. UserProvider now lives only in AppRoutes
// (inside BrowserRouter so useNavigate works).
const App = () => {
    return <AppRoutes />
}

export default App
