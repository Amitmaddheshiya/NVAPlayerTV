import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mediaAPI, deviceAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { LayoutGrid } from '../../components/LayoutGrid';
import { CloudOrientationPicker, normalizeCloudOrientation } from '../../components/CloudOrientationPicker';
import { CloudSectionRatioControl, normalizeCloudGridRatio } from '../../components/CloudSectionRatioControl';
import { LibraryModal } from '../../components/LibraryModal';
import { ArrowLeft, Settings, Save, CheckCircle2, XCircle, AlertTriangle, Info, X, History, RotateCcw } from 'lucide-react';
import { formatStorageBytes, getInsufficientStorageDevices } from '../../utils/configCacheStorage';

type DialogState = {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm?: () => void | Promise<void>;
};

const getRequestErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback;

export const UserDeviceDetail = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const [device, setDevice] = useState<any>(null);
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState({
    orientation: 0,
    layout: 'fullscreen',
    grid2Layout: 'horizontal',
    grid3Layout: 'stack-v',
    gridRatio: '1:1:1',
    slideDuration: 5,
    animation: 'slide',
    bgColor: '#000000',
    sections: [
      { id: 1, contentType: 'multimedia' as 'multimedia' | 'web' | 'youtube', mediaUrls: [], webUrl: '', youtubeUrl: '', slideDuration: 5 },
      { id: 2, contentType: 'multimedia' as 'multimedia' | 'web' | 'youtube', mediaUrls: [], webUrl: '', youtubeUrl: '', slideDuration: 5 },
      { id: 3, contentType: 'multimedia' as 'multimedia' | 'web' | 'youtube', mediaUrls: [], webUrl: '', youtubeUrl: '', slideDuration: 5 },
    ],
    ticker: { text: '', color: '#ffffff', bgColor: '#000000', speed: 6, fontSize: 24, position: 'bottom' },
    widgets: {
      clock: { enabled: false, format: '12h', position: 'top-left', transparency: 50, size: 100, textColor: '#38bdf8', bgColor: '#000000' },
      weather: { enabled: false, city: 'Delhi', unit: 'celsius', position: 'top-right', transparency: 50, size: 100, textColor: '#4ade80', bgColor: '#000000' },
      emergencyAlert: { enabled: false, type: 'FIRE', title: 'EMERGENCY ALERT', message: 'PLEASE EVACUATE IMMEDIATELY!', sound: false },
    },
    cache: { videoMB: 2048 },
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [configHistory, setConfigHistory] = useState<any[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [retryingSync, setRetryingSync] = useState(false);
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number | null>(null);
  const navigate = useNavigate();

  const defaultConfig = {
    orientation: 0,
    layout: 'fullscreen',
    grid2Layout: 'horizontal',
    grid3Layout: 'stack-v',
    gridRatio: '1:1:1',
    slideDuration: 5,
    animation: 'slide',
    bgColor: '#000000',
    sections: [
      { id: 1, contentType: 'multimedia' as 'multimedia' | 'web' | 'youtube', mediaUrls: [], webUrl: '', youtubeUrl: '', slideDuration: 5 },
      { id: 2, contentType: 'multimedia' as 'multimedia' | 'web' | 'youtube', mediaUrls: [], webUrl: '', youtubeUrl: '', slideDuration: 5 },
      { id: 3, contentType: 'multimedia' as 'multimedia' | 'web' | 'youtube', mediaUrls: [], webUrl: '', youtubeUrl: '', slideDuration: 5 },
    ],
    ticker: { text: '', color: '#ffffff', bgColor: '#000000', speed: 6, fontSize: 24, position: 'bottom' },
    widgets: {
      clock: { enabled: false, format: '12h', position: 'top-left', transparency: 50, size: 100, textColor: '#38bdf8', bgColor: '#000000' },
      weather: { enabled: false, city: 'Delhi', unit: 'celsius', position: 'top-right', transparency: 50, size: 100, textColor: '#4ade80', bgColor: '#000000' },
      emergencyAlert: { enabled: false, type: 'FIRE', title: 'EMERGENCY ALERT', message: 'PLEASE EVACUATE IMMEDIATELY!', sound: false },
    },
    cache: { videoMB: 2048 },
  };

  const handleClearConfig = () => {
    setDialog({
      type: 'warning',
      title: 'Clear device configuration?',
      message: 'This will remove the selected media and reset this device to its default settings.',
      confirmLabel: 'Clear configuration',
      onConfirm: clearDeviceConfig,
    });
  };

  const clearDeviceConfig = async () => {
    setSavingConfig(true);
    try {
      await deviceAPI.updateConfig(deviceId!, defaultConfig);
      setConfig(defaultConfig);
      setDialog({
        type: 'success',
        title: 'Configuration cleared',
        message: 'The default configuration was saved. TV apply and cache status will update on this page.',
      });
    } catch (error) {
      console.error('Clear config error:', error);
      setDialog({
        type: 'error',
        title: 'Could not clear configuration',
        message: getRequestErrorMessage(error, 'The configuration could not be cleared. Check the connection and try again.'),
      });
    } finally {
      setSavingConfig(false);
    }
  };

  useEffect(() => {
    if (deviceId) {
      loadDevice();
      loadDeviceMedia();
    }
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId) return;
    const refreshSyncStatus = async () => {
      try {
        const response = await deviceAPI.getDevice(deviceId);
        const latest = response.data;
        setDevice((previous: any) => previous ? {
          ...previous,
          status: latest.status,
          lastSeen: latest.lastSeen,
          appVersion: latest.appVersion,
          storage: latest.storage,
          cacheInfo: latest.cacheInfo,
          health: latest.health,
        } : latest);
      } catch {
        // Keep the last known status visible during short network interruptions.
      }
    };
    const timer = window.setInterval(refreshSyncStatus, 10_000);
    return () => window.clearInterval(timer);
  }, [deviceId]);

  // Ensure sections are properly initialized when layout changes
  useEffect(() => {
    const sectionCount = getSectionCount();
    setConfig((prevConfig) => {
      const currentSections = prevConfig.sections || [];
      const newSections = [...currentSections];
      
      // Add missing sections
      while (newSections.length < sectionCount) {
        newSections.push({
          id: newSections.length + 1,
          contentType: 'multimedia' as 'multimedia' | 'web' | 'youtube',
          mediaUrls: [],
          webUrl: '',
          youtubeUrl: '',
          slideDuration: 5,
        });
      }
      
      return {
        ...prevConfig,
        sections: newSections,
      };
    });
  }, [config.layout]);

  const loadDevice = async () => {
    try {
      const response = await deviceAPI.getDevice(deviceId!);
      setDevice(response.data);
      if (response.data.config) {
        // Migrate old config to new section-based structure ONLY if sections don't exist
        const loadedConfig = response.data.config;
        if (!loadedConfig.sections || !Array.isArray(loadedConfig.sections) || loadedConfig.sections.length === 0) {
          // Old config - create sections from mediaUrls ONLY for fullscreen layout
          const mediaUrls = loadedConfig.mediaUrls || [];
          loadedConfig.sections = [
            { id: 1, contentType: 'multimedia' as 'multimedia' | 'web' | 'youtube', mediaUrls, webUrl: '', youtubeUrl: '', slideDuration: loadedConfig.slideDuration || 5 },
            { id: 2, contentType: 'multimedia' as 'multimedia' | 'web' | 'youtube', mediaUrls: [], webUrl: '', youtubeUrl: '', slideDuration: loadedConfig.slideDuration || 5 },
            { id: 3, contentType: 'multimedia' as 'multimedia' | 'web' | 'youtube', mediaUrls: [], webUrl: '', youtubeUrl: '', slideDuration: loadedConfig.slideDuration || 5 },
          ];
          console.log('Migrated old config to sections:', loadedConfig.sections);
        }
        
        setConfig({
          ...config,
          ...loadedConfig,
          ticker: { ...config.ticker, ...(loadedConfig.ticker || {}) },
          widgets: { ...config.widgets, ...(loadedConfig.widgets || {}) },
        });
        console.log('Loaded config sections:', loadedConfig.sections);
      }
    } catch (error) {
      console.error('Failed to load device:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDeviceMedia = async () => {
    try {
      // Request with higher limit to get enough media for selection
      const response = await mediaAPI.getMedia({ page: 1, limit: 1000 });
      setMediaList(response.data.data || response.data);
    } catch (error) {
      console.error('Failed to load media:', error);
      setDialog({
        type: 'error',
        title: 'Could not load media library',
        message: getRequestErrorMessage(error, 'Media could not be loaded. Check the connection and try again.'),
      });
    }
  };

  const handleSaveConfig = async () => {
    if (!deviceId) return;

    setSavingConfig(true);
    try {
      // Ensure sections are properly set based on layout
      const sectionCount = getSectionCount();
      
      // Get current sections or create default ones
      let sectionsToSave = config.sections || [];
      if (sectionsToSave.length === 0) {
        sectionsToSave = [
          { id: 1, contentType: 'multimedia' as 'multimedia' | 'web' | 'youtube', mediaUrls: [], webUrl: '', youtubeUrl: '', slideDuration: 5 },
          { id: 2, contentType: 'multimedia' as 'multimedia' | 'web' | 'youtube', mediaUrls: [], webUrl: '', youtubeUrl: '', slideDuration: 5 },
          { id: 3, contentType: 'multimedia' as 'multimedia' | 'web' | 'youtube', mediaUrls: [], webUrl: '', youtubeUrl: '', slideDuration: 5 },
        ];
      }
      
      // Slice to the correct number of sections based on layout
      sectionsToSave = sectionsToSave.slice(0, sectionCount);
      
      // Clean up sections - clear irrelevant fields based on contentType
      sectionsToSave = sectionsToSave.map((section) => {
        const cleaned = { ...section };
        if (cleaned.contentType === 'multimedia') {
          cleaned.webUrl = '';
          cleaned.youtubeUrl = '';
        } else if (cleaned.contentType === 'web') {
          cleaned.mediaUrls = [];
          cleaned.youtubeUrl = '';
        } else if (cleaned.contentType === 'youtube') {
          cleaned.mediaUrls = [];
          cleaned.webUrl = '';
        }
        return cleaned;
      });
      
      // Convert relative URLs to absolute URLs for each section
      const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';
      const sectionsWithAbsoluteUrls = sectionsToSave.map((section) => {
        if (section.contentType === 'multimedia' && section.mediaUrls) {
          const absoluteUrls = section.mediaUrls.map((url: string) => {
            if (url.startsWith('/api/media/file/')) {
              return `${SERVER_URL}${url}`;
            }
            return url;
          });
          return { ...section, mediaUrls: absoluteUrls };
        }
        return section;
      });
      
      const configToSave = {
        ...config,
        orientation: normalizeCloudOrientation(config.orientation),
        gridRatio: normalizeCloudGridRatio(config.layout, config.grid3Layout, config.gridRatio),
        ticker: { ...config.ticker, fontSize: Math.min(100, Math.max(10, Number(config.ticker.fontSize) || 24)) },
        sections: sectionsWithAbsoluteUrls,
      };

      const storageCheck = getInsufficientStorageDevices(configToSave, mediaList, [device]);
      if (storageCheck.insufficient.length) {
        const tv = storageCheck.insufficient[0];
        const proceed = window.confirm(
          `TV storage may be too low. ${tv.name} has about ${formatStorageBytes(tv.freeBytes)} free; this update needs about ${formatStorageBytes(storageCheck.requiredBytes)} including safety space. The old playlist will keep playing unless the new cache fully downloads. Save this update anyway?`
        );
        if (!proceed) return;
      } else if (storageCheck.bytes > 0 && (storageCheck.unknownFiles > 0 || storageCheck.unknownStorageDevices.length > 0)) {
        const proceed = window.confirm(
          `TV free-storage data or ${storageCheck.unknownFiles} media file size(s) could not be confirmed yet. The TV will check real free space before downloading and keep the old playlist if there is not enough. Continue saving?`
        );
        if (!proceed) return;
      }
      
      console.log('Saving config:', JSON.stringify(configToSave, null, 2));
      console.log('Section count:', sectionCount);
      console.log('Sections to save:', sectionsWithAbsoluteUrls);
      
      await deviceAPI.updateConfig(deviceId, configToSave);
      setDialog({
        type: 'success',
        title: 'Configuration saved',
        message: 'The layout, settings, and selected media were saved. TV apply and cache status will update on this page.',
      });
    } catch (error) {
      console.error('Save config error:', error);
      setDialog({
        type: 'error',
        title: 'Could not save configuration',
        message: getRequestErrorMessage(error, 'The configuration was not saved. Check the connection and try again.'),
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const openConfigHistory = async () => {
    try {
      const response = await deviceAPI.getConfigHistory(deviceId!);
      setConfigHistory(response.data?.entries || []);
      setHistoryOpen(true);
    } catch (error) {
      setDialog({ type: 'error', title: 'History unavailable', message: getRequestErrorMessage(error, 'Could not load configuration history.') });
    }
  };

  const rollbackConfig = async (entry: any) => {
    if (!deviceId || !entry?.config) return;
    if (!window.confirm('Restore this saved configuration? The TV will keep its current playlist until the restored media is fully cached.')) return;
    const storageCheck = getInsufficientStorageDevices(entry.config, mediaList, [device]);
    if (storageCheck.insufficient.length && !window.confirm(
      `This saved configuration may need about ${formatStorageBytes(storageCheck.requiredBytes)} including safety space, but the TV reports ${formatStorageBytes(storageCheck.insufficient[0].freeBytes)} free. Restore anyway?`
    )) return;
    setSavingConfig(true);
    try {
      await deviceAPI.updateConfig(deviceId, entry.config);
      setHistoryOpen(false);
      await loadDevice();
      setDialog({ type: 'success', title: 'Configuration restored', message: 'The previous settings were saved as a new version. TV playback switches after its cache is verified.' });
    } catch (error) {
      setDialog({ type: 'error', title: 'Could not restore configuration', message: getRequestErrorMessage(error, 'The previous configuration could not be restored.') });
    } finally {
      setSavingConfig(false);
    }
  };

  const retryDeviceSync = async () => {
    if (!deviceId || retryingSync) return;
    setRetryingSync(true);
    try {
      await deviceAPI.retryCloudSync(deviceId);
      const response = await deviceAPI.getDevice(deviceId);
      setDevice(response.data);
    } catch (error) {
      setDialog({ type: 'error', title: 'Retry could not start', message: getRequestErrorMessage(error, 'Could not retry this TV sync.') });
    } finally {
      setRetryingSync(false);
    }
  };

  const updateSection = (sectionId: number, updates: any) => {
    setConfig((prevConfig) => ({
      ...prevConfig,
      sections: prevConfig.sections.map((s, idx) => {
        // Match by array index (0-based) instead of ID for proper isolation
        if (idx === sectionId - 1) {
          const updated = { ...s, ...updates };
          
          // Clear irrelevant fields based on contentType
          if (updates.contentType === 'multimedia') {
            updated.webUrl = '';
            updated.youtubeUrl = '';
          } else if (updates.contentType === 'web') {
            updated.mediaUrls = [];
            updated.youtubeUrl = '';
          } else if (updates.contentType === 'youtube') {
            updated.mediaUrls = [];
            updated.webUrl = '';
          }
          
          return updated;
        }
        return s;
      }),
    }));
  };

  const getSectionCount = () => {
    if (config.layout === 'fullscreen') return 1;
    if (config.layout === 'split') return 2;
    if (config.layout === 'grid') return 3;
    return 1;
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!device) {
    return <div className="flex items-center justify-center min-h-screen">Device not found</div>;
  }

  const sectionCount = getSectionCount();
  const tickerFontSize = Math.min(100, Math.max(10, Number(config.ticker.fontSize) || 24));
  const cloudSync = device.health?.cloudSync;
  const cloudSyncReady = cloudSync?.status === 'ready' && cloudSync.mediaCached === cloudSync.mediaTotal;
  const onlineOnlySections = Math.max(0, Number(cloudSync?.onlineOnlySections || 0));
  const dialogAppearance = dialog?.type === 'success'
    ? { Icon: CheckCircle2, iconClass: 'text-emerald-600 bg-emerald-50', titleClass: 'text-emerald-900', buttonClass: 'bg-emerald-600 hover:bg-emerald-700' }
    : dialog?.type === 'error'
    ? { Icon: XCircle, iconClass: 'text-red-600 bg-red-50', titleClass: 'text-red-900', buttonClass: 'bg-red-600 hover:bg-red-700' }
    : dialog?.type === 'warning'
    ? { Icon: AlertTriangle, iconClass: 'text-amber-600 bg-amber-50', titleClass: 'text-amber-900', buttonClass: 'bg-amber-600 hover:bg-amber-700' }
    : { Icon: Info, iconClass: 'text-blue-600 bg-blue-50', titleClass: 'text-blue-900', buttonClass: 'bg-blue-600 hover:bg-blue-700' };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-[95vw] sm:max-w-[1120px] xl:max-w-none xl:w-full mx-auto px-2 sm:px-3 xl:px-6 py-1.5 sm:py-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1.5 sm:gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="secondary" onClick={() => navigate('/user/devices')} className="text-[10px] sm:text-xs">
              <ArrowLeft className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
              <span className="hidden sm:inline">Back</span>
              <span className="sm:hidden">←</span>
            </Button>
            <div>
              <h1 className="text-sm sm:text-base md:text-lg font-bold text-gray-900">{device.name}</h1>
              <p className="text-[10px] sm:text-xs text-gray-500">{device.deviceId}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
            <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium ${device.status === 'online' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {device.status === 'online' ? '● Online' : '○ Offline'}
            </span>
            <Button onClick={handleClearConfig} variant="secondary" className="text-[10px] sm:text-xs">
              Clear
            </Button>
            <Button onClick={openConfigHistory} variant="secondary" className="text-[10px] sm:text-xs">
              <History className="mr-1 h-3 w-3" />History
            </Button>
            <Button onClick={handleSaveConfig} disabled={savingConfig} className="bg-blue-600 hover:bg-blue-700 text-[10px] sm:text-xs">
              <Save className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
              {savingConfig ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </header>

      {device.health?.cloudSync && (
        <div className="max-w-[95vw] sm:max-w-[1120px] xl:max-w-none xl:w-full mx-auto px-2 sm:px-3 xl:px-6 pt-2">
          <div className={`rounded-md border px-3 py-2 text-xs ${
            cloudSyncReady
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : device.health.cloudSync.status === 'failed'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}>
            <strong>TV sync · v{device.health.cloudSync.configVersion}</strong>
            <span className="ml-2">
              {cloudSyncReady
                ? `Applied and cached ${device.health.cloudSync.mediaCached}/${device.health.cloudSync.mediaTotal} files`
                : device.health.cloudSync.status === 'failed'
                ? device.health.cloudSync.message || `Cached ${device.health.cloudSync.mediaCached}/${device.health.cloudSync.mediaTotal} files; previous playlist is still active`
                : `Pending · cached ${device.health.cloudSync.mediaCached}/${device.health.cloudSync.mediaTotal} files`}
            </span>
            {onlineOnlySections > 0 && (
              <span className="ml-2 font-medium">
                {onlineOnlySections} web/YouTube section{onlineOnlySections === 1 ? '' : 's'} require internet and are not part of offline media cache.
              </span>
            )}
            {device.status !== 'online' && !cloudSyncReady && (
              <span className="ml-2">TV is offline; it will sync when it reconnects.</span>
            )}
            <div className="mt-1 text-[11px] opacity-80">
              APK {device.appVersion || 'unknown'} · Last seen {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : 'unknown'}
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            {device.health.cloudSync.status === 'failed' && (
              <Button variant="secondary" disabled={retryingSync} onClick={retryDeviceSync} className="text-[10px] sm:text-xs">
                <RotateCcw className="mr-1 h-3 w-3" />{retryingSync ? 'Retrying…' : 'Retry sync'}
              </Button>
            )}
          </div>
        </div>
      )}

      <main className="max-w-[95vw] sm:max-w-[1120px] xl:max-w-none xl:w-full mx-auto px-2 sm:px-3 xl:px-6 py-2 sm:py-3">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-3">
          {/* Left Column - Configuration */}
          <div className="lg:col-span-2 space-y-2 sm:space-y-3">
            {/* Layout Selection */}
            <Card>
              <CardHeader className="p-3 sm:p-4">
                <CardTitle className="flex items-center gap-2 text-[10px] sm:text-xs md:text-sm">
                  <Settings className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                  Layout Selection
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-4">
                <LayoutGrid
                  layout={config.layout as 'fullscreen' | 'split' | 'grid'}
                  grid2Layout={config.grid2Layout as 'horizontal' | 'vertical'}
                  grid3Layout={config.grid3Layout as 'stack-v' | 'stack-h' | 'top-two-bottom-one' | 'top-one-bottom-two'}
                  onSelectLayout={(layout) => setConfig({ ...config, layout })}
                  onSelectGrid2Layout={(grid2Layout) => setConfig({ ...config, grid2Layout })}
                  onSelectGrid3Layout={(grid3Layout) => setConfig({ ...config, grid3Layout })}
                />
                <CloudSectionRatioControl
                  layout={config.layout}
                  grid2Layout={config.grid2Layout}
                  grid3Layout={config.grid3Layout}
                  value={config.gridRatio}
                  onChange={(gridRatio) => setConfig({ ...config, gridRatio })}
                />
              </CardContent>
            </Card>

            {/* Section Configuration */}
            <Card>
              <CardHeader className="p-3 sm:p-4">
                <CardTitle className="text-[10px] sm:text-xs md:text-sm">Section Configuration</CardTitle>
              </CardHeader>
              <CardContent className={`p-3 sm:p-4 space-y-2 sm:space-y-3 xl:grid xl:gap-3 xl:space-y-0 ${sectionCount === 3 ? 'xl:grid-cols-3' : sectionCount === 2 ? 'xl:grid-cols-2' : 'xl:grid-cols-1'}`}>
                {Array.from({ length: sectionCount }).map((_, index) => {
                  const section = config.sections[index] || {
                    id: index + 1,
                    contentType: 'multimedia' as 'multimedia' | 'web' | 'youtube',
                    mediaUrls: [],
                    webUrl: '',
                    youtubeUrl: '',
                    slideDuration: 5,
                  };
                  const actualSectionId = index + 1;
                  const currentContentType = section.contentType;
                  return (
                    <div key={actualSectionId} className="border rounded-lg p-2 sm:p-3">
                      <h3 className="text-[10px] sm:text-xs md:text-sm font-medium mb-2 sm:mb-3">Section {actualSectionId}</h3>
                      
                      {/* Content Type Selection */}
                      <div className="mb-2 sm:mb-3">
                        <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">Content Type</label>
                        <Select
                          options={[
                            { value: 'multimedia', label: 'Multimedia (Files)' },
                            { value: 'web', label: 'Website (URL)' },
                            { value: 'youtube', label: 'YouTube (URL)' },
                          ]}
                          value={currentContentType}
                          onChange={(e) => updateSection(actualSectionId, { contentType: e.target.value as any })}
                        />
                      </div>

                      {/* Multimedia Content */}
                      {currentContentType === 'multimedia' && (
                        <div className="mb-2 sm:mb-3">
                          <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">Select Media Files</label>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setCurrentSectionIndex(index);
                              setLibraryModalOpen(true);
                            }}
                            className="w-full text-[10px] sm:text-xs"
                          >
                            Choose Files from Library ({section.mediaUrls.length} selected)
                          </Button>
                          {section.mediaUrls.length > 0 && (
                            <div className="mt-1.5 sm:mt-2 space-y-1 max-h-24 sm:max-h-32 overflow-y-auto">
                              {section.mediaUrls.map((url: string, idx: number) => {
                                const media = mediaList.find((m) => m.url === url);
                                return (
                                  <div key={idx} className="text-[10px] sm:text-xs bg-blue-50 p-1.5 sm:p-2 rounded flex justify-between items-center">
                                    <span className="truncate flex-1">{media?.originalName || url}</span>
                                    <Button
                                      variant="danger"
                                      size="sm"
                                      onClick={() => {
                                        const newUrls = section.mediaUrls.filter((u: string) => u !== url);
                                        updateSection(actualSectionId, { mediaUrls: newUrls });
                                      }}
                                    >
                                      ×
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Web URL */}
                      {currentContentType === 'web' && (
                        <div className="mb-2 sm:mb-3">
                          <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">Website URL</label>
                          <Input
                            placeholder="https://example.com"
                            value={section.webUrl}
                            onChange={(e) => updateSection(actualSectionId, { webUrl: e.target.value })}
                            className="text-[10px] sm:text-xs"
                          />
                        </div>
                      )}

                      {/* YouTube URL */}
                      {currentContentType === 'youtube' && (
                        <div className="mb-2 sm:mb-3">
                          <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">YouTube URL</label>
                          <Input
                            placeholder="https://youtube.com/watch?v=..."
                            value={section.youtubeUrl}
                            onChange={(e) => updateSection(actualSectionId, { youtubeUrl: e.target.value })}
                            className="text-[10px] sm:text-xs"
                          />
                        </div>
                      )}

                      {/* Slide Duration */}
                      <div>
                        <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">Slide Duration (sec)</label>
                        <Input
                          type="number"
                          value={section.slideDuration}
                          onChange={(e) => updateSection(actualSectionId, { slideDuration: parseInt(e.target.value) })}
                          min="1"
                          className="text-[10px] sm:text-xs"
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Ticker Settings */}
            <Card>
              <CardHeader className="p-3 sm:p-4">
                <CardTitle className="text-[10px] sm:text-xs md:text-sm">Ticker Settings</CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                <Input
                  label="Ticker Text"
                  placeholder="Enter scrolling text..."
                  value={config.ticker.text}
                  onChange={(e) => setConfig({ ...config, ticker: { ...config.ticker, text: e.target.value } })}
                  className="text-[10px] sm:text-xs"
                />
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
                  <div>
                    <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">Text Color</label>
                    <Input
                      type="color"
                      value={config.ticker.color}
                      onChange={(e) => setConfig({ ...config, ticker: { ...config.ticker, color: e.target.value } })}
                      className="h-6 sm:h-8 md:h-10"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">Bg Color</label>
                    <Input
                      type="color"
                      value={config.ticker.bgColor}
                      onChange={(e) => setConfig({ ...config, ticker: { ...config.ticker, bgColor: e.target.value } })}
                      className="h-6 sm:h-8 md:h-10"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">Speed</label>
                    <Input
                      type="number"
                      value={config.ticker.speed}
                      onChange={(e) => setConfig({ ...config, ticker: { ...config.ticker, speed: parseInt(e.target.value) } })}
                      min="1"
                      max="20"
                      className="text-[10px] sm:text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">Font Size</label>
                    <div className="flex h-8 sm:h-10 items-center justify-between rounded-md border border-gray-300 bg-white">
                      <button type="button" aria-label="Decrease ticker font size" disabled={tickerFontSize <= 10}
                        onClick={() => setConfig({ ...config, ticker: { ...config.ticker, fontSize: Math.max(10, tickerFontSize - 2) } })}
                        className="h-full px-3 text-lg font-semibold text-gray-700 disabled:opacity-40">−</button>
                      <span className="min-w-10 text-center text-xs font-medium">{tickerFontSize}px</span>
                      <button type="button" aria-label="Increase ticker font size" disabled={tickerFontSize >= 100}
                        onClick={() => setConfig({ ...config, ticker: { ...config.ticker, fontSize: Math.min(100, tickerFontSize + 2) } })}
                        className="h-full px-3 text-lg font-semibold text-gray-700 disabled:opacity-40">+</button>
                    </div>
                    <span className="text-[9px] text-gray-500">10–100 px</span>
                  </div>
                  <div>
                    <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">Position</label>
                    <Select
                      options={[
                        { value: 'top', label: 'Top' },
                        { value: 'bottom', label: 'Bottom' },
                      ]}
                      value={config.ticker.position}
                      onChange={(e) => setConfig({ ...config, ticker: { ...config.ticker, position: e.target.value } })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Device Info */}
          <div className="space-y-2 sm:space-y-3">
            <Card>
              <CardHeader className="p-3 sm:p-4">
                <CardTitle className="text-[10px] sm:text-xs md:text-sm">Live TV Preview</CardTitle>
              </CardHeader>
              <CardContent className="p-1.5 sm:p-2">
                <CloudOrientationPicker value={config.orientation} onChange={(orientation) => setConfig({ ...config, orientation })} config={config} mediaList={mediaList} />
              </CardContent>
            </Card>
            {/* Device Info */}
            <Card>
              <CardHeader className="p-3 sm:p-4">
                <CardTitle className="text-[10px] sm:text-xs md:text-sm">Device Info</CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 space-y-1.5 sm:space-y-2">
                <div className="flex justify-between text-[10px] sm:text-xs">
                  <span className="text-gray-600">Version</span>
                  <span className="font-medium">{device.appVersion || '-'}</span>
                </div>
                <div className="flex justify-between text-[10px] sm:text-xs">
                  <span className="text-gray-600">Storage</span>
                  <span className="font-medium">{device.storage ? ((device.storage.used / device.storage.total) * 100).toFixed(1) + '%' : '-'}</span>
                </div>
                <div className="flex justify-between text-[10px] sm:text-xs">
                  <span className="text-gray-600">Last Seen</span>
                  <span className="font-medium text-[9px] sm:text-[10px]">{new Date(device.lastSeen).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[10px] sm:text-xs">
                  <span className="text-gray-600">Location</span>
                  <span className="font-medium">{device.location || 'Not set'}</span>
                </div>
              </CardContent>
            </Card>

            {/* Cache Settings */}
            <Card>
              <CardHeader className="p-3 sm:p-4">
                <CardTitle className="text-[10px] sm:text-xs md:text-sm">Cache Settings</CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-4">
                <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">Video Cache (MB)</label>
                <Input
                  type="number"
                  value={config.cache.videoMB}
                  onChange={(e) => setConfig({ ...config, cache: { ...config.cache, videoMB: parseInt(e.target.value) } })}
                  min="512"
                  max="8192"
                  className="text-[10px] sm:text-xs"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <LibraryModal
        isOpen={libraryModalOpen}
        onClose={() => setLibraryModalOpen(false)}
        onSelect={(selectedUrls) => {
          if (currentSectionIndex !== null) {
            updateSection(currentSectionIndex + 1, { mediaUrls: selectedUrls });
          }
        }}
        selectedUrls={currentSectionIndex !== null ? config.sections[currentSectionIndex]?.mediaUrls || [] : []}
      />

      {historyOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4">
          <section role="dialog" aria-modal="true" className="w-full max-w-xl rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Configuration history</h2>
              <button type="button" onClick={() => setHistoryOpen(false)} aria-label="Close history"><X className="h-4 w-4" /></button>
            </div>
            {configHistory.length ? (
              <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                {configHistory.map((entry) => (
                  <div key={entry._id || `${entry.configVersion}-${entry.savedAt}`} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">Version {entry.configVersion} · {entry.config?.layout || 'configuration'}</div>
                      <div className="text-xs text-slate-500">{entry.savedAt ? new Date(entry.savedAt).toLocaleString() : 'Saved earlier'} · {entry.source || 'saved config'}</div>
                    </div>
                    <Button variant="secondary" disabled={savingConfig} onClick={() => void rollbackConfig(entry)} className="shrink-0 text-xs">
                      <RotateCcw className="mr-1 h-3 w-3" />Restore
                    </Button>
                  </div>
                ))}
              </div>
            ) : <p className="py-6 text-center text-sm text-slate-500">No saved configuration history yet.</p>}
          </section>
        </div>
      )}

      {dialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            aria-label="Close dialog backdrop"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            onClick={() => {
              if (!dialog.onConfirm) setDialog(null);
            }}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="device-config-dialog-title"
            className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <button
              type="button"
              aria-label="Close dialog"
              onClick={() => setDialog(null)}
              className="absolute right-3 top-3 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="px-5 pb-5 pt-6 text-center sm:px-6">
              <div className={`mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full ${dialogAppearance.iconClass}`}>
                <dialogAppearance.Icon className="h-5 w-5" />
              </div>
              <h2 id="device-config-dialog-title" className={`text-base font-semibold ${dialogAppearance.titleClass}`}>
                {dialog.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{dialog.message}</p>
            </div>
            <div className="flex justify-center gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 sm:px-6">
              {dialog.onConfirm ? (
                <>
                  <button
                    type="button"
                    disabled={savingConfig}
                    onClick={() => setDialog(null)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingConfig}
                    onClick={() => void dialog.onConfirm?.()}
                    className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:cursor-wait disabled:opacity-60 ${dialogAppearance.buttonClass}`}
                  >
                    {savingConfig ? 'Applying…' : dialog.confirmLabel || 'Confirm'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setDialog(null)}
                  className={`min-w-24 rounded-lg px-5 py-2 text-sm font-medium text-white transition ${dialogAppearance.buttonClass}`}
                >
                  OK
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
