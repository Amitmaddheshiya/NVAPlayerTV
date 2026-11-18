import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mediaAPI, deviceAPI } from '../services/api';
import type { Media, Device } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Upload, Trash2, Play } from 'lucide-react';

export const Library = () => {
  const [mediaList, setMediaList] = useState<Media[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [section, setSection] = useState(1);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    loadMedia();
    loadDevices();
  }, []);

  const loadMedia = async () => {
    try {
      const response = await mediaAPI.getMedia({ page: 1, limit: 1000 });
      setMediaList(response.data.data || response.data);
    } catch (error) {
      console.error('Failed to load media:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDevices = async () => {
    try {
      const response = await deviceAPI.getDevices({ page: 1, limit: 1000 });
      setDevices(response.data.data || response.data);
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress(0);
    try {
      await mediaAPI.uploadMedia(selectedFile, section, selectedDevice || undefined, undefined, setUploadProgress);
      setSelectedFile(null);
      loadMedia();
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
      loadMedia();
    } catch (error) {
      alert('Delete failed');
    }
  };

  const handleAssign = async (id: string) => {
    const deviceIds = selectedDevice ? [selectedDevice] : [];
    try {
      await mediaAPI.assignMedia(id, deviceIds, section);
      loadMedia();
    } catch (error) {
      alert('Assign failed');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Media Library</h1>
          <Button variant="secondary" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Upload Media</CardTitle>
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
            <Select
              label="Assign to Device (Optional)"
              options={[
                { value: '', label: 'None' },
                ...devices.map((d) => ({ value: d.deviceId, label: d.name })),
              ]}
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
            />
            <Button onClick={handleUpload} disabled={!selectedFile || uploading}>
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
            {uploading ? (
              <div className="space-y-1" role="status" aria-live="polite">
                <div className="text-right text-xs text-gray-600">{uploadProgress}%</div>
                <progress className="h-2 w-full accent-blue-600" value={uploadProgress} max={100} />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mediaList.map((media) => (
            <Card key={media._id}>
              <CardContent className="p-6">
                <div className="aspect-video bg-gray-200 rounded-lg mb-4 flex items-center justify-center">
                  <Play className="w-12 h-12 text-gray-400" />
                </div>
                <div className="space-y-2">
                  <div className="font-medium truncate">{media.originalName}</div>
                  <div className="text-sm text-gray-600">
                    {(media.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                  <div className="text-sm text-gray-600">
                    Section {media.section}
                  </div>
                  <div className="text-sm text-gray-600">
                    {media.mimeType.startsWith('image') ? 'Image' : 'Video'}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleAssign(media._id)}
                    >
                      Assign
                    </Button>
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
      </main>
    </div>
  );
};
