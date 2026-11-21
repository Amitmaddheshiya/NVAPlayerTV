import type { ReactNode } from 'react';
import { normalizeCloudGridRatio } from './CloudSectionRatioControl';

type CloudOrientationPickerProps = {
  value: unknown;
  onChange: (degrees: number) => void;
  config: any;
  mediaList?: any[];
};

export const normalizeCloudOrientation = (value: unknown) => {
  const legacy: Record<string, number> = {
    horizontal: 0,
    vertical: 90,
    'reverse-horizontal': 180,
    'reverse-vertical': 270,
  };
  const parsed = typeof value === 'number' ? value : Number(value);
  const degrees = Number.isFinite(parsed) ? parsed : legacy[String(value)] ?? 0;
  return ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;
};

export const CloudOrientationPicker = ({ value, onChange, config, mediaList = [] }: CloudOrientationPickerProps) => {
  const degrees = normalizeCloudOrientation(value);
  const quarterTurn = degrees === 90 || degrees === 270;
  const layout = config?.layout || 'fullscreen';
  const sections = Array.isArray(config?.sections) ? config.sections : [];
  const sectionCount = layout === 'grid' ? 3 : layout === 'split' ? 2 : 1;
  const weightsFor = (count: number) => {
    return normalizeCloudGridRatio(layout, config?.grid3Layout, config?.gridRatio).split(':').map(Number).slice(0, count);
  };
  const ticker = config?.ticker || {};
  const sectionView = (index: number, flex = 1) => {
    const section = sections[index] || {};
    const mediaCount = Array.isArray(section.mediaUrls) ? section.mediaUrls.length : 0;
    const firstMediaUrl = section.mediaUrls?.[0];
    const previewMedia = mediaList.find((media) => media.url === firstMediaUrl);
    const contentDetail = section.contentType === 'web'
      ? section.webUrl
      : section.contentType === 'youtube'
      ? section.youtubeUrl
      : previewMedia?.originalName || previewMedia?.filename || String(firstMediaUrl || '').split('/').pop()?.split('?')[0];
    return (
      <div key={index} style={{ flex }} className="relative flex min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded-sm border border-white/15 bg-gradient-to-br from-sky-900 via-slate-800 to-indigo-950 px-1 text-center text-white">
        {previewMedia?.mimeType?.startsWith('image/') && (
          <img src={previewMedia.url} alt="Selected media preview" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
        )}
        {previewMedia?.mimeType?.startsWith('video/') && <span className="absolute z-10 rounded border border-white/30 bg-black/50 px-2 py-1 text-[7px] font-bold tracking-widest">VIDEO PREVIEW</span>}
        <span className="relative z-10 text-[7px] font-bold uppercase tracking-wide text-sky-200">Section {index + 1}</span>
        <span className="relative z-10 mt-0.5 max-w-full truncate rounded bg-black/50 px-1 text-[8px] font-semibold">
          {section.contentType === 'web' ? 'Website' : section.contentType === 'youtube' ? 'YouTube' : mediaCount ? `${mediaCount} media file${mediaCount === 1 ? '' : 's'}` : 'Media preview'}
        </span>
        {contentDetail && <span className="relative z-10 mt-0.5 max-w-full truncate text-[6px] text-white/80">{contentDetail}</span>}
        {section.contentType === 'multimedia' && (
          <span className="relative z-10 mt-0.5 text-[6px] text-slate-200">Slide {Number(section.slideDuration || config?.slideDuration || 5)} sec</span>
        )}
      </div>
    );
  };

  let contentLayout: ReactNode;
  if (layout === 'fullscreen') {
    contentLayout = sectionView(0);
  } else if (layout === 'split') {
    const weights = weightsFor(2);
    contentLayout = (
      <div className={`flex min-h-0 min-w-0 flex-1 gap-[2px] ${config?.grid2Layout === 'vertical' ? 'flex-col' : 'flex-row'}`}>
        {Array.from({ length: sectionCount }, (_, index) => sectionView(index, weights[index]))}
      </div>
    );
  } else if (config?.grid3Layout === 'stack-h') {
    const weights = weightsFor(3);
    contentLayout = <div className="flex min-h-0 min-w-0 flex-1 flex-row gap-[2px]">{Array.from({ length: 3 }, (_, index) => sectionView(index, weights[index]))}</div>;
  } else if (config?.grid3Layout === 'top-two-bottom-one') {
    const weights = weightsFor(2);
    contentLayout = (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-[2px]">
        <div style={{ flex: weights[0] }} className="flex min-h-0 gap-[2px]">{sectionView(0)}{sectionView(1)}</div>
        {sectionView(2, weights[1])}
      </div>
    );
  } else if (config?.grid3Layout === 'top-one-bottom-two') {
    const weights = weightsFor(2);
    contentLayout = (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-[2px]">
        {sectionView(0, weights[0])}
        <div style={{ flex: weights[1] }} className="flex min-h-0 gap-[2px]">{sectionView(1)}{sectionView(2)}</div>
      </div>
    );
  } else {
    const weights = weightsFor(3);
    contentLayout = <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-[2px]">{Array.from({ length: 3 }, (_, index) => sectionView(index, weights[index]))}</div>;
  }
  const tickerBar = ticker.text ? (
    <div className="z-10 shrink-0 overflow-hidden whitespace-nowrap px-1 py-0.5" style={{ backgroundColor: ticker.bgColor || '#000000', color: ticker.color || '#ffffff', fontSize: `${Math.min(16, Math.max(6, Number(ticker.fontSize || 24) * 0.4))}px` }}>
      <span className="inline-block font-semibold" style={{ animation: `cloud-preview-scroll ${Math.max(2, 12 - Number(ticker.speed || 6) * 0.45)}s linear infinite` }}>{ticker.text}</span>
    </div>
  ) : null;

  return (
    <div>
      <div className="grid grid-cols-4 gap-2" role="group" aria-label="Screen rotation">
        {[0, 90, 180, 270].map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={degrees === option}
            onClick={() => onChange(option)}
            className={`rounded-md border px-2 py-2 text-[10px] sm:text-xs font-medium ${degrees === option ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            {option}°
          </button>
        ))}
      </div>
      <p className="mt-1 text-[9px] text-gray-500">Live preview · changes update as you edit settings below.</p>
      <style>{'@keyframes cloud-preview-scroll { from { transform: translateX(100%); } to { transform: translateX(-100%); } }'}</style>
      <div
        className={`relative mx-auto mt-2 flex items-center justify-center overflow-hidden rounded-lg bg-slate-100 ${quarterTurn ? 'h-52 sm:h-56' : 'h-36 sm:h-40'}`}
        style={{ aspectRatio: quarterTurn ? '9 / 16' : '16 / 9' }}
        aria-live="polite"
      >
        <div
          className="relative flex-shrink-0 overflow-hidden rounded-xl border-[5px] border-gray-800 bg-black p-1 shadow-xl transition-transform duration-300 ease-in-out"
          style={{
            width: quarterTurn ? '177.7778%' : '100%',
            height: quarterTurn ? '56.25%' : '100%',
            boxSizing: 'border-box',
            transform: `rotate(${degrees}deg)`,
          }}
          aria-label={`TV preview rotated ${degrees} degrees`}
        >
          <div className="flex h-full w-full flex-col overflow-hidden rounded-sm p-[2px]" style={{ backgroundColor: config?.bgColor || '#000000' }}>
            {ticker.text && ticker.position === 'top' && (
              tickerBar
            )}
            {contentLayout}
            {ticker.text && ticker.position !== 'top' && (
              tickerBar
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
