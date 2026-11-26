import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dealerAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { SkeletonGrid } from '../../components/ui/Skeleton';
import { useUrlParam, useUrlNumberParam } from '../../hooks/useUrlParam';
import { HardDrive, User } from 'lucide-react';

export const DealerMediaLibrary = () => {
  const navigate = useNavigate();
  const [userSearchTerm, setUserSearchTerm] = useUrlParam('q');
  const [userSearchInput, setUserSearchInput] = useState(userSearchTerm);
  const [currentPage, setCurrentPage] = useUrlNumberParam('page', 1);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const usersPerPage = isMobile ? 6 : 20;

  const usersQuery = useQuery({
    queryKey: ['dealer-media-users', currentPage, userSearchTerm, usersPerPage],
    queryFn: async () => {
      const params: any = { page: currentPage, limit: usersPerPage };
      if (userSearchTerm) params.search = userSearchTerm;
      const response = await dealerAPI.getCustomers(params);
      return response.data;
    },
  });

  const filteredUsers = usersQuery.data?.data || [];
  const loading = usersQuery.isLoading;
  const totalUsers = usersQuery.data?.total || 0;
  const totalPages = usersQuery.data?.totalPages || 0;

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Debounce search input -> URL param (400ms)
  useEffect(() => {
    setUserSearchInput(userSearchTerm);
  }, [userSearchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (userSearchInput !== userSearchTerm) setUserSearchTerm(userSearchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [userSearchInput]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [userSearchTerm]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const paginatedUsers = filteredUsers;

  if (loading) {
    return (
      <div className="p-1 sm:p-1.5 md:p-2 w-full">
        <SkeletonGrid count={12} />
      </div>
    );
  }

  return (
    <div className="p-1 sm:p-1.5 md:p-2 w-full">
      <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 mb-2 sm:mb-3">Media Library</h1>

      {/* Storage Summary by Customer */}
      <Card className="mb-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[10px] sm:text-xs md:text-sm">
            <HardDrive className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" />
            Storage Usage by Customer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <Input
              placeholder="Search customers by email or business name..."
              value={userSearchInput}
              onChange={(e) => setUserSearchInput(e.target.value)}
              className="text-xs sm:text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {paginatedUsers.map((user: any) => (
              <div
                key={user._id}
                className="p-3 sm:p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => navigate(`/dealer/library/user/${user._id}`)}
              >
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600" />
                  <div className="text-xs sm:text-sm font-medium truncate">{user.businessName || user.email}</div>
                </div>
                <div className="text-base sm:text-lg font-bold">{formatBytes(user.storageUsed)}</div>
                <div className="text-xs sm:text-sm text-gray-600">{user.deviceCount || 0} devices</div>
              </div>
            ))}
          </div>
          {filteredUsers.length === 0 && (
            <div className="text-center py-8 sm:py-12 text-gray-500 text-xs sm:text-sm">
              No customers found.
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t">
              <div className="text-xs sm:text-sm text-gray-600">
                Showing {(currentPage - 1) * usersPerPage + 1} to {Math.min(currentPage * usersPerPage, totalUsers)} of {totalUsers} customers
              </div>
              <div className="flex gap-1 sm:gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
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
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
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
  );
};
