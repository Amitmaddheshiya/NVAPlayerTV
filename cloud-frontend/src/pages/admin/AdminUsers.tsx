import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { userAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Alert } from '../../components/ui/Alert';
import { Plus, Edit, Trash2, Monitor, HardDrive, Upload, Shield, ShieldAlert } from 'lucide-react';

export const AdminUsers = () => {
  const navigate = useNavigate();
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
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

  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 15;
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const isSubUser = (user: any) => user?.role === 'sub-user' || !!user?.parentId;

  useEffect(() => {
    loadUsers();
  }, [currentPage, searchTerm, roleFilter]);

  const loadUsers = async () => {
    try {
      const params: any = {
        page: currentPage,
        limit: usersPerPage
      };

      // Send filters to backend for server-side filtering
      if (roleFilter && roleFilter !== 'all') {
        params.role = roleFilter;
      }
      if (searchTerm) {
        params.search = searchTerm;
      }

      const response = await userAPI.getUsers(params);
      const usersData = response.data.data || response.data;
      setFilteredUsers(usersData); // No client-side filtering needed
      setTotalUsers(response.data.total || 0);
      setTotalPages(response.data.totalPages || 0);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * usersPerPage,
    currentPage * usersPerPage
  );

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <>
      <div className="p-2 sm:p-4 md:p-6 max-w-[95vw] sm:max-w-[1200px] mx-auto overflow-x-hidden">
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
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
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
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Business</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Devices</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Storage</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Monthly Upload</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedUsers.map((user) => (
                  <tr key={user._id} className="hover:bg-gray-50">
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap">
                      <div className="text-xs sm:text-sm font-medium text-gray-900">{user.email}</div>
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap">
                      {user.role === 'admin' ? (
                        <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-purple-100 text-purple-800">
                          <Shield className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
                          Admin
                        </span>
                      ) : isSubUser(user) ? (
                        <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-amber-100 text-amber-800">
                          <ShieldAlert className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
                          Sub-user
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-medium bg-blue-100 text-blue-800">
                          <ShieldAlert className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
                          User
                        </span>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                      {user.phone || '-'}
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                      {user.businessName || '-'}
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                      <div className="flex items-center gap-1">
                        <Monitor className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-gray-600" />
                        {user.assignedDevices?.length || 0}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                      <div className="flex items-center gap-1">
                        <HardDrive className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-gray-600" />
                        {formatBytes(user.storageUsed)}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                      <div className="flex items-center gap-1">
                        <Upload className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-gray-600" />
                        {formatBytes(user.currentMonthUpload)} / {user.monthlyUploadLimit} GB
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium">
                      <div className="flex gap-1 sm:gap-2">
                        <Button size="sm" variant="secondary" onClick={() => handleEdit(user)}>
                          <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                        {!isSubUser(user) && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleDeviceAssignment(user)}
                          >
                            <Monitor className="w-3 h-3 sm:w-4 sm:h-4" />
                          </Button>
                        )}
                        {user.role !== 'admin' && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleDelete(user._id)}
                          >
                            <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                          </Button>
                        )}
                      </div>
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
