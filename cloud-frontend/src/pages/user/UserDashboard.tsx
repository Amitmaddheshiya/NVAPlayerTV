import { useEffect, useState } from 'react';
import { userAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Wifi, HardDrive, Upload, Monitor, TrendingUp } from 'lucide-react';
import { subscribeToDeviceUpdates } from '../../services/socket';

export const UserDashboard = () => {
  const [stats, setStats] = useState({
    totalDevices: 0,
    onlineDevices: 0,
    offlineDevices: 0,
    storageUsed: 0,
    storageLimit: 0,
    currentMonthUpload: 0,
    monthlyLimit: 0,
    uploadOpsUsed: 0,
    uploadOpsLimit: 0,
    assignOpsUsed: 0,
    assignOpsLimit: 0,
    deviceLimit: 0,
    fileSizeLimitMB: 500,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToDeviceUpdates(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void loadStats();
      }, 5000);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const loadStats = async () => {
    try {
      const userRes = await userAPI.getMe();
      console.log('User Dashboard - User:', userRes.data);

      const currentUser = userRes.data;

      console.log('User Dashboard Stats:', {
        totalDevices: currentUser?.totalDevices,
        onlineDevices: currentUser?.onlineDevices,
        offlineDevices: currentUser?.offlineDevices,
        storageUsed: currentUser?.storageUsed,
        currentMonthUpload: currentUser?.currentMonthUpload,
      });

      const usage = currentUser?.usage;
      setStats({
        totalDevices: currentUser?.totalDevices || 0,
        onlineDevices: currentUser?.onlineDevices || 0,
        offlineDevices: currentUser?.offlineDevices || 0,
        storageUsed: usage?.storage?.usedBytes ?? currentUser?.storageUsed ?? 0,
        storageLimit: usage?.storage?.limitBytes ?? ((currentUser?.monthlyUploadLimit || 10) * 1024 * 1024 * 1024),
        currentMonthUpload: usage?.monthlyUpload?.usedBytes ?? currentUser?.currentMonthUpload ?? 0,
        monthlyLimit: usage?.monthlyUpload?.limitGB ?? currentUser?.monthlyUploadLimit ?? 10,
        uploadOpsUsed: usage?.uploadOps?.used ?? 0,
        uploadOpsLimit: usage?.uploadOps?.limit ?? 10,
        assignOpsUsed: usage?.assignOps?.used ?? 0,
        assignOpsLimit: usage?.assignOps?.limit ?? 15,
        deviceLimit: usage?.devices?.limit ?? 4,
        fileSizeLimitMB: usage?.fileSizeLimitMB ?? 500,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
      // Set default values on error
      setStats({
        totalDevices: 0,
        onlineDevices: 0,
        offlineDevices: 0,
        storageUsed: 0,
        storageLimit: 1 * 1024 * 1024 * 1024,
        currentMonthUpload: 0,
        monthlyLimit: 10,
        uploadOpsUsed: 0,
        uploadOpsLimit: 10,
        assignOpsUsed: 0,
        assignOpsLimit: 15,
        deviceLimit: 4,
        fileSizeLimitMB: 500,
      });
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const storagePercentage = stats.storageLimit > 0 ? (stats.storageUsed / stats.storageLimit) * 100 : 0;
  const uploadPercentage = stats.monthlyLimit > 0 ? (stats.currentMonthUpload / (stats.monthlyLimit * 1024 * 1024 * 1024)) * 100 : 0;

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="p-2 sm:p-4 md:p-6 max-w-[95vw] sm:max-w-[1200px] mx-auto overflow-x-hidden">
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-3 sm:mb-4 md:mb-6">User Dashboard</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4 mb-3 sm:mb-4 md:mb-6">
          <Card>
            <CardContent className="p-2 sm:p-3 md:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
                <Monitor className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 lg:w-8 lg:h-8 text-blue-600" />
                <div>
                  <p className="text-[10px] sm:text-xs md:text-sm text-gray-600">Total Devices</p>
                  <p className="text-sm sm:text-base md:text-xl lg:text-2xl font-bold">{stats.totalDevices}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-2 sm:p-3 md:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
                <Wifi className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 lg:w-8 lg:h-8 text-green-600" />
                <div>
                  <p className="text-[10px] sm:text-xs md:text-sm text-gray-600">Online</p>
                  <p className="text-sm sm:text-base md:text-xl lg:text-2xl font-bold">{stats.onlineDevices}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-2 sm:p-3 md:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
                <HardDrive className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 lg:w-8 lg:h-8 text-purple-600" />
                <div>
                  <p className="text-[10px] sm:text-xs md:text-sm text-gray-600">Storage Used</p>
                  <p className="text-sm sm:text-base md:text-xl lg:text-2xl font-bold">{formatBytes(stats.storageUsed)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-2 sm:p-3 md:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
                <Upload className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 lg:w-8 lg:h-8 text-orange-600" />
                <div>
                  <p className="text-[10px] sm:text-xs md:text-sm text-gray-600">This Month</p>
                  <p className="text-sm sm:text-base md:text-xl lg:text-2xl font-bold">{formatBytes(stats.currentMonthUpload)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Storage & Upload Progress */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3 md:gap-4 mb-3 sm:mb-4 md:mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[10px] sm:text-xs md:text-sm">
                <HardDrive className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                Storage Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 sm:space-y-3">
                <div className="flex justify-between text-[10px] sm:text-xs md:text-sm">
                  <span className="text-gray-600">Used</span>
                  <span className="font-medium">{formatBytes(stats.storageUsed)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 sm:h-3 md:h-4">
                  <div
                    className="bg-purple-600 h-2 sm:h-3 md:h-4 rounded-full transition-all"
                    style={{ width: `${Math.min(storagePercentage, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] sm:text-xs md:text-sm">
                  <span className="text-gray-600">Limit</span>
                  <span className="font-medium">{(stats.storageLimit / (1024 * 1024 * 1024)).toFixed(1)} GB</span>
                </div>
                <div className="text-[10px] sm:text-xs md:text-sm text-gray-500">
                  {storagePercentage.toFixed(1)}% of storage quota
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[10px] sm:text-xs md:text-sm">
                <Upload className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                Monthly Upload
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 sm:space-y-3">
                <div className="flex justify-between text-[10px] sm:text-xs md:text-sm">
                  <span className="text-gray-600">Uploaded</span>
                  <span className="font-medium">{formatBytes(stats.currentMonthUpload)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 sm:h-3 md:h-4">
                  <div
                    className="bg-orange-600 h-2 sm:h-3 md:h-4 rounded-full transition-all"
                    style={{ width: `${Math.min(uploadPercentage, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] sm:text-xs md:text-sm">
                  <span className="text-gray-600">Remaining</span>
                  <span className="font-medium">
                    {formatBytes(stats.monthlyLimit * 1024 * 1024 * 1024 - stats.currentMonthUpload)}
                  </span>
                </div>
                <div className="text-[10px] sm:text-xs md:text-sm text-gray-500">
                  {uploadPercentage.toFixed(1)}% of monthly quota
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Your Plan Limits */}
        <Card className="mb-3 sm:mb-4 md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[10px] sm:text-xs md:text-sm">
              <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" />
              Your Plan &amp; Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
              <div className="p-2 sm:p-3 bg-gray-50 rounded-lg">
                <div className="text-[10px] sm:text-xs text-gray-600">Storage</div>
                <div className="text-sm sm:text-base font-bold">{formatBytes(stats.storageUsed)} / {(stats.storageLimit / (1024*1024*1024)).toFixed(1)} GB</div>
              </div>
              <div className="p-2 sm:p-3 bg-gray-50 rounded-lg">
                <div className="text-[10px] sm:text-xs text-gray-600">Uploads this month</div>
                <div className="text-sm sm:text-base font-bold">{stats.uploadOpsUsed} / {stats.uploadOpsLimit}</div>
              </div>
              <div className="p-2 sm:p-3 bg-gray-50 rounded-lg">
                <div className="text-[10px] sm:text-xs text-gray-600">Assignments this month</div>
                <div className="text-sm sm:text-base font-bold">{stats.assignOpsUsed} / {stats.assignOpsLimit}</div>
              </div>
              <div className="p-2 sm:p-3 bg-gray-50 rounded-lg">
                <div className="text-[10px] sm:text-xs text-gray-600">TVs</div>
                <div className="text-sm sm:text-base font-bold">{stats.totalDevices} / {stats.deviceLimit}</div>
              </div>
              <div className="p-2 sm:p-3 bg-gray-50 rounded-lg">
                <div className="text-[10px] sm:text-xs text-gray-600">Max file size</div>
                <div className="text-sm sm:text-base font-bold">{stats.fileSizeLimitMB} MB</div>
              </div>
              <div className="p-2 sm:p-3 bg-gray-50 rounded-lg">
                <div className="text-[10px] sm:text-xs text-gray-600">Monthly upload data</div>
                <div className="text-sm sm:text-base font-bold">{formatBytes(stats.currentMonthUpload)} / {stats.monthlyLimit} GB</div>
              </div>
            </div>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-2 sm:mt-3">
              Monthly counters reset on the 1st of each month. Need more? Contact support to upgrade your plan.
            </p>
          </CardContent>
        </Card>

        {/* Device Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[10px] sm:text-xs md:text-sm">
              <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" />
              Device Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              <div className="p-2 sm:p-3 md:p-4 bg-green-50 rounded-lg">
                <div className="text-[10px] sm:text-xs md:text-sm text-green-800 font-medium">Online Devices</div>
                <div className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-green-600">{stats.onlineDevices}</div>
              </div>
              <div className="p-2 sm:p-3 md:p-4 bg-red-50 rounded-lg">
                <div className="text-[10px] sm:text-xs md:text-sm text-red-800 font-medium">Offline Devices</div>
                <div className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-red-600">{stats.offlineDevices}</div>
              </div>
              <div className="p-2 sm:p-3 md:p-4 bg-blue-50 rounded-lg">
                <div className="text-[10px] sm:text-xs md:text-sm text-blue-800 font-medium">Total Assigned</div>
                <div className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-blue-600">{stats.totalDevices}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };
