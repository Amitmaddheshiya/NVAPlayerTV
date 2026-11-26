import { Shield, ShieldAlert } from 'lucide-react';

/**
 * Account-origin badge. accountType comes from the backend:
 * admin | dealer | user | d-user (dealer customer) | sub-user | d-sub-user.
 * Falls back to deriving from role when accountType is absent.
 */
const STYLES: Record<string, { label: string; className: string }> = {
  admin: { label: 'Admin', className: 'bg-purple-100 text-purple-800' },
  dealer: { label: 'Dealer', className: 'bg-teal-100 text-teal-800' },
  user: { label: 'User', className: 'bg-blue-100 text-blue-800' },
  'd-user': { label: 'D-User', className: 'bg-cyan-100 text-cyan-800' },
  'sub-user': { label: 'Sub-user', className: 'bg-amber-100 text-amber-800' },
  'd-sub-user': { label: 'D-Sub-user', className: 'bg-orange-100 text-orange-800' },
};

export const RoleBadge = ({ accountType, role }: { accountType?: string; role?: string }) => {
  let type = accountType;
  if (!type) {
    if (role === 'admin') type = 'admin';
    else if (role === 'dealer') type = 'dealer';
    else if (role === 'sub-user') type = 'sub-user';
    else type = 'user';
  }
  const meta = STYLES[type] || STYLES.user;
  const Icon = type === 'admin' ? Shield : ShieldAlert;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${meta.className}`}>
      <Icon className="w-2.5 h-2.5 mr-1" />
      {meta.label}
    </span>
  );
};
