import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deviceAPI, userAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { ArrowLeft, Monitor, Plus, Trash2, Search } from 'lucide-react';
import { DeviceStatusBadge } from '../../components/admin/DeviceStatusBadge';
import { Pagination } from '../../components/admin/Pagination';
import { useToast } from '../../components/ui/Toast';
import { SkeletonTable } from '../../components/ui/Skeleton';
import { useUrlParam, useUrlNumberParam } from '../../hooks/useUrlParam';

export const AdminUserDevices = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useUrlParam('q');
  const [searchInput, setSearchInput] = useState(searchTerm);
  const [statusFilter, setStatusFilter] = useUrlParam('status', 'all');

  // Pagination for assigned devices
  const [assignedPage, setAssignedPage] = useUrlNumberParam('apage', 1);
  const assignedPerPage = 10;

  // Pagination for available devices
  const [allDevicesPage, setAllDevicesPage] = useUrlNumberParam('vpage', 1);
  const allDevicesPerPage = 10;

  const { success, error: toastError } = useToast();

  const userQuery = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: async () => {
      const response = await userAPI.getUser(userId);
      return response.data;
    },
    enabled: !!userId,
  });

  const assignedQuery = useQuery({
    queryKey: ['admin-user-devices-assigned', userId, assignedPage],
    queryFn: async () => {
      const response = await deviceAPI.getDevices({ page: assignedPage, limit: assignedPerPage, assignedUserId: userId });
      return response.data;
    },
    enabled: !!userId,
  });

  const availableQuery = useQuery({
    queryKey: ['admin-user-devices-available', userId, allDevicesPage, searchTerm, statusFilter],
    queryFn: async () => {
      const response = await deviceAPI.getDevices({
        page: allDevicesPage,
        limit: allDevicesPerPage,
        excludeAssignedUserId: userId,
        search: searchTerm || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      return response.data;
    },
    enabled: !!userId,
  });

  // All users — used to label devices that are already assigned to another account
  const usersQuery = useQuery({
    queryKey: ['admin-all-users'],
    queryFn: async () => {
      const response = await userAPI.getUsers({ limit: 1000 });
      return response.data;
    },
  });

  const user = userQuery.data || null;
  const assignedDevices = assignedQuery.data?.data || [];
  const availableDevices = availableQuery.data?.data || [];
  const assignedTotal = assignedQuery.data?.total || 0;
  const availableTotal = availableQuery.data?.total || 0;
  const assignedTotalPages = assignedQuery.data?.totalPages || 1;
  const availableTotalPages = availableQuery.data?.totalPages || 1;
  const loading = assignedQuery.isLoading || userQuery.isLoading;
  const isSubUser = !!user && (user.role === 'sub-user' || !!user.parentId);
  const canAssignDevices = !!user && !isSubUser;

  const userEmailById = new Map<string, string>();
  const usersList = usersQuery.data?.data || usersQuery.data || [];
  (Array.isArray(usersList) ? usersList : []).forEach((u: any) => {
    if (u?._id) userEmailById.set(String(u._id), u.email || '');
  });
  const assigneeLabel = (device: any): string | null => {
    const assigneeId = device?.assignedUserId ? String(device.assignedUserId) : '';
    if (!assigneeId || assigneeId === String(userId)) return null;
    return userEmailById.get(assigneeId) || 'another user';
  };

  const reloadBoth = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-user-devices-assigned', userId] });
    queryClient.invalidateQueries({ queryKey: ['admin-user-devices-available', userId] });
  };

  // Debounce search input -> URL param (400ms)
  useEffect(() => {
    setSearchInput(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchTerm) setSearchTerm(searchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset available-devices page when filters change
  useEffect(() => {
    setAllDevicesPage(1);
  }, [searchTerm, statusFilter]);

  const handleAssign = async (deviceId: string) => {
    if (!canAssignDevices) {
      toastError('Devices can only be assigned to the parent account, not a sub-user.');
      return;
    }
    const device = availableDevices.find((d: any) => d.deviceId === deviceId);
    const assignee = device ? assigneeLabel(device) : null;
    if (assignee) {
      toastError(`This device is already assigned to ${assignee}. Unassign it from that user first.`);
      return;
    }
    try {
      await deviceAPI.updateDevice(deviceId, { assignedUserId: userId });
      success('Device assigned successfully');
      reloadBoth();
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to assign device';
      toastError(errorMessage);
    }
  };

  const handleUnassign = async (deviceId: string) => {
    try {
      await deviceAPI.updateDevice(deviceId, { assignedUserId: '' });
      success('Device unassigned successfully');
      reloadBoth();
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to unassign device';
      toastError(errorMessage);
    }
  };

  const renderStatusBadge = (device: any) => <DeviceStatusBadge displayStatus={device.displayStatus} />;

  if (loading) {
    return (
      <div className="p-1 sm:p-1.5 md:p-2 w-full">
        <SkeletonTable rows={8} cols={5} />
      </div>
    );
  }

  return (
    <div className="p-1 sm:p-1.5 md:p-2 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3 sm:mb-4">
        <Button variant="secondary" onClick={() => navigate('/admin/users')} className="text-xs sm:text-sm w-full sm:w-auto">
          <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
          Back to Users
        </Button>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">Device Assignment</h1>
          <p className="text-xs sm:text-sm text-gray-600 truncate">
            {user?.email} · {isSubUser ? 'Sub-user' : `${assignedDevices.length} devices assigned`}
          </p>
        </div>
      </div>

      {isSubUser && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Device assignment is disabled for sub-users. Assign devices to the parent account instead.
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
        {/* Left Column - Assigned Devices */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              Assigned Devices ({assignedTotal})
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
                  {assignedDevices.map((device) => (
                    <div
                      key={device.deviceId}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">{device.name}</div>
                        <div className="text-xs text-gray-500">{device.deviceId}</div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {renderStatusBadge(device)}
                          <span className="text-[10px] text-gray-500 truncate">{device.location || '-'}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleUnassign(device.deviceId)}
                        className="ml-2 shrink-0 px-2 py-1"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Pagination for Assigned Devices */}
                <Pagination
                  currentPage={assignedPage}
                  totalPages={assignedTotalPages}
                  total={assignedTotal}
                  perPage={assignedPerPage}
                  onPageChange={setAssignedPage}
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* Right Column - All Devices */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Available Devices ({availableTotal})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Search and Filter */}
            <div className="space-y-3 mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search devices..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
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

            {availableDevices.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Monitor className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>No available devices found</p>
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {availableDevices.map((device) => {
                    const assignee = assigneeLabel(device);
                    return (
                    <div
                      key={device.deviceId}
                      className={`flex items-center justify-between p-3 rounded-lg transition ${assignee ? 'bg-gray-100' : 'bg-gray-50 hover:bg-gray-100'}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">{device.name}</div>
                        <div className="text-xs text-gray-500">{device.deviceId}</div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {renderStatusBadge(device)}
                          <span className="text-[10px] text-gray-500 truncate">{device.location || '-'}</span>
                          {assignee && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                              Assigned to {assignee}
                            </span>
                          )}
                        </div>
                      </div>
                      {canAssignDevices && !assignee && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleAssign(device.deviceId)}
                          className="ml-2 shrink-0 px-2 py-1"
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Assign
                        </Button>
                      )}
                    </div>
                    );
                  })}
                </div>

                {/* Pagination for Available Devices */}
                <Pagination
                  currentPage={allDevicesPage}
                  totalPages={availableTotalPages}
                  total={availableTotal}
                  perPage={allDevicesPerPage}
                  onPageChange={setAllDevicesPage}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
