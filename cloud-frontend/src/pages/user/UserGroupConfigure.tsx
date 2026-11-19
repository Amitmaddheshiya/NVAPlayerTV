import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { deviceAPI, groupAPI, mediaAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { LayoutGrid } from '../../components/LayoutGrid';
import { CloudOrientationPicker, normalizeCloudOrientation } from '../../components/CloudOrientationPicker';
import { CloudSectionRatioControl, normalizeCloudGridRatio } from '../../components/CloudSectionRatioControl';
import { LibraryModal } from '../../components/LibraryModal';
import { Alert } from '../../components/ui/Alert';
import { ArrowLeft, Save, Monitor, Layers, Settings, History, RotateCcw } from 'lucide-react';
import { formatStorageBytes, getInsufficientStorageDevices } from '../../utils/configCacheStorage';

export const UserGroupConfigure = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const [group, setGroup] = useState<any>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configHistory, setConfigHistory] = useState<any[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [retryingDevices, setRetryingDevices] = useState<string[]>([]);
  const [dialog, setDialog] = useState<{ isOpen: boolean; title: string; message: string; type: 'success' | 'error' | 'warning' | 'info'; showConfirm: boolean; confirmText: string }>({
    isOpen: false, title: '', message: '', type: 'info', showConfirm: false, confirmText: 'Confirm',
  });
  const confirmationResolver = useRef<((confirmed: boolean) => void) | null>(null);
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
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number | null>(null);

  const showNotice = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', title?: string) => {
    setDialog({ isOpen: true, title: title || (type === 'error' ? 'Error' : type === 'success' ? 'Success' : 'Notice'), message, type, showConfirm: false, confirmText: 'Confirm' });
  };

  const askConfirmation = (message: string, title = 'Please confirm') => new Promise<boolean>((resolve) => {
    confirmationResolver.current = resolve;
    setDialog({ isOpen: true, title, message, type: 'warning', showConfirm: true, confirmText: 'Continue' });
  });

  const closeDialog = (confirmed = false) => {
    setDialog((current) => ({ ...current, isOpen: false }));
    const resolve = confirmationResolver.current;
    confirmationResolver.current = null;
    resolve?.(confirmed);
  };

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

  const handleClearConfig = async () => {
    if (!groupId) return;
    if (await askConfirmation('Are you sure you want to clear all configuration? This will remove all files and settings from all devices in the group.', 'Clear group configuration')) {
      setSaving(true);
      try {
        const response = await groupAPI.configureGroup(groupId, defaultConfig);
        if (!response.data?.success) {
          const result = response.data || {};
          if (!result.partial && !(result.failedDeviceIds || []).length) throw new Error(result.message || 'Group configuration was not applied');
          if ((result.appliedDeviceIds || []).length) setConfig(defaultConfig);
          showNotice(`${result.message || 'Configuration was only partially applied.'} Applied: ${(result.appliedDeviceIds || []).join(', ') || 'none'}. Failed: ${(result.failedDeviceIds || []).join(', ') || 'unknown'}.`, 'warning');
        } else {
          setConfig(defaultConfig);
          showNotice('Clear configuration saved for the group. Each device cache/apply status will update below.', 'success');
        }
      } catch (error) {
        console.error('Clear config error:', error);
        showNotice((error as any)?.response?.data?.message || (error as any)?.message || 'Failed to clear configuration', 'error');
      } finally {
        setSaving(false);
      }
    }
  };

  useEffect(() => {
    if (groupId) {
      loadGroup();
      loadDevices();
      loadMedia();
    }
  }, [groupId]);

  useEffect(() => {
    const deviceIds: string[] = Array.isArray(group?.devices) ? group.devices.map((id: string) => String(id)) : [];
    if (!deviceIds.length) return;
    let active = true;
    const refreshDeviceSync = async () => {
      const results = await Promise.allSettled(deviceIds.map((id) => deviceAPI.getDevice(id)));
      if (!active) return;
      const latestById = new Map<string, any>();
      results.forEach((result) => {
        if (result.status === 'fulfilled') latestById.set(String(result.value.data?.deviceId), result.value.data);
      });
      if (!latestById.size) return;
      setDevices((previous) => previous.map((device) => {
        const latest = latestById.get(String(device.deviceId));
        return latest ? { ...device, status: latest.status, lastSeen: latest.lastSeen, appVersion: latest.appVersion, storage: latest.storage, health: latest.health } : device;
      }));
    };
    void refreshDeviceSync();
    const timer = window.setInterval(refreshDeviceSync, 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [group?.devices?.join('|')]);

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

  const loadGroup = async () => {
    try {
      const response = await groupAPI.getGroups();
      const groups = response.data.data || response.data;
      const groupData = groups.find((g: any) => g._id === groupId);
      setGroup(groupData);
      const firstDeviceId = groupData?.devices?.[0];
      let loadedConfig = groupData?.config;
      if (!loadedConfig && firstDeviceId) {
        const deviceResponse = await deviceAPI.getDevice(firstDeviceId);
        loadedConfig = deviceResponse.data?.config;
      }
      if (loadedConfig) {
        const loadedSections = Array.isArray(loadedConfig.sections) && loadedConfig.sections.length
          ? loadedConfig.sections
          : [
              {
                id: 1,
                contentType: 'multimedia',
                mediaUrls: loadedConfig.mediaUrls || [],
                webUrl: '',
                youtubeUrl: '',
                slideDuration: loadedConfig.slideDuration || 5,
              },
            ];
        setConfig((current) => ({
          ...current,
          ...loadedConfig,
          sections: loadedSections,
          ticker: { ...current.ticker, ...(loadedConfig.ticker || {}) },
          widgets: {
            ...current.widgets,
            ...(loadedConfig.widgets || {}),
            clock: { ...current.widgets.clock, ...(loadedConfig.widgets?.clock || {}) },
            weather: { ...current.widgets.weather, ...(loadedConfig.widgets?.weather || {}) },
            emergencyAlert: { ...current.widgets.emergencyAlert, ...(loadedConfig.widgets?.emergencyAlert || {}) },
          },
          cache: { ...current.cache, ...(loadedConfig.cache || {}) },
        }));
      }
    } catch (error) {
      console.error('Failed to load group:', error);
    }
  };

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

  const loadMedia = async () => {
    try {
      const response = await mediaAPI.getMedia({ page: 1, limit: 1000 });
      setMediaList(response.data.data || response.data);
    } catch (error) {
      console.error('Failed to load media:', error);
    }
  };

  const handleSaveConfig = async () => {
    if (!groupId) return;

    setSaving(true);
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
        const cleaned: any = { ...section };
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

      const currentGroupDevices = devices.filter((device) => group?.devices?.includes(device.deviceId));
      const storageCheck = getInsufficientStorageDevices(configToSave, mediaList, currentGroupDevices);
      if (storageCheck.insufficient.length) {
        const limited = storageCheck.insufficient
          .map((tv) => `${tv.name}: ${formatStorageBytes(tv.freeBytes)} free`)
          .join('\n');
        const proceed = await askConfirmation(
          `Some TVs may not have enough free storage. This update needs about ${formatStorageBytes(storageCheck.requiredBytes)} per TV including safety space.\n${limited}\n\nThe previous cached playlist stays active if a TV cannot complete the download. Save this update anyway?`
        );
        if (!proceed) return;
      } else if (storageCheck.bytes > 0 && (storageCheck.unknownFiles > 0 || storageCheck.unknownStorageDevices.length > 0)) {
        const proceed = await askConfirmation(
          `Free-storage data for ${storageCheck.unknownStorageDevices.length} TV(s) or ${storageCheck.unknownFiles} media file size(s) could not be confirmed. Each TV will check real free space before downloading and keep its old playlist if needed. Continue saving?`
        );
        if (!proceed) return;
      }
      
      // Apply config to all devices in the group
      const response = await groupAPI.configureGroup(groupId, configToSave);
      if (!response.data?.success) {
        const result = response.data || {};
        if (!result.partial && !(result.failedDeviceIds || []).length) throw new Error(result.message || 'Group configuration was not applied');
        showNotice(`${result.message || 'Configuration was only partially saved.'} Applied: ${(result.appliedDeviceIds || []).join(', ') || 'none'}. Failed: ${(result.failedDeviceIds || []).join(', ') || 'unknown'}.`, 'warning');
        return;
      }

      showNotice('Configuration saved for all group devices. Each device cache/apply status will update below.', 'success');
    } catch (error) {
      console.error('Save config error:', error);
      const result = (error as any)?.response?.data;
      const partialDetails = result?.partial
        ? ` Applied: ${(result.appliedDeviceIds || []).join(', ') || 'none'}. Failed: ${(result.failedDeviceIds || []).join(', ') || 'unknown'}.`
        : '';
      showNotice(`${result?.message || (error as any)?.message || 'Failed to save configuration'}${partialDetails}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const openConfigHistory = async () => {
    if (!groupId) return;
    try {
      const response = await groupAPI.getConfigHistory(groupId);
      setConfigHistory(response.data?.entries || []);
      setHistoryOpen(true);
    } catch (error) {
      showNotice((error as any)?.response?.data?.error || 'Could not load group configuration history.', 'error');
    }
  };

  const rollbackGroupConfig = async (entry: any) => {
    if (!groupId || !entry?.config) return;
    if (!await askConfirmation('Restore this saved group configuration? Each TV will keep playing its current cache until the restored media is fully downloaded.', 'Restore configuration')) return;
    const storageCheck = getInsufficientStorageDevices(entry.config, mediaList, devices.filter((device) => group?.devices?.includes(device.deviceId)));
    if (storageCheck.insufficient.length && !await askConfirmation(
      `This saved configuration may need about ${formatStorageBytes(storageCheck.requiredBytes)} including safety space. ${storageCheck.insufficient.length} TV(s) report less free storage. Restore anyway?`
    )) return;
    setSaving(true);
    try {
      const response = await groupAPI.configureGroup(groupId, entry.config);
      if (!response.data?.success) throw new Error(response.data?.message || 'Group configuration restore failed');
      setConfig((previous) => ({ ...previous, ...entry.config }));
      setHistoryOpen(false);
      showNotice('Previous configuration restored for the group. TV cache/apply status will update below.', 'success');
    } catch (error) {
      showNotice((error as any)?.response?.data?.message || (error as any)?.message || 'Could not restore group configuration.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const retryDeviceSync = async (deviceId: string) => {
    if (retryingDevices.includes(deviceId)) return;
    setRetryingDevices((previous) => [...previous, deviceId]);
    try {
      await deviceAPI.retryCloudSync(deviceId);
      const response = await deviceAPI.getDevice(deviceId);
      setDevices((previous) => previous.map((device) => device.deviceId === deviceId ? { ...device, ...response.data } : device));
    } catch (error) {
      showNotice((error as any)?.response?.data?.error || (error as any)?.message || `Could not retry sync for ${deviceId}.`, 'error');
    } finally {
      setRetryingDevices((previous) => previous.filter((id) => id !== deviceId));
    }
  };

  const updateSection = (sectionId: number, updates: any) => {
    setConfig((prevConfig) => ({
      ...prevConfig,
      sections: prevConfig.sections.map((s, idx) => {
        // Match by array index (0-based) instead of ID for proper isolation
        if (idx === sectionId - 1) {
          const updated: any = { ...s, ...updates };
          
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
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  const groupDevices = devices.filter((d) => group?.devices.includes(d.deviceId));
  const syncedDevices = groupDevices.filter((device) => device.health?.cloudSync);
  const expectedPlacements = (device: any) => (Array.isArray(device.config?.sections)
    ? device.config.sections.reduce((count: number, section: any) =>
        count + (section?.contentType === 'multimedia' && Array.isArray(section.mediaUrls) ? section.mediaUrls.length : 0), 0)
    : Array.isArray((device.config as any)?.mediaUrls) ? (device.config as any).mediaUrls.length : 0);
  const syncTotals = groupDevices.reduce((totals, device) => ({
    cached: totals.cached + Number(device.health?.cloudSync?.mediaCached || 0),
    total: totals.total + Number(device.health?.cloudSync?.mediaTotal ?? expectedPlacements(device)),
  }), { cached: 0, total: 0 });
  const readyDeviceCount = groupDevices.filter((device) => {
    const sync = device.health?.cloudSync;
    return sync?.status === 'ready' && sync.mediaCached === sync.mediaTotal;
  }).length;
  const onlineOnlySections = (Array.isArray(config.sections) ? config.sections : []).filter((section: any) =>
    (section?.contentType === 'web' && String(section?.webUrl || '').trim()) ||
    (section?.contentType === 'youtube' && String(section?.youtubeUrl || '').trim())
  ).length;
  const syncState = syncedDevices.some((device) => device.health?.cloudSync?.status === 'failed')
    ? 'failed'
    : groupDevices.length > 0 && readyDeviceCount === groupDevices.length
    ? 'ready'
    : 'pending';
  const tickerFontSize = Math.min(100, Math.max(10, Number(config.ticker.fontSize) || 24));
  const sectionCount = getSectionCount();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-[95vw] sm:max-w-[1200px] xl:max-w-none xl:w-full mx-auto px-2 sm:px-3 md:px-4 xl:px-8 py-2 sm:py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="secondary" onClick={() => navigate('/user/groups')} className="text-[10px] sm:text-xs">
              <ArrowLeft className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
              <span className="hidden sm:inline">Back</span>
              <span className="sm:hidden">←</span>
            </Button>
            <div>
              <h1 className="text-sm sm:text-base md:text-lg font-bold text-gray-900">Configure Group: {group?.name}</h1>
              <p className="text-[10px] sm:text-xs text-gray-500">{groupDevices.length} devices</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
            <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium bg-blue-100 text-blue-800">
              {groupDevices.length} Devices
            </span>
            <Button onClick={openConfigHistory} variant="secondary" className="text-[10px] sm:text-xs">
              <History className="mr-1 h-3 w-3" />History
            </Button>
            <Button onClick={handleClearConfig} variant="secondary" className="text-[10px] sm:text-xs">
              Clear
            </Button>
            <Button onClick={handleSaveConfig} disabled={saving || groupDevices.length === 0} className="bg-blue-600 hover:bg-blue-700 text-[10px] sm:text-xs">
              <Save className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </header>

      {groupDevices.length > 0 && (
        <div className="max-w-[95vw] sm:max-w-[1200px] xl:max-w-none xl:w-full mx-auto px-2 sm:px-3 md:px-4 xl:px-8 pt-2">
          <div className={`rounded-md border px-3 py-2 text-xs ${
            syncState === 'ready'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : syncState === 'failed'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}>
            <strong>Group TV sync</strong>
            {groupDevices.length > 0 ? (
              <>
                <span className="ml-2">
                  {syncState === 'ready' ? 'Applied and cached' : syncState === 'failed' ? 'Some devices need attention' : 'Sync in progress'}
                  {' '}· cached {syncTotals.cached}/{syncTotals.total} file placements across {readyDeviceCount}/{groupDevices.length} devices
                </span>
                {onlineOnlySections > 0 && (
                  <div className="mt-1 font-medium">
                    {onlineOnlySections} web/video embed section{onlineOnlySections === 1 ? '' : 's'} require internet and are not part of offline media cache.
                  </div>
                )}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
                  {groupDevices.map((device) => {
                    const sync = device.health?.cloudSync;
                    return (
                      <span key={device.deviceId}>
                        {device.name}: {sync ? `v${sync.configVersion} ${sync.status} ${sync.mediaCached}/${sync.mediaTotal}` : 'waiting for first sync status'}
                        {!sync && device.status !== 'online' ? ' (offline)' : ''}
                      </span>
                    );
                  })}
                </div>
              </>
            ) : (
              <span className="ml-2">Waiting for TVs to report their saved configuration and cache status.</span>
            )}
          </div>
        </div>
      )}

      <main className="max-w-[95vw] sm:max-w-[1200px] xl:max-w-none xl:w-full mx-auto px-2 sm:px-3 md:px-4 xl:px-8 py-2 sm:py-3 md:py-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
          {/* Left Column - Configuration */}
          <div className="lg:col-span-2 space-y-2 sm:space-y-3 md:space-y-4">
            {/* Layout Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[10px] sm:text-xs md:text-sm">
                  <Settings className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                  Layout Selection
                </CardTitle>
              </CardHeader>
              <CardContent>
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
              <CardHeader>
                <CardTitle className="text-[10px] sm:text-xs md:text-sm">Section Configuration</CardTitle>
              </CardHeader>
              <CardContent className={`space-y-2 sm:space-y-3 md:space-y-4 xl:grid xl:gap-3 xl:space-y-0 ${sectionCount === 3 ? 'xl:grid-cols-3' : sectionCount === 2 ? 'xl:grid-cols-2' : 'xl:grid-cols-1'}`}>
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
                  const currentContentType: string = section.contentType;
                  return (
                    <div key={actualSectionId} className="border rounded-lg p-2 sm:p-3 md:p-4">
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
              <CardHeader>
                <CardTitle className="text-[10px] sm:text-xs md:text-sm">Ticker Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 sm:space-y-3">
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

          {/* Right Column - Devices & Info */}
          <div className="space-y-2 sm:space-y-3 md:space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-[10px] sm:text-xs md:text-sm">Live TV Preview</CardTitle>
              </CardHeader>
              <CardContent className="p-1.5 sm:p-2">
                <CloudOrientationPicker value={config.orientation} onChange={(orientation) => setConfig({ ...config, orientation })} config={config} mediaList={mediaList} />
              </CardContent>
            </Card>
            {/* Group Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-[10px] sm:text-xs md:text-sm">Group Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 sm:space-y-2">
                <div className="flex justify-between text-[10px] sm:text-xs">
                  <span className="text-gray-600">Group Name</span>
                  <span className="font-medium">{group?.name || '-'}</span>
                </div>
                <div className="flex justify-between text-[10px] sm:text-xs">
                  <span className="text-gray-600">Devices</span>
                  <span className="font-medium">{groupDevices.length}</span>
                </div>
                <div className="flex justify-between text-[10px] sm:text-xs">
                  <span className="text-gray-600">Online</span>
                  <span className="font-medium text-green-600">{groupDevices.filter((d) => d.status === 'online').length}</span>
                </div>
              </CardContent>
            </Card>

            {/* Group Devices */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[10px] sm:text-xs md:text-sm">
                  <Layers className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                  Group Devices
                </CardTitle>
              </CardHeader>
              <CardContent>
                {groupDevices.length === 0 ? (
                  <div className="text-center py-4 sm:py-6 md:py-8 text-gray-500 text-[10px] sm:text-xs">
                    No devices in this group
                  </div>
                ) : (
                  <div className="space-y-1.5 sm:space-y-2 max-h-32 sm:max-h-40 md:max-h-48 overflow-y-auto">
                    {groupDevices.map((device) => (
                      <div key={device.deviceId} className="p-1.5 sm:p-2 md:p-3 rounded-lg border bg-white">
                        <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
                          <Monitor className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 text-gray-600" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] sm:text-xs md:text-sm font-medium truncate">{device.name}</div>
                            <div className="text-[9px] sm:text-[10px] md:text-xs text-gray-500">{device.deviceId}</div>
                          </div>
                          <span className={`px-1 sm:px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] ${device.status === 'online' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {device.status}
                          </span>
                        </div>
                        <div className="mt-1 text-[9px] text-gray-500">
                          APK {device.appVersion || 'unknown'} · Last seen {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : 'unknown'}
                        </div>
                        {device.health?.cloudSync && (
                          <div className={`mt-1 text-[9px] sm:text-[10px] ${
                            device.health.cloudSync.status === 'ready'
                              ? 'text-emerald-700'
                              : device.health.cloudSync.status === 'failed'
                              ? 'text-rose-700'
                              : 'text-amber-700'
                          }`}>
                            v{device.health.cloudSync.configVersion} · {device.health.cloudSync.status} · cache {device.health.cloudSync.mediaCached}/{device.health.cloudSync.mediaTotal}
                            {device.health.cloudSync.status === 'failed' && device.health.cloudSync.message
                              ? ` · ${device.health.cloudSync.message}`
                              : ''}
                            {device.status !== 'online' && device.health.cloudSync.status !== 'ready'
                              ? ' · waiting for device to reconnect'
                              : ''}
                          </div>
                        )}
                        {device.health?.cloudSync?.status === 'failed' && (
                          <Button
                            variant="secondary"
                            disabled={retryingDevices.includes(device.deviceId)}
                            onClick={() => void retryDeviceSync(device.deviceId)}
                            className="mt-1 text-[9px] sm:text-[10px]"
                          >
                            <RotateCcw className="mr-1 h-3 w-3" />
                            {retryingDevices.includes(device.deviceId) ? 'Retrying…' : 'Retry sync'}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>


            {/* Cache Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-[10px] sm:text-xs md:text-sm">Cache Settings</CardTitle>
              </CardHeader>
              <CardContent>
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

      <Alert
        isOpen={dialog.isOpen}
        onClose={() => closeDialog(false)}
        title={dialog.title}
        message={dialog.message}
        type={dialog.type}
        showConfirm={dialog.showConfirm}
        confirmText={dialog.confirmText}
        onConfirm={() => closeDialog(true)}
      />

      {historyOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4">
          <section role="dialog" aria-modal="true" className="w-full max-w-xl rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Group configuration history</h2>
              <button type="button" onClick={() => setHistoryOpen(false)} aria-label="Close history">×</button>
            </div>
            {configHistory.length ? (
              <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                {configHistory.map((entry) => (
                  <div key={entry._id || entry.savedAt} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div>
                      <div className="text-sm font-medium">{entry.config?.layout || 'configuration'}</div>
                      <div className="text-xs text-slate-500">{entry.savedAt ? new Date(entry.savedAt).toLocaleString() : 'Saved earlier'}</div>
                    </div>
                    <Button variant="secondary" disabled={saving} onClick={() => void rollbackGroupConfig(entry)} className="shrink-0 text-xs">
                      <RotateCcw className="mr-1 h-3 w-3" />Restore
                    </Button>
                  </div>
                ))}
              </div>
            ) : <p className="py-6 text-center text-sm text-slate-500">No group configuration history yet.</p>}
          </section>
        </div>
      )}
    </div>
  );
};
