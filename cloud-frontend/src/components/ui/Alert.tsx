import { useEffect } from 'react';
import { cn } from '../../utils/cn';

interface AlertProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  onConfirm?: () => void;
  showConfirm?: boolean;
  confirmText?: string;
}

export const Alert = ({
  isOpen,
  onClose,
  title,
  message,
  type = 'info',
  onConfirm,
  showConfirm = false,
  confirmText = 'Confirm',
}: AlertProps) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const typeStyles = {
    success: {
      icon: '✓',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      titleColor: 'text-green-900',
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
    },
    error: {
      icon: '✕',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      titleColor: 'text-red-900',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
    },
    warning: {
      icon: '⚠',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      titleColor: 'text-yellow-900',
      iconBg: 'bg-yellow-100',
      iconColor: 'text-yellow-600',
    },
    info: {
      icon: 'ℹ',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      titleColor: 'text-blue-900',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
    },
  };

  const styles = typeStyles[type];

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Alert Dialog */}
      <div
        className={cn(
          'relative w-full max-w-md rounded-xl border-2 shadow-2xl transition-all',
          styles.bgColor,
          styles.borderColor
        )}
      >
        {/* Icon */}
        <div className="flex justify-center pt-6">
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full',
              styles.iconBg
            )}
          >
            <span className={cn('text-xl font-bold', styles.iconColor)}>
              {styles.icon}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 text-center">
          <h3
            className={cn('mb-2 text-lg font-semibold', styles.titleColor)}
          >
            {title}
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {showConfirm ? 'Cancel' : 'OK'}
          </button>
          {showConfirm && (
            <button
              onClick={handleConfirm}
              className={cn(
                'flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors',
                type === 'error' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
              )}
            >
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
