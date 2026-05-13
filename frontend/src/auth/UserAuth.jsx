import React, { useContext } from 'react'
import { Navigate } from 'react-router-dom'
import { UserContext } from '../context/user.context'

// BUG FIX: The original component had a race condition.
// It used two separate loading states (contextLoading + localLoading) which
// could show the loading spinner indefinitely if one never resolved.
// It also used useEffect + navigate() which caused a brief flash of the
// protected page before redirecting unauthenticated users.
//
// The fix: use <Navigate> for declarative redirects (no flash, no race),
// and only block on the single context loading state.
const UserAuth = ({ children }) => {
    const { user, loading } = useContext(UserContext)

    if (loading) {
        return (
            <div style={{
                height: '100vh', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: '#0a0b0f'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: 40, height: 40, border: '2px solid rgba(99,102,241,0.3)',
                        borderTopColor: '#6366f1', borderRadius: '50%',
                        animation: 'spin 0.7s linear infinite', margin: '0 auto'
                    }} />
                    <p style={{ color: '#64748b', marginTop: '1rem', fontSize: '0.85rem' }}>
                        Loading…
                    </p>
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        )
    }

    if (!user) return <Navigate to="/login" replace />

    return <>{children}</>
}

export default UserAuth
