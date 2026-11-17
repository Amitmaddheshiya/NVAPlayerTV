import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { deviceAPI, userAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { ArrowLeft, Monitor, Plus, Trash2, Wifi, WifiOff, Search } from 'lucide-react';

export const AdminUserDevices = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  
  const [user, setUser] = useState<any>(null);
  const [assignedDevices, setAssignedDevices] = useState<any[]>([]);
  const [allDevices, setAllDevices] = useState<any[]>([]);
  const [filteredAllDevices, setFilteredAllDevices] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Pagination for assigned devices
  const [assignedPage, setAssignedPage] = useState(1);
  const assignedPerPage = 10;
  
  // Pagination for all devices
  const [allDevicesPage, setAllDevicesPage] = useState(1);
  const allDevicesPerPage = 10;
  
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (userId) {
      loadUser();
      loadAssignedDevices();
      loadAllDevices();
    }
  }, [userId]);

  useEffect(() => {
    filterAllDevices();
  }, [allDevices, searchTerm, statusFilter]);

  const loadUser = async () => {
    try {
      const response = await userAPI.getUser(userId);
      setUser(response.data);
    } catch (error) {
      console.error('Failed to load user:', error);
    }
  };

  const loadAssignedDevices = async () => {
    try {
      const response = await deviceAPI.getDevices({ page: 1, limit: 1000, assignedUserId: userId });
      setAssignedDevices(response.data.data || response.data);
    } catch (error) {
      console.error('Failed to load assigned devices:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllDevices = async () => {
    try {
      const response = await deviceAPI.getDevices({ page: 1, limit: 1000 });
      setAllDevices(response.data.data || response.data);
    } catch (error) {
      console.error('Failed to load all devices:', error);
    }
  };

  const filterAllDevices = () => {
    let filtered = [...allDevices];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.name.toLowerCase().includes(term) ||
          d.deviceId.toLowerCase().includes(term) ||
          (d.location && d.location.toLowerCase().includes(term))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((d) => d.status === statusFilter);
    }

    // Exclude already assigned devices from the list
    const assignedIds = assignedDevices.map(d => d.deviceId);
    filtered = filtered.filter(d => !assignedIds.includes(d.deviceId));

    setFilteredAllDevices(filtered);
  };

  const handleAssign = async (deviceId: string) => {
    try {
      await deviceAPI.updateDevice(deviceId, { assignedUserId: userId });
      setAlertMessage({ type: 'success', message: 'Device assigned successfully' });
      setTimeout(() => setAlertMessage(null), 3000);
      loadAssignedDevices();
      loadAllDevices();
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to assign device';
      setAlertMessage({ type: 'error', message: errorMessage });
      setTimeout(() => setAlertMessage(null), 5000);
    }
  };

  const handleUnassign = async (deviceId: string) => {
    try {
      await deviceAPI.updateDevice(deviceId, { assignedUserId: '' });
      setAlertMessage({ type: 'success', message: 'Device unassigned successfully' });
      setTimeout(() => setAlertMessage(null), 3000);
      loadAssignedDevices();
      loadAllDevices();
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to unassign device';
      setAlertMessage({ type: 'error', message: errorMessage });
      setTimeout(() => setAlertMessage(null), 5000);
    }
  };

  // Pagination for assigned devices
  const paginatedAssigned = assignedDevices.slice(
    (assignedPage - 1) * assignedPerPage,
    assignedPage * assignedPerPage
  );
  const assignedTotalPages = Math.ceil(assignedDevices.length / assignedPerPage);

  // Pagination for all devices
  const paginatedAllDevices = filteredAllDevices.slice(
    (allDevicesPage - 1) * allDevicesPerPage,
    allDevicesPage * allDevicesPerPage
  );
  const allDevicesTotalPages = Math.ceil(filteredAllDevices.length / allDevicesPerPage);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-[95vw] sm:max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="secondary" onClick={() => navigate('/admin/users')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Users
        </Button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Device Assignment</h1>
          <p className="text-sm text-gray-600">
            {user?.email} - {assignedDevices.length} devices assigned
          </p>
        </div>
      </div>

      {/* Alert Message */}
      {alertMessage && (
        <div
          className={`mb-4 p-4 rounded-lg ${
            alertMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {alertMessage.message}
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Assigned Devices */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              Assigned Devices ({assignedDevices.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {assignedDevices.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Monitor className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>No devices assigned to this user</p>
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {paginatedAssigned.map((device) => (
                    <div
                      key={device.deviceId}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">{device.name}</div>
                        <div className="text-xs text-gray-500">{device.deviceId}</div>
                        <div className="flex items-center gap-2 mt-1">
                          {device.displayStatus === 'online' ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800">
                              <Wifi className="w-2.5 h-2.5 mr-1" />
                              Online
                            </span>
                          ) : device.displayStatus === '30D+' ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-800">
                              <WifiOff className="w-2.5 h-2.5 mr-1" />
                              30D+
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">
                              <WifiOff className="w-2.5 h-2.5 mr-1" />
                              Offline
                            </span>
                          )}
                          <span className="text-[10px] text-gray-500">{device.location || '-'}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleUnassign(device.deviceId)}
                        className="ml-2"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Pagination for Assigned Devices */}
                {assignedDevices.length > assignedPerPage && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <div className="text-xs text-gray-600">
                      Showing {(assignedPage - 1) * assignedPerPage + 1} to {Math.min(assignedPage * assignedPerPage, assignedDevices.length)} of {assignedDevices.length}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setAssignedPage((prev) => Math.max(1, prev - 1))}
                        disabled={assignedPage === 1}
                      >
                        Previous
                      </Button>
                      <span className="text-xs text-gray-600 flex items-center px-2">
                        {assignedPage} / {assignedTotalPages}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setAssignedPage((prev) => Math.min(assignedTotalPages, prev + 1))}
                        disabled={assignedPage === assignedTotalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Right Column - All Devices */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Available Devices ({filteredAllDevices.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Search and Filter */}
            <div className="space-y-3 mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search devices..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 text-sm"
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
            </div>

            {filteredAllDevices.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Monitor className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>No available devices found</p>
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {paginatedAllDevices.map((device) => (
                    <div
                      key={device.deviceId}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">{device.name}</div>
                        <div className="text-xs text-gray-500">{device.deviceId}</div>
                        <div className="flex items-center gap-2 mt-1">
                          {device.displayStatus === 'online' ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800">
                              <Wifi className="w-2.5 h-2.5 mr-1" />
                              Online
                            </span>
                          ) : device.displayStatus === '30D+' ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-800">
                              <WifiOff className="w-2.5 h-2.5 mr-1" />
                              30D+
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">
                              <WifiOff className="w-2.5 h-2.5 mr-1" />
                              Offline
                            </span>
                          )}
                          <span className="text-[10px] text-gray-500">{device.location || '-'}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleAssign(device.deviceId)}
                        className="ml-2"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Assign
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Pagination for All Devices */}
                {filteredAllDevices.length > allDevicesPerPage && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <div className="text-xs text-gray-600">
                      Showing {(allDevicesPage - 1) * allDevicesPerPage + 1} to {Math.min(allDevicesPage * allDevicesPerPage, filteredAllDevices.length)} of {filteredAllDevices.length}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setAllDevicesPage((prev) => Math.max(1, prev - 1))}
                        disabled={allDevicesPage === 1}
                      >
                        Previous
                      </Button>
                      <span className="text-xs text-gray-600 flex items-center px-2">
                        {allDevicesPage} / {allDevicesTotalPages}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setAllDevicesPage((prev) => Math.min(allDevicesTotalPages, prev + 1))}
                        disabled={allDevicesPage === allDevicesTotalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
