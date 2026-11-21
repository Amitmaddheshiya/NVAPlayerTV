import { io, Socket } from 'socket.io-client';
import cloudService from './cloudService';
import eventEmitter from '../utils/EventEmitter';

class SocketService {
  private socket: Socket | null = null;

  connect(): void {
    if (this.socket?.connected) {
      console.log('=== SOCKET: Already connected ===');
      return;
    }

    const apiUrl = cloudService.getApiUrl();
    if (!apiUrl) {
      console.log('=== SOCKET: No API URL available ===');
      return;
    }

    console.log('=== SOCKET: Connecting to ===', apiUrl);
    this.socket = io(apiUrl, {
      auth: (callback) => {
        void cloudService.ensureDeviceAuthToken().then(
          (token) => callback({ token }),
          () => callback({ token: '' })
        );
      },
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      console.log('=== SOCKET: Connected successfully ===');
      console.log('=== SOCKET: Authenticated device room joined by server ===');
    });

    this.socket.on('config:update', (config: any) => {
      const payloadConfig = config?.config || config;
      console.log('=== SOCKET: Config update received ===');
      console.log('Config version:', config?.configVersion);
      console.log('Config sections:', payloadConfig?.sections?.length || 0);
      console.log('Config layout:', payloadConfig?.layout);
      // Emit event to React Native app
      this.emitConfigUpdate(config);
    });

    this.socket.on('command:restart', () => {
      console.log('Restart command received');
      this.emitCommand('restart');
    });

    this.socket.on('command:sync', () => {
      console.log('Sync command received');
      this.emitCommand('sync');
    });

    this.socket.on('command:clear-cache', () => {
      console.log('Clear cache command received');
      this.emitCommand('clear-cache');
    });

    this.socket.on('emergency:alert:clear', () => {
      console.log('Emergency alert clear received');
      eventEmitter.emit('emergency:alert:clear');
    });

    this.socket.on('emergency:alert', (alert: any) => {
      console.log('Emergency alert received:', alert);
      this.emitEmergencyAlert(alert);
    });

    this.socket.on('device:deactivated', () => {
      eventEmitter.emit('device:deactivated');
      this.disconnect();
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    this.socket.on('error', (error: any) => {
      console.error('Socket error:', error);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  emitConfigUpdate(config: any): void {
    console.log('=== SOCKET SERVICE: Emitting config:update to eventEmitter ===');
    eventEmitter.emit('config:update', config);
  }

  emitCommand(command: string): void {
    eventEmitter.emit('command:received', command);
  }

  emitEmergencyAlert(alert: any): void {
    eventEmitter.emit('emergency:alert', alert);
  }

  emitEmergencyDismissed(): void {
    try {
      this.socket?.emit('emergency:dismissed');
    } catch (error) {
      console.warn('Failed to emit emergency dismissed:', error);
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export default new SocketService();
