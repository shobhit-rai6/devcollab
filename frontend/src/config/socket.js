import { io } from 'socket.io-client';

let socketInstance = null;

export const initializeSocket = (projectId) => {
    if (socketInstance) {
        socketInstance.disconnect();
    }

    const token = localStorage.getItem('token');
    
    socketInstance = io({
        path: '/socket.io',
        auth: {
            token: token
        },
        query: {
            projectId
        },
        transports: ['websocket', 'polling'],
        withCredentials: true,
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    socketInstance.on('connect', () => {
        console.log('Socket connected successfully with ID:', socketInstance.id);
    });

    socketInstance.on('connect_error', (error) => {
        console.error('Socket connection error:', error.message);
    });

    socketInstance.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
    });

    return socketInstance;
}

export const receiveMessage = (eventName, callback) => {
    if (socketInstance) {
        socketInstance.off(eventName);
        socketInstance.on(eventName, (data) => {
            console.log(`Received ${eventName}:`, data);
            callback(data);
        });
    }
}

export const sendMessage = (eventName, data) => {
    if (socketInstance) {
        console.log(`Sending ${eventName}:`, data);
        socketInstance.emit(eventName, data);
    } else {
        console.error('Socket not initialized');
    }
}

export const disconnectSocket = () => {
    if (socketInstance) {
        socketInstance.disconnect();
        socketInstance = null;
    }
}

// ✅ EXPORT the socketInstance getter
export const getSocketInstance = () => socketInstance;