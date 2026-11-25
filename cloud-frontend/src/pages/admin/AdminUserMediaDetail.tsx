import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mediaAPI, userAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ArrowLeft, Search, Folder, HardDrive, Upload, Trash2 } from 'lucide-react';
import { MediaActions } from '../../components/admin/MediaActions';
import { MediaThumbnail } from '../../components/MediaThumbnail';
import { Pagination } from '../../components/admin/Pagination';
import { SkeletonGrid } from '../../components/ui/Skeleton';
import { useUrlParam, useUrlNumberParam } from '../../hooks/useUrlParam';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';

export const AdminUserMediaDetail = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useUrlParam('q');
  const [searchInput, setSearchInput] = useState(searchTerm);
  const [folderFilter, setFolderFilter] = useUrlParam('folder', 'all');
  const [currentPage, setCurrentPage] = useUrlNumberParam('page', 1);
  const filesPerPage = 15;
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { success, error: toastError } = useToast();

  const userQuery = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: async () => {
      const response = await userAPI.getUser(userId);
      return response.data;
    },
    enabled: !!userId,
  });

  const foldersQuery = useQuery({
    queryKey: ['admin-user-folders', userId],
    queryFn: async () => {
      const response = await mediaAPI.getFolders({ uploadedBy: userId });
      const data = response.data.data || response.data || [];
      return Array.isArray(data) ? data : [];
    },
    enabled: !!userId,
  });

  const mediaQuery = useQuery({
    queryKey: ['admin-user-media', userId, currentPage, searchTerm, folderFilter],
    queryFn: async () => {
      const response = await mediaAPI.getMedia({
        uploadedBy: userId,
        page: currentPage,
        limit: filesPerPage,
        search: searchTerm || undefined,
        folder: folderFilter !== 'all' ? folderFilter : undefined,
      });
      return response.data;
    },
    enabled: !!userId,
  });

  const user = userQuery.data || null;
  const mediaList = mediaQuery.data?.data || [];
  const folders = foldersQuery.data || [];
  const loading = mediaQuery.isLoading || userQuery.isLoading;
  const totalMedia = mediaQuery.data?.total || 0;
  const totalPages = mediaQuery.data?.totalPages || 1;

  const loadUserMedia = () => queryClient.invalidateQueries({ queryKey: ['admin-user-media', userId] });
  const loadFolders = () => queryClient.invalidateQueries({ queryKey: ['admin-user-folders', userId] });

  // Debounce search input -> URL param (400ms)
  useEffect(() => {
    setSearchInput(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchTerm) setSearchTerm(searchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, folderFilter]);

  // Clear selection when the visible page/filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentPage, searchTerm, folderFilter]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allPageSelected = mediaList.length > 0 && mediaList.every((m) => selectedIds.has(m._id));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allPageSelected) {
        const next = new Set(prev);
        mediaList.forEach((m) => next.delete(m._id));
        return next;
      }
      const next = new Set(prev);
      mediaList.forEach((m) => next.add(m._id));
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    await Promise.all(
      Array.from(selectedIds).map(async (id) => {
        try {
          await mediaAPI.deleteMedia(id);
          ok++;
        } catch {
          fail++;
        }
      })
    );
    setBulkBusy(false);
    setBulkDeleteOpen(false);
    setSelectedIds(new Set());
    loadUserMedia();
    loadFolders();
    if (fail === 0) success(`${ok} file(s) deleted`);
    else toastError(`Deleted ${ok}, failed ${fail}`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await mediaAPI.deleteMedia(deleteTarget);
      setDeleteTarget(null);
      success('Media deleted');
      loadUserMedia();
      loadFolders();
    } catch (error) {
      toastError('Delete failed');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const renderMediaActions = (media: any) => (
    <MediaActions url={media.url} onDelete={() => setDeleteTarget(media._id)} />
  );

  if (loading) {
    return (
      <div className="p-1 sm:p-1.5 md:p-2 w-full">
        <SkeletonGrid count={12} />
      </div>
    );
  }

  if (!user) {
    return <div className="flex items-center justify-center h-screen">User not found</div>;
  }

  return (
    <div className="p-1 sm:p-1.5 md:p-2 w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-2 sm:mb-3">
        <Button variant="secondary" onClick={() => navigate('/admin/library')} className="text-xs sm:text-sm">
          <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">Back to Library</span>
          <span className="sm:hidden">←</span>
        </Button>
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 truncate">
          Media for {user.email}
        </h1>
      </div>

      {/* User Info Card */}
      <Card className="mb-2">
        <CardHeader>
          <CardTitle className="text-[10px] sm:text-xs md:text-sm">User Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
      <Card className="mb-2">
        <CardContent className="p-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search files..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
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
                <option key={folder.name} value={folder.name}>
                  {folder.name} ({folder.count})
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <Card className="mb-2 border-blue-200 bg-blue-50">
          <CardContent className="p-2 flex flex-wrap items-center gap-2">
            <span className="text-xs sm:text-sm font-medium text-blue-800">
              {selectedIds.size} selected
            </span>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={bulkBusy}
              className="text-xs sm:text-sm"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Delete
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkBusy}
              className="text-xs sm:text-sm"
            >
              Clear
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Media Table */}
      <Card>
        <CardContent className="p-0">
          {/* Mobile / tablet: card list — no horizontal scroll */}
          <div className="lg:hidden divide-y divide-gray-200">
            {mediaList.map((media) => (
              <div key={media._id} className="p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(media._id)}
                      onChange={() => toggleSelect(media._id)}
                      className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                    />
                    <div className="min-w-0 flex items-start gap-2">
                      <MediaThumbnail url={media.url} mimeType={media.mimeType} name={media.originalName} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate" title={media.originalName}>{media.originalName}</div>
                        <div className="text-[11px] text-gray-500">
                          {media.mimeType.split('/')[1].toUpperCase()} · {formatBytes(media.size)} · Section {media.section}
                        </div>
                      </div>
                    </div>
                  </div>
                  {renderMediaActions(media)}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-gray-500 truncate">
                  <Folder className="w-2.5 h-2.5 text-gray-600 shrink-0" />
                  <span className="truncate">{media.folder || '—'}</span>
                  <span className="ml-auto shrink-0">{new Date(media.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: compact full-width table */}
          <div className="hidden lg:block">
            <table className="w-full table-fixed text-[11px]">
              <colgroup>
                <col className="w-[4%]" />
                <col className="w-[26%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[14%]" />
                <col className="w-[10%]" />
                <col className="w-[20%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-2 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">File</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Size</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Folder</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Section</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Uploaded</th>
                  <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {mediaList.map((media) => (
                  <tr key={media._id} className="hover:bg-gray-50">
                    <td className="px-2 py-2 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(media._id)}
                        onChange={() => toggleSelect(media._id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <MediaThumbnail url={media.url} mimeType={media.mimeType} name={media.originalName} />
                        <div className="text-xs font-medium text-gray-900 truncate" title={media.originalName}>{media.originalName}</div>
                      </div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900">{media.mimeType.split('/')[1].toUpperCase()}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900">{formatBytes(media.size)}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900 truncate" title={media.folder || ''}>
                      <div className="flex items-center gap-1">
                        <Folder className="w-2.5 h-2.5 text-gray-600 shrink-0" />
                        <span className="truncate">{media.folder || '—'}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-900">Section {media.section}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-500 truncate" title={new Date(media.createdAt).toLocaleString()}>{new Date(media.createdAt).toLocaleString()}</td>
                    <td className="px-1.5 py-1.5 whitespace-nowrap font-medium">
                      {renderMediaActions(media)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {mediaList.length === 0 && (
            <div className="text-center py-8 sm:py-12 text-gray-500 text-xs sm:text-sm">
              {totalMedia === 0 ? 'No media files found for this user' : 'No media files match your filters.'}
            </div>
          )}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            total={totalMedia}
            perPage={filesPerPage}
            onPageChange={setCurrentPage}
            itemLabel="files"
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Media"
        message="Are you sure you want to delete this media file? This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        title="Delete Selected Files"
        message={`Delete ${selectedIds.size} selected file(s)? This cannot be undone.`}
        confirmLabel={bulkBusy ? 'Deleting...' : 'Delete'}
        danger
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteOpen(false)}
      />
    </div>
  );
};
