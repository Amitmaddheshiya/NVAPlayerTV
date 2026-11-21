import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { LayoutGrid } from './LayoutGrid';
import { CloudOrientationPicker } from './CloudOrientationPicker';
import { CloudSectionRatioControl } from './CloudSectionRatioControl';
import { LibraryModal } from './LibraryModal';
import { Settings } from 'lucide-react';

export const cloudConfigDefaults = {
  orientation: 0,
  layout: 'fullscreen',
  grid2Layout: 'horizontal',
  grid3Layout: 'stack-v',
  gridRatio: '1:1:1',
  slideDuration: 5,
  animation: 'slide',
  bgColor: '#000000',
  sections: [
    { id: 1, contentType: 'multimedia' as const, mediaUrls: [] as string[], webUrl: '', youtubeUrl: '', slideDuration: 5 },
    { id: 2, contentType: 'multimedia' as const, mediaUrls: [] as string[], webUrl: '', youtubeUrl: '', slideDuration: 5 },
    { id: 3, contentType: 'multimedia' as const, mediaUrls: [] as string[], webUrl: '', youtubeUrl: '', slideDuration: 5 },
  ],
  ticker: { text: '', color: '#ffffff', bgColor: '#000000', speed: 6, fontSize: 24, position: 'bottom' },
  widgets: {
    clock: { enabled: false, format: '12h', position: 'top-left', transparency: 50, size: 100, textColor: '#38bdf8', bgColor: '#000000' },
    weather: { enabled: false, city: 'Delhi', unit: 'celsius', position: 'top-right', transparency: 50, size: 100, textColor: '#4ade80', bgColor: '#000000' },
    emergencyAlert: { enabled: false, type: 'FIRE', title: 'EMERGENCY ALERT', message: 'PLEASE EVACUATE IMMEDIATELY!', sound: false },
  },
  cache: { videoMB: 2048 },
};

export const getCloudSectionCount = (layout: string) => {
  if (layout === 'fullscreen') return 1;
  if (layout === 'split') return 2;
  if (layout === 'grid') return 3;
  return 1;
};

const makeSection = (id: number) => ({
  id,
  contentType: 'multimedia' as const,
  mediaUrls: [] as string[],
  webUrl: '',
  youtubeUrl: '',
  slideDuration: 5,
});

interface CloudConfigEditorProps {
  config: any;
  setConfig: (updater: any) => void;
  mediaList: any[];
  /** Extra cards rendered in the right column under Cache Settings (e.g. device info). */
  rightExtra?: React.ReactNode;
}

/**
 * Shared cloud configuration editor used by the device detail page and the
 * schedule template editor so both expose identical layout/section/ticker/
 * preview/cache controls.
 */
