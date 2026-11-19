import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Server responded with error status
      if (error.response.status === 401) {
        // Unauthorized - clear token and redirect to login
        localStorage.removeItem('token');
        window.location.href = '/login';
      } else if (error.response.status === 403) {
        console.error('Access denied:', error.response.data.error || 'You do not have permission');
      } else if (error.response.status === 404) {
        console.error('Resource not found:', error.response.data.error || 'The requested resource was not found');
      } else if (error.response.status === 500) {
        console.error('Server error:', error.response.data.error || 'An unexpected error occurred');
      }
    } else if (error.request) {
      // Request made but no response
      console.error('Network error: Unable to connect to server');
    } else {
      // Error in request setup
      console.error('Request error:', error.message);
    }
    return Promise.reject(error);
  }
);

// Auth
export const authAPI = {
  register: (email: string, password: string, role?: string) =>
    api.post('/auth/register', { email, password, role }),
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
};

// Devices
export const deviceAPI = {
  getDevices: (params?: { status?: string; group?: string; page?: number; limit?: number; assignedUserId?: string; search?: string }) =>
    api.get('/devices', { params }),
  getDevice: (id: string) => api.get(`/devices/${id}`),
  getDeviceMedia: (id: string) => api.get(`/devices/${id}/media`),
  getConfigHistory: (id: string) => api.get(`/devices/${id}/config-history`),
  retryCloudSync: (id: string) => api.post(`/devices/${id}/retry-cloud-sync`),
  getDeviceStats: () => api.get('/devices/stats'),
  heartbeat: (id: string, data: any) => api.post(`/devices/${id}/heartbeat`, data),
  updateConfig: (id: string, config: any) => api.post(`/devices/${id}/config`, { config }),
  sendCommand: (id: string, command: string) => api.post(`/devices/${id}/command`, { command }),
  deleteDevice: (id: string) => api.delete(`/devices/${id}`),
  createDevice: (data: any) => api.post('/devices', data),
  updateDevice: (id: string, data: any) => api.put(`/devices/${id}`, data),
  checkActivation: (id: string) => api.get(`/devices/${id}/activation`),
};

// Media
const CHUNKED_UPLOAD_THRESHOLD_BYTES = 32 * 1024 * 1024;

async function sha256Blob(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) return '';
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createUploadId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

