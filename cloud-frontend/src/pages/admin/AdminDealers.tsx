import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { userAPI, brandingAPI } from '../../services/api';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Store, Plus, Pencil, Trash2, Search, Image as ImageIcon, Monitor, Users } from 'lucide-react';

interface DealerForm {
  email: string;
  password: string;
  businessName: string;
  phone: string;
  city: string;
  deviceLimit: string;
  userLimit: string;
}

const emptyForm: DealerForm = { email: '', password: '', businessName: '', phone: '', city: '', deviceLimit: '0', userLimit: '0' };

export const AdminDealers = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<DealerForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-dealers', search, page],
    queryFn: async () => (await userAPI.getUsers({ role: 'dealer', search: search || undefined, page, limit: 20 })).data,
  });

  const dealers = data?.data || [];
  const totalPages = data?.totalPages || 1;
  const loadDealers = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-dealers'] });
    queryClient.invalidateQueries({ queryKey: ['admin-users'] });
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setLogoFile(null);
    setError('');
    setShowForm(true);
  };

  const openEdit = (dealer: any) => {
    setEditing(dealer);
    setForm({
      email: dealer.email || '',
      password: '',
      businessName: dealer.businessName || '',
      phone: dealer.phone || '',
      city: dealer.city || '',
      deviceLimit: String(dealer.deviceLimit ?? 0),
      userLimit: String(dealer.userLimit ?? 0),
    });
    setLogoFile(null);
    setError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload: any = {
        email: form.email,
        businessName: form.businessName,
        phone: form.phone,
        city: form.city,
        deviceLimit: parseInt(form.deviceLimit, 10) || 0,
        userLimit: parseInt(form.userLimit, 10) || 0,
      };
      if (form.password) payload.password = form.password;

      let dealerId = editing?._id;
      if (editing) {
        await userAPI.updateUser(editing._id, payload);
      } else {
        payload.role = 'dealer';
        payload.password = form.password;
        const res = await userAPI.createUser(payload);
        dealerId = res.data?.id || res.data?._id;
      }

      // Logo upload is a separate endpoint (multipart).
      if (logoFile && dealerId) {
        await brandingAPI.uploadUserLogo(String(dealerId), logoFile);
      }

      setShowForm(false);
      loadDealers();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save dealer');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLogo = async () => {
    if (!editing?._id) return;
    try {
      await brandingAPI.deleteUserLogo(String(editing._id));
      loadDealers();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to remove logo');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await userAPI.deleteUser(deleteTarget._id);
      loadDealers();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to delete dealer');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Store className="w-6 h-6" /> Dealers
          </h1>
          <p className="text-gray-600 mt-1">Dealer (sub-admin) accounts with device & customer limits.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Add Dealer
        </Button>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search dealers..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {isLoading ? (
        <div className="text-gray-500">Loading dealers...</div>
      ) : dealers.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-gray-500">No dealers yet. Create your first dealer account.</CardContent></Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">Dealer</th>
                  <th className="text-left px-5 py-3 font-medium">Contact</th>
                  <th className="text-left px-5 py-3 font-medium">Device Limit</th>
                  <th className="text-left px-5 py-3 font-medium">Customer Limit</th>
                  <th className="text-left px-5 py-3 font-medium">Logo</th>
                  <th className="text-right px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {dealers.map((d: any) => (
                  <tr key={d._id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Store className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-900">{d.businessName || d.email}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{d.email}{d.phone ? ` · ${d.phone}` : ''}{d.city ? ` · ${d.city}` : ''}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1 text-gray-700">
                        <Monitor className="w-4 h-4" /> {d.deviceLimit > 0 ? d.deviceLimit : 'Unlimited'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1 text-gray-700">
                        <Users className="w-4 h-4" /> {d.userLimit > 0 ? d.userLimit : 'Unlimited'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {d.logoUrl ? (
                        <img src={`/api/branding/${d.logoUrl}`} alt="logo" className="h-8 w-auto" />
                      ) : (
                        <span className="text-xs text-gray-400">None</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(d)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setDeleteTarget(d)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
          <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editing ? 'Edit Dealer' : 'Add Dealer'}
            </h3>
            <div className="space-y-3">
              <Input label="Business Name" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
              <Input label="Email *" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input
                label={editing ? 'Password (leave blank to keep)' : 'Password *'}
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                showPasswordToggle
              />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <Input label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Device Limit (0 = unlimited)"
                  type="number"
                  min={0}
                  value={form.deviceLimit}
                  onChange={(e) => setForm({ ...form, deviceLimit: e.target.value })}
                />
                <Input
                  label="Customer Limit (0 = unlimited)"
                  type="number"
                  min={0}
                  value={form.userLimit}
                  onChange={(e) => setForm({ ...form, userLimit: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dealer Logo</label>
                <div className="flex items-center gap-3">
                  {editing?.logoUrl && (
                    <img src={`/api/branding/${editing.logoUrl}`} alt="dealer logo" className="h-10 w-auto border rounded" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                    className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:text-sm file:font-medium hover:file:bg-blue-100"
                  />
                </div>
                {editing?.logoUrl && (
                  <button type="button" onClick={handleDeleteLogo} className="mt-1 text-xs text-red-600 hover:underline">
                    Remove current logo
                  </button>
                )}
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" /> Shown in the dealer CMS instead of the default logo.
                </p>
              </div>
            </div>
            {error && <div className="mt-3 p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.email || (!editing && !form.password)}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Dealer"
        message={`Delete dealer "${deleteTarget?.businessName || deleteTarget?.email}"? This removes the dealer account and all customer accounts, unassigns their devices, and deletes their media.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default AdminDealers;
