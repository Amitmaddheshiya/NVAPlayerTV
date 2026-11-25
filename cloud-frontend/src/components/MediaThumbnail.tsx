import { useState } from 'react';
import { Image as ImageIcon, Video, FileText, Music } from 'lucide-react';

interface MediaThumbnailProps {
  url: string;
  mimeType: string;
  name: string;
  size?: 'sm' | 'md';
}

const typeIcon = (mimeType: string) => {
  if (mimeType?.startsWith('video')) return <Video className="w-4 h-4 text-gray-400" />;
  if (mimeType?.startsWith('audio')) return <Music className="w-4 h-4 text-gray-400" />;
  if (mimeType?.startsWith('image')) return <ImageIcon className="w-4 h-4 text-gray-400" />;
  return <FileText className="w-4 h-4 text-gray-400" />;
};

/** Small preview thumb: real image for image/* files, type icon otherwise. */
export const MediaThumbnail = ({ url, mimeType, name, size = 'sm' }: MediaThumbnailProps) => {
  const [failed, setFailed] = useState(false);
  const dim = size === 'md' ? 'w-12 h-12' : 'w-9 h-9';
  const isImage = mimeType?.startsWith('image/') && !failed;

  return (
    <div className={`${dim} rounded-md overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0`}>
      {isImage ? (
        <img
          src={url}
          alt={name}
          loading="lazy"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        typeIcon(mimeType)
      )}
    </div>
  );
};
