import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { AdminLayout } from './components/AdminLayout';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminMediaLibrary } from './pages/admin/AdminMediaLibrary';
import { AdminDevices } from './pages/admin/AdminDevices';
import { AdminDeviceEdit } from './pages/admin/AdminDeviceEdit';
import { AdminUsers } from './pages/admin/AdminUsers';
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

// Protected Route Component
const ProtectedRoute = ({ children, requiredRole, permission }: { children: React.ReactNode; requiredRole?: 'admin' | 'user'; permission?: 'devices' | 'groups' | 'library' | 'settings' | 'subUsers' }) => {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const storedRole = user.role;
  const isSubUser = storedRole === 'sub-user' || !!user.isSubUser;
  const userRole = storedRole === 'sub-user' ? 'user' : storedRole;

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Sub-user permission gate: hidden modules are unreachable even via direct URL.
  if (permission && userRole === 'user' && isSubUser) {
    const allowed = permission === 'subUsers' ? false : user.permissions?.[permission] !== false;
    if (!allowed) {
      return <Navigate to="/user/dashboard" replace />;
    }
  }
  if (permission === 'subUsers' && userRole === 'user' && (isSubUser || Number(user.subUserLimit || 0) <= 0)) {
    return <Navigate to="/user/dashboard" replace />;
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
    } else if (userRole === 'user') {
      return <Navigate to="/user/dashboard" replace />;
    } else {
      // Invalid role, redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      return <Navigate to="/login" replace />;
    }
  }

  return <>{children}</>;
};

function App() {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin';

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
          path="/admin/config"
          element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminConfig /></AdminLayout></ProtectedRoute>}
        />
        <Route
          path="/admin/storage"
          element={<ProtectedRoute requiredRole="admin"><AdminLayout><AdminStorage /></AdminLayout></ProtectedRoute>}
        />
        
        {/* User Routes */}
        <Route
          path="/user/dashboard"
          element={<ProtectedRoute requiredRole="user"><UserLayout><UserDashboard /></UserLayout></ProtectedRoute>}
        />
        <Route
          path="/user/devices"
          element={<ProtectedRoute requiredRole="user" permission="devices"><UserLayout><UserDevices /></UserLayout></ProtectedRoute>}
        />
        <Route
          path="/user/groups"
          element={<ProtectedRoute requiredRole="user" permission="groups"><UserLayout><UserGroups /></UserLayout></ProtectedRoute>}
        />
        <Route
          path="/user/library"
          element={<ProtectedRoute requiredRole="user" permission="library"><UserLayout><UserLibrary /></UserLayout></ProtectedRoute>}
        />
        <Route
          path="/user/sub-users"
          element={<ProtectedRoute requiredRole="user" permission="subUsers"><UserLayout><UserSubUsers /></UserLayout></ProtectedRoute>}
        />
        <Route
          path="/user/settings"
          element={<ProtectedRoute requiredRole="user" permission="settings"><UserLayout><UserSettings /></UserLayout></ProtectedRoute>}
        />
        <Route
          path="/user/devices/:deviceId"
          element={<ProtectedRoute requiredRole="user" permission="devices"><UserLayout><UserDeviceDetail /></UserLayout></ProtectedRoute>}
        />
        <Route
          path="/user/groups/:groupId/configure"
          element={<ProtectedRoute requiredRole="user" permission="groups"><UserLayout><UserGroupConfigure /></UserLayout></ProtectedRoute>}
        />
        <Route
          path="/user/devices/:deviceId/schedules"
          element={<ProtectedRoute requiredRole="user" permission="devices"><UserLayout><UserSchedules /></UserLayout></ProtectedRoute>}
        />
        <Route
          path="/user/groups/:groupId/schedules"
          element={<ProtectedRoute requiredRole="user" permission="groups"><UserLayout><UserSchedules /></UserLayout></ProtectedRoute>}
        />
        
        {/* Legacy Routes (for backward compatibility) - redirect to role-based routes */}
        <Route
          path="/dashboard"
          element={token ? <Navigate to={isAdmin ? "/admin/dashboard" : "/user/dashboard"} replace /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/devices"
          element={token ? <Navigate to={isAdmin ? "/admin/devices" : "/user/devices"} replace /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/library"
          element={token ? <Navigate to={isAdmin ? "/admin/library" : "/user/library"} replace /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/devices/:deviceId"
          element={token ? <Navigate to={`/user/devices/:deviceId`} replace /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/schedules"
          element={token ? <Navigate to="/user/devices" replace /> : <Navigate to="/login" replace />}
        />
        
        {/* Default redirect based on role */}
        <Route 
          path="/" 
          element={
            <Navigate 
              to={token ? (isAdmin ? "/admin/dashboard" : "/user/dashboard") : "/login"} 
            replace 
            />
          } 
        />
      </Routes>
    </Router>
  );
}

export default App;
