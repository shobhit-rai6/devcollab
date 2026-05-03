// backend/server.js
// Changes: every socket message is now saved to MongoDB via messageModel

import 'dotenv/config';
import http from 'http';
import app from './app.js';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import projectModel from './models/project.model.js';
import messageModel from './models/message.model.js';   // ← NEW
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

// ── Socket auth middleware ───────────────────────────────────────────────────
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token ||
                      socket.handshake.headers.authorization?.split(' ')[1];
        const projectId = socket.handshake.query.projectId;

        if (!token)     return next(new Error('Authentication error: No token'));
        if (!projectId) return next(new Error('Project ID is required'));
        if (!mongoose.Types.ObjectId.isValid(projectId))
            return next(new Error('Invalid projectId format'));

        let decoded;
        try { decoded = jwt.verify(token, process.env.JWT_SECRET); }
        catch (e) { return next(new Error('Authentication error: Invalid token')); }

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

// ── Helper: persist a message to MongoDB ────────────────────────────────────
async function persistMessage({ projectId, sender, message, type = 'user' }) {
    try {
        await messageModel.create({ project: projectId, sender, message, type });
    } catch (err) {
        // Non-fatal — log but don't crash the socket handler
        console.error('⚠️  Failed to persist message:', err.message);
    }
}

// ── Socket connection handler ────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log('✅ User connected:', socket.user?.email);
    socket.join(socket.roomId);

    socket.to(socket.roomId).emit('user-joined', {
        message: `${socket.user?.email} joined the project`,
        user: socket.user
    });

    // ── Incoming project message ─────────────────────────────────────────────
    socket.on('project-message', async (data) => {
        try {
            const userMsg = data.message;
            const sender  = {
                _id:   socket.user._id || socket.user.id || socket.user.email,
                email: socket.user.email
            };

            const outgoing = { message: userMsg, sender, timestamp: new Date() };

            // Broadcast to everyone in room (including sender)
            io.to(socket.roomId).emit('project-message', outgoing);

            // ── Persist user message ─────────────────────────────────────────
            await persistMessage({
                projectId: socket.roomId,
                sender,
                message:   userMsg,
                type:      'user'
            });

            // ── Handle @ai mention ───────────────────────────────────────────
            const aiMentioned = userMsg.toLowerCase().includes('@ai');
            if (aiMentioned) {
                const prompt = userMsg.replace(/@ai/gi, '').trim();

                try {
                    const result = await generateResult(prompt);

                    let aiPayload;
                    try { aiPayload = JSON.parse(result); }
                    catch { aiPayload = { text: result, fileTree: null }; }

                    const aiResponse = {
                        text:         aiPayload.text         || 'I processed your request',
                        fileTree:     aiPayload.fileTree     || null,
                        buildCommand: aiPayload.buildCommand || null,
                        startCommand: aiPayload.startCommand || null
                    };

                    const aiSender = { _id: 'ai', email: 'AI Assistant' };
                    const aiMsg    = JSON.stringify(aiResponse);

                    io.to(socket.roomId).emit('project-message', {
                        message:   aiMsg,
                        sender:    aiSender,
                        timestamp: new Date()
                    });

                    // ── Persist AI message ───────────────────────────────────
                    await persistMessage({
                        projectId: socket.roomId,
                        sender:    aiSender,
                        message:   aiMsg,
                        type:      'ai'
                    });

                } catch (aiErr) {
                    console.error('❌ AI generation error:', aiErr.message);

                    const errText = '⚠️ AI is unavailable right now. Try again in a moment.';
                    const aiSender = { _id: 'ai', email: 'AI Assistant' };

                    io.to(socket.roomId).emit('project-message', {
                        message:   JSON.stringify({ type: 'text', content: errText }),
                        sender:    aiSender,
                        timestamp: new Date()
                    });

                    await persistMessage({
                        projectId: socket.roomId,
                        sender:    aiSender,
                        message:   JSON.stringify({ type: 'text', content: errText }),
                        type:      'ai'
                    });
                }
            }
        } catch (err) {
            console.error('Error handling project-message:', err);
        }
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        console.log('👋 User disconnected:', socket.user?.email);
        socket.to(socket.roomId).emit('user-left', {
            message: `${socket.user?.email} left the project`,
            user: socket.user
        });
        socket.leave(socket.roomId);
    });

    socket.on('error', (err) => console.error('Socket error:', err));
});

server.listen(port, () => console.log(`🚀 Server running on port ${port}`));

process.on('SIGINT', () => {
    io.close();
    server.close();
    process.exit(0);
});
