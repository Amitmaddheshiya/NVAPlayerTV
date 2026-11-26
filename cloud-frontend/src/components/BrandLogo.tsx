import { useEffect, useState } from 'react';
import { brandingAPI } from '../services/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Module-level cache so every layout/page shares one branding fetch per session.
let cachedLogoUrl: string | null | undefined;
let cachedPublicLogoUrl: string | null | undefined;
let inflight: Promise<string | null> | null = null;
let inflightPublic: Promise<string | null> | null = null;

const fetchLogoUrl = (publicOnly = false): Promise<string | null> => {
  if (publicOnly) {
    if (cachedPublicLogoUrl !== undefined) return Promise.resolve(cachedPublicLogoUrl);
    if (!inflightPublic) {
      inflightPublic = brandingAPI.getPublicBranding()
        .then((res) => {
          cachedPublicLogoUrl = res.data?.logoUrl || null;
          return cachedPublicLogoUrl;
        })
        .catch(() => {
          cachedPublicLogoUrl = null;
          return null;
        })
        .finally(() => { inflightPublic = null; });
    }
    return inflightPublic;
  }
  if (cachedLogoUrl !== undefined) return Promise.resolve(cachedLogoUrl);
  if (!inflight) {
    inflight = brandingAPI.getBranding()
      .then((res) => {
        cachedLogoUrl = res.data?.logoUrl || null;
        return cachedLogoUrl;
      })
      .catch(() => {
        cachedLogoUrl = null;
        return null;
      })
      .finally(() => { inflight = null; });
  }
  return inflight;
};

/** Call after uploading/removing a logo so the next render refetches. */
export const invalidateBrandingCache = () => { cachedLogoUrl = undefined; };

interface BrandLogoProps {
  /** Text shown when no logo is configured (e.g. "Admin CMS"). */
  fallback: string;
  className?: string;
  /** Use the unauthenticated global-logo endpoint (login page etc.). */
  publicOnly?: boolean;
}

/**
 * Sidebar/header brand mark: shows the resolved white-label logo (dealer logo
 * → global logo) when configured, otherwise the plain text fallback.
 */
export const BrandLogo = ({ fallback, className = '', publicOnly = false }: BrandLogoProps) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(publicOnly ? null : (cachedLogoUrl ?? null));

  useEffect(() => {
    let alive = true;
    fetchLogoUrl(publicOnly).then((url) => { if (alive) setLogoUrl(url); });
    return () => { alive = false; };
  }, [publicOnly]);

  if (logoUrl) {
    return (
      <span className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 via-yellow-200 to-sky-300 p-[2.5px] shadow-[0_0_16px_rgba(251,191,36,0.4),inset_0_1px_0_rgba(255,255,255,0.6)]">
        <span className="flex h-12 w-44 items-center justify-center rounded-[13px] bg-gradient-to-b from-gray-800 to-gray-950 px-3 ring-1 ring-white/10">
          <img
            src={`${API_URL}/branding/${logoUrl}`}
            alt={fallback}
            className="max-h-full max-w-full object-contain drop-shadow-[0_0_6px_rgba(255,255,255,0.15)]"
            onError={() => setLogoUrl(null)}
          />
        </span>
      </span>
    );
  }
  return <span className={className}>{fallback}</span>;
};
