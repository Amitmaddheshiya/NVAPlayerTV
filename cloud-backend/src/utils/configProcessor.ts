import Media from '../models/Media';
import env from '../config/env';
import { getMediaPathFromUrl } from './mediaUrl';

export interface ProcessedConfigResult {
  config?: any;
  mediaDocs: any[];
  mediaPaths: string[];
  error?: string;
  status?: number;
}

/**
 * Validates media ownership/existence and converts a submitted cloud config into
 * the stored device config shape: absolute media URLs, per-section mediaItems
 * metadata, cleaned irrelevant fields and the legacy top-level mediaUrls.
 * Shared by device config saves, group config saves and schedule templates.
 */
export const processConfigForStorage = async (
  submittedConfig: any,
  ownerId?: string
): Promise<ProcessedConfigResult> => {
  const config = JSON.parse(JSON.stringify(submittedConfig || {}));

  const configuredMediaUrls: string[] = (Array.isArray(config.sections) ? config.sections : [])
    .flatMap((section: any) => section?.contentType === 'multimedia' && Array.isArray(section.mediaUrls) ? section.mediaUrls : [])
    .map((value: any) => getMediaPathFromUrl(String(value ?? '')))
    .filter((path: string | null): path is string => !!path);
  const uniqueMediaPaths: string[] = [...new Set(configuredMediaUrls)];
  const mediaDocs = uniqueMediaPaths.length
    ? await Media.find({ path: { $in: uniqueMediaPaths } }).select('path originalName filename mimeType size hash updatedAt createdAt uploadedBy').lean()
    : [];
  if (mediaDocs.length !== uniqueMediaPaths.length) {
    return { mediaDocs: [], mediaPaths: uniqueMediaPaths, error: 'Configuration contains a media file that no longer exists', status: 400 };
  }
  if (ownerId && mediaDocs.some((media: any) => media.uploadedBy?.toString() !== String(ownerId))) {
    return { mediaDocs: [], mediaPaths: uniqueMediaPaths, error: 'Configuration can only use media uploaded to your account', status: 403 };
  }
  const mediaByPath = new Map(mediaDocs.map((media: any) => [String(media.path), media]));

  if (config.sections && Array.isArray(config.sections)) {
    config.sections = config.sections.map((section: any) => {
      const cleaned = { ...section };

      if (cleaned.contentType === 'multimedia') {
        cleaned.webUrl = '';
        cleaned.youtubeUrl = '';
        if (cleaned.mediaUrls && Array.isArray(cleaned.mediaUrls)) {
          const absoluteUrls = cleaned.mediaUrls.map((url: string) => {
            if (url.startsWith('/api/media/file/')) {
              return `${env.SERVER_URL}${url}`;
            }
            return url;
          });
          cleaned.mediaUrls = absoluteUrls;
          cleaned.mediaItems = absoluteUrls.map((url: string) => {
            const mediaPath = getMediaPathFromUrl(url);
            const media: any = mediaPath ? mediaByPath.get(mediaPath) : null;
            return media ? {
              url,
              name: media.filename || media.originalName,
              originalName: media.originalName,
              type: media.mimeType,
              size: Number(media.size || 0),
              hash: media.hash,
              mtimeMs: Number(media.updatedAt?.getTime?.() || media.createdAt?.getTime?.() || 0),
            } : { url };
          });
        }
      } else if (cleaned.contentType === 'web') {
        cleaned.mediaUrls = [];
        cleaned.youtubeUrl = '';
      } else if (cleaned.contentType === 'youtube') {
        cleaned.mediaUrls = [];
        cleaned.webUrl = '';
      }

      return cleaned;
    });

    if (config.layout === 'fullscreen' && config.sections.length > 0) {
      const firstSection = config.sections[0];
      config.mediaUrls = firstSection.contentType === 'multimedia' && firstSection.mediaUrls ? firstSection.mediaUrls : [];
    } else {
      config.mediaUrls = [];
    }
  } else {
    config.mediaUrls = [];
  }

  if (config.grid2Layout) {
    config.grid2Layout = config.grid2Layout;
  }

  return { config, mediaDocs, mediaPaths: uniqueMediaPaths };
};
