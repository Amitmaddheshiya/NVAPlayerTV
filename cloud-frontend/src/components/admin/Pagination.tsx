import { Button } from '../ui/Button';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  total: number;
  perPage: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}

/** Shared prev/next pagination bar used across admin tables. */
export const Pagination = ({ currentPage, totalPages, total, perPage, onPageChange, itemLabel = 'items' }: PaginationProps) => {
  if (total <= perPage) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-2 sm:px-3 py-2 sm:py-3 border-t">
      <div className="text-xs text-gray-600">
        Showing {(currentPage - 1) * perPage + 1} to {Math.min(currentPage * perPage, total)} of {total} {itemLabel}
      </div>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="text-xs"
        >
          Previous
        </Button>
        <span className="text-xs text-gray-600 flex items-center px-2">
          {currentPage} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="text-xs"
        >
          Next
        </Button>
      </div>
    </div>
  );
};
