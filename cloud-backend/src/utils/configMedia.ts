/** Count Cloud media placements in a base config and its schedule profiles. */
export const countConfiguredMedia = (config: any): number => {
  const countSections = (sections: any): number =>
    (Array.isArray(sections) ? sections : []).reduce((total: number, section: any) =>
      total + (section?.contentType === 'multimedia' && Array.isArray(section?.mediaUrls) ? section.mediaUrls.length : 0), 0);

  return countSections(config?.sections) +
    (Array.isArray(config?.schedule?.profiles) ? config.schedule.profiles : []).reduce(
      (total: number, profile: any) => total + countSections(profile?.config?.sections), 0);
};

/**
 * All media URLs referenced by a config: multimedia section mediaUrls, the
 * legacy top-level mediaUrls field, and every schedule profile's config
 * (recursively). Used to keep Media.assignedDevices complete.
 */
export const getConfiguredMediaUrls = (config: any): Set<string> => {
  const urls = new Set<string>();
  const addUrl = (url: any) => {
    const value = String(url || '').trim();
    if (value) urls.add(value);
  };
  const collect = (cfg: any) => {
    if (!cfg || typeof cfg !== 'object') return;
    if (Array.isArray(cfg.mediaUrls)) cfg.mediaUrls.forEach(addUrl);
    for (const section of Array.isArray(cfg.sections) ? cfg.sections : []) {
      if (section?.contentType === 'multimedia' && Array.isArray(section.mediaUrls)) {
        section.mediaUrls.forEach(addUrl);
      }
    }
    for (const profile of Array.isArray(cfg.schedule?.profiles) ? cfg.schedule.profiles : []) {
      collect(profile?.config);
    }
  };
  collect(config);
  return urls;
};

/** Sum unique Cloud media bytes across the base playlist and schedule profiles. */
export const getConfiguredMediaBytes = (config: any): number => {
  const sizes = new Map<string, number>();
  const collect = (sections: any) => {
    for (const section of Array.isArray(sections) ? sections : []) {
      if (section?.contentType !== 'multimedia' || !Array.isArray(section.mediaUrls)) continue;
      for (const url of section.mediaUrls) {
        const key = String(url || '').split(/[?#]/, 1)[0];
        if (!key) continue;
        const metadata = Array.isArray(section.mediaItems)
          ? section.mediaItems.find((item: any) => String(item?.url || '').split(/[?#]/, 1)[0] === key)
          : null;
        sizes.set(key, Math.max(sizes.get(key) || 0, Number(metadata?.size || 0)));
      }
    }
  };

  collect(config?.sections);
  for (const profile of Array.isArray(config?.schedule?.profiles) ? config.schedule.profiles : []) {
    collect(profile?.config?.sections);
  }
  return [...sizes.values()].reduce((total, size) => total + size, 0);
};
