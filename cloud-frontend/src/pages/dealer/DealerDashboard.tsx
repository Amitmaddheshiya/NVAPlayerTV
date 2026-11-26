import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dealerAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Users, Monitor, Wifi, HardDrive, Upload, TrendingUp } from 'lucide-react';
import { subscribeToDeviceUpdates } from '../../services/socket';
import { SkeletonStats, SkeletonCard } from '../../components/ui/Skeleton';

export const DealerDashboard = () => {
  const queryClient = useQueryClient();

  const statsQuery = useQuery({
    queryKey: ['dealer-dashboard'],
    queryFn: async () => (await dealerAPI.getDashboard()).data,
  });

  const data = statsQuery.data;
  const stats = {
    totalUsers: data?.users?.total || 0,
    totalDevices: data?.devices?.total || 0,
    onlineDevices: data?.devices?.online || 0,
    offlineDevices: data?.devices?.offline || 0,
    totalStorage: data?.media?.bytesUsed || 0,
    recentUploads: data?.recentUploads || [],
  };
  const loading = statsQuery.isLoading;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToDeviceUpdates(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey: ['dealer-dashboard'] });
      }, 5000);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [queryClient]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="p-1 sm:p-1.5 md:p-2 w-full">
        <SkeletonStats count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div className="p-1 sm:p-1.5 md:p-2 w-full">
      <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 mb-1">Dealer Dashboard</h1>
      <p className="text-xs sm:text-sm text-gray-500 mb-2 sm:mb-3">
        {data?.dealer?.businessName || 'Your account'} — covers your customer accounts only.
        {data?.dealer?.deviceLimit ? ` Device limit: ${stats.totalDevices}/${data.dealer.deviceLimit}.` : ''}
        {data?.dealer?.userLimit ? ` Customer limit: ${data.users?.customers || 0}/${data.dealer.userLimit}.` : ''}
      </p>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-4">
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

      {/* Plan Limits */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 sm:mb-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
              Device Limit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center text-xs sm:text-sm mb-2">
              <span className="text-gray-600">Used</span>
              <span className="font-bold">
                {stats.totalDevices} / {data?.dealer?.deviceLimit ? data.dealer.deviceLimit : '∞'}
              </span>
            </div>
            {data?.dealer?.deviceLimit ? (
              <>
                <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
                  <div
                    className={`h-1.5 sm:h-2 rounded-full ${stats.totalDevices >= data.dealer.deviceLimit ? 'bg-red-600' : 'bg-blue-600'}`}
                    style={{ width: `${Math.min(100, (stats.totalDevices / data.dealer.deviceLimit) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
                  {stats.totalDevices >= data.dealer.deviceLimit
                    ? 'Device limit reached — remove a device or contact your administrator.'
                    : `${data.dealer.deviceLimit - stats.totalDevices} device(s) remaining`}
                </p>
              </>
            ) : (
              <p className="text-[10px] sm:text-xs text-gray-500">Unlimited devices</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Users className="w-4 h-4 sm:w-5 sm:h-5" />
              Customer Limit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center text-xs sm:text-sm mb-2">
              <span className="text-gray-600">Used</span>
              <span className="font-bold">
                {data?.users?.customers || 0} / {data?.dealer?.userLimit ? data.dealer.userLimit : '∞'}
              </span>
            </div>
            {data?.dealer?.userLimit ? (
              <>
                <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
                  <div
                    className={`h-1.5 sm:h-2 rounded-full ${((data?.users?.customers || 0) >= data.dealer.userLimit) ? 'bg-red-600' : 'bg-blue-600'}`}
                    style={{ width: `${Math.min(100, ((data?.users?.customers || 0) / data.dealer.userLimit) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
                  {(data?.users?.customers || 0) >= data.dealer.userLimit
                    ? 'Customer limit reached — remove a customer or contact your administrator.'
                    : `${data.dealer.userLimit - (data?.users?.customers || 0)} customer(s) remaining`}
                </p>
              </>
            ) : (
              <p className="text-[10px] sm:text-xs text-gray-500">Unlimited customers</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3 sm:mb-4">
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
                  style={{ width: `${stats.totalDevices ? (stats.onlineDevices / stats.totalDevices) * 100 : 0}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-xs sm:text-sm">
                <span className="text-gray-600">Offline</span>
                <span className="font-bold text-red-600">{stats.offlineDevices}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
                <div
                  className="bg-red-600 h-1.5 sm:h-2 rounded-full"
                  style={{ width: `${stats.totalDevices ? (stats.offlineDevices / stats.totalDevices) * 100 : 0}%` }}
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
                {stats.recentUploads.map((media: any) => (
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
