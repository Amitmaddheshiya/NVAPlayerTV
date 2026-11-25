import { useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';

/**
 * Sync a single filter value with the URL query string.
 * Back/forward navigation and page refresh preserve the filter.
 * Empty string removes the param.
 */
export const useUrlParam = (key: string, defaultValue = ''): [string, (v: string) => void] => {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(key) ?? defaultValue;

  const setValue = useCallback(
    (v: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (v === '' || v === defaultValue) next.delete(key);
          else next.set(key, v);
          return next;
        },
        { replace: true }
      );
    },
    [key, defaultValue, setSearchParams]
  );

  return [value, setValue];
};

/** Sort state synced to URL (?sort=field&order=asc|desc). */
export const useSortParam = (
  defaultField = '',
  defaultOrder: 'asc' | 'desc' = 'desc'
): { sortBy: string; sortOrder: 'asc' | 'desc'; toggleSort: (field: string) => void } => {
  const [sortBy, setSortBy] = useUrlParam('sort', defaultField);
  const [sortOrderRaw, setSortOrderRaw] = useUrlParam('order', defaultOrder);
  const sortOrder = (sortOrderRaw === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrderRaw(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrderRaw('asc');
    }
  };

  return { sortBy, sortOrder, toggleSort };
};

/** Numeric URL param (page numbers etc). */
export const useUrlNumberParam = (key: string, defaultValue = 1): [number, (v: number) => void] => {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(key);
  const value = raw ? parseInt(raw, 10) || defaultValue : defaultValue;

  const setValue = useCallback(
    (v: number) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (v === defaultValue) next.delete(key);
          else next.set(key, String(v));
          return next;
        },
        { replace: true }
      );
    },
    [key, defaultValue, setSearchParams]
  );

  return [value, setValue];
};
