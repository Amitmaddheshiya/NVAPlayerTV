import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

interface SortableThProps {
  label: string;
  field: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
  className?: string;
}

export const SortableTh = ({ label, field, sortBy, sortOrder, onSort, className = '' }: SortableThProps) => {
  const active = sortBy === field;
  return (
    <th
      className={`cursor-pointer select-none hover:text-gray-700 transition-colors ${className}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          sortOrder === 'asc' ? (
            <ArrowUp className="w-3 h-3 text-blue-600" />
          ) : (
            <ArrowDown className="w-3 h-3 text-blue-600" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 text-gray-300" />
        )}
      </span>
    </th>
  );
};
