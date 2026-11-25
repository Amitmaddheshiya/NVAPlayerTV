import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deviceAPI, groupAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Wifi, WifiOff, Settings, Layers, Clock, Monitor } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { subscribeToDeviceUpdates } from '../../services/socket';
import { SkeletonTable } from '../../components/ui/Skeleton';

const formatLastSeen = (lastSeen: string | Date): string => {
  const date = new Date(lastSeen);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

export const UserDevices = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const devicesPerPage = 10;
  const navigate = useNavigate();

  const devicesQuery = useQuery({
    queryKey: ['user-devices', currentPage, searchTerm, statusFilter],
    queryFn: async () => {
      const params: any = { page: currentPage, limit: devicesPerPage };
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
      if (searchTerm) params.search = searchTerm;
      const response = await deviceAPI.getDevices(params);
      return response.data;
    },
  });

  const groupsQuery = useQuery({
    queryKey: ['user-groups-list'],
    queryFn: async () => {
      const response = await groupAPI.getGroups();
      return response.data.data || response.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const devices = devicesQuery.data?.data || [];
  const filteredDevices = devices;
  const groups = groupsQuery.data || [];
  const loading = devicesQuery.isLoading;
  const totalDevices = devicesQuery.data?.total || 0;
  const totalPages = devicesQuery.data?.totalPages || 0;
  const deviceSummary = devicesQuery.data?.summary || { onlineDevices: 0, offlineDevices: 0, groupedDevices: 0 };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToDeviceUpdates(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey: ['user-devices'] });
      }, 5000);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [queryClient]);

  const isDeviceInGroup = (deviceId: string) => {
    return groups.some((group) => group.devices.includes(deviceId));
  };

  const handleConfigure = (deviceId: string) => {
    navigate(`/user/devices/${deviceId}`);
  };

  const paginatedDevices = filteredDevices;

  if (loading) {
    return (
      <div className="p-1 sm:p-1.5 md:p-2 w-full">
        <SkeletonTable rows={8} cols={5} />
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 md:p-6 max-w-[95vw] sm:max-w-[1200px] mx-auto overflow-x-hidden">
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-3 sm:mb-4 md:mb-6">My Devices</h1>

      {/* Device Summary */}
      <Card className="mb-2 sm:mb-3 md:mb-4">
        <CardHeader>
          <CardTitle className="text-[10px] sm:text-xs md:text-sm">Device Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            <div className="p-2 sm:p-3 md:p-4 bg-green-50 rounded-lg">
              <div className="text-[10px] sm:text-xs md:text-sm text-green-800 font-medium">Online</div>
              <div className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-green-600">
                {deviceSummary.onlineDevices}
              </div>
            </div>
            <div className="p-2 sm:p-3 md:p-4 bg-red-50 rounded-lg">
              <div className="text-[10px] sm:text-xs md:text-sm text-red-800 font-medium">Offline</div>
              <div className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-red-600">
                {deviceSummary.offlineDevices}
              </div>
            </div>
            <div className="p-2 sm:p-3 md:p-4 bg-orange-50 rounded-lg">
              <div className="text-[10px] sm:text-xs md:text-sm text-orange-800 font-medium">In Groups</div>
              <div className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-orange-600">
                {deviceSummary.groupedDevices}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search and Filter */}
      <Card className="mb-2 sm:mb-3 md:mb-4">
        <CardContent className="p-2 sm:p-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
            <Input
              label="Search"
              placeholder="Search devices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-[10px] sm:text-xs"
            />
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
        </CardContent>
      </Card>

      {filteredDevices.length === 0 ? (
        <Card>
          <CardContent className="p-6 sm:p-8 md:p-12 text-center">
            <Monitor className="w-8 h-8 sm:w-12 sm:h-12 md:w-16 md:h-16 text-gray-400 mx-auto mb-2 sm:mb-3 md:mb-4" />
            <h3 className="text-sm sm:text-base md:text-lg font-medium text-gray-900 mb-2">
              {devices.length === 0 ? 'No devices assigned' : 'No devices match your filters'}
            </h3>
            {devices.length === 0 && (
              <p className="text-gray-600 text-[10px] sm:text-xs md:text-sm">
                Contact your administrator to get devices assigned to your account.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Devices Table */}
          <Card className="mb-2 sm:mb-3 md:mb-4">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] sm:text-xs">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-gray-500 uppercase tracking-wider">Device</th>
                      <th className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-gray-500 uppercase tracking-wider">Version</th>
                      <th className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-gray-500 uppercase tracking-wider">Last Seen</th>
                      <th className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-gray-500 uppercase tracking-wider">Group</th>
                      <th className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedDevices.map((device) => {
                      const inGroup = isDeviceInGroup(device.deviceId);
                      const isLongOffline = device.status === 'offline' &&
                        Date.now() - new Date(device.lastSeen).getTime() >= 30 * 24 * 60 * 60 * 1000;
                      return (
                        <tr key={device.deviceId} className="hover:bg-gray-50">
                          <td className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 whitespace-nowrap">
                            <div>
                              <div className="text-[10px] sm:text-xs font-medium text-gray-900">{device.name}</div>
                              <div className="text-[9px] sm:text-[10px] text-gray-500">{device.deviceId}</div>
                            </div>
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 whitespace-nowrap">
                            {device.status === 'online' ? (
                              <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium bg-green-100 text-green-800">
                                <Wifi className="w-2 h-2 sm:w-2.5 sm:h-2.5 mr-0.5 sm:mr-1" />
                                Online
                              </span>
                            ) : isLongOffline ? (
                              <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium bg-orange-100 text-orange-800">
                                <WifiOff className="w-2 h-2 sm:w-2.5 sm:h-2.5 mr-0.5 sm:mr-1" />
                                30D+
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium bg-red-100 text-red-800">
                                <WifiOff className="w-2 h-2 sm:w-2.5 sm:h-2.5 mr-0.5 sm:mr-1" />
                                Offline
                              </span>
                            )}
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 whitespace-nowrap text-[10px] sm:text-xs text-gray-900">
                            {device.appVersion || '-'}
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 whitespace-nowrap text-[10px] sm:text-xs text-gray-500">
                            <div className="flex items-center gap-0.5 sm:gap-1">
                              <Clock className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-gray-600" />
                              {formatLastSeen(device.lastSeen)}
                            </div>
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 whitespace-nowrap text-[10px] sm:text-xs text-gray-900">
                            {inGroup ? (
                              <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium bg-orange-100 text-orange-800">
                                <Layers className="w-2 h-2 sm:w-2.5 sm:h-2.5 mr-0.5 sm:mr-1" />
                                In Group
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 whitespace-nowrap text-[10px] sm:text-xs font-medium">
                            <Button
                              size="sm"
                              disabled={inGroup}
                              title={inGroup ? 'Configure this device from its group page' : 'Configure device'}
                              onClick={() => handleConfigure(device.deviceId)}
                            >
                              <Settings className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                              <span className="hidden sm:inline">{inGroup ? 'Group Managed' : 'Configure'}</span>
                              <span className="sm:hidden">{inGroup ? 'Group' : 'Config'}</span>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 sm:px-3 md:px-4 py-2 sm:py-3 border-t">
              <div className="text-[10px] sm:text-xs text-gray-600">
                Showing {(currentPage - 1) * devicesPerPage + 1} to {Math.min(currentPage * devicesPerPage, totalDevices)} of {totalDevices} devices
              </div>
              <div className="flex gap-1 sm:gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="text-[10px] sm:text-xs"
                >
                  Previous
                </Button>
                <span className="text-[10px] sm:text-xs text-gray-600 flex items-center">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="text-[10px] sm:text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
};
