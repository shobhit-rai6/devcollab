import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

let socketInstance = null;

export const initializeSocket = async (projectId) => {
  if (socketInstance) {
    socketInstance.disconnect();
  }

  const token = await AsyncStorage.getItem('token');

  socketInstance = io(BASE_URL, {
    path: '/socket.io',
    auth: { token },
    query: { projectId },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socketInstance.on('connect', () => {
    console.log('Socket connected:', socketInstance.id);
  });

  socketInstance.on('connect_error', (error) => {
    console.error('Socket error:', error.message);
  });

  socketInstance.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  return socketInstance;
};

export const receiveMessage = (eventName, callback) => {
  if (socketInstance) {
    socketInstance.off(eventName);
    socketInstance.on(eventName, (data) => {
      callback(data);
    });
  }
};

export const sendMessage = (eventName, data) => {
  if (socketInstance) {
    socketInstance.emit(eventName, data);
  } else {
    console.error('Socket not initialized');
  }
};

export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
};

export const getSocketInstance = () => socketInstance;