async function uploadMediaResumable(
  file: File,
  section?: number,
  deviceId?: string,
  folder?: string,
  onProgress?: (percent: number) => void,
) {
  const resumeKey = `cloud-upload:${deviceId || ''}:${section || ''}:${folder || ''}:${file.name}:${file.size}:${file.lastModified}`;
  let uploadId = localStorage.getItem(resumeKey) || '';
  let status: { chunkSize: number; totalChunks: number; receivedChunks: number[] } | null = null;

  if (uploadId) {
    try {
      const response = await api.get(`/media/uploads/${encodeURIComponent(uploadId)}`);
      status = response.data;
    } catch (error: any) {
      if (error?.response?.status !== 404) throw error;
      localStorage.removeItem(resumeKey);
      uploadId = '';
    }
  }

  if (!uploadId || !status) {
    uploadId = uploadId || createUploadId();
    localStorage.setItem(resumeKey, uploadId);
    const response = await api.post('/media/uploads/init', {
      uploadId,
      filename: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      section,
      deviceId,
      folder,
    });
    const returnedUploadId = String(response.data.uploadId || '');
    if (returnedUploadId !== uploadId) throw new Error('The server returned a different upload session ID');
    status = response.data;
  }

  const chunkSize = Number(status.chunkSize || 0);
  const totalChunks = Number(status.totalChunks || 0);
  if (!chunkSize || !totalChunks || totalChunks !== Math.ceil(file.size / chunkSize)) {
    throw new Error('The saved upload session does not match the selected file');
  }
  const received = new Set((status.receivedChunks || []).map(Number));
  let completedBytes = Array.from(received).reduce(
    (sum, index) => sum + Math.min(chunkSize, Math.max(0, file.size - index * chunkSize)),
    0,
  );
  onProgress?.(Math.min(99, Math.round((completedBytes / file.size) * 100)));

  for (let index = 0; index < totalChunks; index += 1) {
    if (received.has(index)) continue;
    const start = index * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const chunk = file.slice(start, end);
    let lastError: any;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const formData = new FormData();
        formData.append('sha256', await sha256Blob(chunk));
        formData.append('chunk', chunk, file.name);
        await api.put(`/media/uploads/${encodeURIComponent(uploadId)}/chunks/${index}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (event) => {
            const sent = Math.min(chunk.size, Number(event.loaded || 0));
            const percent = Math.round(((completedBytes + sent) / file.size) * 100);
            onProgress?.(Math.min(99, percent));
          },
        });
        lastError = null;
        break;
      } catch (error: any) {
        lastError = error;
        const statusCode = Number(error?.response?.status || 0);
        if (statusCode && statusCode < 500 && statusCode !== 429) break;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    if (lastError) throw lastError;
    completedBytes += chunk.size;
    onProgress?.(Math.min(99, Math.round((completedBytes / file.size) * 100)));
  }

  let result;
  try {
    result = await api.post(`/media/uploads/${encodeURIComponent(uploadId)}/complete`);
  } catch (error: any) {
    if ([400, 403, 413].includes(Number(error?.response?.status || 0))) {
      await api.delete(`/media/uploads/${encodeURIComponent(uploadId)}`).catch(() => undefined);
      localStorage.removeItem(resumeKey);
    }
    throw error;
  }
  localStorage.removeItem(resumeKey);
  onProgress?.(100);
  return result;
}

export const mediaAPI = {
  getStats: () => api.get('/media/stats'),
  uploadMedia: (file: File, section?: number, deviceId?: string, folder?: string, onProgress?: (percent: number) => void) => {
    if (file.size > CHUNKED_UPLOAD_THRESHOLD_BYTES) {
      return uploadMediaResumable(file, section, deviceId, folder, onProgress);
    }
    const formData = new FormData();
    formData.append('file', file);
    if (section) formData.append('section', section.toString());
    if (deviceId) formData.append('deviceId', deviceId);
    if (folder) formData.append('folder', folder);
    return api.post('/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (file.size > 0) onProgress?.(Math.min(100, Math.round((Number(event.loaded || 0) / file.size) * 100)));
      },
    });
  },
  getMedia: (params?: { section?: number; deviceId?: string; page?: number; limit?: number; search?: string; folder?: string; type?: string }) =>
    api.get('/media', { params }),
  deleteMedia: (id: string) => api.delete(`/media/${id}`),
  assignMedia: (id: string, deviceIds: string[], section?: number) =>
    api.post(`/media/${id}/assign`, { deviceIds, section }),
  updateMedia: (id: string, data: { folder?: string }) =>
    api.put(`/media/${id}`, data),
};

// Schedules
export const scheduleAPI = {
  getSchedules: () => api.get('/schedules'),
  createSchedule: (data: any) => api.post('/schedules', data),
  updateSchedule: (id: string, data: any) => api.put(`/schedules/${id}`, data),
  deleteSchedule: (id: string) => api.delete(`/schedules/${id}`),
};

// Groups
export const groupAPI = {
  getGroups: (params?: { page?: number; limit?: number; search?: string }) => api.get('/groups', { params }),
  createGroup: (name: string, devices: string[]) =>
    api.post('/groups', { name, devices }),
  updateGroup: (id: string, name: string, devices: string[]) =>
    api.put(`/groups/${id}`, { name, devices }),
  deleteGroup: (id: string) => api.delete(`/groups/${id}`),
  configureGroup: (id: string, config: any) => api.post(`/groups/${id}/configure`, { config }),
  getConfigHistory: (id: string) => api.get(`/groups/${id}/config-history`),
};

// Users
export const userAPI = {
  getUsers: (params?: { page?: number; limit?: number; search?: string; role?: string }) => api.get('/users', { params }),
  getUser: (id: string) => api.get(`/users/${id}`),
  getMe: () => api.get('/users/me'),
  getUserStats: (id: string) => api.get(`/users/${id}/stats`),
  createUser: (data: any) => api.post('/users', data),
  updateUser: (id: string, data: any) => api.put(`/users/${id}`, data),
  updateProfile: (data: any) => api.put('/users/me', data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/users/me/change-password', { currentPassword, newPassword }),
  deleteUser: (id: string) => api.delete(`/users/${id}`),
  assignDevices: (id: string, deviceIds: string[]) =>
    api.post(`/users/${id}/devices`, { deviceIds }),
};

// Global Config
export const configAPI = {
  getConfig: () => api.get('/config/public'),
  updateConfig: (data: any) => api.put('/config', data),
};

export default api;
