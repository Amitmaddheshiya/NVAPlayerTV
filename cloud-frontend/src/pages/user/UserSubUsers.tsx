import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { deviceAPI, groupAPI, userAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Plus, Edit, Trash2, Users, ShieldCheck } from 'lucide-react';
import { SkeletonTable } from '../../components/ui/Skeleton';

const PERMISSION_OPTIONS = [
  { key: 'devices', label: 'Devices', description: 'View and manage devices & configuration' },
  { key: 'groups', label: 'Groups', description: 'Create and configure groups' },
  { key: 'library', label: 'Library', description: 'Upload and manage media files' },
  { key: 'settings', label: 'Settings', description: 'Update profile & password' },
];

const defaultPermissions = () => ({ devices: true, groups: true, library: true, settings: true });

export const UserSubUsers = () => {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [alertState, setAlertState] = useState<{
    isOpen: boolean; title: string; message: string; type: 'success' | 'error' | 'warning' | 'info';
    showConfirm?: boolean; onConfirm?: () => void;
  }>({ isOpen: false, title: '', message: '', type: 'info' });

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [permissions, setPermissions] = useState<Record<string, boolean>>(defaultPermissions());
  const [resourceAccess, setResourceAccess] = useState({ devices: [] as string[], groups: [] as string[] });

  const subUsersQuery = useQuery({
    queryKey: ['user-subusers'],
    queryFn: async () => {
      const res = await userAPI.getSubUsers();
      return res.data;
    },
  });

  const resourceOptionsQuery = useQuery({
    queryKey: ['user-subusers-options'],
    queryFn: async () => {
      const [deviceResponse, groupResponse] = await Promise.all([
        deviceAPI.getDevices({ page: 1, limit: 1000 }),
        groupAPI.getGroups({ page: 1, limit: 1000 }),
      ]);
      return {
        devices: deviceResponse.data.data || deviceResponse.data || [],
        groups: groupResponse.data.data || groupResponse.data || [],
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const subUsers = subUsersQuery.data?.data || [];
  const limit = subUsersQuery.data?.limit || 0;
  const loading = subUsersQuery.isLoading;
  const availableDevices = resourceOptionsQuery.data?.devices || [];
  const availableGroups = resourceOptionsQuery.data?.groups || [];
  const loadSubUsers = () => queryClient.invalidateQueries({ queryKey: ['user-subusers'] });

  const openCreate = () => {
    setEditing(null);
    setFormData({ email: '', password: '' });
    setPermissions(defaultPermissions());
    setResourceAccess({ devices: [], groups: [] });
    setShowForm(true);
  };

  const openEdit = (sub: any) => {
    setEditing(sub);
    setFormData({ email: sub.email, password: '' });
    setPermissions({ ...defaultPermissions(), ...(sub.permissions || {}) });
    setResourceAccess({
      devices: Array.isArray(sub.resourceAccess?.devices) ? sub.resourceAccess.devices.map(String) : [],
      groups: Array.isArray(sub.resourceAccess?.groups) ? sub.resourceAccess.groups.map(String) : [],
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await userAPI.updateSubUser(editing._id, {
          email: formData.email,
          ...(formData.password ? { password: formData.password } : {}),
          permissions,
          resourceAccess,
        });
      } else {
        await userAPI.createSubUser({ email: formData.email, password: formData.password, permissions, resourceAccess });
      }
      setShowForm(false);
      setEditing(null);
      loadSubUsers();
      setAlertState({ isOpen: true, title: 'Success', message: editing ? 'Sub-user updated' : 'Sub-user created', type: 'success' });
    } catch (error: any) {
      setAlertState({
        isOpen: true, title: 'Save Failed',
        message: error?.response?.data?.error || 'Failed to save sub-user',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleResource = (kind: 'devices' | 'groups', id: string, checked: boolean) => {
    setResourceAccess((current) => ({
      ...current,
      [kind]: checked ? [...new Set([...current[kind], id])] : current[kind].filter((item) => item !== id),
    }));
  };

  const handleDelete = (sub: any) => {
    setAlertState({
      isOpen: true, title: 'Delete Sub-user',
      message: `Delete sub-user ${sub.email}? They will immediately lose access.`,
      type: 'warning', showConfirm: true,
      onConfirm: async () => {
        try {
          await userAPI.deleteSubUser(sub._id);
          loadSubUsers();
          setAlertState({ isOpen: true, title: 'Success', message: 'Sub-user deleted', type: 'success' });
        } catch {
          setAlertState({ isOpen: true, title: 'Delete Failed', message: 'Failed to delete sub-user', type: 'error' });
        }
      },
    });
  };

  const permissionSummary = (perms: any) =>
    PERMISSION_OPTIONS.filter((o) => perms?.[o.key] !== false).map((o) => o.label).join(', ') || 'No access';

  if (loading) return (
    <div className="p-1 sm:p-1.5 md:p-2 w-full">
      <SkeletonTable rows={6} cols={5} />
    </div>
  );

  const atLimit = limit <= 0 || subUsers.length >= limit;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6" /> Sub-users
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {subUsers.length} of {limit} sub-user{limit === 1 ? '' : 's'} used. Sub-users manage your devices with the permissions you grant.
          </p>
        </div>
        <Button onClick={openCreate} disabled={atLimit} className="text-sm">
          <Plus className="w-4 h-4 mr-1" /> Add Sub-user
        </Button>
      </div>

      {limit <= 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-sm text-amber-800">
            Your account does not have sub-users enabled. Contact the admin to set a sub-user limit for your account.
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-sm">{editing ? 'Edit Sub-user' : 'New Sub-user'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
                <Input
                  label={editing ? 'New Password (leave blank to keep)' : 'Password'}
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required={!editing}
                  showPasswordToggle
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Page Access</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PERMISSION_OPTIONS.map((opt) => (
                    <label key={opt.key} className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={permissions[opt.key] !== false}
                        onChange={(e) => setPermissions({ ...permissions, [opt.key]: e.target.checked })}
                        className="mt-0.5 rounded border-gray-300"
                      />
                      <span>
                        <span className="block text-sm font-medium text-gray-900">{opt.label}</span>
                        <span className="block text-xs text-gray-500">{opt.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Hidden pages are completely inaccessible — UI and API both blocked.
                </p>
              </div>

              {permissions.devices !== false && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Allowed Devices</label>
                  <p className="mb-2 text-xs text-gray-500">Select the devices this sub-user can view and manage.</p>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
                    {availableDevices.length ? availableDevices.map((device) => (
                      <label key={device.deviceId} className="flex items-center gap-2 rounded p-2 hover:bg-gray-50">
                        <input type="checkbox" checked={resourceAccess.devices.includes(String(device.deviceId))}
                          onChange={(e) => toggleResource('devices', String(device.deviceId), e.target.checked)} />
                        <span className="text-sm text-gray-800">{device.name || device.deviceId} <span className="text-xs text-gray-500">({device.deviceId})</span></span>
                      </label>
                    )) : <p className="p-2 text-xs text-gray-500">No devices are assigned to your account.</p>}
                  </div>
                </div>
              )}

              {permissions.groups !== false && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Allowed Groups</label>
                  <p className="mb-2 text-xs text-gray-500">Select the groups this sub-user can view and manage.</p>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
                    {availableGroups.length ? availableGroups.map((group) => (
                      <label key={group._id} className="flex items-center gap-2 rounded p-2 hover:bg-gray-50">
                        <input type="checkbox" checked={resourceAccess.groups.includes(String(group._id))}
                          onChange={(e) => toggleResource('groups', String(group._id), e.target.checked)} />
                        <span className="text-sm text-gray-800">{group.name}</span>
                      </label>
                    )) : <p className="p-2 text-xs text-gray-500">No groups are available.</p>}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Create'}</Button>
                <Button type="button" variant="secondary" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Access</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {subUsers.map((sub) => (
                  <tr key={sub._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{sub.email}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{permissionSummary(sub.permissions)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(sub.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(sub)}><Edit className="w-4 h-4" /></Button>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(sub)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {subUsers.length === 0 && (
            <div className="text-center py-10 text-gray-500 text-sm">No sub-users yet.</div>
          )}
        </CardContent>
      </Card>

      <Alert
        isOpen={alertState.isOpen}
        onClose={() => setAlertState({ ...alertState, isOpen: false })}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        showConfirm={alertState.showConfirm}
        onConfirm={alertState.onConfirm}
      />
    </div>
  );
};

export default UserSubUsers;
