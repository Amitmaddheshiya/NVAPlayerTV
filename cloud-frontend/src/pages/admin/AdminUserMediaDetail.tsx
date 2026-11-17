import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mediaAPI, userAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ArrowLeft, Trash2, Download, Search, Folder, HardDrive, Upload } from 'lucide-react';

export const AdminUserMediaDetail = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [filteredMedia, setFilteredMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [folderFilter, setFolderFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const filesPerPage = 15;

  useEffect(() => {
    if (userId) {
      loadUser();
      loadUserMedia();
    }
  }, [userId]);

  useEffect(() => {
    filterMedia();
  }, [mediaList, searchTerm, folderFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, folderFilter]);

  const loadUser = async () => {
    try {
      const response = await userAPI.getUser(userId);
      setUser(response.data);
    } catch (error) {
      console.error('Failed to load user:', error);
    }
  };

  const loadUserMedia = async () => {
    try {
      const response = await mediaAPI.getMedia({ page: 1, limit: 1000 });
      const mediaData = response.data.data || response.data;
      const userMedia = mediaData.filter((m: any) => m.uploadedBy === userId);
      setMediaList(userMedia);
    } catch (error) {
      console.error('Failed to load media:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterMedia = () => {
    let filtered = [...mediaList];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.originalName.toLowerCase().includes(term) ||
          (m.folder && m.folder.toLowerCase().includes(term))
      );
    }

    // Folder filter
    if (folderFilter !== 'all') {
      filtered = filtered.filter((m) => m.folder === folderFilter);
    }

    setFilteredMedia(filtered);
  };

  const paginatedMedia = filteredMedia.slice(
    (currentPage - 1) * filesPerPage,
    currentPage * filesPerPage
  );

  const totalPages = Math.ceil(filteredMedia.length / filesPerPage);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this media?')) return;

    try {
      await mediaAPI.deleteMedia(id);
      loadUserMedia();
    } catch (error) {
      alert('Delete failed');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const folders = Array.from(new Set(mediaList.map((m) => m.folder).filter(Boolean)));

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (!user) {
    return <div className="flex items-center justify-center h-screen">User not found</div>;
  }

  return (
    <div className="p-2 sm:p-4 md:p-6 max-w-[95vw] sm:max-w-[1200px] mx-auto overflow-x-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 md:gap-4 mb-3 sm:mb-4 md:mb-6">
        <Button variant="secondary" onClick={() => navigate('/admin/library')} className="text-xs sm:text-sm">
          <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Back to Library</span>
          <span className="sm:hidden">←</span>
        </Button>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">
          Media for {user.email}
        </h1>
      </div>

      {/* User Info Card */}
      <Card className="mb-2 sm:mb-3 md:mb-4">
        <CardHeader>
          <CardTitle className="text-[10px] sm:text-xs md:text-sm">User Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          <div>
            <div className="text-xs sm:text-sm text-gray-600">Email</div>
            <div className="text-xs sm:text-sm font-medium">{user.email}</div>
          </div>
          <div>
            <div className="text-xs sm:text-sm text-gray-600">Role</div>
            <div className="text-xs sm:text-sm font-medium capitalize">{user.role}</div>
          </div>
          <div>
            <div className="text-xs sm:text-sm text-gray-600">Storage Used</div>
            <div className="text-xs sm:text-sm font-medium flex items-center gap-1">
              <HardDrive className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600" />
              {formatBytes(user.storageUsed)}
            </div>
          </div>
          <div>
            <div className="text-xs sm:text-sm text-gray-600">Total Files</div>
            <div className="text-xs sm:text-sm font-medium flex items-center gap-1">
              <Upload className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600" />
              {mediaList.length}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search and Filter */}
      <Card className="mb-2 sm:mb-3 md:mb-4">
        <CardContent className="p-2 sm:p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 text-xs sm:text-sm"
              />
            </div>
            <select
              className="w-full p-2 sm:p-2.5 border rounded text-xs sm:text-sm"
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
            >
              <option value="all">All Folders</option>
              {folders.map((folder) => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Media Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">File</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Folder</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Section</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Uploaded</th>
                  <th className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedMedia.map((media) => (
                  <tr key={media._id} className="hover:bg-gray-50">
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap">
                      <div className="text-xs sm:text-sm font-medium text-gray-900 truncate max-w-[150px] sm:max-w-xs">
                        {media.originalName}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                      {media.mimeType.split('/')[1].toUpperCase()}
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                      {formatBytes(media.size)}
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                      <div className="flex items-center gap-1">
                        <Folder className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-gray-600" />
                        {media.folder || '-'}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                      Section {media.section}
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-500">
                      {new Date(media.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-2 sm:py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium">
                      <div className="flex gap-1 sm:gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => window.open(media.url, '_blank')}
                        >
                          <Download className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleDelete(media._id)}
                        >
                          <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredMedia.length === 0 && (
            <div className="text-center py-8 sm:py-12 text-gray-500 text-xs sm:text-sm">
              {mediaList.length === 0 ? 'No media files found for this user' : 'No media files match your filters.'}
            </div>
          )}
          {filteredMedia.length > filesPerPage && (
            <div className="flex items-center justify-between px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-t">
              <div className="text-xs sm:text-sm text-gray-600">
                Showing {(currentPage - 1) * filesPerPage + 1} to {Math.min(currentPage * filesPerPage, filteredMedia.length)} of {filteredMedia.length} files
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
  );
};
