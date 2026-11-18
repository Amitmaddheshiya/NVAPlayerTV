import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mediaAPI, deviceAPI } from '../services/api';
import type { Media, Device } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Upload, Trash2, Play, ArrowLeft, Settings, Save } from 'lucide-react';

export const DeviceDetail = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const [device, setDevice] = useState<Device | null>(null);
  const [mediaList, setMediaList] = useState<Media[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [section, setSection] = useState(1);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [config, setConfig] = useState({
    layout: 'fullscreen',
    sections: [],
    ticker: null,
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (deviceId) {
      loadDevice();
      loadDeviceMedia();
    }
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId) return;
    const timer = window.setInterval(() => {
      deviceAPI.getDevice(deviceId).then((response) => {
        setDevice((current) => current ? { ...current, health: response.data.health } : current);
      }).catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [deviceId]);

  const loadDevice = async () => {
    try {
      const response = await deviceAPI.getDevice(deviceId!);
      setDevice(response.data);
      if (response.data.config) {
        setConfig(response.data.config);
      }
    } catch (error) {
      console.error('Failed to load device:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDeviceMedia = async () => {
    try {
      const response = await mediaAPI.getMedia({ deviceId, page: 1, limit: 1000 });
      setMediaList(response.data.data || response.data);
    } catch (error) {
      console.error('Failed to load media:', error);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !deviceId) return;

    setUploading(true);
    setUploadProgress(0);
    try {
      await mediaAPI.uploadMedia(selectedFile, section, deviceId, undefined, setUploadProgress);
      setSelectedFile(null);
      loadDeviceMedia();
    } catch (error) {
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this media?')) return;

    try {
      await mediaAPI.deleteMedia(id);
      loadDeviceMedia();
    } catch (error) {
      alert('Delete failed');
    }
  };

  const handleSaveConfig = async () => {
    if (!deviceId) return;

    setSavingConfig(true);
    try {
      await deviceAPI.updateConfig(deviceId, config);
      alert('Configuration saved successfully');
      loadDevice();
    } catch (error) {
      alert('Failed to save configuration');
    } finally {
      setSavingConfig(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!device) {
    return <div className="flex items-center justify-center min-h-screen">Device not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="secondary" onClick={() => navigate('/devices')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Devices
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">{device.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-sm ${device.status === 'online' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {device.status}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Device Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Device Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-600">Device ID</div>
              <div className="font-medium">{device.deviceId}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Group</div>
              <div className="font-medium">{device.group || 'None'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Version</div>
              <div className="font-medium">{device.appVersion}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Storage Used</div>
              <div className="font-medium">{((device.storage.used / device.storage.total) * 100).toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Last Seen</div>
              <div className="font-medium">{new Date(device.lastSeen).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Location</div>
              <div className="font-medium">{device.location || 'Not set'}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Playback Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-gray-700">
              Reported playback errors: <span className="font-semibold">{device.health?.playbackErrorCount || 0}</span>
            </div>
            {device.health?.lastError ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <div className="font-semibold">
                  {device.health.lastError.fileName || 'Media error'}
                  {device.health.lastError.section ? ` (Section ${device.health.lastError.section})` : ''}
                </div>
                <div>{device.health.lastError.message || 'Playback failed'}</div>
                <div className="mt-1 text-xs text-amber-800">
                  {device.health.lastError.at ? new Date(device.health.lastError.at).toLocaleString() : 'Time unavailable'}
                  {device.health.lastError.mediaType ? ` (${device.health.lastError.mediaType})` : ''}
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">No playback errors have been reported by this device.</div>
            )}
          </CardContent>
        </Card>

        {/* Configuration Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Configuration Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Layout</label>
              <Select
                options={[
                  { value: 'fullscreen', label: 'Fullscreen' },
                  { value: 'split', label: 'Split Screen' },
                  { value: 'grid', label: 'Grid' },
                ]}
                value={config.layout}
                onChange={(e) => setConfig({ ...config, layout: e.target.value })}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSaveConfig} disabled={savingConfig}>
                <Save className="w-4 h-4 mr-2" />
                {savingConfig ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Upload Media Card */}
        <Card>
          <CardHeader>
            <CardTitle>Upload Media to Device</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="file"
              accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.mp4,.m4v,.mov,.mkv,.webm,.avi,.3gp,.mpg,.mpeg,.pdf"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
            <Select
              label="Section"
              options={[
                { value: '1', label: 'Section 1' },
                { value: '2', label: 'Section 2' },
                { value: '3', label: 'Section 3' },
              ]}
              value={section.toString()}
              onChange={(e) => setSection(parseInt(e.target.value))}
            />
            <Button onClick={handleUpload} disabled={!selectedFile || uploading}>
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? 'Uploading...' : 'Upload to Device'}
            </Button>
            {uploading ? (
              <div className="space-y-1" role="status" aria-live="polite">
                <div className="text-right text-xs text-gray-600">{uploadProgress}%</div>
                <progress className="h-2 w-full accent-blue-600" value={uploadProgress} max={100} />
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Device Media List */}
        <Card>
          <CardHeader>
            <CardTitle>Media on this Device ({mediaList.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {mediaList.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No media assigned to this device</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {mediaList.map((media) => (
                  <Card key={media._id}>
                    <CardContent className="p-4">
                      <div className="aspect-video bg-gray-200 rounded-lg mb-3 flex items-center justify-center">
                        <Play className="w-10 h-10 text-gray-400" />
                      </div>
                      <div className="space-y-1">
                        <div className="font-medium text-sm truncate">{media.originalName}</div>
                        <div className="text-xs text-gray-600">
                          {(media.size / 1024 / 1024).toFixed(2)} MB • Section {media.section}
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleDelete(media._id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};
