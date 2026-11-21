import { type ReactNode, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, LayoutDashboard, Monitor, Layers, Library, Settings, LogOut, Menu, X, Users } from 'lucide-react';

interface UserLayoutProps {
  children: ReactNode;
}

export const UserLayout = ({ children }: UserLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isSubUser = user.role === 'sub-user' || !!user.isSubUser;
  const permissions = user.permissions || {};
  const canAccess = (key: string) => !isSubUser || permissions[key] !== false;

  const menuItems = [
    { path: '/user/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/user/devices', icon: Monitor, label: 'Devices', permission: 'devices' },
    { path: '/user/groups', icon: Layers, label: 'Groups', permission: 'groups' },
    { path: '/user/library', icon: Library, label: 'Library', permission: 'library' },
    { path: '/user/sub-users', icon: Users, label: 'Sub-users', subUsersOnly: true },
    { path: '/user/settings', icon: Settings, label: 'Settings', permission: 'settings' },
  ].filter((item: any) => {
    if (item.subUsersOnly) return !isSubUser && Number(user.subUserLimit || 0) > 0;
    return !item.permission || canAccess(item.permission);
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
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
            <Layout className="w-5 h-5" />
            User CMS
          </h1>
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-gray-800 rounded-lg"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        
        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <nav className="mt-4 space-y-2 pb-4">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-green-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
            <div className="px-4 pt-4 border-t border-gray-700 mt-4">
              <div className="text-sm text-gray-400 mb-2">Logged in as</div>
              <div className="text-sm font-medium mb-3">{user.email || 'User'}</div>
            </div>
          </nav>
        )}
      </header>

      <div className="flex flex-1">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex w-64 bg-gray-900 text-white flex-col fixed h-full">
          <div className="p-6 border-b border-gray-700">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Layout className="w-6 h-6" />
              User CMS
            </h1>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-green-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-700">
            <div className="mb-4 px-4">
              <div className="text-sm text-gray-400">Logged in as</div>
              <div className="text-sm font-medium">{user.email || 'User'}</div>
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
  );
};
