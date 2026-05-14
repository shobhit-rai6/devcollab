import 'dotenv/config';
import http from 'http';
import app from './app.js';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import projectModel from './models/project.model.js';
import messageModel from './models/message.model.js';
import { generateResult } from './services/ai.service.js';

const port = process.env.PORT || 3000;
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true,
        allowedHeaders: ['Authorization', 'Content-Type']
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

// ── Socket auth middleware ────────────────────────────────────────────────────
io.use(async (socket, next) => {
    try {
        const token =
            socket.handshake.auth?.token ||
            socket.handshake.headers.authorization?.split(' ')[1];
        const projectId = socket.handshake.query.projectId;

        if (!token)     return next(new Error('Authentication error: No token'));
        if (!projectId) return next(new Error('Project ID is required'));
        if (!mongoose.Types.ObjectId.isValid(projectId))
            return next(new Error('Invalid projectId format'));

        let decoded;
        try { decoded = jwt.verify(token, process.env.JWT_SECRET); }
        catch { return next(new Error('Authentication error: Invalid token')); }

        const project = await projectModel.findById(projectId);
        if (!project) return next(new Error('Project not found'));

        socket.project = project;
        socket.user    = decoded;
        socket.roomId  = project._id.toString();
        next();
    } catch (err) {
        next(err);
    }
});

// ── Persist a message to MongoDB (non-fatal) ─────────────────────────────────
async function persistMessage({ projectId, sender, message, type = 'user' }) {
    try {
        await messageModel.create({ project: projectId, sender, message, type });
    } catch (err) {
        console.error('⚠️  Failed to persist message:', err.message);
    }
}

// ── Safe JSON parse helper ────────────────────────────────────────────────────
// BUG FIX: ai.controller.js did JSON.parse(result) but result was already an
// object when generateResult returns parsed JSON — this caused a crash.
// We now safely handle both string and object returns from AI service.
function safeParseAI(raw) {
    if (typeof raw === 'object' && raw !== null) return raw;
    try { return JSON.parse(raw); }
    catch { return { type: 'text', content: String(raw) }; }
}

// ── Connection handler ────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log('✅ User connected:', socket.user?.email);
    socket.join(socket.roomId);

    socket.to(socket.roomId).emit('user-joined', {
        message: `${socket.user?.email} joined the project`,
        user:    socket.user
    });

    // ── Typing indicators ─────────────────────────────────────────────────────
    // NEW FEATURE: broadcast typing state to all other room members
    socket.on('typing-start', () => {
        socket.to(socket.roomId).emit('user-typing', { email: socket.user?.email });
    });

    socket.on('typing-stop', () => {
        socket.to(socket.roomId).emit('user-stop-typing', { email: socket.user?.email });
    });

    // ── Online presence ───────────────────────────────────────────────────────
    // NEW FEATURE: broadcast current user count on join/leave
    const roomSockets = io.sockets.adapter.rooms.get(socket.roomId);
    io.to(socket.roomId).emit('online-count', { count: roomSockets?.size || 1 });

    // ── Incoming project message ──────────────────────────────────────────────
    socket.on('project-message', async (data) => {
        try {
            // BUG FIX: Guard against missing/malformed data
            if (!data || typeof data.message !== 'string') return;

            const userMsg = data.message.trim();
            if (!userMsg) return;

            const sender = {
                _id:   socket.user._id || socket.user.id || socket.user.email,
                email: socket.user.email
            };

            const outgoing = { message: userMsg, sender, timestamp: new Date() };

            // Broadcast to everyone in room (including sender)
            io.to(socket.roomId).emit('project-message', outgoing);

            // Persist user message
            await persistMessage({ projectId: socket.roomId, sender, message: userMsg, type: 'user' });

            // ── Handle @ai mention ────────────────────────────────────────────
            if (userMsg.toLowerCase().includes('@ai')) {
                // Emit AI typing indicator
                io.to(socket.roomId).emit('ai-typing', { typing: true });

                try {
                    const rawResult = await generateResult(userMsg);
                    // BUG FIX: safeParseAI handles both string and object returns
                    const parsed    = safeParseAI(rawResult);
                    const aiMessage = JSON.stringify(parsed);

                    const aiSender = { _id: 'ai', email: 'AI Assistant' };

                    io.to(socket.roomId).emit('project-message', {
                        message:   aiMessage,
                        sender:    aiSender,
                        timestamp: new Date()
                    });

                    await persistMessage({
                        projectId: socket.roomId,
                        sender:    aiSender,
                        message:   aiMessage,
                        type:      'ai'
                    });
                } catch (aiErr) {
                    console.error('AI generation error:', aiErr.message);
                    const errMsg = JSON.stringify({
                        type:    'text',
                        content: `⚠️ AI error: ${aiErr.message}`
                    });
                    io.to(socket.roomId).emit('project-message', {
                        message:   errMsg,
                        sender:    { _id: 'ai', email: 'AI Assistant' },
                        timestamp: new Date()
                    });
                } finally {
                    io.to(socket.roomId).emit('ai-typing', { typing: false });
                }
            }
        } catch (err) {
            console.error('project-message handler error:', err.message);
        }
    });

    // ── AI message broadcast (from frontend Ollama/Claude path) ─────────────
    // Persists and rebroadcasts AI-generated messages so all room members see them
    socket.on('ai-message', async (data) => {
        if (!data?.message) return;
        const aiSender = { _id: 'ai', email: 'AI Assistant' };
        io.to(socket.roomId).emit('project-message', {
            message:   data.message,
            sender:    aiSender,
            timestamp: new Date()
        });
        await persistMessage({
            projectId: socket.roomId,
            sender:    aiSender,
            message:   data.message,
            type:      'ai'
        });
    });

    // ── File tree sync ────────────────────────────────────────────────────────
    // NEW FEATURE: real-time file tree sync between collaborators
    socket.on('file-tree-update', (data) => {
        // BUG FIX: validate before broadcasting
        if (!data || typeof data.fileTree !== 'object') return;
        socket.to(socket.roomId).emit('file-tree-updated', {
            fileTree:  data.fileTree,
            updatedBy: socket.user?.email
        });
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        console.log('❌ User disconnected:', socket.user?.email);
        socket.to(socket.roomId).emit('user-left', {
            message: `${socket.user?.email} left the project`,
            user:    socket.user
        });
        // Update online count after disconnect
        const remaining = io.sockets.adapter.rooms.get(socket.roomId);
        io.to(socket.roomId).emit('online-count', { count: remaining?.size || 0 });
    });
});

server.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
