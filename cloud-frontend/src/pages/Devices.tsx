import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deviceAPI } from '../services/api';
import type { Device } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Wifi, WifiOff, RefreshCw, Power } from 'lucide-react';

export const Devices = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadDevices();
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

  const filteredDevices = devices.filter((d) => {
    if (filter === 'all') return true;
    return d.status === filter;
  });

  const toggleDeviceSelection = (deviceId: string) => {
    setSelectedDevices((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) {
        next.delete(deviceId);
      } else {
        next.add(deviceId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedDevices(new Set(filteredDevices.map((d) => d.deviceId)));
  };

  const clearSelection = () => {
    setSelectedDevices(new Set());
  };

  const sendCommand = async (deviceId: string, command: string) => {
    try {
      await deviceAPI.sendCommand(deviceId, command);
      alert(`Command ${command} sent successfully`);
    } catch (error) {
      alert(`Failed to send command ${command}`);
    }
  };

  const sendBulkCommand = async (command: string) => {
    for (const deviceId of selectedDevices) {
      await sendCommand(deviceId, command);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Devices</h1>
          <Button variant="secondary" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-wrap gap-4 items-center">
              <Select
                label="Filter by Status"
                options={[
                  { value: 'all', label: 'All Devices' },
                  { value: 'online', label: 'Online Only' },
                  { value: 'offline', label: 'Offline Only' },
                ]}
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
              />
              <div className="flex gap-2">
                <Button onClick={selectAll}>Select All</Button>
              </div>
              <div className="flex gap-2">
                <Button onClick={clearSelection} variant="secondary">
                  Clear Selection
                </Button>
              </div>
              <div className="ml-auto text-sm text-gray-600">
                {selectedDevices.size} selected
              </div>
            </div>
            {selectedDevices.size > 0 && (
              <div className="flex gap-2 mt-4 pt-4 border-t">
                <Button onClick={() => sendBulkCommand('restart')} variant="warning">
                  Restart Selected
                </Button>
                <Button onClick={() => sendBulkCommand('sync')} variant="secondary">
                  Sync Selected
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDevices.map((device) => (
            <div
              key={device.deviceId}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/devices/${device.deviceId}`)}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{device.name}</CardTitle>
                    {device.status === 'online' ? (
                      <Wifi className="w-5 h-5 text-green-600" />
                    ) : (
                      <WifiOff className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm">
                    <span className="text-gray-600">ID:</span> {device.deviceId}
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-600">Group:</span> {device.group || 'None'}
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-600">Version:</span> {device.appVersion}
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-600">Storage:</span>{' '}
                    {((device.storage.used / device.storage.total) * 100).toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-500">
                    Last seen: {new Date(device.lastSeen).toLocaleString()}
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      checked={selectedDevices.has(device.deviceId)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleDeviceSelection(device.deviceId);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex gap-2 ml-auto">
                      <Button
                        size="sm"
                        variant="warning"
                        onClick={(e) => {
                          e.stopPropagation();
                          sendCommand(device.deviceId, 'restart');
                        }}
                      >
                        <Power className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          sendCommand(device.deviceId, 'sync');
                        }}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};
