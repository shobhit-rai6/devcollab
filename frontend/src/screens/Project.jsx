import React, { useState, useEffect, useContext, useRef, useCallback } from 'react'
import { UserContext } from '../context/user.context'
import { useLocation, useParams } from 'react-router-dom'
import axios from '../config/axios'
import {
    initializeSocket,
    receiveMessage,
    sendMessage,
    getSocketInstance,
    disconnectSocket
} from '../config/socket'
import Markdown from 'markdown-to-jsx'
import hljs from 'highlight.js'
import { getWebContainer } from '../config/webcontainer'
import 'highlight.js/styles/atom-one-dark.css'
import 'remixicon/fonts/remixicon.css'
import { AIAssistant, downloadProjectAsZip } from '../helper/ai.helper'

function SyntaxHighlightedCode(props) {
    const ref = useRef(null)
    React.useEffect(() => {
        if (ref.current && props.className?.includes('lang-')) {
            hljs.highlightElement(ref.current)
            ref.current.removeAttribute('data-highlighted')
        }
    }, [props.className, props.children])
    return <code {...props} ref={ref} />
}

const Project = () => {
    const location = useLocation()
    const { id } = useParams()
    const { user } = useContext(UserContext)
    const messageBox = useRef(null)

    const [isSidePanelOpen, setIsSidePanelOpen] = useState(false)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedUserId, setSelectedUserId] = useState(new Set())
    const [project, setProject] = useState(location.state?.project || null)
    const [message, setMessage] = useState('')
    const [users, setUsers] = useState([])
    const [messages, setMessages] = useState([])
    const [fileTree, setFileTree] = useState({})
    const [currentFile, setCurrentFile] = useState(null)
    const [openFiles, setOpenFiles] = useState([])
    const [webContainer, setWebContainer] = useState(null)
    const [iframeUrl, setIframeUrl] = useState(null)
    const [runProcess, setRunProcess] = useState(null)
    const [isRunning, setIsRunning] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    // AI states
    const [aiAssistant, setAiAssistant] = useState(null)
    const [isAiTyping, setIsAiTyping] = useState(false)
    const [suggestedCommands, setSuggestedCommands] = useState([])
    const [aiContextMenu, setAiContextMenu] = useState({ visible: false, x: 0, y: 0, selectedText: '' })
    const [aiResponse, setAiResponse] = useState(null)

    // NEW states
    const [onlineUsers, setOnlineUsers] = useState(new Set())
    const [typingUsers, setTypingUsers] = useState(new Set())
    const [searchQuery, setSearchQuery] = useState('')
    const [isSearchOpen, setIsSearchOpen] = useState(false)
    const [historyLoaded, setHistoryLoaded] = useState(false)
    const [chatStats, setChatStats] = useState({ total: 0, ai: 0 })

    const socketInitialized = useRef(false)
    const isSavingRef = useRef(false)
    const fileTreeRef = useRef(fileTree)
    const messagesEndRef = useRef(null)
    const typingTimerRef = useRef(null)

    useEffect(() => { fileTreeRef.current = fileTree }, [fileTree])

    // ── HELPER FUNCTIONS ──────────────────────────────────────────────────────

    const getFileIcon = (filename) => {
        if (filename?.endsWith('.js') || filename?.endsWith('.jsx')) return 'ri-javascript-line'
        if (filename?.endsWith('.ts') || filename?.endsWith('.tsx')) return 'ri-file-code-line'
        if (filename?.endsWith('.json')) return 'ri-braces-line'
        if (filename?.endsWith('.css')) return 'ri-css3-line'
        if (filename?.endsWith('.html')) return 'ri-html5-line'
        if (filename?.endsWith('.md')) return 'ri-markdown-line'
        return 'ri-file-3-line'
    }

    const scrollToBottom = () => {
        if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }

    // ── CORE FUNCTIONS ────────────────────────────────────────────────────────

    const saveFileTree = useCallback(async (ft) => {
        if (!project?._id || isSavingRef.current) return
        isSavingRef.current = true
        try {
            await axios.put('/projects/update-file-tree', { projectId: project._id, fileTree: ft })
        } catch (err) {
            console.error('Error saving file tree:', err)
        } finally {
            isSavingRef.current = false
        }
    }, [project?._id])

    const runApplication = useCallback(async () => {
        if (!webContainer) return
        setIsRunning(true)
        try {
            await webContainer.mount(fileTree)
            if (!fileTree['package.json']) { setIsRunning(false); return }
            const installProcess = await webContainer.spawn('npm', ['install'])
            installProcess.output.pipeTo(new WritableStream({ write(chunk) { console.log('npm install:', chunk) } }))
            await installProcess.exit
            if (runProcess) runProcess.kill()
            const tempRunProcess = await webContainer.spawn('npm', ['start'])
            tempRunProcess.output.pipeTo(new WritableStream({ write(chunk) { console.log('npm start:', chunk) } }))
            setRunProcess(tempRunProcess)
            webContainer.on('server-ready', (port, url) => { setIframeUrl(url); setIsRunning(false) })
        } catch (err) {
            console.error('Error running application:', err)
            setIsRunning(false)
        }
    }, [webContainer, fileTree, runProcess])

    const handleFileClick = useCallback((file) => {
        setCurrentFile(file)
        setOpenFiles(prev => prev.includes(file) ? prev : [...prev, file])
    }, [])

    const closeFile = useCallback((fileToClose, e) => {
        e.stopPropagation()
        setOpenFiles(prev => {
            const newOpen = prev.filter(f => f !== fileToClose)
            if (currentFile === fileToClose) setCurrentFile(newOpen[0] || null)
            return newOpen
        })
    }, [currentFile])

    const retryMountFiles = useCallback(async () => {
        if (!webContainer || !aiResponse?.fileTree) return
        try {
            const mountableFileTree = {}
            for (const [filename, fileData] of Object.entries(aiResponse.fileTree)) {
                const content = fileData.file?.contents || fileData.contents || fileData
                mountableFileTree[filename] = { file: { contents: String(content) } }
            }
            await webContainer.mount(mountableFileTree)
            setFileTree(mountableFileTree)
            await saveFileTree(mountableFileTree)
            const firstFile = Object.keys(mountableFileTree)[0]
            if (firstFile) {
                setCurrentFile(firstFile)
                setOpenFiles(prev => prev.includes(firstFile) ? prev : [...prev, firstFile])
            }
            setMessages(prev => [...prev, {
                sender: { _id: 'ai', email: 'AI Assistant' },
                message: JSON.stringify({ type: 'text', content: '✅ Files mounted successfully!' })
            }])
        } catch (error) {
            console.error('Manual mount failed:', error)
            setMessages(prev => [...prev, {
                sender: { _id: 'ai', email: 'AI Assistant' },
                message: JSON.stringify({ type: 'text', content: `❌ Failed to mount files: ${error.message}` })
            }])
        }
    }, [webContainer, aiResponse, saveFileTree])

    // ── DELETE PROJECT ────────────────────────────────────────────────────────

    const deleteProject = async () => {
        if (!project?._id) return
        const confirmed = window.confirm(`Delete "${project.name}"?\n\nThis permanently deletes all files and chat history.`)
        if (!confirmed) return
        try {
            await axios.delete(`/projects/${project._id}`)
            window.location.href = '/'
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to delete project')
        }
    }

    // ── AI MESSAGE RENDERER ───────────────────────────────────────────────────

    const WriteAiMessage = useCallback((msg) => {
        try {
            const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg
            switch (parsed.type) {
                case 'code':
                case 'mixed':
                    return (
                        <div className="ai-message">
                            <div className="ai-content" style={{ lineHeight: '1.6' }}>
                                <Markdown children={parsed.content} options={{ overrides: { code: { component: SyntaxHighlightedCode, props: { className: 'hljs' } }, pre: { props: { className: 'ai-pre' } } } }} />
                            </div>
                            {parsed.fileTree && Object.keys(parsed.fileTree).length > 0 && (
                                <div className="ai-files" style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(99,102,241,0.08)', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.15)' }}>
                                    {/* File list header with download button */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: '#818cf8', fontSize: '0.8rem' }}>
                                            <i className="ri-file-copy-line"></i>
                                            📁 Generated Files ({Object.keys(parsed.fileTree).length})
                                        </div>
                                        <button
                                            onClick={() => downloadProjectAsZip(parsed.fileTree, project?.name || 'project')}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.65rem', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '7px', color: '#4ade80', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease' }}
                                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.22)' }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.12)' }}
                                        >
                                            <i className="ri-download-2-line"></i> Download
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        {Object.keys(parsed.fileTree).map((file, i) => (
                                            <span key={i} onClick={() => handleFileClick(file)}
                                                style={{ padding: '0.4rem 0.8rem', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '6px', fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace", color: '#a5b4fc', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', transition: 'all 0.15s ease' }}
                                                onMouseEnter={(e) => { e.target.style.background = 'rgba(99,102,241,0.2)'; e.target.style.borderColor = 'rgba(99,102,241,0.3)' }}
                                                onMouseLeave={(e) => { e.target.style.background = 'rgba(99,102,241,0.12)'; e.target.style.borderColor = 'rgba(99,102,241,0.2)' }}
                                            >
                                                <i className={getFileIcon(file)}></i> {file}
                                            </span>
                                        ))}
                                    </div>
                                    <button onClick={retryMountFiles} style={{ marginTop: '0.75rem', padding: '0.4rem 0.8rem', background: 'transparent', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '6px', color: '#818cf8', fontSize: '0.7rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', transition: 'all 0.15s ease' }}
                                        onMouseEnter={(e) => { e.target.style.background = 'rgba(99,102,241,0.1)' }}
                                        onMouseLeave={(e) => { e.target.style.background = 'transparent' }}
                                    >
                                        <i className="ri-refresh-line"></i> Mount Files
                                    </button>
                                </div>
                            )}
                            {parsed.buildCommand && (<div style={{ marginTop: '0.5rem', padding: '0.3rem 0.75rem', background: 'rgba(16,185,129,0.1)', borderRadius: '4px', fontSize: '0.7rem', color: '#4ade80', display: 'inline-block', marginRight: '0.5rem' }}>🔨 {parsed.buildCommand}</div>)}
                            {parsed.startCommand && (<div style={{ marginTop: '0.5rem', padding: '0.3rem 0.75rem', background: 'rgba(59,130,246,0.1)', borderRadius: '4px', fontSize: '0.7rem', color: '#60a5fa', display: 'inline-block' }}>▶️ {parsed.startCommand}</div>)}
                        </div>
                    )
                case 'text':
                default:
                    return (
                        <div className="ai-message ai-text">
                            <Markdown children={parsed.content} options={{ overrides: { code: { component: SyntaxHighlightedCode, props: { className: 'hljs' } }, pre: { props: { className: 'ai-pre' } } } }} />
                        </div>
                    )
            }
        } catch (e) {
            return (
                <div className="ai-message ai-text">
                    <Markdown children={String(msg)} options={{ overrides: { code: { component: SyntaxHighlightedCode, props: { className: 'hljs' } }, pre: { props: { className: 'ai-pre' } } } }} />
                </div>
            )
        }
    }, [handleFileClick, getFileIcon, retryMountFiles, project?.name])

    // ── UI HANDLERS ───────────────────────────────────────────────────────────

    const handleCodeBlur = (e) => {
        if (!currentFile) return
        const ft = { ...fileTree, [currentFile]: { file: { contents: e.target.innerText } } }
        setFileTree(ft)
        saveFileTree(ft)
    }

    const handleUserClick = (uid) => {
        setSelectedUserId(prev => {
            const newSet = new Set(prev)
            newSet.has(uid) ? newSet.delete(uid) : newSet.add(uid)
            return newSet
        })
    }

    const addCollaborators = () => {
        axios.put('/projects/add-user', { projectId: project._id, users: Array.from(selectedUserId) })
            .then(() => { setIsModalOpen(false); setSelectedUserId(new Set()); return axios.get(`/projects/get-project/${project._id}`) })
            .then(res => { setProject(res.data.project); return axios.get('/users/all') })
            .then(res => setUsers(res.data.users))
            .catch(err => { console.error('Error adding collaborators:', err); alert(err.response?.data?.error || 'Failed to add collaborators') })
    }

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
    }

    const send = async () => {
        if (!message.trim() || !user) return
        const userMessage = message.trim()
        const isAICall = userMessage.toLowerCase().includes('@ai') || userMessage.toLowerCase().startsWith('/ai') || userMessage.toLowerCase().startsWith('ai:')
        if (isAICall && aiAssistant) {
            const cleanMessage = userMessage.replace(/^@ai\s*/i, '').replace(/^\/ai\s*/i, '').replace(/^ai:\s*/i, '').trim()
            setIsAiTyping(true)
            await aiAssistant.processCommand(cleanMessage || 'Help me with this project')
            setIsAiTyping(false)
            setMessage('')
        } else if (isAICall && !aiAssistant) {
            alert('🤖 AI Assistant is initializing. Please wait a moment.')
        } else {
            sendMessage('project-message', { message: userMessage, sender: user })
            setMessage('')
        }
    }

    const handleAICommand = useCallback(async (command) => {
        if (aiAssistant) {
            setIsAiTyping(true)
            await aiAssistant.processCommand(command)
            setIsAiTyping(false)
            setMessage('')
            setSuggestedCommands([])
        }
    }, [aiAssistant])

    const handleMessageChange = (e) => {
        const value = e.target.value
        setMessage(value)
        if (value.toLowerCase().includes('@ai')) {
            setSuggestedCommands([
                { command: 'create express server', icon: 'ri-server-line' },
                { command: 'generate react component', icon: 'ri-code-s-slash-line' },
                { command: 'add mongodb schema', icon: 'ri-database-2-line' },
                { command: 'fix bugs', icon: 'ri-bug-line' },
                { command: 'add authentication', icon: 'ri-lock-line' },
                { command: 'create api routes', icon: 'ri-api-line' }
            ])
        } else {
            setSuggestedCommands([])
        }
        // Typing indicator broadcast
        const socket = getSocketInstance()
        if (socket && user?.email) {
            socket.emit('user-typing', { email: user.email })
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
            typingTimerRef.current = setTimeout(() => {
                socket.emit('user-stopped-typing', { email: user.email })
            }, 2000)
        }
    }

    const handleGlobalKeyPress = useCallback((e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault()
            setMessage('@ai ')
            document.querySelector('.chat-input')?.focus()
        }
    }, [])

    useEffect(() => {
        window.addEventListener('keydown', handleGlobalKeyPress)
        return () => window.removeEventListener('keydown', handleGlobalKeyPress)
    }, [handleGlobalKeyPress])

    const handleAIAction = useCallback(async (action, selectedText) => {
        setAiContextMenu({ ...aiContextMenu, visible: false })
        const commands = {
            explain: `Explain this code:\n\n${selectedText}`,
            refactor: `Refactor this code to be more efficient:\n\n${selectedText}`,
            'add-comments': `Add detailed comments to this code:\n\n${selectedText}`,
            'find-bugs': `Find bugs in this code:\n\n${selectedText}`,
            optimize: `Optimize this code:\n\n${selectedText}`
        }
        if (aiAssistant) {
            setIsAiTyping(true)
            await aiAssistant.processCommand(commands[action])
            setIsAiTyping(false)
        }
    }, [aiAssistant, aiContextMenu])

    // ── EFFECTS ───────────────────────────────────────────────────────────────

    // Init WebContainer
    useEffect(() => {
        if (!webContainer) {
            getWebContainer().then(container => { setWebContainer(container) })
        }
    }, [])

    // Fetch project
    useEffect(() => {
        if (!id) return
        const fetchProject = async () => {
            try {
                setLoading(true)
                const res = await axios.get(`/projects/get-project/${id}`)
                setProject(res.data.project)
                setFileTree(res.data.project.fileTree || {})
            } catch (err) {
                setError('Failed to load project')
            } finally {
                setLoading(false)
            }
        }
        if (!project && id) fetchProject()
        else setLoading(false)
    }, [id, project])

    // Load chat history from DB
    useEffect(() => {
        if (!project?._id || historyLoaded) return
        const loadChatHistory = async () => {
            try {
                const res = await axios.get(`/projects/${project._id}/messages?limit=200`)
                const saved = res.data.messages || []
                if (saved.length > 0) {
                    const formatted = saved.map(m => ({
                        sender: m.sender,
                        message: m.message,
                        timestamp: m.createdAt,
                        _dbId: m._id
                    }))
                    setMessages(formatted)
                    setChatStats({ total: saved.length, ai: saved.filter(m => m.type === 'ai').length })
                }
                setHistoryLoaded(true)
            } catch (err) {
                console.warn('Could not load chat history:', err.message)
                setHistoryLoaded(true)
            }
        }
        loadChatHistory()
    }, [project?._id, historyLoaded])

    // Socket setup + persist messages
   useEffect(() => {
        if (!project?._id) return
 
        // Only init socket once per project
        if (!socketInitialized.current) {
            initializeSocket(project._id)
            socketInitialized.current = true
        }
 
        // Always remove old listener before adding new one
        const socket = getSocketInstance()
        if (socket) socket.off('project-message')
 
        receiveMessage('project-message', async (data) => {
            setMessages(prev => {
                // DEDUP: skip if we already have this exact message
                // (prevents double-add when component re-mounts)
                const isDupe = prev.some(m =>
                    m.sender?._id === data.sender?._id &&
                    m.message === data.message &&
                    Math.abs(new Date(m.timestamp) - new Date(data.timestamp || Date.now())) < 2000
                )
                if (isDupe) return prev
                return [...prev, { ...data, timestamp: data.timestamp || new Date() }]
            })
 
            // Persist every incoming message (user + AI) to DB
            try {
                await axios.post('/projects/messages', {
                    projectId: project._id,
                    messages: [{
                        sender:  data.sender,
                        message: data.message,
                        type:    data.sender?._id === 'ai' ? 'ai' : 'user'
                    }]
                })
            } catch (err) {
                // Non-fatal — message still shows in chat
                console.warn('Could not persist message:', err.message)
            }
        })
 
        axios.get(`/projects/get-project/${project._id}`)
            .then(res => { 
                setProject(res.data.project)
                setFileTree(res.data.project.fileTree || {}) 
            })
            .catch(console.error)
 
        axios.get('/users/all')
            .then(res => setUsers(res.data.users))
            .catch(console.error)
            
        return () => {
            const sock = getSocketInstance()
            if (sock) sock.off('project-message')
            socketInitialized.current = false
            if (runProcess) runProcess.kill()
        }
    }, [project?._id, runProcess])
 useEffect(() => {
        if (!project?._id) return
 
        const loadHistory = async () => {
            try {
                const res = await axios.get(`/projects/${project._id}/messages?limit=200`)
                const saved = res.data.messages || []
                if (saved.length > 0) {
                    setMessages(saved.map(m => ({
                        sender:    m.sender,
                        message:   m.message,
                        timestamp: m.createdAt
                    })))
                }
            } catch (err) {
                console.warn('Could not load chat history:', err.message)
            }
        }
 
        loadHistory()
    }, [project?._id]) 
    // Init AI Assistant
    useEffect(() => {
        if (project?._id && webContainer && !aiAssistant) {
            const assistant = new AIAssistant(
                project._id, webContainer, fileTree, setFileTree, saveFileTree,
                (msg) => setMessages(prev => [...prev, msg]),
                setCurrentFile, setOpenFiles,
                () => setMessages(prev => prev.slice(0, -1))
            )
            setAiAssistant(assistant)
        }
    }, [project?._id, webContainer, fileTree, saveFileTree])

    // Scroll on new messages
    useEffect(() => { scrollToBottom() }, [messages])

    // Derived: filtered messages for search
    const filteredMessages = searchQuery.trim()
        ? messages.filter(m => {
            const text = typeof m.message === 'string' ? m.message : JSON.stringify(m.message)
            return text.toLowerCase().includes(searchQuery.toLowerCase())
        })
        : messages

    // ── LOADING / ERROR STATES ────────────────────────────────────────────────

    if (loading) return (
        <>
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap'); body { background: #0a0b0f; }`}</style>
            <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0b0f', fontFamily: "'DM Sans',sans-serif" }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }}></div>
                    <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Loading project…</p>
                </div>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
        </>
    )

    if (error || !project) return (
        <>
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500&display=swap'); body { background: #0a0b0f; }`}</style>
            <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0b0f', fontFamily: "'DM Sans',sans-serif" }}>
                <div style={{ textAlign: 'center' }}>
                    <i className="ri-error-warning-line" style={{ fontSize: '3.5rem', color: '#f87171' }}></i>
                    <p style={{ marginTop: '1rem', fontFamily: "'Syne',sans-serif", color: '#e8e9f0', fontWeight: 700 }}>{error || 'Project not found'}</p>
                    <button onClick={() => window.history.back()} style={{ marginTop: '1.25rem', padding: '0.65rem 1.5rem', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: "'Syne',sans-serif", fontWeight: 600, fontSize: '0.875rem' }}>← Go Back</button>
                </div>
            </div>
        </>
    )

    // ── MAIN RENDER ───────────────────────────────────────────────────────────

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&family=JetBrains+Mono:wght@400;500&display=swap');
                *, *::before, *::after { box-sizing: border-box; }
                .proj-root { height:100vh; width:100vw; display:flex; overflow:hidden; background:#0a0b0f; font-family:'DM Sans',sans-serif; color:#e8e9f0; }
                .proj-left { width:380px; min-width:320px; max-width:440px; flex-shrink:0; height:100%; display:flex; flex-direction:column; background:#0e1117; border-right:1px solid rgba(255,255,255,0.06); position:relative; z-index:10; }
                .chat-header { display:flex; align-items:center; justify-content:space-between; padding:0.85rem 1rem; border-bottom:1px solid rgba(255,255,255,0.06); background:#0a0b0f; flex-shrink:0; }
                .chat-header-left { display:flex; align-items:center; gap:0.6rem; }
                .chat-project-dot { width:8px; height:8px; background:#22c55e; border-radius:50%; box-shadow:0 0 8px rgba(34,197,94,0.5); animation:pulse-green 2s infinite; }
                @keyframes pulse-green { 0%,100%{opacity:1} 50%{opacity:0.5} }
                .chat-project-name { font-family:'Syne',sans-serif; font-size:0.9rem; font-weight:700; color:#e8e9f0; letter-spacing:-0.01em; }
                .chat-header-actions { display:flex; align-items:center; gap:0.4rem; }
                .header-btn { display:flex; align-items:center; gap:0.35rem; background:rgba(99,102,241,0.12); border:1px solid rgba(99,102,241,0.2); border-radius:8px; padding:0.35rem 0.7rem; font-family:'DM Sans',sans-serif; font-size:0.72rem; font-weight:500; color:#818cf8; cursor:pointer; transition:all 0.15s ease; }
                .header-btn:hover { background:rgba(99,102,241,0.2); border-color:rgba(99,102,241,0.35); }
                .header-icon-btn { width:32px; height:32px; background:transparent; border:1px solid rgba(255,255,255,0.07); border-radius:8px; display:flex; align-items:center; justify-content:center; color:#94a3b8; cursor:pointer; font-size:0.95rem; transition:all 0.15s ease; }
                .header-icon-btn:hover { background:rgba(255,255,255,0.06); border-color:rgba(255,255,255,0.12); color:#e8e9f0; }
                .messages-area { flex:1; overflow-y:auto; padding:1rem 0.875rem; display:flex; flex-direction:column; gap:0.75rem; scrollbar-width:thin; scrollbar-color:rgba(255,255,255,0.06) transparent; }
                .messages-area::-webkit-scrollbar { width:4px; }
                .messages-area::-webkit-scrollbar-track { background:transparent; }
                .messages-area::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.07); border-radius:2px; }
                .msg-wrapper { display:flex; flex-direction:column; }
                .msg-wrapper.own { align-items:flex-end; }
                .msg-wrapper.other { align-items:flex-start; }
                .msg-sender { font-size:0.68rem; color:#94a3b8; margin-bottom:0.3rem; padding:0 0.5rem; font-weight:500; }
                .msg-bubble { max-width:88%; padding:0.65rem 0.9rem; border-radius:12px; font-size:0.84rem; line-height:1.5; word-break:break-word; }
                .msg-bubble.own { background:linear-gradient(135deg,#4f46e5,#6366f1); color:#fff; border-bottom-right-radius:4px; box-shadow:0 2px 12px rgba(99,102,241,0.25); }
                .msg-bubble.other { background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); color:#e2e8f0; border-bottom-left-radius:4px; }
                .msg-bubble.ai-bubble { background:rgba(15,17,25,0.9); border:1px solid rgba(99,102,241,0.2); border-left:2px solid #6366f1; border-bottom-left-radius:4px; padding:0.75rem 1rem; max-width:95%; box-shadow:0 4px 20px rgba(0,0,0,0.4); }
                .ai-pre { background:rgba(0,0,0,0.4)!important; border-radius:8px; padding:0.75rem 1rem; overflow:auto; margin:0.5rem 0; border:1px solid rgba(255,255,255,0.07); font-size:0.78rem; }
                .ai-label { display:inline-flex; align-items:center; gap:0.35rem; font-family:'Syne',sans-serif; font-size:0.66rem; font-weight:600; color:#818cf8; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:0.4rem; }
                .chat-input-area { flex-shrink:0; padding:0.75rem; border-top:1px solid rgba(255,255,255,0.06); background:#0a0b0f; }
                .chat-input-wrap { display:flex; align-items:center; gap:0; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.09); border-radius:12px; transition:border-color 0.2s ease; overflow:hidden; }
                .chat-input-wrap:focus-within { border-color:rgba(99,102,241,0.4); background:rgba(99,102,241,0.04); }
                .chat-input { flex:1; background:transparent; border:none; outline:none; padding:0.75rem 1rem; font-family:'DM Sans',sans-serif; font-size:0.84rem; color:#e8e9f0; }
                .chat-input::placeholder { color:#64748b; }
                .send-btn { width:40px; height:40px; border:none; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:1rem; color:#64748b; transition:all 0.15s ease; margin-right:0.3rem; border-radius:8px; flex-shrink:0; }
                .send-btn.active { background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; box-shadow:0 2px 10px rgba(99,102,241,0.35); }
                .send-btn:disabled { cursor:not-allowed; }
                .side-panel { position:absolute; top:0; left:0; width:100%; height:100%; background:#0a0b0f; border-right:1px solid rgba(255,255,255,0.06); transform:translateX(-100%); transition:transform 0.28s cubic-bezier(0.4,0,0.2,1); z-index:20; display:flex; flex-direction:column; }
                .side-panel.open { transform:translateX(0); }
                .side-panel-header { display:flex; align-items:center; justify-content:space-between; padding:1rem; border-bottom:1px solid rgba(255,255,255,0.06); flex-shrink:0; }
                .side-panel-title { font-family:'Syne',sans-serif; font-size:0.95rem; font-weight:700; color:#e8e9f0; }
                .side-close { width:30px; height:30px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); border-radius:7px; display:flex; align-items:center; justify-content:center; color:#94a3b8; cursor:pointer; font-size:0.95rem; transition:all 0.15s ease; }
                .side-close:hover { background:rgba(255,255,255,0.09); color:#e8e9f0; }
                .collab-list { flex:1; overflow-y:auto; padding:0.75rem; display:flex; flex-direction:column; gap:0.35rem; }
                .collab-item { display:flex; align-items:center; gap:0.75rem; padding:0.65rem 0.75rem; border-radius:10px; transition:background 0.15s ease; }
                .collab-item:hover { background:rgba(255,255,255,0.04); }
                .collab-avatar { width:34px; height:34px; border-radius:50%; background:linear-gradient(135deg,#6366f1,#8b5cf6); display:flex; align-items:center; justify-content:center; font-size:0.8rem; color:#fff; font-weight:600; flex-shrink:0; }
                .collab-info { flex:1; min-width:0; }
                .collab-email { font-size:0.82rem; color:#e2e8f0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                .collab-role { font-size:0.68rem; color:#94a3b8; margin-top:0.1rem; }
                .owner-badge { font-size:0.65rem; font-weight:600; background:rgba(99,102,241,0.15); border:1px solid rgba(99,102,241,0.25); color:#818cf8; padding:0.2rem 0.55rem; border-radius:100px; letter-spacing:0.04em; text-transform:uppercase; flex-shrink:0; }
                .proj-right { flex:1; height:100%; display:flex; overflow:hidden; background:#0d0e14; }
                .explorer { width:220px; min-width:220px; height:100%; background:#0a0b0f; border-right:1px solid rgba(255,255,255,0.06); display:flex; flex-direction:column; }
                .explorer-header { display:flex; align-items:center; justify-content:space-between; padding:0.75rem 0.875rem; border-bottom:1px solid rgba(255,255,255,0.06); flex-shrink:0; }
                .explorer-title { font-size:0.68rem; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:0.1em; }
                .file-tree { flex:1; overflow-y:auto; padding:0.5rem; }
                .file-item { display:flex; align-items:center; gap:0.5rem; width:100%; padding:0.45rem 0.65rem; border-radius:7px; border:none; background:transparent; cursor:pointer; text-align:left; color:#94a3b8; font-size:0.8rem; font-family:'JetBrains Mono',monospace; transition:all 0.15s ease; margin-bottom:0.15rem; }
                .file-item:hover { background:rgba(255,255,255,0.04); color:#e2e8f0; }
                .file-item.active { background:rgba(99,102,241,0.12); color:#a5b4fc; border-left:2px solid #6366f1; padding-left:calc(0.65rem - 2px); }
                .explorer-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:0.5rem; color:#64748b; text-align:center; padding:1rem; }
                .explorer-empty i { font-size:2rem; }
                .explorer-empty p { font-size:0.75rem; line-height:1.4; color:#64748b; }
                .code-editor-pane { flex:1; display:flex; flex-direction:column; height:100%; overflow:hidden; }
                .editor-tabs { display:flex; align-items:center; overflow-x:auto; scrollbar-width:none; flex-shrink:0; }
                .editor-tabs::-webkit-scrollbar { display:none; }
                .editor-tab { display:flex; align-items:center; gap:0.4rem; padding:0.6rem 1rem; font-family:'JetBrains Mono',monospace; font-size:0.75rem; color:#94a3b8; cursor:pointer; border-right:1px solid rgba(255,255,255,0.05); transition:all 0.15s ease; white-space:nowrap; flex-shrink:0; border-bottom:2px solid transparent; background:transparent; }
                .editor-tab:hover { color:#e2e8f0; background:rgba(255,255,255,0.03); }
                .editor-tab.active { color:#a5b4fc; background:rgba(99,102,241,0.08); border-bottom-color:#6366f1; }
                .tab-close { width:16px; height:16px; display:flex; align-items:center; justify-content:center; border-radius:3px; border:none; background:transparent; color:inherit; cursor:pointer; font-size:0.7rem; opacity:0; transition:all 0.1s ease; }
                .editor-tab:hover .tab-close { opacity:1; }
                .tab-close:hover { background:rgba(255,255,255,0.1); }
                .run-btn { display:flex; align-items:center; gap:0.5rem; padding:0.4rem 1rem; border-radius:8px; border:none; font-family:'Syne',sans-serif; font-size:0.78rem; font-weight:600; cursor:pointer; transition:all 0.2s ease; letter-spacing:0.02em; }
                .run-btn.enabled { background:linear-gradient(135deg,#059669,#10b981); color:#fff; box-shadow:0 2px 12px rgba(16,185,129,0.25); }
                .run-btn.enabled:hover { box-shadow:0 4px 18px rgba(16,185,129,0.4); transform:translateY(-1px); }
                .run-btn.disabled { background:rgba(255,255,255,0.07); color:#64748b; cursor:not-allowed; }
                .code-content { flex:1; overflow:auto; background:#0d0e14; }
                .code-empty { height:100%; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:0.75rem; color:#64748b; }
                .code-empty i { font-size:3rem; }
                .code-empty p { font-size:0.85rem; color:#64748b; }
                .preview-panel { width:400px; min-width:400px; display:flex; flex-direction:column; border-left:1px solid rgba(255,255,255,0.06); background:#fff; }
                .preview-bar { display:flex; align-items:center; gap:0.5rem; padding:0.5rem 0.75rem; background:#0a0b0f; border-bottom:1px solid rgba(255,255,255,0.06); flex-shrink:0; }
                .preview-url-wrap { flex:1; display:flex; align-items:center; gap:0.4rem; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:7px; padding:0.35rem 0.7rem; }
                .preview-url-input { flex:1; background:transparent; border:none; outline:none; font-family:'JetBrains Mono',monospace; font-size:0.72rem; color:#94a3b8; }
                .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.75); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; z-index:100; animation:fadeIn 0.18s ease; }
                @keyframes fadeIn { from{opacity:0} to{opacity:1} }
                .modal-box { background:#0e1117; border:1px solid rgba(255,255,255,0.08); border-radius:20px; width:480px; max-width:calc(100vw - 2rem); box-shadow:0 24px 80px rgba(0,0,0,0.6); animation:slideUp 0.22s cubic-bezier(0.34,1.56,0.64,1); overflow:hidden; }
                @keyframes slideUp { from{opacity:0;transform:translateY(16px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
                .modal-head { display:flex; align-items:center; justify-content:space-between; padding:1.25rem 1.5rem; border-bottom:1px solid rgba(255,255,255,0.06); }
                .modal-title { font-family:'Syne',sans-serif; font-size:1rem; font-weight:700; color:#e8e9f0; }
                .modal-subtitle { font-size:0.72rem; color:#94a3b8; margin-top:0.2rem; }
                .modal-close-btn { width:30px; height:30px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); border-radius:8px; display:flex; align-items:center; justify-content:center; color:#94a3b8; cursor:pointer; font-size:0.9rem; transition:all 0.15s ease; }
                .modal-close-btn:hover { background:rgba(255,255,255,0.1); color:#e8e9f0; }
                .modal-user-list { max-height:340px; overflow-y:auto; padding:0.75rem; display:flex; flex-direction:column; gap:0.3rem; scrollbar-width:thin; scrollbar-color:rgba(255,255,255,0.06) transparent; }
                .modal-user-item { display:flex; align-items:center; gap:0.75rem; padding:0.7rem 0.875rem; border-radius:10px; border:1.5px solid transparent; cursor:pointer; transition:all 0.15s ease; }
                .modal-user-item.selectable:hover { background:rgba(255,255,255,0.04); }
                .modal-user-item.selected { background:rgba(99,102,241,0.1); border-color:rgba(99,102,241,0.35); }
                .modal-user-item.existing { opacity:0.5; cursor:not-allowed; background:rgba(34,197,94,0.04); }
                .modal-user-item.owner-item { opacity:0.5; cursor:not-allowed; background:rgba(168,85,247,0.04); }
                .modal-avatar { width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg,#6366f1,#8b5cf6); display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:600; color:#fff; flex-shrink:0; }
                .modal-user-email { font-size:0.84rem; color:#e2e8f0; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                .modal-user-status { font-size:0.68rem; color:#94a3b8; margin-top:0.15rem; }
                .modal-check { font-size:1.1rem; color:#6366f1; flex-shrink:0; }
                .modal-status-chip { font-size:0.65rem; font-weight:600; padding:0.2rem 0.55rem; border-radius:100px; text-transform:uppercase; letter-spacing:0.05em; flex-shrink:0; }
                .chip-owner { background:rgba(168,85,247,0.15); color:#c084fc; border:1px solid rgba(168,85,247,0.2); }
                .chip-collab { background:rgba(34,197,94,0.1); color:#4ade80; border:1px solid rgba(34,197,94,0.2); }
                .modal-footer { padding:1rem 1.25rem; border-top:1px solid rgba(255,255,255,0.06); background:rgba(0,0,0,0.2); display:flex; gap:0.75rem; }
                .btn-secondary { flex:1; padding:0.7rem; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); border-radius:10px; font-family:'DM Sans',sans-serif; font-size:0.85rem; color:#94a3b8; cursor:pointer; transition:all 0.15s ease; }
                .btn-secondary:hover { background:rgba(255,255,255,0.08); color:#e2e8f0; }
                .btn-primary { flex:2; padding:0.7rem; background:linear-gradient(135deg,#6366f1,#8b5cf6); border:none; border-radius:10px; font-family:'Syne',sans-serif; font-size:0.85rem; font-weight:700; color:#fff; cursor:pointer; transition:all 0.2s ease; box-shadow:0 4px 16px rgba(99,102,241,0.3); }
                .btn-primary:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 6px 22px rgba(99,102,241,0.45); }
                .btn-primary:disabled { opacity:0.4; cursor:not-allowed; transform:none; }
                .no-users { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:3rem 1rem; color:#64748b; gap:0.5rem; }
                .no-users i { font-size:2.5rem; }
                .no-users p { font-size:0.8rem; }
                @keyframes spin { to{transform:rotate(360deg)} }
                .spin { animation:spin 0.8s linear infinite; }
                @keyframes typingDot { 0%,60%,100%{transform:translateY(0);opacity:0.5} 30%{transform:translateY(-4px);opacity:1} }
            `}</style>

            <main className="proj-root">
                {/* LEFT PANEL - CHAT */}
                <section className="proj-left">

                    {/* HEADER */}
                    <header className="chat-header">
                        <div className="chat-header-left">
                            <div className="chat-project-dot"></div>
                            <div>
                                <span className="chat-project-name">{project.name}</span>
                                {onlineUsers.size > 0 && (
                                    <div style={{ fontSize: '0.62rem', color: '#22c55e', marginTop: '1px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
                                        {onlineUsers.size} online
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="chat-header-actions">
                            <button className="header-icon-btn" onClick={() => setIsSearchOpen(s => !s)} title="Search messages"
                                style={isSearchOpen ? { background: 'rgba(99,102,241,0.15)', borderColor: 'rgba(99,102,241,0.3)', color: '#818cf8' } : {}}>
                                <i className="ri-search-line"></i>
                            </button>
                            <button className="header-btn" onClick={() => downloadProjectAsZip(fileTree, project?.name || 'project')} title="Download all files as ZIP"
                                style={{ background: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.2)', color: '#4ade80' }}>
                                <i className="ri-download-cloud-2-line"></i> ZIP
                            </button>
                            <button className="header-btn" onClick={() => setIsModalOpen(true)}>
                                <i className="ri-user-add-line"></i> Add
                            </button>
                            <button className="header-icon-btn" onClick={() => setIsSidePanelOpen(true)}>
                                <i className="ri-group-line"></i>
                            </button>
                        </div>
                    </header>

                    {/* SEARCH BAR */}
                    {isSearchOpen && (
                        <div style={{ padding: '0.5rem 0.875rem', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <i className="ri-search-line" style={{ color: '#64748b', fontSize: '0.85rem' }}></i>
                            <input type="text" placeholder="Search messages…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} autoFocus
                                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#e8e9f0', fontFamily: "'DM Sans',sans-serif", fontSize: '0.84rem' }} />
                            {searchQuery && <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{filteredMessages.length} result{filteredMessages.length !== 1 ? 's' : ''}</span>}
                            <button onClick={() => { setSearchQuery(''); setIsSearchOpen(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '0.9rem', display: 'flex' }}>
                                <i className="ri-close-line"></i>
                            </button>
                        </div>
                    )}

                    {/* CHAT STATS */}
                    {chatStats.total > 0 && !isSearchOpen && (
                        <div style={{ padding: '0.35rem 1rem', background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: '1rem', fontSize: '0.65rem', color: '#475569' }}>
                            <span><i className="ri-chat-3-line"></i> {chatStats.total} messages</span>
                            <span><i className="ri-sparkling-2-line" style={{ color: '#818cf8' }}></i> {chatStats.ai} AI</span>
                        </div>
                    )}

                    {/* MESSAGES */}
                    <div className="messages-area" ref={messageBox}>
                        {filteredMessages.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                                <i className="ri-chat-3-line" style={{ fontSize: '2.5rem' }}></i>
                                <p style={{ fontSize: '0.78rem', marginTop: '0.75rem' }}>
                                    {searchQuery ? 'No messages match your search' : 'Start the conversation or type @ai to ask AI'}
                                </p>
                            </div>
                        )}
                        {filteredMessages.map((msg, index) => {
                            const isAI = msg.sender?._id === 'ai'
                            const isCurrentUser = msg.sender?._id === user?._id?.toString()
                            return (
                                <div key={index} className={`msg-wrapper ${isAI ? 'other' : isCurrentUser ? 'own' : 'other'}`}>
                                    {!isCurrentUser && (
                                        <div className="msg-sender">
                                            {isAI ? <span className="ai-label"><i className="ri-sparkling-2-line"></i> AI Assistant</span> : msg.sender?.email}
                                        </div>
                                    )}
                                    <div className={`msg-bubble ${isAI ? 'ai-bubble' : isCurrentUser ? 'own' : 'other'}`}>
                                        {isAI ? WriteAiMessage(msg.message) : <span style={{ whiteSpace: 'pre-wrap' }}>{msg.message}</span>}
                                    </div>
                                </div>
                            )
                        })}

                        {/* TYPING INDICATOR */}
                        {[...typingUsers].filter(e => e !== user?.email).length > 0 && (
                            <div className="msg-wrapper other" style={{ opacity: 0.7 }}>
                                <div className="msg-sender">{[...typingUsers].filter(e => e !== user?.email).join(', ')} is typing</div>
                                <div className="msg-bubble other" style={{ padding: '0.5rem 0.9rem' }}>
                                    <span style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                                        {[0, 1, 2].map(i => (
                                            <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#64748b', animation: `typingDot 1.2s ${i * 0.2}s ease-in-out infinite` }}></span>
                                        ))}
                                    </span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* INPUT AREA */}
                    <div className="chat-input-area">
                        {suggestedCommands.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 0.75rem', flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '0.5rem' }}>
                                {suggestedCommands.map((cmd, i) => (
                                    <button key={i} onClick={() => handleAICommand(cmd.command)}
                                        style={{ padding: '0.3rem 0.7rem', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '16px', color: '#a5b4fc', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                                        <i className={cmd.icon}></i>{cmd.command}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="chat-input-wrap">
                            {message.toLowerCase().startsWith('@ai') && (
                                <span style={{ paddingLeft: '1rem', color: '#818cf8', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <i className="ri-sparkling-2-line"></i> AI
                                </span>
                            )}
                            <input className="chat-input" type="text"
                                placeholder={isAiTyping ? 'AI is thinking...' : 'Message… or @ai to ask AI (⌘K)'}
                                value={message} onChange={handleMessageChange} onKeyPress={handleKeyPress} disabled={isAiTyping} />
                            <button className={`send-btn ${message.trim() ? 'active' : ''}`} onClick={send} disabled={!message.trim() || isAiTyping}>
                                <i className={isAiTyping ? 'ri-loader-4-line spin' : 'ri-send-plane-fill'}></i>
                            </button>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 0.75rem', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
                            {[
                                { label: '🚀 Express API', prompt: 'create express server' },
                                { label: '📦 React Component', prompt: 'generate react component' },
                                { label: '🗄️ MongoDB Schema', prompt: 'add mongodb schema' },
                                { label: '🔐 JWT Auth', prompt: 'add authentication' },
                                { label: '💬 Just Chat', prompt: 'hi' }
                            ].map((s, i) => (
                                <button key={i} onClick={() => handleAICommand(s.prompt)}
                                    style={{ padding: '0.4rem 0.8rem', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '20px', color: '#818cf8', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s ease' }}>
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* SIDE PANEL - COLLABORATORS */}
                    <div className={`side-panel ${isSidePanelOpen ? 'open' : ''}`}>
                        <div className="side-panel-header">
                            <span className="side-panel-title">Collaborators</span>
                            <button className="side-close" onClick={() => setIsSidePanelOpen(false)}>
                                <i className="ri-close-line"></i>
                            </button>
                        </div>
                        <div className="collab-list">
                            {project.users?.map((u, i) => (
                                <div key={i} className="collab-item">
                                    <div className="collab-avatar">{u.email?.charAt(0).toUpperCase()}</div>
                                    <div className="collab-info">
                                        <div className="collab-email">{u.email}</div>
                                        <div className="collab-role">{project.owner?._id === u._id ? 'Project Owner' : 'Collaborator'}</div>
                                    </div>
                                    {project.owner?._id === u._id && <span className="owner-badge">Owner</span>}
                                </div>
                            ))}
                        </div>
                        {/* DELETE PROJECT — owner only */}
                        {(project.owner?._id === user?._id?.toString() || project.owner?.email === user?.email) && (
                            <div style={{ padding: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                                <button onClick={deleteProject}
                                    style={{ width: '100%', padding: '0.6rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', cursor: 'pointer', color: '#f87171', fontSize: '0.8rem', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', transition: 'all 0.15s ease' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)' }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}>
                                    <i className="ri-delete-bin-line"></i> Delete Project
                                </button>
                            </div>
                        )}
                    </div>
                </section>

                {/* RIGHT PANEL - IDE */}
                <section className="proj-right">
                    {/* FILE EXPLORER */}
                    <div className="explorer">
                        <div className="explorer-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <i className="ri-folder-3-line" style={{ color: '#94a3b8', fontSize: '0.85rem' }}></i>
                                <span className="explorer-title">Files</span>
                                {Object.keys(fileTree).length > 0 && (
                                    <span style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', borderRadius: '10px', padding: '0 0.4rem', fontSize: '0.6rem', fontWeight: 600 }}>
                                        {Object.keys(fileTree).length}
                                    </span>
                                )}
                            </div>
                            {Object.keys(fileTree).length > 0 && (
                                <button onClick={() => downloadProjectAsZip(fileTree, project?.name || 'project')}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4ade80', fontSize: '0.85rem', display: 'flex', padding: '0.1rem' }} title="Download project ZIP">
                                    <i className="ri-download-2-line"></i>
                                </button>
                            )}
                        </div>
                        <div className="file-tree">
                            {Object.keys(fileTree).length > 0 ? (
                                Object.keys(fileTree).map((file, i) => (
                                    <button key={i} onClick={() => handleFileClick(file)} className={`file-item ${currentFile === file ? 'active' : ''}`}>
                                        <i className={getFileIcon(file)} style={{ fontSize: '0.8rem', flexShrink: 0 }}></i>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file}</span>
                                    </button>
                                ))
                            ) : (
                                <div className="explorer-empty">
                                    <i className="ri-code-box-line"></i>
                                    <p>No files yet.<br />Ask AI to generate code.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* CODE EDITOR */}
                    <div className="code-editor-pane">
                        <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#0a0b0f', flexShrink: 0 }}>
                            <div className="editor-tabs" style={{ flex: 1 }}>
                                {openFiles.map((file, i) => (
                                    <div key={i} className={`editor-tab ${currentFile === file ? 'active' : ''}`} onClick={() => setCurrentFile(file)}>
                                        <i className={getFileIcon(file)} style={{ fontSize: '0.8rem' }}></i>
                                        {file}
                                        <button className="tab-close" onClick={(e) => closeFile(file, e)}>
                                            <i className="ri-close-line"></i>
                                        </button>
                                    </div>
                                ))}
                            </div>
                            {/* RUN BUTTON */}
                            <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.75rem', borderLeft: '1px solid rgba(255,255,255,0.06)', gap: '0.5rem', flexShrink: 0 }}>
                                <button
                                    className={`run-btn ${fileTree['package.json'] && !isRunning ? 'enabled' : 'disabled'}`}
                                    onClick={runApplication}
                                    disabled={!fileTree['package.json'] || isRunning}
                                >
                                    {isRunning ? <><i className="ri-loader-4-line spin"></i> Running</> : <><i className="ri-play-fill"></i> Run</>}
                                </button>
                            </div>
                        </div>

                        <div className="code-content">
                            {fileTree[currentFile] ? (
                                <div style={{ height: '100%', width: '100%', background: '#0d0e14' }}>
                                    <pre style={{ height: '100%', margin: 0, padding: '1.25rem' }}>
                                        <code className="hljs"
                                            style={{ outline: 'none', display: 'block', minHeight: '100%', fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', lineHeight: '1.7', whiteSpace: 'pre-wrap', wordWrap: 'break-word', background: 'transparent' }}
                                            contentEditable suppressContentEditableWarning onBlur={handleCodeBlur}
                                            dangerouslySetInnerHTML={{ __html: hljs.highlight(fileTree[currentFile].file.contents, { language: 'javascript' }).value }}
                                        />
                                    </pre>
                                </div>
                            ) : (
                                <div className="code-empty">
                                    <i className="ri-file-code-line"></i>
                                    <p>Select a file to start editing</p>
                                </div>
                            )}
                        </div>

                        {/* AI CONTEXT MENU */}
                        {aiContextMenu.visible && (
                            <div style={{ position: 'fixed', top: aiContextMenu.y, left: aiContextMenu.x, background: '#1a1c24', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.25rem', boxShadow: '0 12px 40px rgba(0,0,0,0.6)', zIndex: 1000, minWidth: '180px' }}>
                                {[
                                    { action: 'explain', icon: 'ri-question-line', label: 'Explain Code' },
                                    { action: 'refactor', icon: 'ri-refactor-line', label: 'Refactor' },
                                    { action: 'add-comments', icon: 'ri-chat-1-line', label: 'Add Comments' },
                                    { action: 'find-bugs', icon: 'ri-bug-line', label: 'Find Bugs' },
                                    { action: 'optimize', icon: 'ri-flashlight-line', label: 'Optimize' }
                                ].map((item, i) => (
                                    <button key={i} onClick={() => handleAIAction(item.action, aiContextMenu.selectedText)}
                                        style={{ width: '100%', padding: '0.6rem 1rem', background: 'transparent', border: 'none', borderRadius: '6px', color: '#e2e8f0', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}
                                        onMouseEnter={(e) => e.target.style.background = 'rgba(99,102,241,0.12)'}
                                        onMouseLeave={(e) => e.target.style.background = 'transparent'}>
                                        <i className={item.icon} style={{ color: '#818cf8' }}></i>{item.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* PREVIEW PANEL */}
                    {iframeUrl && webContainer && (
                        <div className="preview-panel">
                            <div className="preview-bar">
                                <div className="preview-url-wrap">
                                    <span style={{ fontSize: '0.7rem', color: '#22c55e' }}><i className="ri-lock-line"></i></span>
                                    <input className="preview-url-input" type="text" value={iframeUrl} onChange={(e) => setIframeUrl(e.target.value)} />
                                </div>
                                <button style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem' }}>
                                    <i className="ri-refresh-line"></i>
                                </button>
                            </div>
                            <iframe src={iframeUrl} style={{ width: '100%', flex: 1, border: 'none', background: '#fff' }} title="Preview" sandbox="allow-scripts allow-same-origin allow-forms allow-modals" />
                        </div>
                    )}
                </section>
            </main>

            {/* ADD COLLABORATORS MODAL */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && (setIsModalOpen(false), setSelectedUserId(new Set()))}>
                    <div className="modal-box">
                        <div className="modal-head">
                            <div>
                                <div className="modal-title">Add Collaborators</div>
                                <div className="modal-subtitle">Select users to invite to <strong style={{ color: '#818cf8' }}>{project.name}</strong></div>
                            </div>
                            <button className="modal-close-btn" onClick={() => { setIsModalOpen(false); setSelectedUserId(new Set()) }}>
                                <i className="ri-close-line"></i>
                            </button>
                        </div>
                        <div className="modal-user-list">
                            {users.length > 0 ? users.map(u => {
                                const isAlreadyCollaborator = project.users?.some(pu => pu._id === u._id)
                                const isOwner = project.owner?._id === u._id
                                const isSelected = selectedUserId.has(u._id)
                                const isSelectable = !isOwner && !isAlreadyCollaborator
                                return (
                                    <div key={u._id}
                                        className={`modal-user-item ${isSelectable ? 'selectable' : ''} ${isSelected ? 'selected' : ''} ${isAlreadyCollaborator ? 'existing' : ''} ${isOwner ? 'owner-item' : ''}`}
                                        onClick={() => isSelectable && handleUserClick(u._id)}>
                                        <div className="modal-avatar">{u.email?.charAt(0).toUpperCase()}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div className="modal-user-email">{u.email}</div>
                                            <div className="modal-user-status">{isOwner ? 'Project owner' : isAlreadyCollaborator ? 'Already a collaborator' : 'Click to select'}</div>
                                        </div>
                                        {isOwner && <span className="modal-status-chip chip-owner">Owner</span>}
                                        {isAlreadyCollaborator && !isOwner && <span className="modal-status-chip chip-collab">Added</span>}
                                        {isSelected && <i className="ri-checkbox-circle-fill modal-check"></i>}
                                    </div>
                                )
                            }) : (
                                <div className="no-users">
                                    <i className="ri-user-search-line"></i>
                                    <p>No users found</p>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => { setIsModalOpen(false); setSelectedUserId(new Set()) }}>Cancel</button>
                            <button className="btn-primary" onClick={addCollaborators} disabled={selectedUserId.size === 0}>
                                Add {selectedUserId.size > 0 ? `${selectedUserId.size} ` : ''}Collaborator{selectedUserId.size !== 1 ? 's' : ''}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

export default Project
