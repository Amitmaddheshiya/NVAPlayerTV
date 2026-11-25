import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { userAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Alert } from '../../components/ui/Alert';
import { SkeletonTable } from '../../components/ui/Skeleton';
import { useUrlParam, useUrlNumberParam, useSortParam } from '../../hooks/useUrlParam';
import { SortableTh } from '../../components/admin/SortableTh';
import { Plus, Edit, Trash2, Monitor, HardDrive, Upload, Shield, ShieldAlert } from 'lucide-react';

export const AdminUsers = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useUrlParam('q');
  const [searchInput, setSearchInput] = useState(searchTerm);
  const [roleFilter, setRoleFilter] = useUrlParam('role', 'all');
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
    email: '',
    password: '',
    phone: '',
    businessName: '',
    role: 'user',
    subUserLimit: 0,
  });

  const [currentPage, setCurrentPage] = useUrlNumberParam('page', 1);
  const { sortBy, sortOrder, toggleSort } = useSortParam('createdAt', 'desc');
  const usersPerPage = 15;

  const usersQuery = useQuery({
    queryKey: ['admin-users', currentPage, searchTerm, roleFilter, sortBy, sortOrder],
    queryFn: async () => {
      const params: any = { page: currentPage, limit: usersPerPage };
      if (roleFilter && roleFilter !== 'all') params.role = roleFilter;
      if (searchTerm) params.search = searchTerm;
      if (sortBy) { params.sortBy = sortBy; params.sortOrder = sortOrder; }
      const response = await userAPI.getUsers(params);
      return response.data;
    },
  });

  const filteredUsers = usersQuery.data?.data || [];
  const loading = usersQuery.isLoading;
  const totalUsers = usersQuery.data?.total || 0;
  const totalPages = usersQuery.data?.totalPages || 0;
  const loadUsers = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const isSubUser = (user: any) => user?.role === 'sub-user' || !!user?.parentId;

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
  }, [searchTerm, roleFilter, sortBy, sortOrder]);

  // No client-side filtering - all filtering happens on server

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingUser) {
        await userAPI.updateUser(editingUser._id, formData);
        setAlertState({
          isOpen: true,
          title: 'Success',
          message: 'User updated successfully',
          type: 'success',
        });
      } else {
        await userAPI.createUser(formData);
        setAlertState({
          isOpen: true,
          title: 'Success',
          message: 'User created successfully',
          type: 'success',
        });
      }
      setShowForm(false);
      setEditingUser(null);
      setFormData({
        email: '',
        password: '',
        phone: '',
        businessName: '',
        role: 'user',
        subUserLimit: 0,
      });
      loadUsers();
    } catch (error: any) {
      setAlertState({
        isOpen: true,
        title: 'Save Failed',
        message: error?.response?.data?.error || 'Failed to save user. Please try again.',
        type: 'error',
      });
    }
  };

  const handleEdit = (user: any) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      phone: user.phone || '',
      businessName: user.businessName || '',
      role: isSubUser(user) ? 'sub-user' : user.role,
      subUserLimit: user.subUserLimit || 0,
    });
    setShowForm(true);
  };

  const handleDelete = async (userId: string) => {
    setAlertState({
      isOpen: true,
      title: 'Delete User',
      message: 'Are you sure you want to delete this user?',
      type: 'warning',
      showConfirm: true,
      onConfirm: async () => {
        try {
          await userAPI.deleteUser(userId);
          loadUsers();
          setAlertState({
            isOpen: true,
            title: 'Success',
            message: 'User deleted successfully',
            type: 'success',
          });
        } catch (error) {
          setAlertState({
            isOpen: true,
            title: 'Delete Failed',
            message: 'Failed to delete user. Please try again.',
            type: 'error',
          });
        }
      },
    });
  };

  const handleDeviceAssignment = (user: any) => {
    navigate(`/admin/users/${user._id}/devices`);
  };

  // Server already paginates — use the page's users directly.
  const paginatedUsers = filteredUsers;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const renderRoleBadge = (user: any) => {
    if (user.role === 'admin') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-800 whitespace-nowrap">
          <Shield className="w-2.5 h-2.5 mr-1" />
          Admin
        </span>
      );
    }
    if (isSubUser(user)) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 whitespace-nowrap">
          <ShieldAlert className="w-2.5 h-2.5 mr-1" />
          Sub-user
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800 whitespace-nowrap">
        <ShieldAlert className="w-2.5 h-2.5 mr-1" />
        User
      </span>
    );
  };

  const renderUploadUsage = (user: any) =>
    user.role === 'admin'
      ? 'Unlimited'
      : `${formatBytes(user.currentMonthUpload || 0)} / ${user.monthlyUploadLimit ?? '—'} GB`;

  const renderUserActions = (user: any) => (
    <div className="flex gap-0.5">
      <Button size="sm" variant="secondary" onClick={() => handleEdit(user)} className="px-2 py-1 text-xs">
        <Edit className="w-3 h-3" />
      </Button>
      {!isSubUser(user) && (
        <Button size="sm" variant="secondary" onClick={() => handleDeviceAssignment(user)} className="px-2 py-1 text-xs">
          <Monitor className="w-3 h-3" />
        </Button>
      )}
      {user.role !== 'admin' && (
        <Button size="sm" variant="danger" onClick={() => handleDelete(user._id)} className="px-2 py-1 text-xs">
          <Trash2 className="w-3 h-3" />
        </Button>
      )}
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
    <>
      <div className="p-1.5 sm:p-2 md:p-3 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 sm:mb-4 md:mb-6 gap-2 sm:gap-3 md:gap-4">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">Users</h1>
        <Button onClick={() => setShowForm(!showForm)} className="text-xs sm:text-sm w-full sm:w-auto">
          <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
          Add User
        </Button>
      </div>

      {/* Search and Filter */}
      <Card className="mb-2 sm:mb-3 md:mb-4">
        <CardContent className="p-2 sm:p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Search</label>
              <Input
                placeholder="Search users..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="text-xs sm:text-sm"
              />
            </div>
            <div>
              <Select
                label="Filter by Role"
                options={[
                  { value: 'all', label: 'All Roles' },
                  { value: 'admin', label: 'Admin' },
                  { value: 'user', label: 'User' },
                  { value: 'sub-user', label: 'Sub-user' },
                ]}
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {showForm && (
        <Card className="mb-2 sm:mb-3 md:mb-4">
          <CardHeader>
            <CardTitle className="text-[10px] sm:text-xs md:text-sm">{editingUser ? 'Edit User' : 'Add New User'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-2 sm:space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <Input
                  label="Email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="text-xs sm:text-sm"
                />
                <Input
                  label="Password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required={!editingUser}
                  placeholder={editingUser ? 'Leave blank to keep current' : ''}
                  className="text-xs sm:text-sm"
                  showPasswordToggle
                />
                <Input
                  label="Phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="text-xs sm:text-sm"
                />
                <Input
                  label="Business Name"
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  className="text-xs sm:text-sm"
                />
                <Select
                  label="Role"
                  options={editingUser && isSubUser(editingUser)
                    ? [{ value: 'sub-user', label: 'Sub-user' }]
                    : [
                      { value: 'user', label: 'User' },
                      { value: 'admin', label: 'Admin' },
                    ]}
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  disabled={!!(editingUser && isSubUser(editingUser))}
                />
                {formData.role === 'user' && !(editingUser && isSubUser(editingUser)) && (
                  <Input
                    label="Sub-user Limit"
                    type="number"
                    min={0}
                    value={formData.subUserLimit}
                    onChange={(e) => setFormData({ ...formData, subUserLimit: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    placeholder="0 = no sub-users"
                    className="text-xs sm:text-sm"
                  />
                )}
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="text-xs sm:text-sm">
                  {editingUser ? 'Update' : 'Create'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowForm(false);
                    setEditingUser(null);
                  }}
                  className="text-xs sm:text-sm"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          {/* Mobile / tablet: card list — no horizontal scroll */}
          <div className="lg:hidden divide-y divide-gray-200">
            {paginatedUsers.map((user) => (
              <div key={user._id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate" title={user.email}>{user.email}</div>
                    <div className="text-[11px] text-gray-500 truncate">{user.businessName || '—'}</div>
                  </div>
                  {renderRoleBadge(user)}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-gray-700">
                  <div className="truncate"><span className="text-gray-500">Phone:</span> {user.phone || '—'}</div>
                  <div><span className="text-gray-500">Devices:</span> {user.assignedDevices?.length || 0}</div>
                  <div className="truncate"><span className="text-gray-500">Storage:</span> {formatBytes(user.storageUsed)}</div>
                  <div className="truncate"><span className="text-gray-500">Monthly Upload:</span> {renderUploadUsage(user)}</div>
                  <div><span className="text-gray-500">Created:</span> {new Date(user.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="flex justify-end">{renderUserActions(user)}</div>
              </div>
            ))}
          </div>

          {/* Desktop: compact full-width table — all columns visible, no horizontal scroll */}
          <div className="hidden lg:block">
            <table className="w-full table-fixed text-[11px]">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[6%]" />
                <col className="w-[10%]" />
                <col className="w-[16%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead className="bg-gray-50 border-b">
                <tr>
                  <SortableTh label="User" field="email" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider" />
                  <SortableTh label="Role" field="role" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider" />
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                  <SortableTh label="Business" field="businessName" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider" />
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Devices</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Storage</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Monthly Upload</th>
                  <SortableTh label="Created" field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={toggleSort} className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider" />
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedUsers.map((user) => (
                  <tr key={user._id} className="hover:bg-gray-50">
                    <td className="px-2 py-2 whitespace-nowrap">
                      <div className="text-xs font-medium text-gray-900 truncate" title={user.email}>{user.email}</div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{renderRoleBadge(user)}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-gray-900 truncate" title={user.phone || ''}>{user.phone || '—'}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-gray-900 truncate" title={user.businessName || ''}>{user.businessName || '—'}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-gray-900">
                      <div className="flex items-center gap-1">
                        <Monitor className="w-2.5 h-2.5 text-gray-600" />
                        {user.assignedDevices?.length || 0}
                      </div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-gray-900 truncate" title={formatBytes(user.storageUsed)}>
                      <div className="flex items-center gap-1">
                        <HardDrive className="w-2.5 h-2.5 text-gray-600" />
                        {formatBytes(user.storageUsed)}
                      </div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-gray-900 truncate" title={renderUploadUsage(user)}>
                      <div className="flex items-center gap-1">
                        <Upload className="w-2.5 h-2.5 text-gray-600" />
                        {renderUploadUsage(user)}
                      </div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-1.5 py-1.5 whitespace-nowrap font-medium">
                      {renderUserActions(user)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredUsers.length === 0 && (
            <div className="text-center py-8 sm:py-12 text-gray-500 text-xs sm:text-sm">
              No users found.
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-t">
              <div className="text-xs sm:text-sm text-gray-600">
                Showing {(currentPage - 1) * usersPerPage + 1} to {Math.min(currentPage * usersPerPage, totalUsers)} of {totalUsers} users
              </div>
              <div className="flex gap-1 sm:gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
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
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
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

      <Alert
        isOpen={alertState.isOpen}
        onClose={() => setAlertState({ ...alertState, isOpen: false })}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        showConfirm={alertState.showConfirm}
        onConfirm={alertState.onConfirm}
      />
    </>
  );
};
