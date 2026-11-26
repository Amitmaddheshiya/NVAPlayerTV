import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deviceAPI, groupAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Plus, Edit, Trash2, Monitor, Layers, Settings, Search } from 'lucide-react';
import { SkeletonTable } from '../../components/ui/Skeleton';

export const UserGroups = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const groupsPerPage = 10;

  const groupsQuery = useQuery({
    queryKey: ['user-groups', currentPage, searchTerm],
    queryFn: async () => {
      const params: any = { page: currentPage, limit: groupsPerPage };
      if (searchTerm) params.search = searchTerm;
      const response = await groupAPI.getGroups(params);
      return response.data;
    },
  });

  const devicesQuery = useQuery({
    queryKey: ['user-groups-devices'],
    queryFn: async () => {
      const response = await deviceAPI.getDevices({ page: 1, limit: 1000 });
      return response.data.data || response.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // All groups (unpaginated) — needed to know which group each device belongs
  // to when creating/editing, since the table only loads one page at a time.
  const allGroupsQuery = useQuery({
    queryKey: ['user-groups-all'],
    queryFn: async () => {
      const response = await groupAPI.getGroups({ page: 1, limit: 1000 });
      return response.data?.data || response.data || [];
    },
    staleTime: 30 * 1000,
  });

  const groups = groupsQuery.data?.data || [];
  const filteredGroups = groups;
  const devices = devicesQuery.data || [];
  const loading = groupsQuery.isLoading;
  const totalGroups = groupsQuery.data?.total || 0;
  const totalPages = groupsQuery.data?.totalPages || 0;
  const loadGroups = () => {
    queryClient.invalidateQueries({ queryKey: ['user-groups'] });
    queryClient.invalidateQueries({ queryKey: ['user-groups-all'] });
  };

  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    showConfirm?: boolean;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
  });

  const [formData, setFormData] = useState({
    name: '',
    devices: [] as string[],
  });
  const [deviceSearchTerm, setDeviceSearchTerm] = useState('');
  const [visibleDeviceCount, setVisibleDeviceCount] = useState(10);

  // No client-side filtering - all filtering happens on server

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingGroup) {
        await groupAPI.updateGroup(editingGroup._id, formData.name, formData.devices);
      } else {
        await groupAPI.createGroup(formData.name, formData.devices);
      }
      setShowForm(false);
      setEditingGroup(null);
      setFormData({ name: '', devices: [] });
      setVisibleDeviceCount(10);
      setDeviceSearchTerm('');
      loadGroups();
      setAlertState({
        isOpen: true,
        title: 'Success',
        message: editingGroup ? 'Group updated successfully' : 'Group created successfully',
        type: 'success',
      });
    } catch (error: any) {
      setAlertState({
        isOpen: true,
        title: 'Error',
        message: error?.response?.data?.error || 'Failed to save group. Please try again.',
        type: 'error',
      });
    }
  };

  const handleEdit = (group: any) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      devices: group.devices || [],
    });
    setShowForm(true);
    setVisibleDeviceCount(10);
    setDeviceSearchTerm('');
  };

  const handleDelete = async (groupId: string) => {
    setAlertState({
      isOpen: true,
      title: 'Delete Group',
      message: 'Are you sure you want to delete this group?',
      type: 'warning',
      showConfirm: true,
      onConfirm: async () => {
        try {
          await groupAPI.deleteGroup(groupId);
          loadGroups();
          setAlertState({
            isOpen: true,
            title: 'Success',
            message: 'Group deleted successfully',
            type: 'success',
          });
        } catch (error) {
          setAlertState({
            isOpen: true,
            title: 'Error',
            message: 'Failed to delete group. Please try again.',
            type: 'error',
          });
        }
      },
    });
  };

  const allGroups = allGroupsQuery.data || [];

  // Returns the name of the OTHER group a device belongs to (null if free or
  // already in the group being edited).
  const otherGroupNameFor = (deviceId: string): string | null => {
    const g = allGroups.find((grp: any) =>
      grp._id !== editingGroup?._id &&
      Array.isArray(grp.devices) &&
      grp.devices.includes(deviceId)
    );
    return g ? g.name : null;
  };

  const toggleDevice = (deviceId: string) => {
    // Device already in another group — cannot be selected here
    if (otherGroupNameFor(deviceId) && !formData.devices.includes(deviceId)) {
      setAlertState({
        isOpen: true,
        title: 'Device Already Assigned',
        message: `This device is already assigned to group "${otherGroupNameFor(deviceId)}". Remove it from that group first.`,
        type: 'warning',
      });
      return;
    }

    setFormData((prev) => {
      if (prev.devices.includes(deviceId)) {
        return { ...prev, devices: prev.devices.filter((id) => id !== deviceId) };
      }
      return { ...prev, devices: [...prev.devices, deviceId] };
    });
  };

  const handleConfigure = (groupId: string) => {
    navigate(`/user/groups/${groupId}/configure`);
  };

  const getDeviceCount = (deviceIds: string[]) => {
    return deviceIds.length;
  };

  const filteredDevices = devices.filter((device) =>
    device.name.toLowerCase().includes(deviceSearchTerm.toLowerCase()) ||
    device.deviceId.toLowerCase().includes(deviceSearchTerm.toLowerCase())
  );
  const visibleDevices = filteredDevices.slice(0, visibleDeviceCount);
  const hasMoreDevices = filteredDevices.length > visibleDeviceCount;

  const getOnlineCount = (deviceIds: string[]) => {
    return devices
      .filter((d) => deviceIds.includes(d.deviceId))
      .filter((d) => d.status === 'online').length;
  };

  const paginatedGroups = filteredGroups;

  if (loading) {
    return (
      <div className="p-1 sm:p-1.5 md:p-2 w-full">
        <SkeletonTable rows={8} cols={5} />
      </div>
    );
  }

  return (
    <>
      <Alert
        isOpen={alertState.isOpen}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        showConfirm={alertState.showConfirm}
        onConfirm={alertState.onConfirm}
        onClose={() => setAlertState({ ...alertState, isOpen: false })}
      />
      <div className="p-2 sm:p-4 md:p-6 max-w-[95vw] sm:max-w-[1200px] mx-auto overflow-x-hidden">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 sm:mb-4 md:mb-6 gap-2">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">Device Groups</h1>
        <Button onClick={() => {
          setShowForm(!showForm);
          if (!showForm) {
            setVisibleDeviceCount(10);
            setDeviceSearchTerm('');
          }
        }} className="text-[10px] sm:text-xs">
          <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
          Create Group
        </Button>
      </div>

      {/* Search */}
      <Card className="mb-2 sm:mb-3 md:mb-4">
        <CardContent className="p-2 sm:p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
            <Input
              placeholder="Search groups..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 sm:pl-10 text-[10px] sm:text-xs"
            />
          </div>
        </CardContent>
      </Card>

        {showForm && (
          <Card className="mb-2 sm:mb-3 md:mb-4">
            <CardHeader>
              <CardTitle className="text-[10px] sm:text-xs md:text-sm">{editingGroup ? 'Edit Group' : 'Create New Group'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-2 sm:space-y-3">
                <div>
                  <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">
                    Group Name
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="My Group"
                    required
                    className="text-[10px] sm:text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">
                    Select Devices
                  </label>
                  <div className="mb-2">
                    <Input
                      placeholder="Search devices..."
                      value={deviceSearchTerm}
                      onChange={(e) => setDeviceSearchTerm(e.target.value)}
                      className="text-[10px] sm:text-xs"
                    />
                  </div>
                  <div className="space-y-1.5 sm:space-y-2 max-h-40 sm:max-h-48 md:max-h-64 overflow-y-auto">
                    {visibleDevices.map((device) => {
                      const otherGroup = otherGroupNameFor(device.deviceId);
                      const isSelected = formData.devices.includes(device.deviceId);
                      const disabled = !!otherGroup && !isSelected;
                      return (
                      <div
                        key={device.deviceId}
                        onClick={() => !disabled && toggleDevice(device.deviceId)}
                        className={`flex items-center justify-between p-1.5 sm:p-2 md:p-3 rounded-lg transition-colors ${
                          disabled
                            ? 'bg-gray-100 opacity-60 cursor-not-allowed'
                            : isSelected
                              ? 'bg-blue-50 border border-blue-500 cursor-pointer'
                              : 'bg-gray-50 hover:bg-gray-100 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
                          <Monitor className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 text-gray-600" />
                          <div>
                            <div className="text-[10px] sm:text-xs md:text-sm font-medium">{device.name}</div>
                            <div className="text-[9px] sm:text-[10px] md:text-xs text-gray-600">{device.deviceId}</div>
                            {otherGroup && (
                              <div className="text-[9px] sm:text-[10px] md:text-xs text-amber-700 font-medium">
                                In group: {otherGroup}
                              </div>
                            )}
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={disabled}
                          onChange={() => {}}
                          onClick={(e) => e.stopPropagation()}
                          className="w-3 h-3 sm:w-4 sm:h-4"
                        />
                      </div>
                      );
                    })}
                    {hasMoreDevices && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full text-[10px] sm:text-xs"
                        onClick={() => setVisibleDeviceCount((prev) => prev + 10)}
                      >
                        Load More ({filteredDevices.length - visibleDeviceCount} remaining)
                      </Button>
                    )}
                    {filteredDevices.length === 0 && (
                      <div className="text-center py-3 sm:py-4 text-gray-500 text-[10px] sm:text-xs">
                        No devices found
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-1.5 sm:gap-2">
                  <Button type="submit" className="text-[10px] sm:text-xs">
                    {editingGroup ? 'Update' : 'Create'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setShowForm(false);
                      setEditingGroup(null);
                    }}
                    className="text-[10px] sm:text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Groups Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] sm:text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-gray-500 uppercase tracking-wider">Group</th>
                    <th className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-gray-500 uppercase tracking-wider">Devices</th>
                    <th className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-gray-500 uppercase tracking-wider">Online</th>
                    <th className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-left text-[9px] sm:text-[10px] font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedGroups.map((group) => (
                    <tr key={group._id} className="hover:bg-gray-50">
                      <td className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1 sm:gap-2">
                          <Layers className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-gray-600" />
                          <div className="text-[10px] sm:text-xs font-medium text-gray-900">{group.name}</div>
                        </div>
                      </td>
                      <td className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 whitespace-nowrap text-[10px] sm:text-xs text-gray-900">
                        <div className="flex items-center gap-0.5 sm:gap-1">
                          <Monitor className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-gray-600" />
                          {getDeviceCount(group.devices)}
                        </div>
                      </td>
                      <td className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 whitespace-nowrap text-[10px] sm:text-xs text-gray-900">
                        {getOnlineCount(group.devices)} / {getDeviceCount(group.devices)}
                      </td>
                      <td className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 whitespace-nowrap text-[10px] sm:text-xs font-medium">
                        <div className="flex gap-0.5 sm:gap-1">
                          <Button size="sm" variant="secondary" onClick={() => handleConfigure(group._id)}>
                            <Settings className="w-2 h-2 sm:w-2.5 sm:h-2.5 mr-0.5" />
                            <span className="hidden sm:inline">Configure</span>
                            <span className="sm:hidden">Config</span>
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => handleEdit(group)}>
                            <Edit className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => handleDelete(group._id)}>
                            <Trash2 className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredGroups.length === 0 && (
              <div className="text-center py-6 sm:py-8 md:py-12 text-gray-500 text-[10px] sm:text-xs">
                No groups found.
              </div>
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-2 sm:px-3 md:px-4 py-2 sm:py-3 border-t">
                <div className="text-[10px] sm:text-xs text-gray-600">
                  Showing {(currentPage - 1) * groupsPerPage + 1} to {Math.min(currentPage * groupsPerPage, totalGroups)} of {totalGroups} groups
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="text-[10px] sm:text-xs"
                  >
                    Previous
                  </Button>
                  <span className="text-[10px] sm:text-xs text-gray-600 flex items-center px-2">
                    {currentPage} / {totalPages}
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
          </CardContent>
        </Card>
      </div>
    </>
  );
};
