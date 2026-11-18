type CloudSectionRatioControlProps = {
  layout: string;
  grid2Layout?: string;
  grid3Layout?: string;
  value?: string;
  onChange: (ratio: string) => void;
};

const getRatioCount = (layout: string, grid3Layout?: string) =>
  layout === 'split' || (layout === 'grid' && (grid3Layout === 'top-two-bottom-one' || grid3Layout === 'top-one-bottom-two')) ? 2 : 3;

export const normalizeCloudGridRatio = (layout: string, grid3Layout: string | undefined, value: string | undefined) => {
  const count = getRatioCount(layout, grid3Layout);
  const parsed = String(value || '').split(':').map((part) => Number(part));
  const weights = parsed.length !== count || parsed.some((part) => !Number.isFinite(part) || part <= 0)
    ? Array.from({ length: count }, () => 1)
    : parsed.map((part) => Math.min(100, Math.max(1, Math.round(part))));
  return weights.join(':');
};

export const CloudSectionRatioControl = ({ layout, grid2Layout, grid3Layout, value, onChange }: CloudSectionRatioControlProps) => {
  if (layout === 'fullscreen') return null;

  const isGroupedGrid3 = layout === 'grid' && (grid3Layout === 'top-two-bottom-one' || grid3Layout === 'top-one-bottom-two');
  const count = getRatioCount(layout, grid3Layout);
  const weights = normalizeCloudGridRatio(layout, grid3Layout, value).split(':').map(Number);
  const presets = count === 2
    ? [[1, 4], [1, 3], [1, 2], [1, 1], [2, 1], [3, 1], [4, 1]]
    : [[1, 1, 1], [2, 1, 1], [1, 2, 1], [1, 1, 2], [2, 1, 2], [1, 2, 2], [2, 2, 1], [3, 1, 1], [1, 1, 3]];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const ratioName = layout === 'split'
    ? grid2Layout === 'vertical' ? 'Section height ratio' : 'Section width ratio'
    : isGroupedGrid3 ? 'Top area : bottom area ratio' : 'Section ratio';
  const updateWeight = (index: number, nextWeight: number) => {
    const next = [...weights];
    next[index] = Math.min(100, Math.max(1, Math.round(nextWeight)));
    onChange(next.join(':'));
  };

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-2 sm:p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] sm:text-xs font-semibold text-gray-800">{ratioName}</div>
          <div className="text-[9px] sm:text-[10px] text-gray-500">Choose a preset or adjust custom weights (1–100).</div>
        </div>
        <span className="rounded bg-white px-2 py-1 text-[9px] sm:text-[10px] font-mono text-gray-700">{weights.join(' : ')}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets.map((preset) => {
          const selected = preset.every((weight, index) => weights[index] === weight);
          return (
            <button key={preset.join(':')} type="button" aria-pressed={selected} onClick={() => onChange(preset.join(':'))}
              className={`rounded border px-2 py-1 text-[9px] sm:text-[10px] ${selected ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`}>
              {preset.join(':')}
            </button>
          );
        })}
      </div>

      <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
        {weights.map((weight, index) => {
          const label = isGroupedGrid3 ? (index === 0 ? 'Top area' : 'Bottom area') : `Section ${index + 1}`;
          return (
            <label key={index} className="min-w-0 text-[9px] sm:text-[10px] text-gray-600">
              <span className="flex justify-between gap-1"><span className="truncate">{label}</span><span>{Math.round((weight / total) * 100)}%</span></span>
              <input type="number" min="1" max="100" value={weight} aria-label={`${label} ratio weight`}
                onChange={(event) => updateWeight(index, Number(event.target.value) || 1)}
                className="mt-1 h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-800" />
            </label>
          );
        })}
      </div>
    </div>
  );
};
