import { useEffect, useState } from 'react';
import { mediaAPI } from '../services/api';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { X, Search, Image, Video, FileText, Check } from 'lucide-react';

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selectedUrls: string[]) => void;
  selectedUrls?: string[];
}

export const LibraryModal = ({ isOpen, onClose, onSelect, selectedUrls = [] }: LibraryModalProps) => {
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [filteredMedia, setFilteredMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [tempSelectedUrls, setTempSelectedUrls] = useState<string[]>(selectedUrls);

  useEffect(() => {
    if (isOpen) {
      loadMedia();
      setTempSelectedUrls(selectedUrls);
    }
  }, [isOpen, selectedUrls]);

  useEffect(() => {
    let filtered = mediaList;

    if (typeFilter !== 'all') {
      filtered = filtered.filter((m) => {
        if (typeFilter === 'image') return m.mimeType?.startsWith('image/');
        if (typeFilter === 'video') return m.mimeType?.startsWith('video/');
        return true;
      });
    }

    if (searchTerm) {
      filtered = filtered.filter((m) =>
        m.originalName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredMedia(filtered);
  }, [mediaList, searchTerm, typeFilter]);

  const loadMedia = async () => {
    try {
      setLoading(true);
      const response = await mediaAPI.getMedia({ page: 1, limit: 1000 });
      const mediaData = response.data.data || response.data;
      setMediaList(Array.isArray(mediaData) ? mediaData : []);
    } catch (error) {
      console.error('Failed to load media:', error);
      setMediaList([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (url: string) => {
    setTempSelectedUrls((prev) =>
      prev.includes(url)
        ? prev.filter((u) => u !== url)
        : [...prev, url]
    );
  };

  const handleConfirm = () => {
    onSelect(tempSelectedUrls);
    onClose();
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType?.startsWith('image/')) return <Image className="w-5 h-5 text-blue-500" />;
    if (mimeType?.startsWith('video/')) return <Video className="w-5 h-5 text-green-500" />;
    return <FileText className="w-5 h-5 text-gray-500" />;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-lg w-full max-w-[95vw] sm:max-w-4xl max-h-[90vh] sm:max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-2 sm:p-3 md:p-4 border-b">
          <h2 className="text-sm sm:text-base md:text-lg lg:text-xl font-bold">Select Files from Library</h2>
          <Button variant="secondary" size="sm" onClick={onClose}>
            <X className="w-3 h-3 sm:w-4 sm:h-4" />
          </Button>
        </div>

        {/* Search & Filter */}
        <div className="p-2 sm:p-3 md:p-4 border-b flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="w-full sm:w-48 md:w-64 lg:w-80 relative">
            <Search className="absolute left-2.5 sm:left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
            <Input
              placeholder="Search files..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 sm:pl-10 text-[10px] sm:text-xs"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-2 sm:px-3 py-1.5 sm:py-2 border rounded-lg text-[10px] sm:text-xs md:text-sm w-full sm:w-auto"
          >
            <option value="all">All Types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
          </select>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-3 md:p-4">
          {loading ? (
            <div className="text-center py-4 sm:py-6 md:py-8 text-[10px] sm:text-xs">Loading...</div>
          ) : filteredMedia.length === 0 ? (
            <div className="text-center py-4 sm:py-6 md:py-8 text-gray-500 text-[10px] sm:text-xs">No files found</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
              {filteredMedia.map((media) => {
                const isSelected = tempSelectedUrls.includes(media.url);
                return (
                  <div
                    key={media._id}
                    onClick={() => toggleSelection(media.url)}
                    className={`relative p-2 sm:p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2 bg-blue-500 text-white rounded-full p-0.5 sm:p-1">
                        <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      </div>
                    )}
                    <div className="flex items-center justify-center mb-1.5 sm:mb-2 h-16 sm:h-20 bg-gray-100 rounded">
                      {getFileIcon(media.mimeType)}
                    </div>
                    <div className="text-[10px] sm:text-xs font-medium truncate" title={media.originalName}>
                      {media.originalName}
                    </div>
                    <div className="text-[9px] sm:text-[10px] text-gray-500">
                      {(media.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-2 sm:p-3 md:p-4 border-t gap-2 sm:gap-0">
          <div className="text-[10px] sm:text-xs md:text-sm text-gray-600">
            {tempSelectedUrls.length} file(s) selected
          </div>
          <div className="flex gap-1.5 sm:gap-2 w-full sm:w-auto">
            <Button variant="secondary" onClick={onClose} className="text-[10px] sm:text-xs flex-1 sm:flex-none">
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={tempSelectedUrls.length === 0} className="text-[10px] sm:text-xs flex-1 sm:flex-none">
              Confirm Selection
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