export const CloudConfigEditor = ({ config, setConfig, mediaList, rightExtra }: CloudConfigEditorProps) => {
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number | null>(null);

  const sectionCount = getCloudSectionCount(config?.layout);
  const tickerFontSize = Math.min(100, Math.max(10, Number(config?.ticker?.fontSize) || 24));

  // Keep sections array in sync with the selected layout.
  useEffect(() => {
    setConfig((prevConfig: any) => {
      const currentSections = Array.isArray(prevConfig?.sections) ? prevConfig.sections : [];
      const newSections = [...currentSections];
      while (newSections.length < sectionCount) {
        newSections.push(makeSection(newSections.length + 1));
      }
      if (newSections.length === currentSections.length) return prevConfig;
      return { ...prevConfig, sections: newSections };
    });
  }, [config?.layout]);

  const updateSection = (sectionId: number, updates: any) => {
    setConfig((prevConfig: any) => ({
      ...prevConfig,
      sections: (prevConfig.sections || []).map((s: any, idx: number) => {
        if (idx === sectionId - 1) {
          const updated: any = { ...s, ...updates };
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

  return (
    <>
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
                const section = config.sections?.[index] || makeSection(index + 1);
                const actualSectionId = index + 1;
                const currentContentType: string = section.contentType;
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
                          Choose Files from Library ({(section.mediaUrls || []).length} selected)
                        </Button>
                        {(section.mediaUrls || []).length > 0 && (
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
                value={config.ticker?.text || ''}
                onChange={(e) => setConfig({ ...config, ticker: { ...(config.ticker || {}), text: e.target.value } })}
                className="text-[10px] sm:text-xs"
              />
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
                <div>
                  <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">Text Color</label>
                  <Input
                    type="color"
                    value={config.ticker?.color || '#ffffff'}
                    onChange={(e) => setConfig({ ...config, ticker: { ...(config.ticker || {}), color: e.target.value } })}
                    className="h-6 sm:h-8 md:h-10"
                  />
                </div>
                <div>
                  <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">Bg Color</label>
                  <Input
                    type="color"
                    value={config.ticker?.bgColor || '#000000'}
                    onChange={(e) => setConfig({ ...config, ticker: { ...(config.ticker || {}), bgColor: e.target.value } })}
                    className="h-6 sm:h-8 md:h-10"
                  />
                </div>
                <div>
                  <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">Speed</label>
                  <Input
                    type="number"
                    value={config.ticker?.speed ?? 6}
                    onChange={(e) => setConfig({ ...config, ticker: { ...(config.ticker || {}), speed: parseInt(e.target.value) } })}
                    min="1"
                    max="20"
                    className="text-[10px] sm:text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] sm:text-xs font-medium text-gray-700 mb-1">Font Size</label>
                  <div className="flex h-8 sm:h-10 items-center justify-between rounded-md border border-gray-300 bg-white">
                    <button type="button" aria-label="Decrease ticker font size" disabled={tickerFontSize <= 10}
                      onClick={() => setConfig({ ...config, ticker: { ...(config.ticker || {}), fontSize: Math.max(10, tickerFontSize - 2) } })}
                      className="h-full px-3 text-lg font-semibold text-gray-700 disabled:opacity-40">−</button>
                    <span className="min-w-10 text-center text-xs font-medium">{tickerFontSize}px</span>
                    <button type="button" aria-label="Increase ticker font size" disabled={tickerFontSize >= 100}
                      onClick={() => setConfig({ ...config, ticker: { ...(config.ticker || {}), fontSize: Math.min(100, tickerFontSize + 2) } })}
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
                    value={config.ticker?.position || 'bottom'}
                    onChange={(e) => setConfig({ ...config, ticker: { ...(config.ticker || {}), position: e.target.value } })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Preview, Cache, extras */}
        <div className="space-y-2 sm:space-y-3">
          <Card>
            <CardHeader className="p-3 sm:p-4">
              <CardTitle className="text-[10px] sm:text-xs md:text-sm">Live TV Preview</CardTitle>
            </CardHeader>
            <CardContent className="p-1.5 sm:p-2">
              <CloudOrientationPicker value={config.orientation} onChange={(orientation) => setConfig({ ...config, orientation })} config={config} mediaList={mediaList} />
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
                value={config.cache?.videoMB ?? 2048}
                onChange={(e) => setConfig({ ...config, cache: { ...(config.cache || {}), videoMB: parseInt(e.target.value) } })}
                min="512"
                max="8192"
                className="text-[10px] sm:text-xs"
              />
            </CardContent>
          </Card>

          {rightExtra}
        </div>
      </div>

      <LibraryModal
        isOpen={libraryModalOpen}
        onClose={() => setLibraryModalOpen(false)}
        onSelect={(selectedUrls) => {
          if (currentSectionIndex !== null) {
            const section = config.sections?.[currentSectionIndex];
            updateSection(currentSectionIndex + 1, { mediaUrls: selectedUrls });
            void section;
          }
        }}
        selectedUrls={currentSectionIndex !== null ? config.sections?.[currentSectionIndex]?.mediaUrls || [] : []}
      />
    </>
  );
};
