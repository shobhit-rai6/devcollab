import React, { useState, useContext } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UserContext } from '../context/user.context'
import axios from '../config/axios'

const Register = () => {
    const [email, setEmail]       = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading]   = useState(false)
    const [error, setError]       = useState('')
    const [showPass, setShowPass] = useState(false)

    const { login } = useContext(UserContext)
    const navigate  = useNavigate()

    async function submitHandler(e) {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            const res = await axios.post('/users/register', { email, password })
            // ✅ FIX: save BOTH token and user so refresh doesn't logout
            login(res.data.user, res.data.token)
            navigate('/')
        } catch (err) {
            setError(err.response?.data?.message || err.response?.data?.error || 'Registration failed. Try again.')
        } finally {
            setLoading(false)
        }
    }

    const strength = password.length === 0 ? 0
        : password.length < 6 ? 1
        : password.length < 10 ? 2 : 3

    const strengthLabel = ['', 'Weak', 'Good', 'Strong']
    const strengthColor = ['', '#f87171', '#fbbf24', '#34d399']

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
                *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

                .auth-root {
                    min-height: 100vh;
                    background: #0a0b0f;
                    display: flex; align-items: center; justify-content: center;
                    font-family: 'DM Sans', sans-serif;
                    position: relative; overflow: hidden;
                }
                .auth-root::before {
                    content: ''; position: fixed;
                    top: -240px; left: -240px; width: 700px; height: 700px;
                    background: radial-gradient(circle, rgba(99,102,241,0.13) 0%, transparent 70%);
                    pointer-events: none;
                }
                .auth-root::after {
                    content: ''; position: fixed;
                    bottom: -180px; right: -180px; width: 500px; height: 500px;
                    background: radial-gradient(circle, rgba(236,72,153,0.09) 0%, transparent 70%);
                    pointer-events: none;
                }
                .auth-card {
                    position: relative; z-index: 1;
                    width: 100%; max-width: 420px; margin: 1rem;
                    background: rgba(14,17,23,0.95);
                    border: 1px solid rgba(255,255,255,0.07);
                    border-radius: 24px; padding: 2.5rem 2.25rem;
                    box-shadow: 0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(99,102,241,0.07);
                    backdrop-filter: blur(12px);
                }
                .auth-logo { display: flex; align-items: center; gap: 0.65rem; margin-bottom: 2rem; }
                .logo-mark {
                    width: 38px; height: 38px;
                    background: linear-gradient(135deg, #6366f1, #ec4899);
                    border-radius: 11px;
                    display: flex; align-items: center; justify-content: center; font-size: 1.1rem;
                    box-shadow: 0 4px 18px rgba(99,102,241,0.4); flex-shrink: 0;
                }
                .logo-text {
                    font-family: 'Syne', sans-serif; font-size: 1.15rem; font-weight: 800;
                    background: linear-gradient(135deg, #e8e9f0, #94a3b8);
                    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                }
                .auth-title { font-family: 'Syne', sans-serif; font-size: 1.6rem; font-weight: 800; color: #e8e9f0; letter-spacing: -0.02em; line-height: 1.15; margin-bottom: 0.4rem; }
                .auth-sub { font-size: 0.87rem; color: #64748b; margin-bottom: 2rem; line-height: 1.5; }
                .auth-sub span { color: #818cf8; }
                .field { margin-bottom: 1.1rem; }
                .field-label { display: block; font-size: 0.78rem; font-weight: 500; color: #94a3b8; margin-bottom: 0.45rem; letter-spacing: 0.02em; }
                .field-wrap { position: relative; }
                .field-input {
                    width: 100%; background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.08); border-radius: 11px;
                    padding: 0.75rem 1rem; font-family: 'DM Sans', sans-serif;
                    font-size: 0.9rem; color: #e8e9f0; outline: none; transition: all 0.2s ease;
                }
                .field-input:focus { border-color: rgba(99,102,241,0.5); background: rgba(99,102,241,0.05); box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
                .field-input::placeholder { color: #475569; }
                .field-input.has-icon { padding-right: 2.75rem; }
                .eye-btn {
                    position: absolute; right: 0.85rem; top: 50%; transform: translateY(-50%);
                    background: none; border: none; cursor: pointer; color: #64748b; font-size: 1rem;
                    display: flex; align-items: center; transition: color 0.15s; padding: 0.2rem;
                }
                .eye-btn:hover { color: #94a3b8; }
                .strength-bar { display: flex; gap: 3px; margin-top: 0.5rem; }
                .strength-seg {
                    height: 3px; flex: 1; border-radius: 2px;
                    background: rgba(255,255,255,0.08);
                    transition: background 0.25s ease;
                }
                .strength-label { font-size: 0.68rem; color: #64748b; margin-top: 0.3rem; }
                .auth-error {
                    display: flex; align-items: center; gap: 0.5rem;
                    background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2);
                    border-radius: 10px; padding: 0.65rem 0.9rem;
                    font-size: 0.82rem; color: #fca5a5; margin-bottom: 1.25rem;
                    animation: shake 0.3s ease;
                }
                @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
                .submit-btn {
                    width: 100%; padding: 0.85rem;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    border: none; border-radius: 12px;
                    font-family: 'Syne', sans-serif; font-size: 0.9rem; font-weight: 700;
                    color: #fff; cursor: pointer; transition: all 0.2s ease;
                    box-shadow: 0 4px 18px rgba(99,102,241,0.35);
                    display: flex; align-items: center; justify-content: center; gap: 0.5rem;
                    margin-top: 1.5rem; letter-spacing: 0.01em;
                }
                .submit-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(99,102,241,0.5); }
                .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
                .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }
                .auth-footer { text-align: center; margin-top: 1.5rem; font-size: 0.83rem; color: #64748b; }
                .auth-link { color: #818cf8; text-decoration: none; font-weight: 500; transition: color 0.15s; }
                .auth-link:hover { color: #a5b4fc; text-decoration: underline; }
                .terms { font-size: 0.75rem; color: #475569; text-align: center; margin-top: 1rem; line-height: 1.5; }
            `}</style>

            <div className="auth-root">
                <div className="auth-card">
                    <div className="auth-logo">
                        <div className="logo-mark">⚡</div>
                        <span className="logo-text">DevCollab</span>
                    </div>

                    <h1 className="auth-title">Create your account</h1>
                    <p className="auth-sub">
                        Start building with <span>AI-assisted code generation</span> and real-time collaboration.
                    </p>

                    {error && (
                        <div className="auth-error">
                            <i className="ri-error-warning-line"></i>
                            {error}
                        </div>
                    )}

                    <form onSubmit={submitHandler}>
                        <div className="field">
                            <label className="field-label" htmlFor="email">Email address</label>
                            <div className="field-wrap">
                                <input
                                    className="field-input" id="email" type="email"
                                    placeholder="you@example.com" value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required autoFocus autoComplete="email"
                                />
                            </div>
                        </div>

                        <div className="field">
                            <label className="field-label" htmlFor="password">Password</label>
                            <div className="field-wrap">
                                <input
                                    className="field-input has-icon" id="password"
                                    type={showPass ? 'text' : 'password'}
                                    placeholder="At least 6 characters" value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required minLength={6} autoComplete="new-password"
                                />
                                <button type="button" className="eye-btn" onClick={() => setShowPass(s => !s)}>
                                    <i className={showPass ? 'ri-eye-off-line' : 'ri-eye-line'}></i>
                                </button>
                            </div>
                            {password.length > 0 && (
                                <>
                                    <div className="strength-bar">
                                        {[1,2,3].map(i => (
                                            <div key={i} className="strength-seg" style={{ background: i <= strength ? strengthColor[strength] : undefined }} />
                                        ))}
                                    </div>
                                    <div className="strength-label" style={{ color: strengthColor[strength] }}>
                                        {strengthLabel[strength]} password
                                    </div>
                                </>
                            )}
                        </div>

                        <button className="submit-btn" type="submit" disabled={loading}>
                            {loading ? <><span className="spinner"></span> Creating account…</> : <>Create account <i className="ri-arrow-right-line"></i></>}
                        </button>
                    </form>

                    <p className="auth-footer">
                        Already have an account?{' '}
                        <Link className="auth-link" to="/login">Sign in →</Link>
                    </p>
                    <p className="terms">By registering you agree to our Terms of Service.</p>
                </div>
            </div>
        </>
    )
}

export default Register
