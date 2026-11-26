import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deviceAPI, userAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Plus, Edit, Trash2, Search, CheckCircle, XCircle } from 'lucide-react';
import { subscribeToDeviceUpdates } from '../../services/socket';
import { DeviceStatusBadge } from '../../components/admin/DeviceStatusBadge';
import { Pagination } from '../../components/admin/Pagination';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { SkeletonTable } from '../../components/ui/Skeleton';
import { useUrlParam, useUrlNumberParam, useSortParam } from '../../hooks/useUrlParam';
import { SortableTh } from '../../components/admin/SortableTh';

export const AdminDevices = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useUrlParam('q');
  const [searchInput, setSearchInput] = useState(searchTerm);
  const [statusFilter, setStatusFilter] = useUrlParam('status', 'all');
  const [userFilter, setUserFilter] = useUrlParam('user', 'all');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssignUser, setBulkAssignUser] = useState('');
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { success, error: toastError } = useToast();
  const [currentPage, setCurrentPage] = useUrlNumberParam('page', 1);
  const { sortBy, sortOrder, toggleSort } = useSortParam('updatedAt', 'desc');
  const devicesPerPage = 15;

  const devicesQuery = useQuery({
    queryKey: ['admin-devices', currentPage, searchTerm, statusFilter, userFilter, sortBy, sortOrder],
    queryFn: async () => {
      const params: any = { page: currentPage, limit: devicesPerPage };
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
      if (userFilter && userFilter !== 'all') params.assignedUserId = userFilter;
      if (searchTerm) params.search = searchTerm;
      if (sortBy) { params.sortBy = sortBy; params.sortOrder = sortOrder; }
      const response = await deviceAPI.getDevices(params);
      return response.data;
    },
  });

  const usersQuery = useQuery({
    queryKey: ['admin-users-list'],
    queryFn: async () => {
      const response = await userAPI.getUsers({ page: 1, limit: 1000 });
      const usersData = response.data.data || response.data;
      return usersData.filter((user: any) => user.role !== 'sub-user' && !user.parentId);
    },
    staleTime: 5 * 60 * 1000,
  });

  const filteredDevices = devicesQuery.data?.data || [];
  const users = usersQuery.data || [];
  const loading = devicesQuery.isLoading;
  const totalDevices = devicesQuery.data?.total || 0;
  const totalPages = devicesQuery.data?.totalPages || 0;
  const loadDevices = () => queryClient.invalidateQueries({ queryKey: ['admin-devices'] });

  const [formData, setFormData] = useState({
    deviceId: '',
    name: '',
    location: '',
    assignedUserId: '',
    activated: false,
  });

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

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, userFilter, sortBy, sortOrder]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToDeviceUpdates(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey: ['admin-devices'] });
      }, 5000);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [queryClient]);

  // No client-side filtering - all filtering happens on server
  const paginatedDevices = filteredDevices;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedId = formData.deviceId.trim();
    const trimmedName = formData.name.trim();
    if (!trimmedId) {
      toastError('Device ID is required');
      return;
    }
    if (!trimmedName) {
      toastError('Device name is required');
      return;
    }

    try {
      await deviceAPI.createDevice({ ...formData, deviceId: trimmedId, name: trimmedName });
      setShowForm(false);
      setFormData({
        deviceId: '',
        name: '',
        location: '',
        assignedUserId: '',
        activated: false,
      });
      loadDevices();
      success('Device created successfully');
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to create device';
      toastError(errorMessage);
    }
  };

  // Clear selection when the visible page changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentPage]);

  const toggleSelect = (deviceId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  };

  const allPageSelected = paginatedDevices.length > 0 && paginatedDevices.every((d) => selectedIds.has(d.deviceId));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allPageSelected) {
        const next = new Set(prev);
        paginatedDevices.forEach((d) => next.delete(d.deviceId));
        return next;
      }
      const next = new Set(prev);
      paginatedDevices.forEach((d) => next.add(d.deviceId));
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    await Promise.all(
      Array.from(selectedIds).map(async (id) => {
        try {
          await deviceAPI.deleteDevice(id);
          ok++;
        } catch {
          fail++;
        }
      })
    );
    setBulkBusy(false);
    setBulkDeleteOpen(false);
    setSelectedIds(new Set());
    loadDevices();
    if (fail === 0) success(`${ok} device(s) deleted`);
    else toastError(`Deleted ${ok}, failed ${fail}`);
  };

  const handleBulkAssign = async () => {
    if (selectedIds.size === 0 || !bulkAssignUser) return;
    setBulkBusy(true);
    let ok = 0;
    const failures: string[] = [];
    await Promise.all(
      Array.from(selectedIds).map(async (id) => {
        try {
          await deviceAPI.updateDevice(id, { assignedUserId: bulkAssignUser });
          ok++;
        } catch (error: any) {
          const reason = error?.response?.data?.error || 'failed';
          failures.push(`${id}: ${reason}`);
        }
      })
    );
    setBulkBusy(false);
    setBulkAssignUser('');
    setSelectedIds(new Set());
    loadDevices();
    if (failures.length === 0) success(`${ok} device(s) assigned`);
    else toastError(`Assigned ${ok}, failed ${failures.length}. ${failures.slice(0, 3).join(' | ')}`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deviceAPI.deleteDevice(deleteTarget);
      setDeleteTarget(null);
      loadDevices();
      success('Device deleted successfully');
    } catch (error) {
      toastError('Failed to delete device');
    }
  };

  const toggleActivation = async (deviceId: string, currentStatus: boolean) => {
    try {
      await deviceAPI.updateDevice(deviceId, { activated: !currentStatus });
      success(`Device ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
      loadDevices();
    } catch (error) {
      toastError('Failed to update device activation');
    }
  };

  const getUserName = (userId: string) => {
    const user = users.find((u) => u._id === userId);
    return user ? user.email : 'Unassigned';
  };

  const renderStatusBadge = (device: any) => <DeviceStatusBadge displayStatus={device.displayStatus} />;

  const renderActivationButton = (device: any) => (
    <Button
      size="sm"
      variant={device.activated ? 'success' : 'danger'}
      onClick={() => toggleActivation(device.deviceId, device.activated || false)}
      className="text-[10px] px-2 py-1 whitespace-nowrap"
    >
      {device.activated ? (
        <>
          <CheckCircle className="w-2.5 h-2.5 mr-1" />
          Active
        </>
      ) : (
        <>
          <XCircle className="w-2.5 h-2.5 mr-1" />
          Activate
        </>
      )}
    </Button>
  );

  const renderDeviceActions = (device: any) => (
    <div className="flex gap-0.5">
      <Button
        size="sm"
        variant="secondary"
        onClick={() => navigate(`/admin/devices/${device.deviceId}/edit`)}
        className="px-2 py-1 text-xs"
      >
        <Edit className="w-3 h-3" />
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={() => setDeleteTarget(device.deviceId)}
        className="px-2 py-1 text-xs"
      >
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  );

  if (loading) {
    return (
      <div className="p-1 sm:p-1.5 md:p-2 w-full">
        <SkeletonTable rows={10} cols={6} />
      </div>
    );
  }

  return (
    <div className="p-1 sm:p-1.5 md:p-2 w-full">
      {/* Alert Dialog removed — toasts via useToast */}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 sm:mb-3 gap-2">
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">Devices</h1>
        <Button onClick={() => setShowForm(!showForm)} className="text-xs sm:text-sm w-full sm:w-auto">
          <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
          Add Device
        </Button>
      </div>

      {/* Search and Filter */}
      <Card className="mb-2">
        <CardContent className="p-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                label="Search"
                placeholder="Search devices..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
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
        <Card className="mb-2">
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

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <Card className="mb-2 border-blue-200 bg-blue-50">
          <CardContent className="p-2 flex flex-wrap items-center gap-2">
            <span className="text-xs sm:text-sm font-medium text-blue-800">
              {selectedIds.size} selected
            </span>
            <Select
              options={[
                { value: '', label: 'Assign to user...' },
                ...users.map((u) => ({ value: u._id, label: u.email })),
              ]}
              value={bulkAssignUser}
              onChange={(e) => setBulkAssignUser(e.target.value)}
              className="w-40 text-xs sm:text-sm"
            />
            <Button
              size="sm"
              onClick={handleBulkAssign}
              disabled={!bulkAssignUser || bulkBusy}
              className="text-xs sm:text-sm"
            >
              Assign
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={bulkBusy}
              className="text-xs sm:text-sm"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Delete
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkBusy}
              className="text-xs sm:text-sm"
            >
              Clear
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Devices Table */}
      <Card>
        <CardContent className="p-0">
          {/* Mobile / tablet: card list — no horizontal scroll */}
          <div className="lg:hidden divide-y divide-gray-200">
            {paginatedDevices.map((device) => (
              <div key={device.deviceId} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(device.deviceId)}
                      onChange={() => toggleSelect(device.deviceId)}
                      className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate" title={device.name}>{device.name}</div>
                      <div className="text-[11px] text-gray-500 truncate" title={device.deviceId}>{device.deviceId}</div>
                    </div>
                  </div>
                  {renderStatusBadge(device)}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-gray-700">
                  <div className="truncate"><span className="text-gray-500">Location:</span> {device.location || '—'}</div>
                  <div className="truncate"><span className="text-gray-500">Assigned:</span> {getUserName(device.assignedUserId)}</div>
                  <div><span className="text-gray-500">Version:</span> {device.appVersion || '—'}</div>
                  <div className="truncate"><span className="text-gray-500">Last Seen:</span> {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : '—'}</div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {renderActivationButton(device)}
                  {renderDeviceActions(device)}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: compact full-width table — all columns visible, no horizontal scroll */}
          <div className="hidden lg:block">
            <table className="w-full table-fixed text-[11px]">
              <colgroup>
                <col className="w-[4%]" />
                <col className="w-[19%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[16%]" />
                <col className="w-[8%]" />
                <col className="w-[12%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-2 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <SortableTh label="Device" field="name" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider" />
                  <SortableTh label="Status" field="status" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider" />
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Activation</th>
                  <SortableTh label="Location" field="location" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider" />
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Assigned To</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Version</th>
                  <SortableTh label="Last Seen" field="lastSeen" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider" />
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedDevices.map((device) => (
                  <tr key={device.deviceId} className="hover:bg-gray-50">
                    <td className="px-2 py-2 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(device.deviceId)}
                        onChange={() => toggleSelect(device.deviceId)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <div className="text-xs font-medium text-gray-900 truncate" title={device.name}>{device.name}</div>
                      <div className="text-[10px] text-gray-500 truncate" title={device.deviceId}>{device.deviceId}</div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{renderStatusBadge(device)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{renderActivationButton(device)}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-gray-900 truncate" title={device.location || ''}>{device.location || '—'}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-gray-900 truncate" title={getUserName(device.assignedUserId)}>{getUserName(device.assignedUserId)}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-gray-900 truncate" title={device.appVersion || ''}>{device.appVersion || '—'}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-gray-500 truncate" title={device.lastSeen ? new Date(device.lastSeen).toLocaleString() : ''}>
                      {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : '—'}
                    </td>
                    <td className="px-1.5 py-1.5 whitespace-nowrap font-medium">
                      {renderDeviceActions(device)}
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
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            total={totalDevices}
            perPage={devicesPerPage}
            onPageChange={setCurrentPage}
            itemLabel="devices"
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Device"
        message="Are you sure you want to delete this device? This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        title="Delete Selected Devices"
        message={`Delete ${selectedIds.size} selected device(s)? This cannot be undone.`}
        confirmLabel={bulkBusy ? 'Deleting...' : 'Delete'}
        danger
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteOpen(false)}
      />
    </div>
  );
};
