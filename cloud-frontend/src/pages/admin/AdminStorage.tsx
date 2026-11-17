import { useEffect, useState } from 'react';
import { userAPI, mediaAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ArrowLeft, HardDrive, Users, FolderOpen, FileText, TrendingUp } from 'lucide-react';

export const AdminStorage = () => {
  const [storageData, setStorageData] = useState({
    totalStorage: 0,
    userBreakdown: [] as any[],
    folderBreakdown: [] as any[],
    typeBreakdown: [] as any[],
  });
  const [loading, setLoading] = useState(true);
  const [userPage, setUserPage] = useState(1);
  const [folderPage, setFolderPage] = useState(1);
  const [typePage, setTypePage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    loadStorageData();
  }, []);

  const loadStorageData = async () => {
    try {
      const [usersRes, mediaRes] = await Promise.all([
        userAPI.getUsers({ page: 1, limit: 1000 }),
        mediaAPI.getMedia({ page: 1, limit: 1000 }),
      ]);

      const users = usersRes.data.data || usersRes.data;
      const media = mediaRes.data.data || mediaRes.data;

      // Calculate total storage
      const totalStorage = media.reduce((acc: number, m: any) => acc + (m.size || 0), 0);

      // Breakdown by user
      const userMap = new Map<string, { email: string; storage: number; fileCount: number }>();
      media.forEach((m: any) => {
        const userId = m.uploadedBy;
        if (!userId) return;
        
        const user = users.find((u: any) => u._id === userId);
        const email = user?.email || 'Unknown';
        
        if (!userMap.has(userId)) {
          userMap.set(userId, { email, storage: 0, fileCount: 0 });
        }
        const userData = userMap.get(userId)!;
        userData.storage += m.size || 0;
        userData.fileCount += 1;
      });

      const userBreakdown = Array.from(userMap.values())
        .sort((a, b) => b.storage - a.storage)
        .map(u => ({
          ...u,
          percentage: totalStorage > 0 ? (u.storage / totalStorage * 100).toFixed(1) : 0,
        }));

      // Breakdown by folder
      const folderMap = new Map<string, { storage: number; fileCount: number }>();
      media.forEach((m: any) => {
        const folder = m.folder || 'general';
        if (!folderMap.has(folder)) {
          folderMap.set(folder, { storage: 0, fileCount: 0 });
        }
        const folderData = folderMap.get(folder)!;
        folderData.storage += m.size || 0;
        folderData.fileCount += 1;
      });

      const folderBreakdown = Array.from(folderMap.entries())
        .map(([folder, data]) => ({
          folder,
          ...data,
          percentage: totalStorage > 0 ? (data.storage / totalStorage * 100).toFixed(1) : 0,
        }))
        .sort((a, b) => b.storage - a.storage);

      // Breakdown by file type
      const typeMap = new Map<string, { storage: number; fileCount: number }>();
      media.forEach((m: any) => {
        const type = m.mimeType?.split('/')[0] || 'unknown';
        if (!typeMap.has(type)) {
          typeMap.set(type, { storage: 0, fileCount: 0 });
        }
        const typeData = typeMap.get(type)!;
        typeData.storage += m.size || 0;
        typeData.fileCount += 1;
      });

      const typeBreakdown = Array.from(typeMap.entries())
        .map(([type, data]) => ({
          type: type.charAt(0).toUpperCase() + type.slice(1),
          ...data,
          percentage: totalStorage > 0 ? (data.storage / totalStorage * 100).toFixed(1) : 0,
        }))
        .sort((a, b) => b.storage - a.storage);

      setStorageData({
        totalStorage,
        userBreakdown,
        folderBreakdown,
        typeBreakdown,
      });
    } catch (error) {
      console.error('Failed to load storage data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Paginated data
  const paginatedUsers = storageData.userBreakdown.slice(
    (userPage - 1) * itemsPerPage,
    userPage * itemsPerPage
  );
  const userTotalPages = Math.ceil(storageData.userBreakdown.length / itemsPerPage);

  const paginatedFolders = storageData.folderBreakdown.slice(
    (folderPage - 1) * itemsPerPage,
    folderPage * itemsPerPage
  );
  const folderTotalPages = Math.ceil(storageData.folderBreakdown.length / itemsPerPage);

  const paginatedTypes = storageData.typeBreakdown.slice(
    (typePage - 1) * itemsPerPage,
    typePage * itemsPerPage
  );
  const typeTotalPages = Math.ceil(storageData.typeBreakdown.length / itemsPerPage);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="p-2 sm:p-4 md:p-6 max-w-[95vw] sm:max-w-[1200px] mx-auto overflow-x-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 md:gap-4 mb-3 sm:mb-4 md:mb-6">
        <Button variant="secondary" onClick={() => window.location.href = '/admin/dashboard'} className="text-xs sm:text-sm">
          <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Back to Dashboard</span>
          <span className="sm:hidden">←</span>
        </Button>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">
          Storage Details
        </h1>
      </div>

      {/* Total Storage Card */}
      <Card className="mb-4 sm:mb-6 md:mb-8">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <HardDrive className="w-8 h-8 sm:w-10 sm:h-10 text-orange-600" />
            <div>
              <p className="text-sm sm:text-base text-gray-600">Total Storage Used</p>
              <p className="text-2xl sm:text-3xl font-bold">{formatBytes(storageData.totalStorage)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Breakdown Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* By User */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Users className="w-4 h-4 sm:w-5 sm:h-5" />
              Storage by User
            </CardTitle>
          </CardHeader>
          <CardContent>
            {storageData.userBreakdown.length === 0 ? (
              <div className="text-center py-4 text-gray-500 text-xs sm:text-sm">No data</div>
            ) : (
              <>
                <div className="space-y-2 sm:space-y-3">
                  {paginatedUsers.map((user, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs sm:text-sm">
                      <div className="flex-1 truncate mr-2">
                        <div className="font-medium">{user.email}</div>
                        <div className="text-gray-500">{user.fileCount} files</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatBytes(user.storage)}</div>
                        <div className="text-gray-500">{user.percentage}%</div>
                      </div>
                    </div>
                  ))}
                </div>
                {userTotalPages > 1 && (
                  <div className="flex items-center justify-between pt-3 border-t mt-3">
                    <div className="text-xs text-gray-600">
                      Showing {(userPage - 1) * itemsPerPage + 1} to {Math.min(userPage * itemsPerPage, storageData.userBreakdown.length)} of {storageData.userBreakdown.length}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setUserPage(p => Math.max(1, p - 1))} disabled={userPage === 1} className="text-xs">
                        Prev
                      </Button>
                      <span className="text-xs text-gray-600 flex items-center">{userPage} / {userTotalPages}</span>
                      <Button size="sm" variant="secondary" onClick={() => setUserPage(p => Math.min(userTotalPages, p + 1))} disabled={userPage === userTotalPages} className="text-xs">
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* By Folder */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <FolderOpen className="w-4 h-4 sm:w-5 sm:h-5" />
              Storage by Folder
            </CardTitle>
          </CardHeader>
          <CardContent>
            {storageData.folderBreakdown.length === 0 ? (
              <div className="text-center py-4 text-gray-500 text-xs sm:text-sm">No data</div>
            ) : (
              <>
                <div className="space-y-2 sm:space-y-3">
                  {paginatedFolders.map((folder, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs sm:text-sm">
                      <div className="flex-1 truncate mr-2">
                        <div className="font-medium">{folder.folder}</div>
                        <div className="text-gray-500">{folder.fileCount} files</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatBytes(folder.storage)}</div>
                        <div className="text-gray-500">{folder.percentage}%</div>
                      </div>
                    </div>
                  ))}
                </div>
                {folderTotalPages > 1 && (
                  <div className="flex items-center justify-between pt-3 border-t mt-3">
                    <div className="text-xs text-gray-600">
                      Showing {(folderPage - 1) * itemsPerPage + 1} to {Math.min(folderPage * itemsPerPage, storageData.folderBreakdown.length)} of {storageData.folderBreakdown.length}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setFolderPage(p => Math.max(1, p - 1))} disabled={folderPage === 1} className="text-xs">
                        Prev
                      </Button>
                      <span className="text-xs text-gray-600 flex items-center">{folderPage} / {folderTotalPages}</span>
                      <Button size="sm" variant="secondary" onClick={() => setFolderPage(p => Math.min(folderTotalPages, p + 1))} disabled={folderPage === folderTotalPages} className="text-xs">
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* By Type */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
              Storage by File Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {storageData.typeBreakdown.length === 0 ? (
              <div className="text-center py-4 text-gray-500 text-xs sm:text-sm">No data</div>
            ) : (
              <>
                <div className="space-y-2 sm:space-y-3">
                  {paginatedTypes.map((type, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs sm:text-sm">
                      <div className="flex-1">
                        <div className="font-medium">{type.type}</div>
                        <div className="text-gray-500">{type.fileCount} files</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatBytes(type.storage)}</div>
                        <div className="text-gray-500">{type.percentage}%</div>
                      </div>
                    </div>
                  ))}
                </div>
                {typeTotalPages > 1 && (
                  <div className="flex items-center justify-between pt-3 border-t mt-3">
                    <div className="text-xs text-gray-600">
                      Showing {(typePage - 1) * itemsPerPage + 1} to {Math.min(typePage * itemsPerPage, storageData.typeBreakdown.length)} of {storageData.typeBreakdown.length}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setTypePage(p => Math.max(1, p - 1))} disabled={typePage === 1} className="text-xs">
                        Prev
                      </Button>
                      <span className="text-xs text-gray-600 flex items-center">{typePage} / {typeTotalPages}</span>
                      <Button size="sm" variant="secondary" onClick={() => setTypePage(p => Math.min(typeTotalPages, p + 1))} disabled={typePage === typeTotalPages} className="text-xs">
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
              Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 sm:space-y-4">
              <div className="flex justify-between items-center text-xs sm:text-sm">
                <span className="text-gray-600">Total Users with Files</span>
                <span className="font-bold">{storageData.userBreakdown.length}</span>
              </div>
              <div className="flex justify-between items-center text-xs sm:text-sm">
                <span className="text-gray-600">Total Folders</span>
                <span className="font-bold">{storageData.folderBreakdown.length}</span>
              </div>
              <div className="flex justify-between items-center text-xs sm:text-sm">
                <span className="text-gray-600">File Types</span>
                <span className="font-bold">{storageData.typeBreakdown.length}</span>
              </div>
              <div className="flex justify-between items-center text-xs sm:text-sm">
                <span className="text-gray-600">Total Files</span>
                <span className="font-bold">{storageData.userBreakdown.reduce((acc, u) => acc + u.fileCount, 0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
