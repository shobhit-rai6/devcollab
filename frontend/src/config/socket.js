import { io } from 'socket.io-client';

let socketInstance = null;

export const initializeSocket = (projectId) => {
    if (socketInstance) {
        socketInstance.disconnect();
        socketInstance = null;
    }

    const token = localStorage.getItem('token');
    // BUG FIX: io() with no URL argument connects to the page's own origin,
    // which is correct for same-origin but WRONG when the API is on a different
    // port/host (e.g. Vite dev on :5173, backend on :3000).
    // Now we explicitly use VITE_API_URL so it works in all environments.
    const serverURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

    socketInstance = io(serverURL, {
        path:       '/socket.io',
        auth:       { token },
        query:      { projectId },
        transports: ['websocket', 'polling'],
        withCredentials: true,
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    socketInstance.on('connect', () => {
        console.log('✅ Socket connected:', socketInstance.id);
    });
    socketInstance.on('connect_error', (err) => {
        console.error('❌ Socket connection error:', err.message);
    });
    socketInstance.on('disconnect', (reason) => {
        console.log('🔌 Socket disconnected:', reason);
    });

    return socketInstance;
};

export const receiveMessage = (eventName, callback) => {
    if (!socketInstance) return;
    socketInstance.off(eventName);
    socketInstance.on(eventName, callback);
};

export const sendMessage = (eventName, data) => {
    if (!socketInstance) {
        console.error('Socket not initialized — call initializeSocket first');
        return;
    }
    socketInstance.emit(eventName, data);
};

export const disconnectSocket = () => {
    if (socketInstance) {
        socketInstance.disconnect();
        socketInstance = null;
    }
};

export const getSocketInstance = () => socketInstance;
