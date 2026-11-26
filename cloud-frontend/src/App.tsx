import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Login } from './pages/Login';
import { AdminLayout } from './components/AdminLayout';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminMediaLibrary } from './pages/admin/AdminMediaLibrary';
import { AdminDevices } from './pages/admin/AdminDevices';
import { AdminDeviceEdit } from './pages/admin/AdminDeviceEdit';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminDealers } from './pages/admin/AdminDealers';
import { AdminUserDevices } from './pages/admin/AdminUserDevices';
import { AdminUserMediaDetail } from './pages/admin/AdminUserMediaDetail';
import { AdminConfig } from './pages/admin/AdminConfig';
import { AdminStorage } from './pages/admin/AdminStorage';
import { UserLayout } from './components/UserLayout';
import { UserDashboard } from './pages/user/UserDashboard';
import { UserDevices } from './pages/user/UserDevices';
import { UserGroups } from './pages/user/UserGroups';
import { UserLibrary } from './pages/user/UserLibrary';
import { UserSettings } from './pages/user/UserSettings';
import { UserDeviceDetail } from './pages/user/UserDeviceDetail';
import { UserGroupConfigure } from './pages/user/UserGroupConfigure';
import { UserSubUsers } from './pages/user/UserSubUsers';
import UserSchedules from './pages/user/UserSchedules';
import { DealerLayout } from './components/DealerLayout';
import { DealerDashboard } from './pages/dealer/DealerDashboard';
import { DealerDevices } from './pages/dealer/DealerDevices';
import { DealerDeviceEdit } from './pages/dealer/DealerDeviceEdit';
import { DealerMediaLibrary } from './pages/dealer/DealerMediaLibrary';
import { DealerUserMediaDetail } from './pages/dealer/DealerUserMediaDetail';
import { DealerUserDevices } from './pages/dealer/DealerUserDevices';
import { DealerUsers } from './pages/dealer/DealerUsers';
import { DealerSubUsers } from './pages/dealer/DealerSubUsers';
import { DealerSettings } from './pages/dealer/DealerSettings';
import { USER_AREAS, getUserArea, areaHomePath, areaBasePath, type UserArea } from './utils/userArea';

// User-area route table — rendered once per account-area prefix
// (/user, /duser, /sub-user, /dsub-user) so every account type has its
// own URL space while sharing the same pages.
const USER_ROUTE_DEFS: { sub: string; element: React.ReactNode; permission?: 'devices' | 'groups' | 'library' | 'settings' | 'subUsers' }[] = [
  { sub: 'dashboard', element: <UserDashboard /> },
  { sub: 'devices', element: <UserDevices />, permission: 'devices' },
  { sub: 'groups', element: <UserGroups />, permission: 'groups' },
  { sub: 'library', element: <UserLibrary />, permission: 'library' },
  { sub: 'sub-users', element: <UserSubUsers />, permission: 'subUsers' },
  { sub: 'settings', element: <UserSettings />, permission: 'settings' },
  { sub: 'devices/:deviceId', element: <UserDeviceDetail />, permission: 'devices' },
  { sub: 'groups/:groupId/configure', element: <UserGroupConfigure />, permission: 'groups' },
  { sub: 'devices/:deviceId/schedules', element: <UserSchedules />, permission: 'devices' },
  { sub: 'groups/:groupId/schedules', element: <UserSchedules />, permission: 'groups' },
];

// Protected Route Component
const ProtectedRoute = ({ children, requiredRole, permission, area }: { children: React.ReactNode; requiredRole?: 'admin' | 'user' | 'dealer'; permission?: 'devices' | 'groups' | 'library' | 'settings' | 'subUsers'; area?: UserArea }) => {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const storedRole = user.role;
  const isSubUser = storedRole === 'sub-user' || !!user.isSubUser;
  const userRole = storedRole === 'sub-user' ? 'user' : storedRole;

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const homePath = areaHomePath(getUserArea(user));

  // Sub-user permission gate: hidden modules are unreachable even via direct URL.
  if (permission && userRole === 'user' && isSubUser) {
    const allowed = permission === 'subUsers' ? false : user.permissions?.[permission] !== false;
    if (!allowed) {
      return <Navigate to={homePath} replace />;
    }
  }
  if (permission === 'subUsers' && userRole === 'user' && (isSubUser || Number(user.subUserLimit || 0) <= 0)) {
    return <Navigate to={homePath} replace />;
  }

  // Account-area gate: /duser/* is only for dealer customers, /sub-user/*
  // for sub-users, etc. Mismatched area redirects to the correct prefix.
  if (area && userRole === 'user' && getUserArea(user) !== area) {
    return <Navigate to={homePath} replace />;
  }

  // If no specific role required, just check if logged in
  if (!requiredRole) {
    return <>{children}</>;
  }

  // Check if user has the required role
  if (userRole !== requiredRole) {
    // Redirect to correct dashboard based on actual role
    if (userRole === 'admin') {
      return <Navigate to="/admin/dashboard" replace />;
    } else if (userRole === 'dealer') {
      return <Navigate to="/dealer/dashboard" replace />;
    } else if (userRole === 'user') {
      return <Navigate to={homePath} replace />;
    } else {
      // Invalid role, redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      return <Navigate to="/login" replace />;
    }
  }

  return <>{children}</>;
};

