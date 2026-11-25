import { Download, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';

interface MediaActionsProps {
  url: string;
  onDelete: () => void;
}

/** Shared compact download/delete action buttons for media rows. */
export const MediaActions = ({ url, onDelete }: MediaActionsProps) => (
  <div className="flex gap-0.5">
    <Button
      size="sm"
      variant="secondary"
      onClick={() => window.open(url, '_blank')}
      className="px-2 py-1 text-xs"
    >
      <Download className="w-3 h-3" />
    </Button>
    <Button
      size="sm"
      variant="danger"
      onClick={onDelete}
      className="px-2 py-1 text-xs"
    >
      <Trash2 className="w-3 h-3" />
    </Button>
  </div>
);
