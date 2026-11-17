import { useEffect, useState } from 'react';
import { deviceAPI, userAPI, mediaAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Users, Monitor, Wifi, HardDrive, Upload, TrendingUp } from 'lucide-react';
import { subscribeToDeviceUpdates } from '../../services/socket';

export const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalDevices: 0,
    onlineDevices: 0,
    offlineDevices: 0,
    totalStorage: 0,
    recentUploads: [] as any[],
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
      // Get device stats from dedicated endpoint for accurate counts
      const [deviceStatsRes, usersRes, mediaStatsRes, recentMediaRes] = await Promise.all([
        deviceAPI.getDeviceStats(),
        userAPI.getUsers({ page: 1, limit: 1000 }),
        mediaAPI.getStats(),
        mediaAPI.getMedia({ page: 1, limit: 5 }),
      ]);

      console.log('Admin Dashboard - Device Stats:', deviceStatsRes.data);
      console.log('Admin Dashboard - Users:', usersRes.data);
      console.log('Admin Dashboard - Media:', mediaStatsRes.data);

      // Use actual counts from device stats endpoint
      const totalUsers = usersRes.data.total || 0;
      const totalDevices = deviceStatsRes.data.totalDevices || 0;
      const onlineDevices = deviceStatsRes.data.onlineDevices || 0;
      const offlineDevices = deviceStatsRes.data.offlineDevices || 0;
      const totalMedia = mediaStatsRes.data.totalMedia || 0;
      const totalStorage = mediaStatsRes.data.totalStorage || 0;
      const media = recentMediaRes.data.data || recentMediaRes.data;

      console.log('Stats:', { totalUsers, totalDevices, onlineDevices, offlineDevices, totalMedia, totalStorage });

      setStats({
        totalUsers,
        totalDevices,
        onlineDevices,
        offlineDevices,
        totalStorage,
        recentUploads: media.slice(0, 5),
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
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

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="p-2 sm:p-4 md:p-6 max-w-[95vw] sm:max-w-[1200px] mx-auto overflow-x-hidden">
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-3 sm:mb-4 md:mb-6">Admin Dashboard</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4 lg:gap-6 mb-4 sm:mb-6 md:mb-8">
          <Card>
            <CardContent className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                <Users className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-blue-600" />
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">Total Users</p>
                  <p className="text-lg sm:text-xl md:text-2xl font-bold">{stats.totalUsers}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                <Monitor className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-purple-600" />
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">Total Devices</p>
                  <p className="text-lg sm:text-xl md:text-2xl font-bold">{stats.totalDevices}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                <Wifi className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-green-600" />
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">Online Devices</p>
                  <p className="text-lg sm:text-xl md:text-2xl font-bold">{stats.onlineDevices}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => window.location.href = '/admin/storage'}>
            <Card>
              <CardContent className="p-3 sm:p-4 md:p-6">
                <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                  <HardDrive className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-orange-600" />
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600">Total Storage</p>
                    <p className="text-lg sm:text-xl md:text-2xl font-bold">{formatBytes(stats.totalStorage)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Additional Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-6 mb-4 sm:mb-6 md:mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
                Device Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 sm:space-y-4">
                <div className="flex justify-between items-center text-xs sm:text-sm">
                  <span className="text-gray-600">Online</span>
                  <span className="font-bold text-green-600">{stats.onlineDevices}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
                  <div
                    className="bg-green-600 h-1.5 sm:h-2 rounded-full"
                    style={{ width: `${(stats.onlineDevices / stats.totalDevices) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-xs sm:text-sm">
                  <span className="text-gray-600">Offline</span>
                  <span className="font-bold text-red-600">{stats.offlineDevices}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
                  <div
                    className="bg-red-600 h-1.5 sm:h-2 rounded-full"
                    style={{ width: `${(stats.offlineDevices / stats.totalDevices) * 100}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
                Recent Uploads
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.recentUploads.length === 0 ? (
                <div className="text-center py-3 sm:py-4 text-gray-500 text-xs sm:text-sm">No recent uploads</div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {stats.recentUploads.map((media) => (
                    <div key={media._id} className="flex items-center justify-between text-xs sm:text-sm">
                      <div className="truncate flex-1">{media.originalName}</div>
                      <div className="text-gray-500 ml-2">{formatBytes(media.size)}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm sm:text-base">System Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="p-3 sm:p-4 bg-green-50 rounded-lg">
                <div className="text-xs sm:text-sm text-green-800 font-medium">API Status</div>
                <div className="text-green-600 text-[10px] sm:text-sm">Operational</div>
              </div>
              <div className="p-3 sm:p-4 bg-green-50 rounded-lg">
                <div className="text-xs sm:text-sm text-green-800 font-medium">Database</div>
        <div className="text-green-600 text-[10px] sm:text-sm">Live API data loaded</div>
              </div>
              <div className="p-3 sm:p-4 bg-green-50 rounded-lg">
                <div className="text-xs sm:text-sm text-green-800 font-medium">Storage</div>
                <div className="text-green-600 text-[10px] sm:text-sm">{formatBytes(stats.totalStorage)} Used</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
  );
};
