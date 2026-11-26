import { type ReactNode, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Monitor, Library, Users, Settings, LogOut, Menu, X } from 'lucide-react';
import { authAPI } from '../services/api';
import { BrandLogo } from './BrandLogo';
import { ToastProvider } from './ui/Toast';

interface DealerLayoutProps {
  children: ReactNode;
}

export const DealerLayout = ({ children }: DealerLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const menuItems = [
    { path: '/dealer/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/dealer/devices', icon: Monitor, label: 'Devices' },
    { path: '/dealer/library', icon: Library, label: 'Media Library' },
    { path: '/dealer/users', icon: Users, label: 'Users' },
    { path: '/dealer/settings', icon: Settings, label: 'Settings' },
  ];

  const handleLogout = () => {
    authAPI.logout().catch(() => {});
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const navButton = (item: typeof menuItems[number], mobile = false) => {
    const Icon = item.icon;
    const isActive = location.pathname === item.path;
    return (
      <button
        key={item.path}
        onClick={() => {
          navigate(item.path);
          if (mobile) setMobileMenuOpen(false);
        }}
        className={`w-full flex items-center gap-3 ${mobile ? 'px-4 py-3' : 'px-4 py-3'} rounded-lg transition-colors ${
          isActive
            ? 'bg-blue-600 text-white'
            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
        }`}
      >
        <Icon className="w-5 h-5" />
        <span>{item.label}</span>
      </button>
    );
  };

  return (
    <ToastProvider>
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Mobile Top Navbar */}
      <header className="lg:hidden bg-gray-900 text-white p-4 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 hover:bg-gray-800 rounded-lg"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <BrandLogo fallback="Dealer CMS" />
          </h1>
          <button onClick={handleLogout} className="p-2 hover:bg-gray-800 rounded-lg">
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {mobileMenuOpen && (
          <nav className="mt-4 space-y-2 pb-4">
            {menuItems.map((item) => navButton(item, true))}
            <div className="px-4 pt-4 border-t border-gray-700 mt-4">
              <div className="text-sm text-gray-400 mb-2">Logged in as</div>
              <div className="text-sm font-medium mb-3">{user.email || 'Dealer'}</div>
            </div>
          </nav>
        )}
      </header>

      <div className="flex flex-1">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex w-64 bg-gray-900 text-white flex-col fixed h-full">
          <div className="p-6 border-b border-gray-700">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BrandLogo fallback="Dealer CMS" />
            </h1>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            {menuItems.map((item) => navButton(item))}
          </nav>

          <div className="p-4 border-t border-gray-700">
            <div className="mb-4 px-4">
              <div className="text-sm text-gray-400">Logged in as</div>
              <div className="text-sm font-medium">{user.email || 'Dealer'}</div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span>Logout</span>
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 lg:ml-64">
          {children}
        </main>
      </div>
    </div>
    </ToastProvider>
  );
};
