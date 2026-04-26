import React, { useContext, useState, useEffect } from 'react'
import { UserContext } from '../context/user.context'
import axios from "../config/axios"
import { useNavigate } from 'react-router-dom'

const Home = () => {
    const { user } = useContext(UserContext)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [projectName, setProjectName] = useState('')
    const [projects, setProjects] = useState([])

    const navigate = useNavigate()

    function createProject(e) {
        e.preventDefault()
        axios.post('/projects/create', { name: projectName })
            .then(() => {
                setIsModalOpen(false)
                setProjectName('')
                return axios.get('/projects/all')
            })
            .then((res) => setProjects(res.data.projects))
            .catch(console.log)
    }

    useEffect(() => {
        axios.get('/projects/all')
            .then(res => setProjects(res.data.projects))
            .catch(console.log)
    }, [])

    return (
        <>
            {/* Global styles injected via style tag */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');

                *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

                .home-root {
                    min-height: 100vh;
                    background: #0a0b0f;
                    font-family: 'DM Sans', sans-serif;
                    color: #e8e9f0;
                    position: relative;
                    overflow-x: hidden;
                }

                /* Ambient background gradient orbs */
                .home-root::before {
                    content: '';
                    position: fixed;
                    top: -200px; left: -200px;
                    width: 600px; height: 600px;
                    background: radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%);
                    pointer-events: none;
                    z-index: 0;
                }
                .home-root::after {
                    content: '';
                    position: fixed;
                    bottom: -200px; right: -200px;
                    width: 500px; height: 500px;
                    background: radial-gradient(circle, rgba(236,72,153,0.08) 0%, transparent 70%);
                    pointer-events: none;
                    z-index: 0;
                }

                .home-container {
                    position: relative;
                    z-index: 1;
                    max-width: 1280px;
                    margin: 0 auto;
                    padding: 0 2rem;
                }

                /* ── HEADER ── */
                .home-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 2rem 0 1.5rem;
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                    margin-bottom: 3.5rem;
                }

                .home-logo {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }

                .logo-mark {
                    width: 36px; height: 36px;
                    background: linear-gradient(135deg, #6366f1, #ec4899);
                    border-radius: 10px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 1rem;
                    box-shadow: 0 4px 16px rgba(99,102,241,0.35);
                }

                .logo-text {
                    font-family: 'Syne', sans-serif;
                    font-weight: 800;
                    font-size: 1.2rem;
                    letter-spacing: -0.02em;
                    background: linear-gradient(90deg, #e8e9f0, #a5b4fc);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }

                .user-badge {
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 100px;
                    padding: 0.45rem 1rem 0.45rem 0.45rem;
                    font-size: 0.8rem;
                    color: #94a3b8;
                }

                .user-avatar {
                    width: 28px; height: 28px;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 0.7rem;
                    color: #fff;
                    font-weight: 600;
                }

                /* ── HERO ── */
                .home-hero {
                    margin-bottom: 3rem;
                }

                .hero-label {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    background: rgba(99,102,241,0.12);
                    border: 1px solid rgba(99,102,241,0.25);
                    border-radius: 100px;
                    padding: 0.3rem 0.9rem;
                    font-size: 0.72rem;
                    font-weight: 500;
                    color: #a5b4fc;
                    letter-spacing: 0.06em;
                    text-transform: uppercase;
                    margin-bottom: 1.25rem;
                }

                .hero-dot {
                    width: 6px; height: 6px;
                    background: #6366f1;
                    border-radius: 50%;
                    animation: pulse-dot 2s infinite;
                }

                @keyframes pulse-dot {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(0.8); }
                }

                .hero-title {
                    font-family: 'Syne', sans-serif;
                    font-weight: 800;
                    font-size: clamp(2.2rem, 4vw, 3.2rem);
                    line-height: 1.1;
                    letter-spacing: -0.03em;
                    color: #f0f1f8;
                    margin-bottom: 0.75rem;
                }

                .hero-title span {
                    background: linear-gradient(90deg, #a5b4fc, #ec4899);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }

                .hero-sub {
                    font-size: 0.95rem;
                    color: #64748b;
                    font-weight: 300;
                    max-width: 460px;
                }

                /* ── STATS BAR ── */
                .stats-bar {
                    display: flex;
                    align-items: center;
                    gap: 2rem;
                    margin-bottom: 2.5rem;
                    padding-bottom: 2rem;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                }

                .stat-item {
                    display: flex;
                    flex-direction: column;
                    gap: 0.2rem;
                }

                .stat-number {
                    font-family: 'Syne', sans-serif;
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: #e8e9f0;
                    line-height: 1;
                }

                .stat-label {
                    font-size: 0.72rem;
                    color: #475569;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                }

                .stat-divider {
                    width: 1px;
                    height: 30px;
                    background: rgba(255,255,255,0.07);
                }

                /* ── PROJECTS GRID ── */
                .projects-section-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 1.25rem;
                }

                .section-title {
                    font-family: 'Syne', sans-serif;
                    font-size: 0.78rem;
                    font-weight: 600;
                    color: #475569;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                }

                .projects-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
                    gap: 1rem;
                }

                /* ── NEW PROJECT CARD ── */
                .new-project-card {
                    background: transparent;
                    border: 2px dashed rgba(99,102,241,0.25);
                    border-radius: 16px;
                    padding: 1.75rem;
                    cursor: pointer;
                    transition: all 0.25s ease;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 0.75rem;
                    min-height: 140px;
                    position: relative;
                    overflow: hidden;
                }

                .new-project-card::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(135deg, rgba(99,102,241,0.07), rgba(236,72,153,0.04));
                    opacity: 0;
                    transition: opacity 0.25s ease;
                }

                .new-project-card:hover {
                    border-color: rgba(99,102,241,0.55);
                    transform: translateY(-2px);
                    box-shadow: 0 8px 32px rgba(99,102,241,0.12);
                }

                .new-project-card:hover::before {
                    opacity: 1;
                }

                .new-card-icon {
                    width: 44px; height: 44px;
                    background: rgba(99,102,241,0.15);
                    border: 1px solid rgba(99,102,241,0.3);
                    border-radius: 12px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 1.2rem;
                    color: #818cf8;
                    transition: all 0.25s ease;
                    position: relative; z-index: 1;
                }

                .new-project-card:hover .new-card-icon {
                    background: rgba(99,102,241,0.25);
                    box-shadow: 0 4px 14px rgba(99,102,241,0.25);
                }

                .new-card-text {
                    font-family: 'Syne', sans-serif;
                    font-size: 0.88rem;
                    font-weight: 600;
                    color: #6366f1;
                    letter-spacing: 0.02em;
                    position: relative; z-index: 1;
                }

                /* ── PROJECT CARD ── */
                .project-card {
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.07);
                    border-radius: 16px;
                    padding: 1.5rem 1.75rem;
                    cursor: pointer;
                    transition: all 0.25s ease;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    min-height: 140px;
                    position: relative;
                    overflow: hidden;
                }

                .project-card::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0;
                    height: 2px;
                    background: linear-gradient(90deg, #6366f1, #ec4899);
                    opacity: 0;
                    transition: opacity 0.25s ease;
                }

                .project-card:hover {
                    background: rgba(255,255,255,0.055);
                    border-color: rgba(99,102,241,0.22);
                    transform: translateY(-3px);
                    box-shadow: 0 12px 40px rgba(0,0,0,0.3);
                }

                .project-card:hover::before {
                    opacity: 1;
                }

                .card-top {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                }

                .card-folder-icon {
                    width: 36px; height: 36px;
                    background: rgba(99,102,241,0.12);
                    border-radius: 9px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 0.95rem;
                    color: #818cf8;
                }

                .card-arrow {
                    width: 28px; height: 28px;
                    background: rgba(255,255,255,0.05);
                    border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 0.8rem;
                    color: #475569;
                    opacity: 0;
                    transition: all 0.2s ease;
                    transform: translateX(-4px);
                }

                .project-card:hover .card-arrow {
                    opacity: 1;
                    transform: translateX(0);
                }

                .card-name {
                    font-family: 'Syne', sans-serif;
                    font-size: 1rem;
                    font-weight: 700;
                    color: #e8e9f0;
                    letter-spacing: -0.01em;
                    line-height: 1.3;
                }

                .card-meta {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-size: 0.76rem;
                    color: #475569;
                }

                .meta-dot {
                    width: 3px; height: 3px;
                    background: #334155;
                    border-radius: 50%;
                }

                .collaborator-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.35rem;
                    background: rgba(255,255,255,0.05);
                    border-radius: 100px;
                    padding: 0.25rem 0.65rem;
                    font-size: 0.72rem;
                    color: #64748b;
                    border: 1px solid rgba(255,255,255,0.06);
                }

                /* ── MODAL ── */
                .modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0,0,0,0.7);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 100;
                    animation: fadeIn 0.18s ease;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .modal-box {
                    background: #13151f;
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 20px;
                    padding: 2rem;
                    width: 420px;
                    max-width: calc(100vw - 2rem);
                    box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.1);
                    animation: slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1);
                }

                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px) scale(0.97); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }

                .modal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 1.75rem;
                }

                .modal-title {
                    font-family: 'Syne', sans-serif;
                    font-size: 1.2rem;
                    font-weight: 700;
                    color: #e8e9f0;
                }

                .modal-close {
                    width: 32px; height: 32px;
                    background: rgba(255,255,255,0.06);
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    color: #64748b;
                    font-size: 1rem;
                    transition: all 0.15s ease;
                }

                .modal-close:hover {
                    background: rgba(255,255,255,0.12);
                    color: #e8e9f0;
                }

                .modal-label {
                    display: block;
                    font-size: 0.75rem;
                    font-weight: 500;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    margin-bottom: 0.6rem;
                }

                .modal-input {
                    width: 100%;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 12px;
                    padding: 0.8rem 1rem;
                    font-family: 'DM Sans', sans-serif;
                    font-size: 0.9rem;
                    color: #e8e9f0;
                    outline: none;
                    transition: all 0.2s ease;
                    margin-bottom: 1.5rem;
                }

                .modal-input::placeholder { color: #334155; }

                .modal-input:focus {
                    border-color: rgba(99,102,241,0.5);
                    background: rgba(99,102,241,0.05);
                    box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
                }

                .modal-actions {
                    display: flex;
                    gap: 0.75rem;
                }

                .btn-cancel {
                    flex: 1;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 10px;
                    padding: 0.75rem;
                    font-family: 'DM Sans', sans-serif;
                    font-size: 0.875rem;
                    color: #64748b;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }

                .btn-cancel:hover {
                    background: rgba(255,255,255,0.08);
                    color: #94a3b8;
                }

                .btn-create {
                    flex: 2;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    border: none;
                    border-radius: 10px;
                    padding: 0.75rem;
                    font-family: 'Syne', sans-serif;
                    font-size: 0.875rem;
                    font-weight: 600;
                    color: #fff;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 4px 16px rgba(99,102,241,0.3);
                    letter-spacing: 0.01em;
                }

                .btn-create:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 6px 22px rgba(99,102,241,0.45);
                    background: linear-gradient(135deg, #4f46e5, #7c3aed);
                }

                .btn-create:active {
                    transform: translateY(0);
                }

                /* ── EMPTY STATE ── */
                .empty-state {
                    grid-column: 1 / -1;
                    padding: 4rem 0;
                    text-align: center;
                    color: #334155;
                }

                .empty-icon {
                    font-size: 3rem;
                    margin-bottom: 1rem;
                    opacity: 0.4;
                }

                .empty-text {
                    font-family: 'Syne', sans-serif;
                    font-size: 0.9rem;
                    color: #334155;
                }
            `}</style>

            <div className="home-root">
                <div className="home-container">
                    {/* HEADER */}
                    <header className="home-header">
                        <div className="home-logo">
                            <div className="logo-mark">
                                <i className="ri-code-s-slash-line" style={{color:'#fff'}}></i>
                            </div>
                            <span className="logo-text">DevCollab</span>
                        </div>
                        {user && (
                            <div className="user-badge">
                                <div className="user-avatar">
                                    {user.email?.charAt(0).toUpperCase()}
                                </div>
                                {user.email}
                            </div>
                        )}
                    </header>

                    {/* HERO */}
                    <div className="home-hero">
                        <div className="hero-label">
                            <span className="hero-dot"></span>
                            Workspace
                        </div>
                        <h1 className="hero-title">
                            Your <span>Projects</span>
                        </h1>
                        <p className="hero-sub">
                            Build and collaborate with your team. Let AI accelerate your workflow.
                        </p>
                    </div>

                    {/* STATS */}
                    {projects.length > 0 && (
                        <div className="stats-bar">
                            <div className="stat-item">
                                <span className="stat-number">{projects.length}</span>
                                <span className="stat-label">Projects</span>
                            </div>
                            <div className="stat-divider"></div>
                            {/* <div className="stat-item">
                                <span className="stat-number">
                                    {projects.reduce((sum, p) => sum + (p.users?.length || 0), 0)}
                                </span>
                                <span className="stat-label">Collaborators</span>
                            </div> */}
                        </div>
                    )}

                    {/* PROJECTS */}
                    <div className="projects-section-header">
                        <span className="section-title">All Projects</span>
                    </div>

                    <div className="projects-grid">
                        {/* New Project Card */}
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="new-project-card"
                        >
                            <div className="new-card-icon">
                                <i className="ri-add-line"></i>
                            </div>
                            <span className="new-card-text">New Project</span>
                        </button>

                        {/* Project Cards */}
                        {projects.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">
                                    <i className="ri-folder-3-line"></i>
                                </div>
                                <p className="empty-text">No projects yet — create your first one</p>
                            </div>
                        ) : (
                            projects.map((project) => (
                                <div
                                    key={project._id}
                                    onClick={() => navigate(`/project/${project._id}`, { state: { project } })}
                                    className="project-card"
                                >
                                    <div className="card-top">
                                        <div className="card-folder-icon">
                                            <i className="ri-folder-3-fill"></i>
                                        </div>
                                        <div className="card-arrow">
                                            <i className="ri-arrow-right-line"></i>
                                        </div>
                                    </div>
                                    <div>
                                        <h2 className="card-name">{project.name}</h2>
                                    </div>
                                    <div className="card-meta">
                                        <span className="collaborator-badge">
                                            <i className="ri-user-line"></i>
                                            {project.users?.length || 0} {project.users?.length === 1 ? 'collaborator' : 'collaborators'}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* MODAL */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && (setIsModalOpen(false), setProjectName(''))}>
                    <div className="modal-box">
                        <div className="modal-header">
                            <h2 className="modal-title">Create New Project</h2>
                            <button className="modal-close" onClick={() => { setIsModalOpen(false); setProjectName('') }}>
                                <i className="ri-close-line"></i>
                            </button>
                        </div>
                        <form onSubmit={createProject}>
                            <label className="modal-label">Project Name</label>
                            <input
                                className="modal-input"
                                type="text"
                                placeholder="e.g. my-awesome-app"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                autoFocus
                                required
                            />
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="btn-cancel"
                                    onClick={() => { setIsModalOpen(false); setProjectName('') }}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="btn-create">
                                    Create Project →
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}

export default Home