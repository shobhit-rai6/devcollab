import 'dotenv/config';
import http from 'http';
import app from './app.js';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import projectModel from './models/project.model.js';
import { generateResult } from './services/ai.service.js';

const port = process.env.PORT || 3000;

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:5173', // Your frontend URL
        methods: ['GET', 'POST'],
        credentials: true,
        allowedHeaders: ['Authorization', 'Content-Type']
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

// Authentication middleware
io.use(async (socket, next) => {
    try {
        console.log('Authenticating socket...');
        
        // Get token from handshake auth or headers
        const token = socket.handshake.auth?.token || 
                     socket.handshake.headers.authorization?.split(' ')[1];
        
        const projectId = socket.handshake.query.projectId;

        console.log('Project ID:', projectId);
        console.log('Token exists:', !!token);

        // Validate token
        if (!token) {
            return next(new Error('Authentication error: No token provided'));
        }

        // Validate projectId
        if (!projectId) {
            return next(new Error('Project ID is required'));
        }

        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            return next(new Error('Invalid projectId format'));
        }

        // Verify JWT token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
            console.error('JWT verification failed:', jwtError.message);
            return next(new Error('Authentication error: Invalid token'));
        }

        if (!decoded) {
            return next(new Error('Authentication error: Invalid token payload'));
        }

        // Find project
        const project = await projectModel.findById(projectId);
        if (!project) {
            return next(new Error('Project not found'));
        }

        // Attach data to socket
        socket.project = project;
        socket.user = decoded;
        socket.roomId = project._id.toString();

        console.log('Socket authenticated successfully for user:', decoded.email);
        next();

    } catch (error) {
        console.error('Socket authentication error:', error);
        next(error);
    }
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.user?.email);
    console.log('Room ID:', socket.roomId);

    // Join the project room
    socket.join(socket.roomId);
    
    // Notify others in the room
    socket.to(socket.roomId).emit('user-joined', {
        message: `${socket.user?.email} joined the project`,
        user: socket.user
    });

    // Handle project messages
    socket.on('project-message', async (data) => {
    try {
        console.log('Received message from:', socket.user?.email);
        console.log('Message:', data.message);

        const message = data.message;
        const sender = {
            _id: socket.user._id || socket.user.id,
            email: socket.user.email
        };

        // Broadcast message to everyone in the room
        io.to(socket.roomId).emit('project-message', {
            message: data.message,
            sender: sender,
            timestamp: new Date()
        });

        // Check if AI is mentioned
        const aiIsPresentInMessage = message.toLowerCase().includes('@ai');
        
        if (aiIsPresentInMessage) {
            console.log('AI mentioned in message, generating response...');
            
            const prompt = message.replace(/@ai/gi, '').trim();
            
            try {
                const result = await generateResult(prompt);
                
                // Parse the result to ensure it's valid
                let aiResponse;
                try {
                    aiResponse = JSON.parse(result);
                } catch (e) {
                    aiResponse = {
                        text: result,
                        fileTree: null
                    };
                }

                // Ensure the response has the expected structure
                const formattedResponse = {
                    text: aiResponse.text || 'I processed your request',
                    fileTree: aiResponse.fileTree || null,
                    buildCommand: aiResponse.buildCommand || null,
                    startCommand: aiResponse.startCommand || null
                };

                // Send AI response to the room
                io.to(socket.roomId).emit('project-message', {
                    message: JSON.stringify(formattedResponse),
                    sender: {
                        _id: 'ai',
                        email: 'AI Assistant'
                    },
                    timestamp: new Date()
                });
                
                console.log('AI response sent successfully');
                
            } // When AI generation fails
catch (aiError) {
    console.error('❌ AI generation error:', aiError.message);
    
    // Send a clear, helpful error message
    const errorResponse = {
        text: "⚠️ **Google AI API Not Activated**\n\nTo use the AI feature, you need to:\n\n1. Go to https://aistudio.google.com/app/apikey\n2. Delete your current API key\n3. Create a **new** API key\n4. **Accept the Terms of Service**\n5. Copy the new key to your .env file\n6. Restart the backend server\n\nOnce you've done these steps, the AI will work!",
        fileTree: null
    };
    
    io.to(socket.roomId).emit('project-message', {
        message: JSON.stringify(errorResponse),
        sender: {
            _id: 'ai',
            email: 'AI Assistant'
        },
        timestamp: new Date()
    });
}
        }
    } catch (error) {
        console.error('Error handling project message:', error);
    }
});

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.user?.email);
        
        // Notify others
        socket.to(socket.roomId).emit('user-left', {
            message: `${socket.user?.email} left the project`,
            user: socket.user
        });
        
        socket.leave(socket.roomId);
    });

    // Handle errors
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('Closing server...');
    io.close();
    server.close();
    process.exit(0);
});