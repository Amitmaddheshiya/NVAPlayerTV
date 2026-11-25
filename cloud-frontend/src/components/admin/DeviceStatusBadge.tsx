import { Wifi, WifiOff } from 'lucide-react';

interface DeviceStatusBadgeProps {
  displayStatus?: string;
  className?: string;
}

/** Shared device status badge (online / 30D+ / offline) used across admin pages. */
export const DeviceStatusBadge = ({ displayStatus, className = '' }: DeviceStatusBadgeProps) => {
  if (displayStatus === 'online') {
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800 whitespace-nowrap ${className}`}>
        <Wifi className="w-2.5 h-2.5 mr-1" />
        Online
      </span>
    );
  }
  if (displayStatus === '30D+') {
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-800 whitespace-nowrap ${className}`}>
        <WifiOff className="w-2.5 h-2.5 mr-1" />
        30D+
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800 whitespace-nowrap ${className}`}>
      <WifiOff className="w-2.5 h-2.5 mr-1" />
      Offline
    </span>
  );
};
