import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

let socket: Socket | null = null;

export const connectSocket = (): Socket => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: { token: localStorage.getItem('token') || '' },
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log('Connected to socket server');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from socket server');
    });
  }

  return socket;
};

export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = (): Socket | null => {
  return socket;
};

export const subscribeToDeviceUpdates = (callback: (data: any) => void): (() => void) => {
  const sock = connectSocket();
  sock.on('device:heartbeat', callback);
  sock.on('device:status-changed', callback);
  return () => {
    sock.off('device:heartbeat', callback);
    sock.off('device:status-changed', callback);
  };
};

export const unsubscribeFromDeviceUpdates = (): void => {
  const sock = getSocket();
  if (sock) {
    sock.off('device:heartbeat');
    sock.off('device:status-changed');
  }
};
