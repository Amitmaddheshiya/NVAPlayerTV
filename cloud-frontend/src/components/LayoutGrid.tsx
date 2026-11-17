import React from 'react';

interface LayoutGridProps {
  layout: 'fullscreen' | 'split' | 'grid';
  grid2Layout?: 'horizontal' | 'vertical';
  grid3Layout?: 'stack-v' | 'stack-h' | 'top-two-bottom-one' | 'top-one-bottom-two';
  onSelectLayout: (layout: string) => void;
  onSelectGrid2Layout: (layout: string) => void;
  onSelectGrid3Layout: (layout: string) => void;
}

export const LayoutGrid: React.FC<LayoutGridProps> = ({
  layout,
  grid2Layout = 'horizontal',
  grid3Layout = 'stack-v',
  onSelectLayout,
  onSelectGrid2Layout,
  onSelectGrid3Layout,
}) => {
  return (
    <div className="space-y-2 sm:space-y-3 [&_span]:hidden [&_.aspect-video]:min-w-0 [&_.aspect-video]:overflow-hidden [&_.aspect-video_*]:min-w-0 [&_.aspect-video_*]:overflow-hidden">
      {/* Layout Options */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 justify-items-center">
        {/* Fullscreen */}
        <div
          onClick={() => onSelectLayout('fullscreen')}
          className={`w-full max-w-[120px] min-w-0 cursor-pointer border-2 rounded-lg p-1.5 sm:p-2 transition-all ${
            layout === 'fullscreen' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <div className="w-full aspect-video bg-gray-200 rounded mb-1 sm:mb-2">
            <div className="w-full h-full flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
              Fullscreen
            </div>
          </div>
          <div className="text-center text-xs sm:text-sm font-medium">Fullscreen</div>
        </div>

        {/* 2 Section */}
        <div
          onClick={() => onSelectLayout('split')}
          className={`w-full max-w-[120px] min-w-0 cursor-pointer border-2 rounded-lg p-1.5 sm:p-2 transition-all ${
            layout === 'split' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <div className="w-full aspect-video bg-gray-200 rounded mb-1 sm:mb-2 p-1 sm:p-2 gap-1 sm:gap-2 flex">
            <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
              <span className="hidden xl:inline">Section </span>1
            </div>
            <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
              <span className="hidden xl:inline">Section </span>2
            </div>
          </div>
          <div className="text-center text-xs sm:text-sm font-medium">2 Section</div>
        </div>

        {/* 3 Section */}
        <div
          onClick={() => onSelectLayout('grid')}
          className={`w-full max-w-[120px] min-w-0 cursor-pointer border-2 rounded-lg p-1.5 sm:p-2 transition-all ${
            layout === 'grid' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <div className="w-full aspect-video bg-gray-200 rounded mb-1 sm:mb-2 p-1 sm:p-2 gap-1 sm:gap-2 flex">
            <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
              <span className="hidden xl:inline">Section </span>1
            </div>
            <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
              <span className="hidden xl:inline">Section </span>2
            </div>
            <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
              <span className="hidden xl:inline">Section </span>3
            </div>
          </div>
          <div className="text-center text-xs sm:text-sm font-medium">3 Section</div>
        </div>
      </div>

      {/* Grid Layout Options for 2 Section */}
      {layout === 'split' && (
        <div className="mt-4">
          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Grid Layout Style</label>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 justify-items-center">
            {/* Horizontal */}
            <div
              onClick={() => onSelectGrid2Layout('horizontal')}
              className={`w-full max-w-[160px] min-w-0 cursor-pointer border-2 rounded-lg p-1.5 sm:p-2 transition-all ${
                grid2Layout === 'horizontal' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="w-full aspect-video bg-gray-200 rounded mb-1 sm:mb-2 p-1 sm:p-2 gap-1 sm:gap-2 flex">
                <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
                  <span className="hidden xl:inline">Section </span>1
                </div>
                <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
                  <span className="hidden xl:inline">Section </span>2
                </div>
              </div>
              <div className="text-center text-xs sm:text-sm font-medium">Horizontal</div>
            </div>

            {/* Vertical */}
            <div
              onClick={() => onSelectGrid2Layout('vertical')}
              className={`w-full max-w-[160px] min-w-0 cursor-pointer border-2 rounded-lg p-1.5 sm:p-2 transition-all ${
                grid2Layout === 'vertical' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="w-full aspect-video bg-gray-200 rounded mb-1 sm:mb-2 p-1 sm:p-2 gap-1 sm:gap-2 flex flex-col">
                <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
                  <span className="hidden xl:inline">Section </span>1
                </div>
                <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
                  <span className="hidden xl:inline">Section </span>2
                </div>
              </div>
              <div className="text-center text-xs sm:text-sm font-medium">Vertical</div>
            </div>
          </div>
        </div>
      )}

      {/* Grid Layout Options for 3 Section */}
      {layout === 'grid' && (
        <div className="mt-4">
          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Grid Layout Style</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 justify-items-center">
            {/* Stack Vertical */}
            <div
              onClick={() => onSelectGrid3Layout('stack-v')}
              className={`w-full max-w-[160px] min-w-0 cursor-pointer border-2 rounded-lg p-1.5 sm:p-2 transition-all ${
                grid3Layout === 'stack-v' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="w-full aspect-video bg-gray-200 rounded mb-1 sm:mb-2 p-1 sm:p-2 gap-1 sm:gap-2 flex flex-col">
                <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
                  <span className="hidden xl:inline">Section </span>1
                </div>
                <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
                  <span className="hidden xl:inline">Section </span>2
                </div>
                <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
                  <span className="hidden xl:inline">Section </span>3
                </div>
              </div>
              <div className="text-center text-xs sm:text-sm font-medium">Stack Vertical</div>
            </div>

            {/* Stack Horizontal */}
            <div
              onClick={() => onSelectGrid3Layout('stack-h')}
              className={`w-full max-w-[160px] min-w-0 cursor-pointer border-2 rounded-lg p-1.5 sm:p-2 transition-all ${
                grid3Layout === 'stack-h' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="w-full aspect-video bg-gray-200 rounded mb-1 sm:mb-2 p-1 sm:p-2 gap-1 sm:gap-2 flex">
                <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
                  <span className="hidden xl:inline">Section </span>1
                </div>
                <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
                  <span className="hidden xl:inline">Section </span>2
                </div>
                <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
                  <span className="hidden xl:inline">Section </span>3
                </div>
              </div>
              <div className="text-center text-xs sm:text-sm font-medium">Stack Horizontal</div>
            </div>

            {/* Top 2 / Bottom 1 */}
            <div
              onClick={() => onSelectGrid3Layout('top-two-bottom-one')}
              className={`w-full max-w-[160px] min-w-0 cursor-pointer border-2 rounded-lg p-1.5 sm:p-2 transition-all ${
                grid3Layout === 'top-two-bottom-one' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="w-full aspect-video bg-gray-200 rounded mb-1 sm:mb-2 p-1 sm:p-2 gap-1 sm:gap-2 flex flex-col">
                <div className="flex-1 gap-1 sm:gap-2 flex">
                  <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
                    <span className="hidden xl:inline">Section </span>1
                  </div>
                  <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
                    <span className="hidden xl:inline">Section </span>2
                  </div>
                </div>
                <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
                  <span className="hidden xl:inline">Section </span>3
                </div>
              </div>
              <div className="text-center text-xs sm:text-sm font-medium">Top 2 / Bottom 1</div>
            </div>

            {/* Top 1 / Bottom 2 */}
            <div
              onClick={() => onSelectGrid3Layout('top-one-bottom-two')}
              className={`w-full max-w-[160px] min-w-0 cursor-pointer border-2 rounded-lg p-1.5 sm:p-2 transition-all ${
                grid3Layout === 'top-one-bottom-two' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="w-full aspect-video bg-gray-200 rounded mb-1 sm:mb-2 p-1 sm:p-2 gap-1 sm:gap-2 flex flex-col">
                <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
                  <span className="hidden xl:inline">Section </span>1
                </div>
                <div className="flex-1 gap-1 sm:gap-2 flex">
                  <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
                    <span className="hidden xl:inline">Section </span>2
                  </div>
                  <div className="flex-1 bg-gray-300 rounded flex items-center justify-center text-gray-500 text-[10px] sm:text-xs">
                    <span className="hidden xl:inline">Section </span>3
                  </div>
                </div>
              </div>
              <div className="text-center text-xs sm:text-sm font-medium">Top 1 / Bottom 2</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
