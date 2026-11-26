import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deviceAPI, dealerAPI, mediaAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { useToast } from '../../components/ui/Toast';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { ArrowLeft, Save, Wifi, WifiOff, Monitor } from 'lucide-react';

export const DealerDeviceEdit = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const { success, error: toastError } = useToast();

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    city: '',
    mobileNo: '',
    assignedUserId: '',
    location: '',
  });

  const deviceQuery = useQuery({
    queryKey: ['dealer-device', deviceId],
    queryFn: async () => {
      const response = await deviceAPI.getDevice(deviceId!);
      return response.data;
    },
    enabled: !!deviceId,
  });

  const customersQuery = useQuery({
    queryKey: ['dealer-customers-list'],
    queryFn: async () => {
      const response = await dealerAPI.getCustomers({ page: 1, limit: 100 });
      return response.data.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const mediaQuery = useQuery({
    queryKey: ['dealer-device-media', deviceId],
    queryFn: async () => {
      const response = await mediaAPI.getMedia({ deviceId });
      return response.data.data || response.data;
    },
    enabled: !!deviceId,
  });

  const device = deviceQuery.data;
  const customers = customersQuery.data || [];
  const mediaList = mediaQuery.data || [];
  const loading = deviceQuery.isLoading;

  // Sync fetched device into editable form state
  useEffect(() => {
    if (device) {
      setFormData({
        name: device.name,
        username: device.username || '',
        city: device.city || '',
        mobileNo: device.mobileNo || '',
        assignedUserId: device.assignedUserId || '',
        location: device.location || '',
      });
    }
  }, [device]);

  const loadDevice = () => {
    queryClient.invalidateQueries({ queryKey: ['dealer-device', deviceId] });
    queryClient.invalidateQueries({ queryKey: ['dealer-devices'] });
  };

  const handleSave = async () => {
    if (!deviceId) return;

    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      toastError('Device name is required');
      return;
    }
    if (trimmedName.length > 100) {
      toastError('Device name must be 100 characters or less');
      return;
    }

    setSaving(true);
    try {
      await deviceAPI.updateDevice(deviceId, { ...formData, name: trimmedName });
      success('Device updated successfully');
      loadDevice();
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to update device';
      toastError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-1 sm:p-1.5 md:p-2 w-full space-y-3">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!device) {
    return <div className="flex items-center justify-center h-screen">Device not found</div>;
  }

  return (
    <div className="p-1 sm:p-1.5 md:p-2 w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-2 sm:mb-3">
        <Button variant="secondary" onClick={() => navigate('/dealer/devices')} className="text-xs sm:text-sm">
          <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Back to Devices</span>
          <span className="sm:hidden">←</span>
        </Button>
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 truncate">Edit Device: {device.name}</h1>
      </div>

      {/* Device Info Card */}
      <Card className="mb-2">
        <CardHeader>
          <CardTitle className="text-[10px] sm:text-xs md:text-sm">Device Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
            <div className="text-xs sm:text-sm font-medium">{device.lastSeen ? new Date(device.lastSeen).toLocaleString() : '-'}</div>
          </div>
          <div>
            <div className="text-xs sm:text-sm text-gray-600">Group</div>
            <div className="text-xs sm:text-sm font-medium">{device.group || 'None'}</div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Form */}
      <Card className="mb-2">
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
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Assign to Customer</label>
              <Select
                options={[
                  { value: '', label: 'Unassigned' },
                  ...customers.map((u: any) => ({ value: u._id, label: u.businessName || u.email })),
                ]}
                value={formData.assignedUserId}
                onChange={(e) => setFormData({ ...formData, assignedUserId: e.target.value })}
              />
              {device?.assignedUserId && formData.assignedUserId && String(device.assignedUserId) !== String(formData.assignedUserId) && (
                <p className="mt-2 text-xs text-amber-700">
                  This device is currently assigned to another customer. It must be unassigned first before assigning to a different customer.
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end mt-3 sm:mt-4">
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
            <div className="text-center py-6 text-gray-500 text-xs sm:text-sm">No media assigned to this device</div>
          ) : (
            <>
              {/* Mobile: card list */}
              <div className="lg:hidden divide-y divide-gray-200">
                {mediaList.map((media: any) => (
                  <div key={media._id} className="py-2 space-y-1">
                    <div className="text-xs font-medium text-gray-900 truncate" title={media.originalName}>{media.originalName}</div>
                    <div className="grid grid-cols-3 gap-2 text-[11px] text-gray-600">
                      <div>{(media.size / 1024 / 1024).toFixed(2)} MB</div>
                      <div>Section {media.section}</div>
                      <div className="truncate">{new Date(media.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop: compact table */}
              <div className="hidden lg:block">
                <table className="w-full table-fixed text-[11px]">
                  <colgroup>
                    <col className="w-[40%]" />
                    <col className="w-[15%]" />
                    <col className="w-[15%]" />
                    <col className="w-[30%]" />
                  </colgroup>
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">File Name</th>
                      <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Size</th>
                      <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Section</th>
                      <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {mediaList.map((media: any) => (
                      <tr key={media._id} className="hover:bg-gray-50">
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900 truncate" title={media.originalName}>{media.originalName}</td>
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900">{(media.size / 1024 / 1024).toFixed(2)} MB</td>
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900">Section {media.section}</td>
                        <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-500 truncate" title={new Date(media.createdAt).toLocaleString()}>{new Date(media.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
