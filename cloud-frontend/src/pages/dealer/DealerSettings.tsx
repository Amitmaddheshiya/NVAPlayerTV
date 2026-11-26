import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dealerAPI, brandingAPI, userAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { invalidateBrandingCache } from '../../components/BrandLogo';
import { Upload, Trash2 } from 'lucide-react';

export const DealerSettings = () => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const { data: me } = useQuery({
    queryKey: ['dealer-me'],
    queryFn: async () => (await userAPI.getMe()).data,
  });

  const { data: branding } = useQuery({
    queryKey: ['dealer-branding'],
    queryFn: async () => (await brandingAPI.getBranding()).data,
  });

  useEffect(() => {
    if (me) {
      setBusinessName(me.businessName || '');
      setPhone(me.phone || '');
      setCity(me.city || '');
    }
  }, [me]);

  const handleSaveProfile = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await dealerAPI.updateProfile({ businessName, phone, city });
      setMessage('Profile updated');
      queryClient.invalidateQueries({ queryKey: ['dealer-me'] });
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setError('');
    try {
      await brandingAPI.uploadDealerLogo(file);
      invalidateBrandingCache();
      queryClient.invalidateQueries({ queryKey: ['dealer-branding'] });
      setMessage('Logo updated');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Logo upload failed');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLogoDelete = async () => {
    setUploadingLogo(true);
    setError('');
    try {
      await brandingAPI.deleteDealerLogo();
      invalidateBrandingCache();
      queryClient.invalidateQueries({ queryKey: ['dealer-branding'] });
      setMessage('Logo removed — global logo will be used');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to remove logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  const dealerLogo = me?.logoUrl || null;
  const resolvedLogo = branding?.logoUrl || null;

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {message && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">{message}</div>}
      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      <Card className="mb-6">
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button onClick={handleSaveProfile} disabled={saving}>
            {saving ? 'Saving...' : 'Save Profile'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dealer Logo</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4">
            This logo appears on your CMS and on the CMS of all your customer accounts.
            If you don't set one, the global logo is used.
          </p>
          {dealerLogo && (
            <div className="mb-4 p-3 border border-gray-200 rounded-lg inline-block">
              <img src={`${API_URL}/branding/${dealerLogo}`} alt="Dealer logo" className="h-16 object-contain" />
            </div>
          )}
          {!dealerLogo && resolvedLogo && (
            <p className="text-sm text-gray-500 mb-4">
              No dealer logo set — customers currently see the global logo.
            </p>
          )}
          <div className="flex items-center gap-3">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={uploadingLogo}>
              <Upload className="w-4 h-4 mr-2" />
              {uploadingLogo ? 'Uploading...' : dealerLogo ? 'Replace Logo' : 'Upload Logo'}
            </Button>
            {dealerLogo && (
              <Button variant="danger" onClick={handleLogoDelete} disabled={uploadingLogo}>
                <Trash2 className="w-4 h-4 mr-2" /> Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-3">PNG, JPG, WEBP, GIF, SVG or ICO — max 2 MB.</p>
        </CardContent>
      </Card>
    </div>
  );
};
