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
export const mediaAPI = {
  getStats: () => api.get('/media/stats'),
  uploadMedia: (file: File, section?: number, deviceId?: string, folder?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (section) formData.append('section', section.toString());
    if (deviceId) formData.append('deviceId', deviceId);
    if (folder) formData.append('folder', folder);
    return api.post('/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
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
