export interface Device {
  _id: string;
  deviceId: string;
  name: string;
  group?: string;
  status: 'online' | 'offline';
  lastSeen: string;
  appVersion: string;
  activated: boolean;
  storage: {
    used: number;
    total: number;
  };
  config: {
    layout: string;
    sections: any[];
    ticker: any;
    schedule?: any;
  };
  location?: string;
  health?: {
    playbackErrorCount?: number;
    lastReportAt?: string;
    cloudSync?: {
      configVersion: number;
      status: 'pending' | 'ready' | 'failed';
      mediaTotal: number;
      mediaCached: number;
      requiredStorageBytes?: number;
      availableStorageBytes?: number;
      storageReserveBytes?: number;
      message?: string;
      updatedAt?: string;
    };
    lastError?: {
      at?: string;
      section?: number;
      fileName?: string;
      mediaType?: string;
      message?: string;
    };
    recentErrors?: Array<{
      at?: string;
      section?: number;
      fileName?: string;
      mediaType?: string;
      message?: string;
    }>;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Media {
  _id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  storageType: 'local' | 's3';
  path: string;
  uploadedBy?: string;
  assignedDevices: string[];
  section: number;
  createdAt: string;
}

export interface Schedule {
  _id: string;
  name: string;
  profile: {
    layout: string;
    sections: Array<{
      section: number;
      mediaIds: string[];
      direction: string;
      duration: number;
    }>;
    ticker: {
      text: string;
      position: string;
      color: string;
      speed: number;
    };
  };
  slots: Array<{
    profileId: string;
    startTime: string;
    endTime: string;
    days: number[];
    priority: number;
  }>;
  fallback: {
    mode: 'black' | 'message' | 'image';
    message?: string;
    textColor?: string;
    bgColor?: string;
    imageUrl?: string;
  };
  assignedDevices: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Group {
  _id: string;
  name: string;
  devices: string[];
  createdAt: string;
  updatedAt: string;
}

export interface User {
  _id: string;
  email: string;
  role: 'admin' | 'operator';
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
