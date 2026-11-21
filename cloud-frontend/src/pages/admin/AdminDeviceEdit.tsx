import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { deviceAPI, userAPI, mediaAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { ArrowLeft, Save, Wifi, WifiOff, Monitor } from 'lucide-react';

export const AdminDeviceEdit = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const [device, setDevice] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    city: '',
    mobileNo: '',
    assignedUserId: '',
    location: '',
  });

  useEffect(() => {
    if (deviceId) {
      loadDevice();
      loadUsers();
      loadDeviceMedia();
    }
  }, [deviceId]);

  const loadDevice = async () => {
    try {
      const response = await deviceAPI.getDevice(deviceId);
      setDevice(response.data);
      setFormData({
        name: response.data.name,
        username: response.data.username || '',
        city: response.data.city || '',
        mobileNo: response.data.mobileNo || '',
        assignedUserId: response.data.assignedUserId || '',
        location: response.data.location || '',
      });
    } catch (error) {
      console.error('Failed to load device:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await userAPI.getUsers({ page: 1, limit: 1000 });
      const usersData = response.data.data || response.data;
      setUsers(usersData.filter((user: any) => user.role !== 'sub-user' && !user.parentId));
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const loadDeviceMedia = async () => {
    try {
      const response = await mediaAPI.getMedia({ deviceId });
      setMediaList(response.data.data || response.data);
    } catch (error) {
      console.error('Failed to load media:', error);
    }
  };

  const handleSave = async () => {
    if (!deviceId) return;

    setSaving(true);
    try {
      await deviceAPI.updateDevice(deviceId, formData);
      setAlertMessage({ type: 'success', message: 'Device updated successfully' });
      loadDevice();
      setTimeout(() => setAlertMessage(null), 3000);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to update device';
      setAlertMessage({ type: 'error', message: errorMessage });
      setTimeout(() => setAlertMessage(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (!device) {
    return <div className="flex items-center justify-center h-screen">Device not found</div>;
  }

  return (
    <div className="p-2 sm:p-4 md:p-6 max-w-[95vw] sm:max-w-[1200px] mx-auto overflow-x-hidden">
      {/* Alert Dialog */}
      {alertMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${
          alertMessage.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{alertMessage.message}</span>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 md:gap-4 mb-3 sm:mb-4 md:mb-6">
        <Button variant="secondary" onClick={() => navigate('/admin/devices')} className="text-xs sm:text-sm">
          <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Back to Devices</span>
          <span className="sm:hidden">←</span>
        </Button>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">Edit Device: {device.name}</h1>
      </div>

      {/* Device Info Card */}
      <Card className="mb-2 sm:mb-3 md:mb-4">
        <CardHeader>
          <CardTitle className="text-[10px] sm:text-xs md:text-sm">Device Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
          <div>
            <div className="text-xs sm:text-sm text-gray-600">Device ID</div>
            <div className="text-xs sm:text-sm font-medium">{device.deviceId}</div>
          </div>
          <div>
            <div className="text-xs sm:text-sm text-gray-600">Status</div>
            <div className="flex items-center gap-2">
              {device.status === 'online' ? (
                <Wifi className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" />
              ) : (
                <WifiOff className="w-3 h-3 sm:w-4 sm:h-4 text-red-600" />
              )}
              <span className={`text-xs sm:text-sm ${device.status === 'online' ? 'text-green-600' : 'text-red-600'}`}>
                {device.status}
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs sm:text-sm text-gray-600">App Version</div>
            <div className="text-xs sm:text-sm font-medium">{device.appVersion || '-'}</div>
          </div>
          <div>
            <div className="text-xs sm:text-sm text-gray-600">Storage Used</div>
            <div className="text-xs sm:text-sm font-medium">
              {device.storage ? ((device.storage.used / device.storage.total) * 100).toFixed(1) + '%' : '-'}
            </div>
          </div>
          <div>
            <div className="text-xs sm:text-sm text-gray-600">Last Seen</div>
            <div className="text-xs sm:text-sm font-medium">{new Date(device.lastSeen).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs sm:text-sm text-gray-600">Group</div>
            <div className="text-xs sm:text-sm font-medium">{device.group || 'None'}</div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Form */}
      <Card className="mb-2 sm:mb-3 md:mb-4">
        <CardHeader>
          <CardTitle className="text-[10px] sm:text-xs md:text-sm">Edit Device Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Device Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="text-xs sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Username</label>
              <Input
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="text-xs sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">City</label>
              <Input
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="text-xs sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Mobile Number</label>
              <Input
                value={formData.mobileNo}
                onChange={(e) => setFormData({ ...formData, mobileNo: e.target.value })}
                className="text-xs sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Location</label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="text-xs sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Assign to User</label>
              <Select
                options={[
                  { value: '', label: 'Unassigned' },
                  ...users.map((u) => ({ value: u._id, label: u.email })),
                ]}
                value={formData.assignedUserId}
                onChange={(e) => setFormData({ ...formData, assignedUserId: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end mt-4 sm:mt-6">
            <Button onClick={handleSave} disabled={saving} className="text-xs sm:text-sm">
              <Save className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Device Media */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
            Media on this Device ({mediaList.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mediaList.length === 0 ? (
            <div className="text-center py-6 sm:py-8 text-gray-500 text-xs sm:text-sm">No media assigned to this device</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">File Name</th>
                    <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                    <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Section</th>
                    <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Uploaded</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {mediaList.map((media) => (
                    <tr key={media._id} className="hover:bg-gray-50">
                      <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                        {media.originalName}
                      </td>
                      <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                        {(media.size / 1024 / 1024).toFixed(2)} MB
                      </td>
                      <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                        Section {media.section}
                      </td>
                      <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500">
                        {new Date(media.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