// Legacy /devices/:deviceId — redirect to the role-appropriate detail page.
const LegacyDeviceRedirect = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (!token) return <Navigate to="/login" replace />;
  let to: string;
  if (user.role === 'admin') to = `/admin/devices/${deviceId}/edit`;
  else if (user.role === 'dealer') to = `/dealer/devices/${deviceId}/edit`;
  else to = `${areaBasePath(getUserArea(user))}/devices/${deviceId}`;
  return <Navigate to={to} replace />;
};

function App() {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin';
  const isDealer = user.role === 'dealer';
  const homePath = isAdmin ? '/admin/dashboard' : isDealer ? '/dealer/dashboard' : areaHomePath(getUserArea(user));
  const userBase = areaBasePath(getUserArea(user));

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Admin Routes */}
        <Route
          path="/admin/dashboard"
          element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminDashboard /></AdminLayout></ProtectedRoute>}
        />
        <Route
          path="/admin/settings"
          element={<Navigate to="/admin/config" replace />}
        />
        <Route
          path="/admin/library"
          element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminMediaLibrary /></AdminLayout></ProtectedRoute>}
        />
        <Route
          path="/admin/library/user/:userId"
          element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminUserMediaDetail /></AdminLayout></ProtectedRoute>}
        />
        <Route
          path="/admin/devices"
          element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminDevices /></AdminLayout></ProtectedRoute>}
        />
        <Route
          path="/admin/devices/:deviceId/edit"
          element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminDeviceEdit /></AdminLayout></ProtectedRoute>}
        />
        <Route
          path="/admin/users"
          element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminUsers /></AdminLayout></ProtectedRoute>}
        />
        <Route
          path="/admin/users/:userId/devices"
          element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminUserDevices /></AdminLayout></ProtectedRoute>}
        />
        <Route
          path="/admin/dealers"
          element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminDealers /></AdminLayout></ProtectedRoute>}
        />
        <Route
          path="/admin/config"
          element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminConfig /></AdminLayout></ProtectedRoute>}
        />
        <Route
          path="/admin/storage"
          element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminStorage /></AdminLayout></ProtectedRoute>}
        />
        
        {/* User-area Routes — same pages under /user, /duser, /sub-user, /dsub-user */}
        {USER_AREAS.map((area) =>
          USER_ROUTE_DEFS.map((def) => (
            <Route
              key={`${area}-${def.sub}`}
              path={`/${area}/${def.sub}`}
              element={
                <ProtectedRoute requiredRole="user" permission={def.permission} area={area}>
                  <UserLayout>{def.element}</UserLayout>
                </ProtectedRoute>
              }
            />
          ))
        )}
        
        {/* Dealer Routes */}
        <Route
          path="/dealer/dashboard"
          element={<ProtectedRoute requiredRole="dealer"><DealerLayout><DealerDashboard /></DealerLayout></ProtectedRoute>}
        />
        <Route
          path="/dealer/devices"
          element={<ProtectedRoute requiredRole="dealer"><DealerLayout><DealerDevices /></DealerLayout></ProtectedRoute>}
        />
        <Route
          path="/dealer/devices/:deviceId/edit"
          element={<ProtectedRoute requiredRole="dealer"><DealerLayout><DealerDeviceEdit /></DealerLayout></ProtectedRoute>}
        />
        <Route
          path="/dealer/library"
          element={<ProtectedRoute requiredRole="dealer"><DealerLayout><DealerMediaLibrary /></DealerLayout></ProtectedRoute>}
        />
        <Route
          path="/dealer/library/user/:userId"
          element={<ProtectedRoute requiredRole="dealer"><DealerLayout><DealerUserMediaDetail /></DealerLayout></ProtectedRoute>}
        />
        <Route
          path="/dealer/users"
          element={<ProtectedRoute requiredRole="dealer"><DealerLayout><DealerUsers /></DealerLayout></ProtectedRoute>}
        />
        <Route
          path="/dealer/users/:userId/devices"
          element={<ProtectedRoute requiredRole="dealer"><DealerLayout><DealerUserDevices /></DealerLayout></ProtectedRoute>}
        />
        <Route
          path="/dealer/users/:customerId/sub-users"
          element={<ProtectedRoute requiredRole="dealer"><DealerLayout><DealerSubUsers /></DealerLayout></ProtectedRoute>}
        />
        <Route
          path="/dealer/settings"
          element={<ProtectedRoute requiredRole="dealer"><DealerLayout><DealerSettings /></DealerLayout></ProtectedRoute>}
        />

        {/* Legacy Routes (for backward compatibility) - redirect to role-based routes */}
        <Route
          path="/dashboard"
          element={token ? <Navigate to={homePath} replace /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/devices"
          element={token ? <Navigate to={isAdmin ? "/admin/devices" : isDealer ? "/dealer/devices" : `${userBase}/devices`} replace /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/library"
          element={token ? <Navigate to={isAdmin ? "/admin/library" : isDealer ? "/dealer/library" : `${userBase}/library`} replace /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/devices/:deviceId"
          element={<LegacyDeviceRedirect />}
        />
        <Route
          path="/schedules"
          element={token ? <Navigate to={isDealer ? "/dealer/devices" : `${userBase}/devices`} replace /> : <Navigate to="/login" replace />}
        />
        
        {/* Default redirect based on role */}
        <Route 
          path="/" 
          element={
            <Navigate 
              to={token ? homePath : "/login"} 
            replace 
            />
          } 
        />
      </Routes>
    </Router>
  );
}

export default App;
