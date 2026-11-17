import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { userAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { HardDrive, User } from 'lucide-react';

export const AdminMediaLibrary = () => {
  const navigate = useNavigate();
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const usersPerPage = isMobile ? 6 : 20;
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [currentPage, userSearchTerm, isMobile]);

  const loadUsers = async () => {
    try {
      const params: any = {
        page: currentPage,
        limit: usersPerPage
      };

      // Send search to backend for server-side filtering
      if (userSearchTerm) {
        params.search = userSearchTerm;
      }

      const response = await userAPI.getUsers(params);
      const usersData = response.data.data || response.data;
      setFilteredUsers(usersData);
      setTotalUsers(response.data.total || 0);
      setTotalPages(response.data.totalPages || 0);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };


  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // No client-side filtering - all filtering happens on server
  const paginatedUsers = filteredUsers;

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <>
      <div className="p-2 sm:p-4 md:p-6 max-w-[95vw] sm:max-w-[1200px] mx-auto overflow-x-hidden">
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-3 sm:mb-4 md:mb-6">Media Library</h1>

      {/* Storage Summary by User */}
      <Card className="mb-2 sm:mb-3 md:mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[10px] sm:text-xs md:text-sm">
            <HardDrive className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" />
            Storage Usage by User
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              placeholder="Search users by email or business name..."
              value={userSearchTerm}
              onChange={(e) => setUserSearchTerm(e.target.value)}
              className="text-xs sm:text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            {paginatedUsers.map((user) => (
              <div
                key={user._id}
                className="p-3 sm:p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => navigate(`/admin/library/user/${user._id}`)}
              >
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600" />
                  <div className="text-xs sm:text-sm font-medium truncate">{user.email}</div>
                </div>
                <div className="text-base sm:text-lg font-bold">{formatBytes(user.storageUsed)}</div>
                <div className="text-xs sm:text-sm text-gray-600">{user.assignedDevices?.length || 0} devices</div>
              </div>
            ))}
          </div>
          {filteredUsers.length === 0 && (
            <div className="text-center py-8 sm:py-12 text-gray-500 text-xs sm:text-sm">
              No users found.
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-xs sm:text-sm text-gray-600">
                Showing {(currentPage - 1) * usersPerPage + 1} to {Math.min(currentPage * usersPerPage, totalUsers)} of {totalUsers} users
              </div>
              <div className="flex gap-1 sm:gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="text-xs sm:text-sm"
                >
                  Previous
                </Button>
                <span className="text-xs sm:text-sm text-gray-600 flex items-center">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="text-xs sm:text-sm"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </>
  );
};
