import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deviceAPI, userAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Plus, Edit, Trash2, Wifi, WifiOff, Search, CheckCircle, XCircle } from 'lucide-react';
import { subscribeToDeviceUpdates } from '../../services/socket';

export const AdminDevices = () => {
  const navigate = useNavigate();
  const [filteredDevices, setFilteredDevices] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const devicesPerPage = 15;
  const [totalDevices, setTotalDevices] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [formData, setFormData] = useState({
    deviceId: '',
    name: '',
    location: '',
    assignedUserId: '',
    activated: false,
  });

  useEffect(() => {
    loadDevices();
    loadUsers();
  }, [currentPage, searchTerm, statusFilter, userFilter]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToDeviceUpdates(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void loadDevices();
      }, 5000);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [currentPage, searchTerm, statusFilter, userFilter]);

  const loadDevices = async () => {
    try {
      const params: any = {
        page: currentPage,
        limit: devicesPerPage
      };

      // Send filters to backend for server-side filtering
      if (statusFilter && statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (userFilter && userFilter !== 'all') {
        params.assignedUserId = userFilter;
      }
      if (searchTerm) {
        params.search = searchTerm;
      }

      const response = await deviceAPI.getDevices(params);
      const devicesData = response.data.data || response.data;
      setFilteredDevices(devicesData); // No client-side filtering needed
      setTotalDevices(response.data.total || 0);
      setTotalPages(response.data.totalPages || 0);
    } catch (error) {
      console.error('Failed to load devices:', error);
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

  // No client-side filtering - all filtering happens on server
  const paginatedDevices = filteredDevices;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await deviceAPI.createDevice(formData);
      setShowForm(false);
      setFormData({
        deviceId: '',
        name: '',
        location: '',
        assignedUserId: '',
        activated: false,
      });
      loadDevices();
      setAlertMessage({ type: 'success', message: 'Device created successfully' });
      setTimeout(() => setAlertMessage(null), 3000);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to create device';
      setAlertMessage({ type: 'error', message: errorMessage });
      setTimeout(() => setAlertMessage(null), 5000);
    }
  };

  const handleDelete = async (deviceId: string) => {
    if (!confirm('Are you sure you want to delete this device?')) return;

    try {
      await deviceAPI.deleteDevice(deviceId);
      loadDevices();
      setAlertMessage({ type: 'success', message: 'Device deleted successfully' });
      setTimeout(() => setAlertMessage(null), 3000);
    } catch (error) {
      setAlertMessage({ type: 'error', message: 'Failed to delete device' });
      setTimeout(() => setAlertMessage(null), 5000);
    }
  };

  const toggleActivation = async (deviceId: string, currentStatus: boolean) => {
    try {
      await deviceAPI.updateDevice(deviceId, { activated: !currentStatus });
      setAlertMessage({ type: 'success', message: `Device ${!currentStatus ? 'activated' : 'deactivated'} successfully` });
      loadDevices();
      setTimeout(() => setAlertMessage(null), 3000);
    } catch (error) {
      setAlertMessage({ type: 'error', message: 'Failed to update device activation' });
      setTimeout(() => setAlertMessage(null), 5000);
    }
  };

  const getUserName = (userId: string) => {
    const user = users.find((u) => u._id === userId);
    return user ? user.email : 'Unassigned';
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
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

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 sm:mb-4 md:mb-6 gap-2 sm:gap-3 md:gap-4">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">Devices</h1>
        <Button onClick={() => setShowForm(!showForm)} className="text-xs sm:text-sm w-full sm:w-auto">
          <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
          Add Device
        </Button>
      </div>

      {/* Search and Filter */}
      <Card className="mb-2 sm:mb-3 md:mb-4">
        <CardContent className="p-2 sm:p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                label="Search"
                placeholder="Search devices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 text-xs sm:text-sm"
              />
            </div>
            <Select
              label="Filter by Status"
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'online', label: 'Online' },
                { value: 'offline', label: 'Offline' },
                { value: '30D+', label: '30D+ Offline' },
              ]}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            />
            <Select
              label="Filter by User"
              options={[
                { value: 'all', label: 'All Users' },
                ...users.map((u) => ({ value: u._id, label: u.email })),
              ]}
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {showForm && (
        <Card className="mb-2 sm:mb-3 md:mb-4">
          <CardHeader>
            <CardTitle className="text-[10px] sm:text-xs md:text-sm">Add New Device</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-2 sm:space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <Input
                  label="Device ID"
                  value={formData.deviceId}
                  onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
                  required
                  className="text-xs sm:text-sm"
                />
                <Input
                  label="Device Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="text-xs sm:text-sm"
                />
                <Input
                  label="Location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="text-xs sm:text-sm"
                />
                <Select
                  label="Assign to User"
                  options={[
                    { value: '', label: 'Unassigned' },
                    ...users.map((u) => ({ value: u._id, label: u.email })),
                  ]}
                  value={formData.assignedUserId}
                  onChange={(e) => setFormData({ ...formData, assignedUserId: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="text-xs sm:text-sm">Create</Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowForm(false)}
                  className="text-xs sm:text-sm"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Devices Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Device</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Activation</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned To</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Version</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Last Seen</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedDevices.map((device) => (
                  <tr key={device.deviceId} className="hover:bg-gray-50">
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap">
                      <div>
                        <div className="text-xs sm:text-sm font-medium text-gray-900">{device.name}</div>
                        <div className="text-[10px] sm:text-xs text-gray-500">{device.deviceId}</div>
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap">
                      {device.displayStatus === 'online' ? (
                        <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-green-100 text-green-800">
                          <Wifi className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
                          Online
                        </span>
                      ) : device.displayStatus === '30D+' ? (
                        <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-orange-100 text-orange-800">
                          <WifiOff className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
                          30D+
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-red-100 text-red-800">
                          <WifiOff className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
                          Offline
                        </span>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant={device.activated ? 'success' : 'danger'}
                        onClick={() => toggleActivation(device.deviceId, device.activated || false)}
                        className="text-[10px] sm:text-xs px-2 py-1"
                      >
                        {device.activated ? (
                          <>
                            <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
                            Active
                          </>
                        ) : (
                          <>
                            <XCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
                            Activate
                          </>
                        )}
                      </Button>
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                      {device.location || '-'}
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                      {getUserName(device.assignedUserId)}
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                      {device.appVersion || '-'}
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500">
                      {new Date(device.lastSeen).toLocaleString()}
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium">
                      <div className="flex gap-1 sm:gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => navigate(`/admin/devices/${device.deviceId}/edit`)}
                        >
                          <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleDelete(device.deviceId)}
                        >
                          <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredDevices.length === 0 && (
            <div className="text-center py-8 sm:py-12 text-gray-500 text-xs sm:text-sm">
              No devices found.
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-t">
              <div className="text-xs sm:text-sm text-gray-600">
                Showing {(currentPage - 1) * devicesPerPage + 1} to {Math.min(currentPage * devicesPerPage, totalDevices)} of {totalDevices} devices
              </div>
              <div className="flex gap-1 sm:gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="text-xs sm:text-sm"
                >
                  Previous
                </Button>
                <span className="text-xs sm:text-sm text-gray-600 flex items-center">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="text-xs sm:text-sm"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
