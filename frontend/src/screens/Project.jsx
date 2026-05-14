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

// ─── Syntax-highlighted code block ───────────────────────────────────────────
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

// ─── File content helpers ─────────────────────────────────────────────────────
function getFileContents(value) {
    if (!value) return ''
    if (typeof value === 'string') return value
    if (typeof value?.file?.contents === 'string') return value.file.contents
    if (typeof value?.contents === 'string') return value.contents
    return String(value)
}

function normaliseFileTree(raw) {
    if (!raw || typeof raw !== 'object') return {}
    const out = {}
    for (const [k, v] of Object.entries(raw)) {
        out[k] = { file: { contents: getFileContents(v) } }
    }
    return out
}

// ─── Build nested WebContainer structure ─────────────────────────────────────
function buildNestedStructure(fileTree) {
    const root = {}
    for (const [path, data] of Object.entries(fileTree)) {
        const content = typeof data === 'string'
            ? data
            : (data?.file?.contents ?? data?.contents ?? JSON.stringify(data, null, 2))
        const parts = path.replace(/\\/g, '/').replace(/^\/+/, '').split('/').filter(Boolean)
        let current = root
        for (let i = 0; i < parts.length - 1; i++) {
            const dir = parts[i]
            if (!current[dir]) current[dir] = { directory: {} }
            else if (current[dir].file) current[dir] = { directory: {} }
            else if (!current[dir].directory) current[dir].directory = {}
            current = current[dir].directory
        }
        const filename = parts[parts.length - 1]
        if (filename && !filename.includes('/') && !current[filename]?.directory) {
            current[filename] = { file: { contents: String(content) } }
        }
    }
    return root
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getFileIcon = (filename) => {
    if (!filename) return 'ri-file-3-line'
    if (filename.endsWith('.js') || filename.endsWith('.jsx')) return 'ri-javascript-line'
    if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'ri-file-code-line'
    if (filename.endsWith('.json')) return 'ri-braces-line'
    if (filename.endsWith('.css'))  return 'ri-css3-line'
    if (filename.endsWith('.html')) return 'ri-html5-line'
    if (filename.endsWith('.md'))   return 'ri-markdown-line'
    return 'ri-file-3-line'
}

const THINKING_CONTENT = '🤔 Thinking…'

// ─── Main Component ───────────────────────────────────────────────────────────
const Project = () => {
    const location = useLocation()
    const { id }   = useParams()
    const { user } = useContext(UserContext)
    const messageBox = useRef(null)

    // ── State ─────────────────────────────────────────────────────────────────
    const [isSidePanelOpen, setIsSidePanelOpen] = useState(false)
    const [isModalOpen,     setIsModalOpen]     = useState(false)
    const [selectedUserId,  setSelectedUserId]  = useState(new Set())
    const [project,         setProject]         = useState(location.state?.project || null)
    const [message,         setMessage]         = useState('')
    const [users,           setUsers]           = useState([])
    const [messages,        setMessages]        = useState([])
    const [fileTree,        setFileTree]        = useState({})
    const [currentFile,     setCurrentFile]     = useState(null)
    const [openFiles,       setOpenFiles]       = useState([])
    const [webContainer,    setWebContainer]    = useState(null)
    const [iframeUrl,       setIframeUrl]       = useState(null)
    const [runProcess,      setRunProcess]      = useState(null)
    const [isRunning,       setIsRunning]       = useState(false)
    const [loading,         setLoading]         = useState(true)
    const [error,           setError]           = useState(null)
    const [aiAssistant,     setAiAssistant]     = useState(null)
    const [isAiTyping,      setIsAiTyping]      = useState(false)
    const [suggestedCmds,   setSuggestedCmds]   = useState([])
    const [onlineUsers,     setOnlineUsers]     = useState(new Set())
    const [typingUsers,     setTypingUsers]     = useState(new Set())
    const [searchQuery,     setSearchQuery]     = useState('')
    const [isSearchOpen,    setIsSearchOpen]    = useState(false)
    const [chatStats,       setChatStats]       = useState({ total: 0, ai: 0 })

    // ── Refs ──────────────────────────────────────────────────────────────────
    const socketInitialized = useRef(false)
    const isSavingRef       = useRef(false)
    const fileTreeRef       = useRef(fileTree)
    const messagesEndRef    = useRef(null)
    const typingTimerRef    = useRef(null)
    const historyLoadedRef  = useRef(false)

    useEffect(() => { fileTreeRef.current = fileTree }, [fileTree])

    // ── Scroll to bottom ──────────────────────────────────────────────────────
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [])

    // ── Save file tree ────────────────────────────────────────────────────────
    const saveFileTree = useCallback(async (ft) => {
        if (!project?._id || isSavingRef.current) return
        isSavingRef.current = true
        try {
            await axios.put('/projects/update-file-tree', { projectId: project._id, fileTree: ft })
        } catch (err) {
            console.error('[Project] Error saving file tree:', err)
        } finally {
            isSavingRef.current = false
        }
    }, [project?._id])

    // ── AI message helpers ────────────────────────────────────────────────────
    // addMessage: appends any message object to state
    const addMessage = useCallback((msg) => {
        setMessages(prev => [...prev, msg])
    }, [])

    // removeMessage: removes the most recent "🤔 Thinking…" bubble specifically
    const removeThinkingMessage = useCallback(() => {
        setMessages(prev => {
            const reversed = [...prev].reverse()
            const idx = reversed.findIndex(m => {
                try {
                    return JSON.parse(m.message)?.content === THINKING_CONTENT
                } catch { return false }
            })
            if (idx === -1) return prev
            const realIdx = prev.length - 1 - idx
            return prev.filter((_, i) => i !== realIdx)
        })
    }, [])

    // broadcastAIMessage: add to local state immediately (sender never gets
    // their own socket echo) AND emit to collaborators via socket
    const broadcastAIMessage = useCallback((msgStr) => {
        const localMsg = {
            sender:    { _id: 'ai', email: 'AI Assistant' },
            message:   msgStr,
            timestamp: new Date()
        }
        setMessages(prev => [...prev, localMsg])
        sendMessage('ai-message', {
            message: msgStr,
            sender:  { _id: 'ai', email: 'AI Assistant' }
        })
    }, [])

    // ── Run app in WebContainer ───────────────────────────────────────────────
    const runApplication = useCallback(async () => {
        if (!webContainer) return
        setIsRunning(true)
        try {
            const nested = buildNestedStructure(normaliseFileTree(fileTree))
            await webContainer.mount(nested)
            if (!fileTree['package.json']) { setIsRunning(false); return }

            const installProcess = await webContainer.spawn('npm', ['install'])
            installProcess.output.pipeTo(
                new WritableStream({ write(chunk) { console.log('[npm install]', chunk) } })
            )
            await installProcess.exit

            if (runProcess) await runProcess.kill()

            const tempRunProcess = await webContainer.spawn('npm', ['start'])
            tempRunProcess.output.pipeTo(
                new WritableStream({ write(chunk) { console.log('[npm start]', chunk) } })
            )
            setRunProcess(tempRunProcess)
            webContainer.once('server-ready', (_port, url) => {
                setIframeUrl(url)
                setIsRunning(false)
            })
        } catch (err) {
            console.error('[Project] Error running application:', err)
            setIsRunning(false)
        }
    }, [webContainer, fileTree, runProcess])

    // ── File tab helpers ──────────────────────────────────────────────────────
    const handleFileClick = useCallback((file) => {
        setCurrentFile(file)
        setOpenFiles(prev => prev.includes(file) ? prev : [...prev, file])
    }, [])

    const closeFile = useCallback((fileToClose, e) => {
        e.stopPropagation()
        setOpenFiles(prev => {
            const next = prev.filter(f => f !== fileToClose)
            if (currentFile === fileToClose) setCurrentFile(next[0] || null)
            return next
        })
    }, [currentFile])

    // ── Mount files from AI message's fileTree ────────────────────────────────
    const mountFiles = useCallback(async (ft) => {
        if (!webContainer || !ft || !Object.keys(ft).length) return
        try {
            const normalised = normaliseFileTree(ft)
            const nested     = buildNestedStructure(normalised)
            await webContainer.mount(nested)
            setFileTree(prev => ({ ...prev, ...normalised }))
            await saveFileTree({ ...fileTreeRef.current, ...normalised })
            const firstFile = Object.keys(normalised)[0]
            if (firstFile) {
                setCurrentFile(firstFile)
                setOpenFiles(prev => prev.includes(firstFile) ? prev : [...prev, firstFile])
            }
            setMessages(prev => [...prev, {
                sender:  { _id: 'ai', email: 'AI Assistant' },
                message: JSON.stringify({ type: 'text', content: '✅ Files mounted successfully!' })
            }])
        } catch (err) {
            console.error('[Project] Manual mount failed:', err)
            setMessages(prev => [...prev, {
                sender:  { _id: 'ai', email: 'AI Assistant' },
                message: JSON.stringify({ type: 'text', content: `❌ Failed to mount files: ${err.message}` })
            }])
        }
    }, [webContainer, saveFileTree])

    // ── Delete project ────────────────────────────────────────────────────────
    const deleteProject = async () => {
        if (!project?._id) return
        const confirmed = window.confirm(
            `Delete "${project.name}"?\n\nThis permanently deletes all files and chat history.`
        )
        if (!confirmed) return
        try {
            await axios.delete(`/projects/${project._id}`)
            window.location.href = '/'
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to delete project')
        }
    }

    // ── AI message renderer ───────────────────────────────────────────────────
    const WriteAiMessage = useCallback((msg) => {
        let parsed
        try {
            parsed = typeof msg === 'string' ? JSON.parse(msg) : msg
        } catch {
            return (
                <div className="ai-message ai-text">
                    <Markdown
                        children={String(msg)}
                        options={{ overrides: { code: { component: SyntaxHighlightedCode } } }}
                    />
                </div>
            )
        }

        if (parsed.type === 'code' || parsed.type === 'mixed') {
            return (
                <div className="ai-message">
                    <div className="ai-content" style={{ lineHeight: '1.6' }}>
                        <Markdown
                            children={parsed.content || ''}
                            options={{
                                overrides: {
                                    code: { component: SyntaxHighlightedCode, props: { className: 'hljs' } },
                                    pre:  { props: { className: 'ai-pre' } }
                                }
                            }}
                        />
                    </div>

                    {parsed.fileTree && Object.keys(parsed.fileTree).length > 0 && (
                        <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(99,102,241,0.08)', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.15)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: '#818cf8', fontSize: '0.8rem' }}>
                                    <i className="ri-file-copy-line"></i>
                                    Generated Files ({Object.keys(parsed.fileTree).length})
                                </div>
                                <button
                                    onClick={() => downloadProjectAsZip(parsed.fileTree, project?.name || 'project')}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.65rem', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '7px', color: '#4ade80', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>
                                    <i className="ri-download-2-line"></i> Download
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {Object.keys(parsed.fileTree).map((file, i) => (
                                    <span
                                        key={i}
                                        onClick={() => {
                                            const normalised = normaliseFileTree(parsed.fileTree)
                                            setFileTree(prev => ({ ...prev, ...normalised }))
                                            saveFileTree({ ...fileTreeRef.current, ...normalised })
                                            handleFileClick(file)
                                        }}
                                        style={{ padding: '0.4rem 0.8rem', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '6px', fontSize: '0.75rem', fontFamily: "'JetBrains Mono', monospace", color: '#a5b4fc', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <i className={getFileIcon(file)}></i> {file}
                                    </span>
                                ))}
                            </div>

                            <button
                                onClick={() => mountFiles(parsed.fileTree)}
                                style={{ marginTop: '0.75rem', padding: '0.4rem 0.8rem', background: 'transparent', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '6px', color: '#818cf8', fontSize: '0.7rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                <i className="ri-refresh-line"></i> Mount Files
                            </button>
                        </div>
                    )}

                    {parsed.buildCommand && (
                        <div style={{ marginTop: '0.5rem', padding: '0.3rem 0.75rem', background: 'rgba(16,185,129,0.1)', borderRadius: '4px', fontSize: '0.7rem', color: '#4ade80', display: 'inline-block', marginRight: '0.5rem' }}>
                            {parsed.buildCommand}
                        </div>
                    )}
                    {parsed.startCommand && (
                        <div style={{ marginTop: '0.5rem', padding: '0.3rem 0.75rem', background: 'rgba(59,130,246,0.1)', borderRadius: '4px', fontSize: '0.7rem', color: '#60a5fa', display: 'inline-block' }}>
                            {parsed.startCommand}
                        </div>
                    )}
                </div>
            )
        }

        // type === 'text' or fallback
        return (
            <div className="ai-message ai-text">
                <Markdown
                    children={parsed.content || String(msg)}
                    options={{
                        overrides: {
                            code: { component: SyntaxHighlightedCode, props: { className: 'hljs' } },
                            pre:  { props: { className: 'ai-pre' } }
                        }
                    }}
                />
            </div>
        )
    }, [handleFileClick, mountFiles, project?.name, saveFileTree])

    // ── Code editor save on blur ──────────────────────────────────────────────
    const handleCodeBlur = (e) => {
        if (!currentFile) return
        const ft = { ...fileTree, [currentFile]: { file: { contents: e.target.innerText } } }
        setFileTree(ft)
        saveFileTree(ft)
    }

    // ── Collaborator modal ────────────────────────────────────────────────────
    const handleUserClick = (uid) => {
        setSelectedUserId(prev => {
            const s = new Set(prev)
            s.has(uid) ? s.delete(uid) : s.add(uid)
            return s
        })
    }

    const addCollaborators = () => {
        axios.put('/projects/add-user', {
            projectId: project._id,
            users: Array.from(selectedUserId)
        })
            .then(() => { setIsModalOpen(false); setSelectedUserId(new Set()); return axios.get(`/projects/get-project/${project._id}`) })
            .then(res => { setProject(res.data.project); return axios.get('/users/all') })
            .then(res => setUsers(res.data.users))
            .catch(err => alert(err.response?.data?.error || 'Failed to add collaborators'))
    }

    // ── Message send ──────────────────────────────────────────────────────────
    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
    }

    const send = async () => {
        if (!message.trim() || !user) return
        const userMessage = message.trim()
        const isAICall = userMessage.toLowerCase().includes('@ai') ||
                         userMessage.toLowerCase().startsWith('/ai') ||
                         userMessage.toLowerCase().startsWith('ai:')

        if (isAICall && aiAssistant) {
            sendMessage('project-message', { message: userMessage, sender: user })
            setMessage('')
            const clean = userMessage
                .replace(/^@ai\s*/i, '')
                .replace(/^\/ai\s*/i, '')
                .replace(/^ai:\s*/i, '')
                .trim()
            setIsAiTyping(true)
            await aiAssistant.processCommand(clean || 'Help me with this project')
            setIsAiTyping(false)
        } else if (isAICall && !aiAssistant) {
            alert('⏳ AI Assistant is initializing. Please wait a moment.')
        } else {
            sendMessage('project-message', { message: userMessage, sender: user })
            setMessage('')
        }
    }

    const handleAICommand = useCallback(async (command) => {
        if (!aiAssistant) return
        setIsAiTyping(true)
        await aiAssistant.processCommand(command)
        setIsAiTyping(false)
        setMessage('')
        setSuggestedCmds([])
    }, [aiAssistant])

    const handleMessageChange = (e) => {
        setMessage(e.target.value)
        setSuggestedCmds(e.target.value.toLowerCase().includes('@ai') ? [
            { command: 'create express server',    icon: 'ri-server-line' },
            { command: 'generate react component', icon: 'ri-code-s-slash-line' },
            { command: 'add mongodb schema',       icon: 'ri-database-2-line' },
            { command: 'fix bugs',                 icon: 'ri-bug-line' },
            { command: 'add authentication',       icon: 'ri-lock-line' },
            { command: 'create api routes',        icon: 'ri-api-line' }
        ] : [])

        const socket = getSocketInstance()
        if (socket && user?.email) {
            socket.emit('typing-start', {})
            clearTimeout(typingTimerRef.current)
            typingTimerRef.current = setTimeout(() => socket.emit('typing-stop', {}), 2000)
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

    // ── Effects ───────────────────────────────────────────────────────────────

    // Init WebContainer
    useEffect(() => {
        if (!webContainer) {
            getWebContainer().then(container => setWebContainer(container))
        }
    }, [])

    // Fetch project
    useEffect(() => {
        if (!id) return
        if (project) { setLoading(false); return }
        const fetchProject = async () => {
            try {
                setLoading(true)
                const res = await axios.get(`/projects/get-project/${id}`)
                setProject(res.data.project)
                setFileTree(normaliseFileTree(res.data.project.fileTree || {}))
            } catch {
                setError('Failed to load project')
            } finally {
                setLoading(false)
            }
        }
        fetchProject()
    }, [id])

    // Load chat history — single effect with ref-flag to prevent double load
    useEffect(() => {
        if (!project?._id || historyLoadedRef.current) return
        historyLoadedRef.current = true
        const loadHistory = async () => {
            try {
                const res  = await axios.get(`/projects/${project._id}/messages?limit=200`)
                const saved = res.data.messages || []
                if (saved.length > 0) {
                    setMessages(saved.map(m => ({
                        sender:    m.sender,
                        message:   m.message,
                        timestamp: m.createdAt,
                        _dbId:     m._id
                    })))
                    setChatStats({
                        total: saved.length,
                        ai:    saved.filter(m => m.type === 'ai').length
                    })
                }
            } catch (err) {
                console.warn('[Project] Could not load chat history:', err.message)
            }
        }
        loadHistory()
    }, [project?._id])

    // Socket init + all message listeners
    useEffect(() => {
        if (!project?._id) return
        if (!socketInitialized.current) {
            initializeSocket(project._id)
            socketInitialized.current = true
        }

        const socket = getSocketInstance()
        if (socket) {
            socket.off('project-message')
            socket.off('ai-message')
        }

        // ── Chat messages from other users ────────────────────────────────
        receiveMessage('project-message', (data) => {
            setMessages(prev => {
                const isDupe = prev.some(m =>
                    m.sender?._id  === data.sender?._id &&
                    m.message      === data.message &&
                    Math.abs(new Date(m.timestamp || 0) - new Date(data.timestamp || Date.now())) < 2000
                )
                if (isDupe) return prev
                return [...prev, { ...data, timestamp: data.timestamp || new Date() }]
            })
        })

        // ── AI responses received by OTHER collaborators ───────────────────
        // (The sender's own screen is updated directly in broadcastAIMessage)
        receiveMessage('ai-message', (data) => {
            setMessages(prev => {
                // Only apply if this didn't originate from us (avoid double-add)
                const isDupe = prev.some(m =>
                    m.sender?._id === 'ai' &&
                    m.message     === data.message &&
                    Math.abs(new Date(m.timestamp || 0) - new Date(data.timestamp || Date.now())) < 2000
                )
                if (isDupe) return prev
                return [...prev, {
                    sender:    { _id: 'ai', email: 'AI Assistant' },
                    message:   data.message,
                    timestamp: data.timestamp || new Date()
                }]
            })
        })

        // ── Typing indicators ─────────────────────────────────────────────
        receiveMessage('user-typing',      ({ email }) =>
            setTypingUsers(prev => new Set([...prev, email])))
        receiveMessage('user-stop-typing', ({ email }) =>
            setTypingUsers(prev => { const s = new Set(prev); s.delete(email); return s }))

        // ── Online presence ───────────────────────────────────────────────
        receiveMessage('online-count', ({ count }) => {
            setOnlineUsers(new Set(Array.from({ length: count }, (_, i) => i)))
        })

        // ── File tree sync from collaborators ─────────────────────────────
        receiveMessage('file-tree-updated', ({ fileTree: ft }) => {
            setFileTree(normaliseFileTree(ft))
        })

        // Load fresh project + users
        axios.get(`/projects/get-project/${project._id}`)
            .then(res => {
                setProject(res.data.project)
                setFileTree(normaliseFileTree(res.data.project.fileTree || {}))
            })
            .catch(console.error)

        axios.get('/users/all')
            .then(res => setUsers(res.data.users))
            .catch(console.error)

        return () => {
            disconnectSocket()
            socketInitialized.current = false
        }
    }, [project?._id])

    // Kill run process on unmount
    useEffect(() => {
        return () => { if (runProcess) runProcess.kill() }
    }, [runProcess])

    // Init AI Assistant — wires up the three message callbacks correctly
    useEffect(() => {
        if (!project?._id || !webContainer || aiAssistant) return

        const assistant = new AIAssistant(
            project._id,
            webContainer,
            fileTreeRef,
            setFileTree,
            saveFileTree,
            // addMessage — used for "🤔 Thinking…" bubble
            addMessage,
            setCurrentFile,
            setOpenFiles,
            // removeMessage — removes only the thinking bubble
            removeThinkingMessage,
            // broadcastAIMessage — adds to local state AND emits to collaborators
            broadcastAIMessage
        )
        setAiAssistant(assistant)
    }, [project?._id, webContainer, saveFileTree, addMessage, removeThinkingMessage, broadcastAIMessage])

    // Scroll on new messages
    useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

    // ── Derived values ────────────────────────────────────────────────────────
    const filteredMessages = searchQuery.trim()
        ? messages.filter(m => {
            const text = typeof m.message === 'string' ? m.message : JSON.stringify(m.message)
            return text.toLowerCase().includes(searchQuery.toLowerCase())
        })
        : messages

    const currentFileContents = currentFile ? getFileContents(fileTree[currentFile]) : ''
    let highlightedCode = ''
    if (currentFileContents) {
        try {
            const lang = currentFile?.endsWith('.css')  ? 'css'
                : currentFile?.endsWith('.html') ? 'html'
                : currentFile?.endsWith('.json') ? 'json'
                : currentFile?.endsWith('.md')   ? 'markdown'
                : 'javascript'
            highlightedCode = hljs.highlight(currentFileContents, { language: lang }).value
        } catch {
            highlightedCode = currentFileContents
        }
    }

    // ── Loading / error ───────────────────────────────────────────────────────
    if (loading) return (
        <>
            <style>{`body{background:#0a0b0f}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0b0f', fontFamily: "'DM Sans',sans-serif" }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }}></div>
                    <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Loading project…</p>
                </div>
            </div>
        </>
    )

    if (error || !project) return (
        <>
            <style>{`body{background:#0a0b0f}`}</style>
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0b0f' }}>
                <div style={{ textAlign: 'center' }}>
                    <i className="ri-error-warning-line" style={{ fontSize: '3.5rem', color: '#f87171' }}></i>
                    <p style={{ marginTop: '1rem', color: '#e8e9f0', fontWeight: 700 }}>{error || 'Project not found'}</p>
                    <button onClick={() => window.history.back()} style={{ marginTop: '1.25rem', padding: '0.65rem 1.5rem', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>
                        Go Back
                    </button>
                </div>
            </div>
        </>
    )

    // ── Render ────────────────────────────────────────────────────────────────
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
                .header-btn { display:flex; align-items:center; gap:0.35rem; background:rgba(99,102,241,0.12); border:1px solid rgba(99,102,241,0.2); border-radius:8px; padding:0.35rem 0.7rem; font-size:0.72rem; font-weight:500; color:#818cf8; cursor:pointer; transition:all 0.15s ease; }
                .header-btn:hover { background:rgba(99,102,241,0.2); }
                .header-icon-btn { width:32px; height:32px; background:transparent; border:1px solid rgba(255,255,255,0.07); border-radius:8px; display:flex; align-items:center; justify-content:center; color:#94a3b8; cursor:pointer; font-size:0.95rem; transition:all 0.15s ease; }
                .header-icon-btn:hover { background:rgba(255,255,255,0.06); color:#e8e9f0; }
                .messages-area { flex:1; overflow-y:auto; padding:1rem 0.875rem; display:flex; flex-direction:column; gap:0.75rem; scrollbar-width:thin; scrollbar-color:rgba(255,255,255,0.06) transparent; }
                .messages-area::-webkit-scrollbar { width:4px; }
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
                .chat-input-wrap { display:flex; align-items:center; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.09); border-radius:12px; transition:border-color 0.2s ease; overflow:hidden; }
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
                .collab-list { flex:1; overflow-y:auto; padding:0.75rem; display:flex; flex-direction:column; gap:0.35rem; }
                .collab-item { display:flex; align-items:center; gap:0.75rem; padding:0.65rem 0.75rem; border-radius:10px; }
                .collab-avatar { width:34px; height:34px; border-radius:50%; background:linear-gradient(135deg,#6366f1,#8b5cf6); display:flex; align-items:center; justify-content:center; font-size:0.8rem; color:#fff; font-weight:600; flex-shrink:0; }
                .collab-email { font-size:0.82rem; color:#e2e8f0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
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
                .code-editor-pane { flex:1; display:flex; flex-direction:column; height:100%; overflow:hidden; }
                .editor-tabs { display:flex; align-items:center; overflow-x:auto; scrollbar-width:none; flex-shrink:0; }
                .editor-tab { display:flex; align-items:center; gap:0.4rem; padding:0.6rem 1rem; font-family:'JetBrains Mono',monospace; font-size:0.75rem; color:#94a3b8; cursor:pointer; border-right:1px solid rgba(255,255,255,0.05); transition:all 0.15s ease; white-space:nowrap; flex-shrink:0; border-bottom:2px solid transparent; background:transparent; }
                .editor-tab:hover { color:#e2e8f0; background:rgba(255,255,255,0.03); }
                .editor-tab.active { color:#a5b4fc; background:rgba(99,102,241,0.08); border-bottom-color:#6366f1; }
                .tab-close { width:16px; height:16px; display:flex; align-items:center; justify-content:center; border-radius:3px; border:none; background:transparent; color:inherit; cursor:pointer; font-size:0.7rem; opacity:0; transition:all 0.1s ease; }
                .editor-tab:hover .tab-close { opacity:1; }
                .run-btn { display:flex; align-items:center; gap:0.5rem; padding:0.4rem 1rem; border-radius:8px; border:none; font-family:'Syne',sans-serif; font-size:0.78rem; font-weight:600; cursor:pointer; transition:all 0.2s ease; }
                .run-btn.enabled { background:linear-gradient(135deg,#059669,#10b981); color:#fff; box-shadow:0 2px 12px rgba(16,185,129,0.25); }
                .run-btn.disabled { background:rgba(255,255,255,0.07); color:#64748b; cursor:not-allowed; }
                .code-content { flex:1; overflow:auto; background:#0d0e14; }
                .code-empty { height:100%; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:0.75rem; color:#64748b; }
                .preview-panel { width:400px; min-width:400px; display:flex; flex-direction:column; border-left:1px solid rgba(255,255,255,0.06); }
                .preview-bar { display:flex; align-items:center; gap:0.5rem; padding:0.5rem 0.75rem; background:#0a0b0f; border-bottom:1px solid rgba(255,255,255,0.06); flex-shrink:0; }
                .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.75); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; z-index:100; }
                .modal-box { background:#0e1117; border:1px solid rgba(255,255,255,0.08); border-radius:20px; width:480px; max-width:calc(100vw - 2rem); box-shadow:0 24px 80px rgba(0,0,0,0.6); overflow:hidden; }
                .modal-head { display:flex; align-items:center; justify-content:space-between; padding:1.25rem 1.5rem; border-bottom:1px solid rgba(255,255,255,0.06); }
                .modal-title { font-family:'Syne',sans-serif; font-size:1rem; font-weight:700; color:#e8e9f0; }
                .modal-user-list { max-height:340px; overflow-y:auto; padding:0.75rem; display:flex; flex-direction:column; gap:0.3rem; }
                .modal-user-item { display:flex; align-items:center; gap:0.75rem; padding:0.7rem 0.875rem; border-radius:10px; border:1.5px solid transparent; cursor:pointer; transition:all 0.15s ease; }
                .modal-user-item.selectable:hover { background:rgba(255,255,255,0.04); }
                .modal-user-item.selected { background:rgba(99,102,241,0.1); border-color:rgba(99,102,241,0.35); }
                .modal-user-item.existing,.modal-user-item.owner-item { opacity:0.5; cursor:not-allowed; }
                .modal-avatar { width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg,#6366f1,#8b5cf6); display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:600; color:#fff; flex-shrink:0; }
                .modal-footer { padding:1rem 1.25rem; border-top:1px solid rgba(255,255,255,0.06); display:flex; gap:0.75rem; }
                .btn-secondary { flex:1; padding:0.7rem; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); border-radius:10px; font-size:0.85rem; color:#94a3b8; cursor:pointer; }
                .btn-primary { flex:2; padding:0.7rem; background:linear-gradient(135deg,#6366f1,#8b5cf6); border:none; border-radius:10px; font-family:'Syne',sans-serif; font-size:0.85rem; font-weight:700; color:#fff; cursor:pointer; }
                .btn-primary:disabled { opacity:0.4; cursor:not-allowed; }
                .modal-status-chip { font-size:0.65rem; font-weight:600; padding:0.2rem 0.55rem; border-radius:100px; text-transform:uppercase; letter-spacing:0.05em; flex-shrink:0; }
                .chip-owner { background:rgba(168,85,247,0.15); color:#c084fc; border:1px solid rgba(168,85,247,0.2); }
                .chip-collab { background:rgba(34,197,94,0.1); color:#4ade80; border:1px solid rgba(34,197,94,0.2); }
                @keyframes spin { to{transform:rotate(360deg)} }
                .spin { animation:spin 0.8s linear infinite; display:inline-block; }
                @keyframes typingDot { 0%,60%,100%{transform:translateY(0);opacity:0.5} 30%{transform:translateY(-4px);opacity:1} }
            `}</style>

            <main className="proj-root">
                {/* ── LEFT: CHAT ─────────────────────────────────────────── */}
                <section className="proj-left">
                    <header className="chat-header">
                        <div className="chat-header-left">
                            <div className="chat-project-dot"></div>
                            <div>
                                <span className="chat-project-name">{project.name}</span>
                                {onlineUsers.size > 0 && (
                                    <div style={{ fontSize: '0.62rem', color: '#22c55e', marginTop: '1px' }}>
                                        {onlineUsers.size} online
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="chat-header-actions">
                            <button className="header-icon-btn" onClick={() => setIsSearchOpen(s => !s)}>
                                <i className="ri-search-line"></i>
                            </button>
                            <button
                                className="header-btn"
                                onClick={() => downloadProjectAsZip(fileTree, project?.name || 'project')}
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

                    {isSearchOpen && (
                        <div style={{ padding: '0.5rem 0.875rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <i className="ri-search-line" style={{ color: '#64748b' }}></i>
                            <input
                                type="text" placeholder="Search messages…" value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)} autoFocus
                                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#e8e9f0', fontFamily: "'DM Sans',sans-serif", fontSize: '0.84rem' }}
                            />
                            {searchQuery && (
                                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                    {filteredMessages.length} result{filteredMessages.length !== 1 ? 's' : ''}
                                </span>
                            )}
                            <button
                                onClick={() => { setSearchQuery(''); setIsSearchOpen(false) }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}>
                                <i className="ri-close-line"></i>
                            </button>
                        </div>
                    )}

                    {chatStats.total > 0 && !isSearchOpen && (
                        <div style={{ padding: '0.35rem 1rem', background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: '1rem', fontSize: '0.65rem', color: '#475569' }}>
                            <span><i className="ri-chat-3-line"></i> {chatStats.total} messages</span>
                            <span><i className="ri-sparkling-2-line" style={{ color: '#818cf8' }}></i> {chatStats.ai} AI</span>
                        </div>
                    )}

                    <div className="messages-area" ref={messageBox}>
                        {filteredMessages.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                                <i className="ri-chat-3-line" style={{ fontSize: '2.5rem' }}></i>
                                <p style={{ fontSize: '0.78rem', marginTop: '0.75rem' }}>
                                    {searchQuery
                                        ? 'No messages match your search'
                                        : 'Start the conversation or type @ai to ask AI'}
                                </p>
                            </div>
                        )}

                        {filteredMessages.map((msg, index) => {
                            const isAI          = msg.sender?._id === 'ai'
                            const isCurrentUser = msg.sender?._id === user?._id?.toString()
                                               || msg.sender?.email === user?.email
                            return (
                                <div key={index} className={`msg-wrapper ${isCurrentUser && !isAI ? 'own' : 'other'}`}>
                                    {!isCurrentUser && (
                                        <div className="msg-sender">
                                            {isAI
                                                ? <span className="ai-label"><i className="ri-sparkling-2-line"></i> AI Assistant</span>
                                                : msg.sender?.email}
                                        </div>
                                    )}
                                    <div className={`msg-bubble ${isAI ? 'ai-bubble' : isCurrentUser ? 'own' : 'other'}`}>
                                        {isAI
                                            ? WriteAiMessage(msg.message)
                                            : <span style={{ whiteSpace: 'pre-wrap' }}>{msg.message}</span>}
                                    </div>
                                </div>
                            )
                        })}

                        {[...typingUsers].filter(e => e !== user?.email).length > 0 && (
                            <div className="msg-wrapper other" style={{ opacity: 0.7 }}>
                                <div className="msg-sender">
                                    {[...typingUsers].filter(e => e !== user?.email).join(', ')} is typing
                                </div>
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

                    <div className="chat-input-area">
                        {suggestedCmds.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '0.5rem' }}>
                                {suggestedCmds.map((cmd, i) => (
                                    <button key={i} onClick={() => handleAICommand(cmd.command)}
                                        style={{ padding: '0.3rem 0.7rem', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '16px', color: '#a5b4fc', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                                        <i className={cmd.icon}></i>{cmd.command}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="chat-input-wrap">
                            {message.toLowerCase().startsWith('@ai') && (
                                <span style={{ paddingLeft: '1rem', color: '#818cf8', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                                    <i className="ri-sparkling-2-line"></i> AI
                                </span>
                            )}
                            <input
                                className="chat-input"
                                type="text"
                                placeholder={isAiTyping ? 'AI is thinking…' : 'Message or @ai to ask AI (⌘K)'}
                                value={message}
                                onChange={handleMessageChange}
                                onKeyDown={handleKeyPress}
                                disabled={isAiTyping}
                            />
                            <button
                                className={`send-btn ${message.trim() ? 'active' : ''}`}
                                onClick={send}
                                disabled={!message.trim() || isAiTyping}>
                                <i className={isAiTyping ? 'ri-loader-4-line spin' : 'ri-send-plane-fill'}></i>
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            {[
                                { label: '⚡ Express API',      prompt: 'create express server' },
                                { label: '⚛ React Component',  prompt: 'generate react component' },
                                { label: '🍃 MongoDB Schema',   prompt: 'add mongodb schema' },
                                { label: '🔐 JWT Auth',         prompt: 'add authentication' },
                                { label: '💬 Just Chat',        prompt: 'hi' }
                            ].map((s, i) => (
                                <button key={i} onClick={() => handleAICommand(s.prompt)}
                                    style={{ padding: '0.4rem 0.8rem', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '20px', color: '#818cf8', fontSize: '0.75rem', cursor: 'pointer' }}>
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Collaborators side panel */}
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
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="collab-email">{u.email}</div>
                                        <div className="collab-role">
                                            {project.owner?._id === u._id ? 'Project Owner' : 'Collaborator'}
                                        </div>
                                    </div>
                                    {project.owner?._id === u._id && (
                                        <span className="owner-badge">Owner</span>
                                    )}
                                </div>
                            ))}
                        </div>
                        {(project.owner?._id === user?._id?.toString() || project.owner?.email === user?.email) && (
                            <div style={{ padding: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                                <button
                                    onClick={deleteProject}
                                    style={{ width: '100%', padding: '0.6rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', cursor: 'pointer', color: '#f87171', fontSize: '0.8rem', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                                    <i className="ri-delete-bin-line"></i> Delete Project
                                </button>
                            </div>
                        )}
                    </div>
                </section>

                {/* ── RIGHT: IDE ──────────────────────────────────────────── */}
                <section className="proj-right">
                    {/* File explorer */}
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
                        </div>
                        <div className="file-tree">
                            {Object.keys(fileTree).length > 0
                                ? Object.keys(fileTree).map((file, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleFileClick(file)}
                                        className={`file-item ${currentFile === file ? 'active' : ''}`}>
                                        <i className={getFileIcon(file)} style={{ fontSize: '0.8rem', flexShrink: 0 }}></i>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file}</span>
                                    </button>
                                ))
                                : (
                                    <div className="explorer-empty">
                                        <i className="ri-code-box-line"></i>
                                        <p>No files yet.<br />Ask AI to generate code.</p>
                                    </div>
                                )
                            }
                        </div>
                    </div>

                    {/* Code editor */}
                    <div className="code-editor-pane">
                        <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#0a0b0f', flexShrink: 0 }}>
                            <div className="editor-tabs" style={{ flex: 1 }}>
                                {openFiles.map((file, i) => (
                                    <div
                                        key={i}
                                        className={`editor-tab ${currentFile === file ? 'active' : ''}`}
                                        onClick={() => setCurrentFile(file)}>
                                        <i className={getFileIcon(file)} style={{ fontSize: '0.8rem' }}></i>
                                        {file}
                                        <button className="tab-close" onClick={(e) => closeFile(file, e)}>
                                            <i className="ri-close-line"></i>
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.75rem', borderLeft: '1px solid rgba(255,255,255,0.06)', gap: '0.5rem', flexShrink: 0 }}>
                                {/* <button
                                    className={`run-btn ${fileTree['package.json'] && !isRunning ? 'enabled' : 'disabled'}`}
                                    onClick={runApplication}
                                    disabled={!fileTree['package.json'] || isRunning}>
                                    {isRunning
                                        ? <><i className="ri-loader-4-line spin"></i> Running</>
                                        : <><i className="ri-play-fill"></i> Run</>}
                                </button> */}
                            </div>
                        </div>

                        <div className="code-content">
                            {currentFile && currentFileContents ? (
                                <div style={{ height: '100%', background: '#0d0e14' }}>
                                    <pre style={{ height: '100%', margin: 0, padding: '1.25rem' }}>
                                        <code
                                            className="hljs"
                                            style={{ outline: 'none', display: 'block', minHeight: '100%', fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', lineHeight: '1.7', whiteSpace: 'pre-wrap', wordWrap: 'break-word', background: 'transparent' }}
                                            contentEditable
                                            suppressContentEditableWarning
                                            onBlur={handleCodeBlur}
                                            dangerouslySetInnerHTML={{ __html: highlightedCode }}
                                        />
                                    </pre>
                                </div>
                            ) : (
                                <div className="code-empty">
                                    <i className="ri-file-code-line"></i>
                                    <p>{currentFile ? 'File is empty' : 'Select a file to start editing'}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Preview panel */}
                    {iframeUrl && webContainer && (
                        <div className="preview-panel">
                            <div className="preview-bar">
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '7px', padding: '0.35rem 0.7rem' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#22c55e' }}><i className="ri-lock-line"></i></span>
                                    <input
                                        style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: '0.72rem', color: '#94a3b8' }}
                                        type="text" value={iframeUrl}
                                        onChange={e => setIframeUrl(e.target.value)}
                                    />
                                </div>
                            </div>
                            <iframe
                                src={iframeUrl}
                                style={{ width: '100%', flex: 1, border: 'none', background: '#fff' }}
                                title="Preview"
                                sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
                            />
                        </div>
                    )}
                </section>
            </main>

            {/* Add Collaborators Modal */}
            {isModalOpen && (
                <div
                    className="modal-overlay"
                    onClick={e => e.target === e.currentTarget && (setIsModalOpen(false), setSelectedUserId(new Set()))}>
                    <div className="modal-box">
                        <div className="modal-head">
                            <div>
                                <div className="modal-title">Add Collaborators</div>
                                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                                    Select users to invite to <strong style={{ color: '#818cf8' }}>{project.name}</strong>
                                </div>
                            </div>
                            <button
                                onClick={() => { setIsModalOpen(false); setSelectedUserId(new Set()) }}
                                style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem' }}>
                                <i className="ri-close-line"></i>
                            </button>
                        </div>

                        <div className="modal-user-list">
                            {users.length > 0 ? users.map(u => {
                                const isAlreadyCollab = project.users?.some(pu => pu._id === u._id)
                                const isOwner         = project.owner?._id === u._id
                                const isSelected      = selectedUserId.has(u._id)
                                const isSelectable    = !isOwner && !isAlreadyCollab
                                return (
                                    <div
                                        key={u._id}
                                        className={`modal-user-item ${isSelectable ? 'selectable' : ''} ${isSelected ? 'selected' : ''} ${isAlreadyCollab ? 'existing' : ''} ${isOwner ? 'owner-item' : ''}`}
                                        onClick={() => isSelectable && handleUserClick(u._id)}>
                                        <div className="modal-avatar">{u.email?.charAt(0).toUpperCase()}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.84rem', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                                            <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                                                {isOwner ? 'Project owner' : isAlreadyCollab ? 'Already a collaborator' : 'Click to select'}
                                            </div>
                                        </div>
                                        {isOwner         && <span className="modal-status-chip chip-owner">Owner</span>}
                                        {isAlreadyCollab && !isOwner && <span className="modal-status-chip chip-collab">Added</span>}
                                        {isSelected      && <i className="ri-checkbox-circle-fill" style={{ color: '#6366f1', fontSize: '1.1rem', flexShrink: 0 }}></i>}
                                    </div>
                                )
                            }) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem 1rem', color: '#64748b', gap: '0.5rem' }}>
                                    <i className="ri-user-search-line" style={{ fontSize: '2.5rem' }}></i>
                                    <p style={{ fontSize: '0.8rem' }}>No users found</p>
                                </div>
                            )}
                        </div>

                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => { setIsModalOpen(false); setSelectedUserId(new Set()) }}>
                                Cancel
                            </button>
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