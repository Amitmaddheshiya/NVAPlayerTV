import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deviceAPI } from '../services/api';
import { subscribeToDeviceUpdates, unsubscribeFromDeviceUpdates } from '../services/socket';
import type { Device } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Monitor, Wifi, WifiOff, HardDrive } from 'lucide-react';

export const Dashboard = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadDevices();
    subscribeToDeviceUpdates((data) => {
      setDevices((prev) => {
        const index = prev.findIndex((d) => d.deviceId === data.deviceId);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = data;
          return updated;
        }
        return [...prev, data];
      });
    });

    return () => {
      unsubscribeFromDeviceUpdates();
    };
  }, []);

  const loadDevices = async () => {
    try {
      const response = await deviceAPI.getDevices({ page: 1, limit: 1000 });
      setDevices(response.data.data || response.data);
    } catch (error) {
      console.error('Failed to load devices:', error);
    } finally {
      setLoading(false);
    }
  };

  const onlineCount = devices.filter((d) => d.status === 'online').length;
  const offlineCount = devices.filter((d) => d.status === 'offline').length;
  const totalStorage = devices.reduce((acc, d) => acc + d.storage.total, 0);
  const usedStorage = devices.reduce((acc, d) => acc + d.storage.used, 0);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Signage CMS Dashboard</h1>
          <Button variant="secondary" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <Monitor className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-sm text-gray-600">Total Devices</p>
                  <p className="text-2xl font-bold">{devices.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <Wifi className="w-8 h-8 text-green-600" />
                <div>
                  <p className="text-sm text-gray-600">Online</p>
                  <p className="text-2xl font-bold">{onlineCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <WifiOff className="w-8 h-8 text-red-600" />
                <div>
                  <p className="text-sm text-gray-600">Offline</p>
                  <p className="text-2xl font-bold">{offlineCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <HardDrive className="w-8 h-8 text-purple-600" />
                <div>
                  <p className="text-sm text-gray-600">Storage Used</p>
                  <p className="text-2xl font-bold">
                    {((usedStorage / totalStorage) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={() => navigate('/devices')} className="w-full">
                Manage Devices
              </Button>
              <Button onClick={() => navigate('/library')} variant="secondary" className="w-full">
                Media Library
              </Button>
              <Button onClick={() => navigate('/schedules')} variant="secondary" className="w-full">
                Manage Schedules
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-gray-500 text-center py-8">
                No recent activity
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};
