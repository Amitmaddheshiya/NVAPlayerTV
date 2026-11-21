import { useEffect, useState } from 'react';
import { configAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Save, Package, AlertCircle } from 'lucide-react';

export const AdminConfig = () => {
  const [config, setConfig] = useState({
    monthlyUploadLimitGB: 10,
    singleUploadLimitMB: 2048,
    apkVersion: '1.0.0',
    apkUrl: '',
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await configAPI.getConfig();
      setConfig(response.data);
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await configAPI.updateConfig(config);
      setAlertState({
        isOpen: true,
        title: 'Success',
        message: 'Configuration saved successfully',
        type: 'success',
      });
    } catch (error) {
      setAlertState({
        isOpen: true,
        title: 'Save Failed',
        message: 'Failed to save configuration. Please try again.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <>
      <div className="p-2 sm:p-4 md:p-6 max-w-[95vw] sm:max-w-[1200px] mx-auto overflow-x-hidden">
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-3 sm:mb-4 md:mb-6">Admin Settings</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
          {/* APK Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[10px] sm:text-xs md:text-sm">
                <Package className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                APK Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 sm:space-y-3">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  Current Version
                </label>
                <Input
                  value={config.apkVersion}
                  onChange={(e) => setConfig({ ...config, apkVersion: e.target.value })}
                  placeholder="1.0.0"
                  className="text-xs sm:text-sm"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  APK URL
                </label>
                <Input
                  value={config.apkUrl}
                  onChange={(e) => setConfig({ ...config, apkUrl: e.target.value })}
                  placeholder="https://example.com/app.apk"
                  className="text-xs sm:text-sm"
                />
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 sm:p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-600 mt-0.5" />
                  <div className="text-xs sm:text-sm text-yellow-800">
                    <p className="font-medium">Important</p>
                    <p className="text-yellow-700">
                      APK updates will be pushed to all devices. Make sure to test thoroughly before deploying.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Global Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[10px] sm:text-xs md:text-sm">
                <Save className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                Global Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 sm:space-y-3">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  Monthly Upload Limit (GB)
                </label>
                <Input
                  type="number"
                  value={config.monthlyUploadLimitGB}
                  onChange={(e) =>
                    setConfig({ ...config, monthlyUploadLimitGB: parseInt(e.target.value) || 0 })
                  }
                  placeholder="10"
                  className="text-xs sm:text-sm"
                />
                <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
                  Maximum total storage each user can upload per month
                </p>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  Single Upload Limit (MB)
                </label>
                <Input
                  type="number"
                  value={config.singleUploadLimitMB}
                  onChange={(e) =>
                    setConfig({ ...config, singleUploadLimitMB: parseInt(e.target.value) || 0 })
                  }
                  placeholder="2048"
                  className="text-xs sm:text-sm"
                />
                <p className="text-[10px] sm:text-xs text-gray-500 mt-1">
                  Maximum size for a single file upload
                </p>
              </div>

              <div className="pt-3 sm:pt-4 border-t">
                <Button onClick={handleSave} disabled={saving} className="w-full text-xs sm:text-sm">
                  <Save className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  {saving ? 'Saving...' : 'Save Configuration'}
                </Button>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 mt-0.5" />
                  <div className="text-xs sm:text-sm text-blue-800">
                    <p className="font-medium">Note</p>
                    <p className="text-blue-700">
                      These settings apply globally to all users. Changes will take effect immediately.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Current Settings Summary */}
        <Card className="mt-2 sm:mt-3 md:mt-4">
          <CardHeader>
            <CardTitle className="text-[10px] sm:text-xs md:text-sm">Current Settings Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                <div className="text-xs sm:text-sm text-gray-600">Monthly Upload Limit</div>
                <div className="text-base sm:text-xl font-bold">{config.monthlyUploadLimitGB} GB</div>
              </div>
              <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                <div className="text-xs sm:text-sm text-gray-600">Single Upload Limit</div>
                <div className="text-base sm:text-xl font-bold">{config.singleUploadLimitMB} MB</div>
              </div>
              <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                <div className="text-xs sm:text-sm text-gray-600">Current APK Version</div>
                <div className="text-base sm:text-xl font-bold">{config.apkVersion}</div>
              </div>
            </div>
          </CardContent>
        </Card>
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
