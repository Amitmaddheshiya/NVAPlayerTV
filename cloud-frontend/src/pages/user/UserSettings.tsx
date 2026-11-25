import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { User, Mail, Phone, Building, Lock, Save, Shield, Clock, HardDrive } from 'lucide-react';
import { userAPI } from '../../services/api';

export const UserSettings = () => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || '{}'));
  const [formData, setFormData] = useState({
    email: user.email || '',
    phone: user.phone || '',
    businessName: user.businessName || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [saving, setSaving] = useState(false);
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
  });

  // localStorage 'user' (set at login) does not contain assignedDevices,
  // so fetch the fresh profile which includes device counts.
  const meQuery = useQuery({
    queryKey: ['user-me-settings'],
    queryFn: async () => {
      const res = await userAPI.getMe();
      return res.data;
    },
  });

  useEffect(() => {
    if (meQuery.data) {
      const fresh = meQuery.data;
      setUser((prev: any) => ({ ...prev, ...fresh }));
      localStorage.setItem('user', JSON.stringify({ ...JSON.parse(localStorage.getItem('user') || '{}'), ...fresh }));
    }
  }, [meQuery.data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await userAPI.updateProfile({
        phone: formData.phone,
        businessName: formData.businessName,
      });

      // Update localStorage with new user data
      localStorage.setItem('user', JSON.stringify(response.data));
      setUser(response.data);
      queryClient.invalidateQueries({ queryKey: ['user-me-settings'] });
      queryClient.invalidateQueries({ queryKey: ['user-dashboard-stats'] });

      setAlertState({
        isOpen: true,
        title: 'Success',
        message: 'Settings saved successfully',
        type: 'success',
      });
    } catch (error) {
      setAlertState({
        isOpen: true,
        title: 'Save Failed',
        message: 'Failed to save settings. Please try again.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (formData.newPassword !== formData.confirmPassword) {
      setAlertState({
        isOpen: true,
        title: 'Password Mismatch',
        message: 'Passwords do not match',
        type: 'error',
      });
      return;
    }

    if (formData.newPassword.length < 6) {
      setAlertState({
        isOpen: true,
        title: 'Invalid Password',
        message: 'Password must be at least 6 characters',
        type: 'error',
      });
      return;
    }

    setSaving(true);
    try {
      await userAPI.changePassword(formData.currentPassword, formData.newPassword);
      setAlertState({
        isOpen: true,
        title: 'Success',
        message: 'Password changed successfully',
        type: 'success',
      });
      setFormData({
        ...formData,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error: any) {
      setAlertState({
        isOpen: true,
        title: 'Change Failed',
        message: error.response?.data?.error || 'Failed to change password. Please try again.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="p-2 sm:p-4 md:p-6 max-w-[95vw] sm:max-w-[1200px] mx-auto overflow-x-hidden">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-3 sm:mb-4 md:mb-6">Settings</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-4 md:gap-6">
          {/* Left Column - Forms */}
          <div className="lg:col-span-2 space-y-2 sm:space-y-4 md:space-y-6">
            {/* Profile Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                  <User className="w-4 h-4 sm:w-5 sm:h-5" />
                  Profile Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 sm:space-y-3">
                <div>
                  <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    value={formData.email}
                    disabled
                    className="bg-gray-100 text-[10px] sm:text-xs"
                  />
                  <p className="text-[9px] sm:text-[10px] text-gray-500 mt-0.5">Email cannot be changed</p>
                </div>

                <div>
                  <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <Input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+91 1234567890"
                    className="text-[10px] sm:text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">
                    Business Name
                  </label>
                  <Input
                    type="text"
                    value={formData.businessName}
                    onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    placeholder="Your Business Name"
                    className="text-[10px] sm:text-xs"
                  />
                </div>

                <div className="pt-2 sm:pt-3 flex justify-end">
                  <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-[10px] sm:text-xs">
                    <Save className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Change Password */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                  <Lock className="w-4 h-4 sm:w-5 sm:h-5" />
                  Change Password
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 sm:space-y-3">
                <div>
                  <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">
                    Current Password
                  </label>
                  <Input
                    type="password"
                    value={formData.currentPassword}
                    onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                    placeholder="Enter current password"
                    className="text-[10px] sm:text-xs"
                    showPasswordToggle
                  />
                </div>

                <div>
                  <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <Input
                    type="password"
                    value={formData.newPassword}
                    onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                    placeholder="Enter new password (min 6 characters)"
                    className="text-[10px] sm:text-xs"
                    showPasswordToggle
                  />
                </div>

                <div>
                  <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">
                    Confirm New Password
                  </label>
                  <Input
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    placeholder="Confirm new password"
                    className="text-[10px] sm:text-xs"
                    showPasswordToggle
                  />
                </div>

                <div className="pt-2 sm:pt-3 flex justify-end">
                  <Button onClick={handlePasswordChange} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-[10px] sm:text-xs">
                    <Lock className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                    {saving ? 'Changing...' : 'Change Password'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Account Info */}
          <div className="space-y-2 sm:space-y-4 md:space-y-6">
            {/* Account Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[10px] sm:text-xs md:text-sm">
                  <Shield className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                  Account Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 sm:space-y-3">
                <div className="p-2 sm:p-3 md:p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
                    <User className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 lg:w-8 lg:h-8 text-blue-600" />
                    <div>
                      <div className="text-[10px] sm:text-xs md:text-sm text-blue-800">Account Type</div>
                      <div className="font-bold text-blue-600 capitalize text-[10px] sm:text-xs md:text-sm lg:text-base">{user.role}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 sm:space-y-2">
                  <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 text-[10px] sm:text-xs md:text-sm">
                    <Mail className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 text-gray-600" />
                    <span className="text-gray-600">Email:</span>
                    <span className="font-medium truncate">{user.email}</span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 text-[10px] sm:text-xs md:text-sm">
                    <Phone className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 text-gray-600" />
                    <span className="text-gray-600">Phone:</span>
                    <span className="font-medium">{user.phone || 'Not set'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 text-[10px] sm:text-xs md:text-sm">
                    <Building className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 text-gray-600" />
                    <span className="text-gray-600">Business:</span>
                    <span className="font-medium truncate">{user.businessName || 'Not set'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Device Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[10px] sm:text-xs md:text-sm">
                  <HardDrive className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                  Device Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-2 sm:p-3 md:p-4 bg-green-50 rounded-lg">
                  <div className="text-[10px] sm:text-xs md:text-sm text-green-800">Assigned Devices</div>
                  <div className="text-lg sm:text-xl md:text-2xl font-bold text-green-600">{user.totalDevices ?? user.assignedDevices?.length ?? 0}</div>
                </div>
                <p className="text-[10px] sm:text-xs md:text-sm text-gray-500 mt-1.5 sm:mt-2 md:mt-3">
                  Contact your administrator to manage device assignments.
                </p>
              </CardContent>
            </Card>

            {/* Account Security */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[10px] sm:text-xs md:text-sm">
                  <Clock className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                  Account Security
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 sm:space-y-2 text-[10px] sm:text-xs md:text-sm">
                  <div className="flex items-center justify-between p-1.5 sm:p-2 md:p-3 bg-gray-50 rounded">
                    <span className="text-gray-600">Two-Factor Authentication</span>
                    <span className="text-orange-600 font-medium">Not Enabled</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 sm:p-2 md:p-3 bg-gray-50 rounded">
                    <span className="text-gray-600">Last Password Change</span>
                    <span className="text-gray-900 font-medium">Never</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 sm:p-2 md:p-3 bg-gray-50 rounded">
                    <span className="text-gray-600">Account Created</span>
                    <span className="text-gray-900 font-medium">Recently</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Alert
        isOpen={alertState.isOpen}
        onClose={() => setAlertState({ ...alertState, isOpen: false })}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />
    </>
  );
};
