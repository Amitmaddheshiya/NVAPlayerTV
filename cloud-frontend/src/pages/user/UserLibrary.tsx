import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mediaAPI, configAPI, userAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { SkeletonGrid } from '../../components/ui/Skeleton';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Trash2, Download, HardDrive, FolderPlus, Folder, Search, Image, Video, FileText, Edit2, ChevronRight, Home, Grid3X3, List } from 'lucide-react';
import { MediaThumbnail } from '../../components/MediaThumbnail';

const getRequestErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback;

export const UserLibrary = () => {
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null); // null = root
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedFilesForDelete, setSelectedFilesForDelete] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [folderPage, setFolderPage] = useState(1);
  const filesPerPage = 10;
  const foldersPerPage = 10;
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    showConfirm?: boolean;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
  });

  const mediaQuery = useQuery({
    queryKey: ['user-library-media', currentPage, searchTerm, currentFolder, typeFilter],
    queryFn: async () => {
      const params: any = { page: currentPage, limit: filesPerPage };
      params.folder = currentFolder || 'general';
      if (typeFilter && typeFilter !== 'all') params.type = typeFilter;
      if (searchTerm) params.search = searchTerm;
      const [response, foldersResponse] = await Promise.all([
        mediaAPI.getMedia(params),
        mediaAPI.getFolders(),
      ]);
      return {
        media: response.data.data || response.data,
        folders: foldersResponse.data.data || foldersResponse.data || [],
        total: response.data.total || 0,
        totalPages: response.data.totalPages || 0,
      };
    },
  });

  const storageQuery = useQuery({
    queryKey: ['user-library-storage'],
    queryFn: async () => {
      try {
        const [configRes, userRes] = await Promise.all([
          configAPI.getConfig(),
          userAPI.getMe(),
        ]);
        const usage = userRes.data.usage;
        let storageLimit = 0;
        if (usage?.storage?.limitBytes) storageLimit = usage.storage.limitBytes;
        else if (usage?.storage?.limitGB) storageLimit = usage.storage.limitGB * 1024 * 1024 * 1024;
        return {
          monthlyLimit: configRes.data.monthlyUploadLimitGB * 1024 * 1024 * 1024,
          currentMonthUpload: userRes.data.currentMonthUpload || 0,
          storageUsed: userRes.data.storageUsed || 0,
          storageLimit,
        };
      } catch {
        return {
          monthlyLimit: 10 * 1024 * 1024 * 1024,
          currentMonthUpload: 0,
          storageUsed: 0,
          storageLimit: 1 * 1024 * 1024 * 1024,
        };
      }
    },
  });

  const mediaList = mediaQuery.data?.media || [];
  const folders: { name: string; count: number }[] = mediaQuery.data?.folders || [];
  const filteredMedia = mediaList;
  const loading = mediaQuery.isLoading;
  const totalMedia = mediaQuery.data?.total || 0;
  const totalPages = mediaQuery.data?.totalPages || 0;
  const storageUsed = storageQuery.data?.storageUsed || 0;
  const storageLimit = storageQuery.data?.storageLimit || 0;
  const monthlyLimit = storageQuery.data?.monthlyLimit || 0;
  const currentMonthUpload = storageQuery.data?.currentMonthUpload || 0;

  const loadMedia = () => queryClient.invalidateQueries({ queryKey: ['user-library-media'] });
  const loadStorageInfo = () => queryClient.invalidateQueries({ queryKey: ['user-library-storage'] });

  // No client-side filtering - all filtering happens on server
  const paginatedMedia = filteredMedia;

  const handleUpload = async () => {
    if (!selectedFile && selectedFiles.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    try {
      if (selectedFiles.length > 0) {
        // Multiple file upload
        const totalBytes = selectedFiles.reduce((total, file) => total + file.size, 0);
        let completedBytes = 0;
        for (const file of selectedFiles) {
          await mediaAPI.uploadMedia(
            file,
            undefined,
            undefined,
            currentFolder || undefined,
            (percent) => setUploadProgress(totalBytes
              ? Math.round(((completedBytes + file.size * percent / 100) / totalBytes) * 100)
              : 100),
          );
          completedBytes += file.size;
        }
        setSelectedFiles([]);
      } else {
        // Single file upload (backward compatibility)
        if (selectedFile) {
          await mediaAPI.uploadMedia(
            selectedFile,
            undefined,
            undefined,
            currentFolder || undefined,
            setUploadProgress,
          );
        }
        setSelectedFile(null);
      }
      loadMedia();
      loadStorageInfo();
      setAlertState({
        isOpen: true,
        title: 'Success',
        message: 'Files uploaded successfully',
        type: 'success',
      });
    } catch (error) {
      setAlertState({
        isOpen: true,
        title: 'Upload Failed',
        message: getRequestErrorMessage(error, 'Failed to upload files. Please try again.'),
        type: 'error',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    // Folders are virtual - they exist when media has that folder name
    // Just set the current folder to the new name
    setCurrentFolder(newFolderName);
    setNewFolderName('');
    setShowNewFolder(false);
  };

  const handleRenameFolder = async () => {
    if (!editingFolder || !editingFolderName.trim()) return;

    // Update all media with the old folder name to the new name
    try {
      const mediaInFolder = mediaList.filter((m) => m.folder === editingFolder);
      
      for (const media of mediaInFolder) {
        await mediaAPI.updateMedia(media._id, { folder: editingFolderName });
      }
      
      loadMedia();
      setCurrentFolder(editingFolderName);
      setEditingFolder(null);
      setEditingFolderName('');
      setAlertState({
        isOpen: true,
        title: 'Success',
        message: 'Folder renamed successfully',
        type: 'success',
      });
    } catch (error) {
      setAlertState({
        isOpen: true,
        title: 'Rename Failed',
        message: 'Failed to rename folder. Please try again.',
        type: 'error',
      });
    }
  };

  const handleDeleteFolder = async () => {
    if (!currentFolder) return;
    
    setAlertState({
      isOpen: true,
      title: 'Delete Folder',
      message: `Are you sure you want to delete folder "${currentFolder}" and all its files?`,
      type: 'warning',
      showConfirm: true,
      onConfirm: async () => {
        try {
          const mediaInFolder = mediaList.filter((m) => m.folder === currentFolder);
          
          for (const media of mediaInFolder) {
            await mediaAPI.deleteMedia(media._id);
          }
          
          setCurrentFolder(null);
          loadMedia();
          loadStorageInfo();
          setAlertState({
            isOpen: true,
            title: 'Success',
            message: 'Folder deleted successfully',
            type: 'success',
          });
        } catch (error) {
          setAlertState({
            isOpen: true,
            title: 'Delete Failed',
            message: 'Failed to delete folder. Please try again.',
            type: 'error',
          });
        }
      },
    });
  };

  const handleDelete = async (id: string) => {
    setAlertState({
      isOpen: true,
      title: 'Delete File',
      message: 'Are you sure you want to delete this media file?',
      type: 'warning',
      showConfirm: true,
      onConfirm: async () => {
        try {
          const response = await mediaAPI.deleteMedia(id);
          loadMedia();
          loadStorageInfo();
          setAlertState({
            isOpen: true,
            title: 'Success',
            message: response.data?.archived
              ? `${response.data.message}. Existing device configurations and TV caches are unchanged.`
              : 'File deleted successfully',
            type: 'success',
          });
        } catch (error) {
          setAlertState({
            isOpen: true,
            title: 'Delete Failed',
            message: 'Failed to delete file. Please try again.',
            type: 'error',
          });
        }
      },
    });
  };

  const handleToggleFileSelection = (id: string) => {
    setSelectedFilesForDelete((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedFilesForDelete.size === filteredMedia.length) {
      setSelectedFilesForDelete(new Set());
    } else {
      setSelectedFilesForDelete(new Set(filteredMedia.map((m) => m._id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedFilesForDelete.size === 0) return;

    setAlertState({
      isOpen: true,
      title: 'Delete Selected Files',
      message: `Are you sure you want to delete ${selectedFilesForDelete.size} file(s)?`,
      type: 'warning',
      showConfirm: true,
      onConfirm: async () => {
        try {
          let retained = 0;
          for (const id of selectedFilesForDelete) {
            const response = await mediaAPI.deleteMedia(id);
            if (response.data?.archived) retained += 1;
          }
          const selectedCount = selectedFilesForDelete.size;
          setSelectedFilesForDelete(new Set());
          loadMedia();
          loadStorageInfo();
          setAlertState({
            isOpen: true,
            title: 'Success',
            message: retained
              ? `${selectedCount} file(s) removed from the library; ${retained} file(s) remain stored for saved TV configurations.`
              : `${selectedCount} file(s) deleted successfully`,
            type: 'success',
          });
        } catch (error) {
          setAlertState({
            isOpen: true,
            title: 'Delete Failed',
            message: 'Failed to delete some files. Please try again.',
            type: 'error',
          });
        }
      },
    });
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getMediaTypeIcon = (mimeType: string) => {
    if (mimeType.startsWith('image')) return <Image className="w-4 h-4" />;
    if (mimeType.startsWith('video')) return <Video className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  // Folders come from the dedicated endpoint: mediaList is filtered to the
  // current folder only, so deriving folders from it would hide every other
  // folder (including newly created ones) from the root folder grid.
  const allFolders = folders.map((folder) => folder.name);
  const folderCountMap = new Map(folders.map((folder) => [folder.name, folder.count]));
  
  // Pagination for folders
  const paginatedFolders = allFolders.slice(
    (folderPage - 1) * foldersPerPage,
    folderPage * foldersPerPage
  );
  const folderTotalPages = Math.ceil(allFolders.length / foldersPerPage);
  
  const currentFolderCount = mediaList.filter((m) => 
    currentFolder === null ? !m.folder : m.folder === currentFolder
  ).length;

  if (loading) {
    return (
      <div className="p-1 sm:p-1.5 md:p-2 w-full">
        <SkeletonGrid count={12} />
      </div>
    );
  }

  return (
    <>
      <div className="p-2 sm:p-4 md:p-6 max-w-[95vw] sm:max-w-[1200px] mx-auto overflow-x-hidden">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6 px-1">My Library</h1>

          {/* Storage Summary */}
          <Card className="mb-3 sm:mb-4 w-full">
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="flex items-center gap-2 text-xs sm:text-sm">
                <HardDrive className="w-3 h-3 sm:w-4 sm:h-4" />
                Storage Usage
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2 sm:pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                <div className="p-2 sm:p-3 bg-blue-50 rounded-lg">
                  <div className="text-[10px] sm:text-xs text-blue-800">Library Storage</div>
                  <div className="text-sm sm:text-lg font-bold text-blue-600">{formatBytes(storageUsed)} / {formatBytes(storageLimit)}</div>
                </div>
                <div className="p-2 sm:p-3 bg-green-50 rounded-lg">
                  <div className="text-[10px] sm:text-xs text-green-800">This Month Upload</div>
                  <div className="text-sm sm:text-lg font-bold text-green-600">{formatBytes(currentMonthUpload)}</div>
                </div>
                <div className="p-2 sm:p-3 bg-purple-50 rounded-lg">
                  <div className="text-[10px] sm:text-xs text-purple-800">Monthly Upload Limit</div>
                  <div className="text-sm sm:text-lg font-bold text-purple-600">{formatBytes(monthlyLimit)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Folder Navigation & Upload */}
          <Card className="mb-3 sm:mb-4 w-full">
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs sm:text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Folder className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="truncate">{currentFolder ? currentFolder : 'Root Folder'}</span>
                  <span className="text-[10px] sm:text-xs font-normal text-gray-500 flex-shrink-0">({currentFolderCount} files)</span>
                </div>
                <div className="flex gap-1 sm:gap-2 flex-wrap">
                  {currentFolder && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setEditingFolder(currentFolder)}>
                        <Edit2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                        <span className="hidden sm:inline">Rename</span>
                      </Button>
                      <Button size="sm" variant="danger" onClick={handleDeleteFolder}>
                        <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                        <span className="hidden sm:inline">Delete</span>
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => setShowNewFolder(!showNewFolder)}>
                    <FolderPlus className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                    <span className="hidden sm:inline">New Folder</span>
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 sm:space-y-3">
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 text-[10px] sm:text-xs">
                <button
                  onClick={() => setCurrentFolder(null)}
                  className={`flex items-center gap-1 px-2 sm:px-3 py-1 rounded ${!currentFolder ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100'}`}
                >
                  <Home className="w-3 h-3 sm:w-4 sm:h-4" />
                  Root
                </button>
                {currentFolder && (
                  <>
                    <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                    <span className="px-2 sm:px-3 py-1 bg-blue-100 text-blue-800 rounded">{currentFolder}</span>
                  </>
                )}
              </div>

              {/* Folder List (when in root) */}
              {currentFolder === null && allFolders.length > 0 && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3 md:gap-4">
                    {paginatedFolders.map((folder) => (
                      <div
                        key={folder}
                        onClick={() => setCurrentFolder(folder)}
                        className="p-2 sm:p-3 md:p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors border"
                      >
                        <Folder className="w-6 h-6 sm:w-8 sm:h-8 text-blue-500 mb-1 sm:mb-2" />
                        <div className="text-xs sm:text-sm font-medium truncate">{folder}</div>
                        <div className="text-[10px] sm:text-xs text-gray-500">
                          {folderCountMap.get(folder) ?? 0} files
                        </div>
                      </div>
                    ))}
                  </div>
                  {allFolders.length > foldersPerPage && (
                    <div className="flex items-center justify-between pt-3 mt-3 border-t">
                      <div className="text-[10px] sm:text-xs text-gray-600">
                        Showing {(folderPage - 1) * foldersPerPage + 1} to {Math.min(folderPage * foldersPerPage, allFolders.length)} of {allFolders.length} folders
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setFolderPage((prev) => Math.max(1, prev - 1))}
                          disabled={folderPage === 1}
                          className="text-[10px] sm:text-xs"
                        >
                          Previous
                        </Button>
                        <span className="text-[10px] sm:text-xs text-gray-600 flex items-center px-2">
                          {folderPage} / {folderTotalPages}
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setFolderPage((prev) => Math.min(folderTotalPages, prev + 1))}
                          disabled={folderPage === folderTotalPages}
                          className="text-[10px] sm:text-xs"
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {showNewFolder && (
                <div className="flex gap-2 p-2 sm:p-3 md:p-4 bg-gray-50 rounded-lg">
                  <Input
                    placeholder="Folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="flex-1 text-xs sm:text-sm"
                  />
                  <Button onClick={handleCreateFolder} className="text-xs sm:text-sm">Create</Button>
                  <Button variant="secondary" onClick={() => setShowNewFolder(false)} className="text-xs sm:text-sm">Cancel</Button>
                </div>
              )}

              {editingFolder && (
                <div className="flex gap-2 p-2 sm:p-3 md:p-4 bg-gray-50 rounded-lg">
                  <Input
                    placeholder="New folder name"
                    value={editingFolderName}
                    onChange={(e) => setEditingFolderName(e.target.value)}
                    className="flex-1 text-xs sm:text-sm"
                  />
                  <Button onClick={handleRenameFolder} className="text-xs sm:text-sm">Save</Button>
                  <Button variant="secondary" onClick={() => { setEditingFolder(null); setEditingFolderName(''); }} className="text-xs sm:text-sm">Cancel</Button>
                </div>
              )}

              {/* Upload */}
              <div className="border-t pt-3 sm:pt-4">
                <div className="flex flex-col gap-3 sm:gap-4">
                  <label className="text-xs sm:text-sm font-medium text-gray-700">
                    Upload to {currentFolder ? `"${currentFolder}"` : 'Root'}
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                    <Input
                      type="file"
                      accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.mp4,.m4v,.mov,.mkv,.webm,.avi,.3gp,.mpg,.mpeg,.pdf"
                      multiple
                      onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
                      className="text-xs sm:text-sm flex-1"
                    />
                    <Button onClick={handleUpload} disabled={selectedFiles.length === 0 || uploading} className="h-9 sm:h-10 w-full sm:w-auto items-center justify-center">
                      {uploading ? 'Uploading...' : 'Upload'}
                    </Button>
                  </div>
                  {uploading ? (
                    <div className="space-y-1" role="status" aria-live="polite">
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>Uploading media securely</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <progress className="h-2 w-full accent-blue-600" value={uploadProgress} max={100} />
                    </div>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Search & Filter */}
          <Card className="mb-3 sm:mb-4 w-full">
            <CardContent className="p-2 sm:p-3">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                  <Input
                    placeholder={`Search files in ${currentFolder ? `"${currentFolder}"` : 'Root'}...`}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 text-xs sm:text-sm w-full"
                  />
                </div>
                <div className="flex gap-2 sm:gap-3">
                  <select
                    className="flex-1 sm:flex-none p-1.5 sm:p-2 border rounded text-[10px] sm:text-xs min-w-[100px]"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                  >
                    <option value="all">All Types</option>
                    <option value="image">Images</option>
                    <option value="video">Videos</option>
                    <option value="other">Other</option>
                  </select>
                  <div className="flex gap-2">
                    <Button
                      variant={viewMode === 'table' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setViewMode('table')}
                      className="px-2 sm:px-3"
                    >
                      <List className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'grid' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setViewMode('grid')}
                      className="px-2 sm:px-3"
                    >
                      <Grid3X3 className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Media Display */}
          <Card className="w-full">
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs sm:text-sm">
                <span>{currentFolder ? `"${currentFolder}"` : 'Root'} Files ({filteredMedia.length})</span>
                <div className="flex items-center gap-2">
                  {selectedFilesForDelete.size > 0 && (
                    <>
                      <span className="text-[10px] sm:text-xs text-gray-500">
                        {selectedFilesForDelete.size} selected
                      </span>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={handleDeleteSelected}
                        className="px-2 py-1 text-[10px] sm:text-xs"
                      >
                        Delete Selected
                      </Button>
                    </>
                  )}
                  {filteredMedia.length > 0 && (
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedFilesForDelete.size === filteredMedia.length && filteredMedia.length > 0}
                        onChange={handleSelectAll}
                        className="w-3 h-3 sm:w-4 sm:h-4"
                      />
                      <span className="text-[10px] sm:text-xs">All</span>
                    </label>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2 sm:pt-3">
              {viewMode === 'table' ? (
                <div className="space-y-2 sm:space-y-0">
                  {/* Mobile Card View */}
                  <div className="sm:hidden space-y-2">
                    {paginatedMedia.map((media) => (
                      <div key={media._id} className={`bg-white border rounded-lg p-3 space-y-2 ${selectedFilesForDelete.has(media._id) ? 'border-blue-500 bg-blue-50' : ''}`}>
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={selectedFilesForDelete.has(media._id)}
                            onChange={() => handleToggleFileSelection(media._id)}
                            className="w-4 h-4 mt-0.5 flex-shrink-0"
                          />
                          <div className="flex-shrink-0 mt-0.5">
                            <MediaThumbnail url={media.url} mimeType={media.mimeType} name={media.originalName} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-900 truncate" title={media.originalName}>
                              {media.originalName}
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              {media.mimeType.split('/')[1].toUpperCase()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t">
                          <div className="text-[10px] text-gray-500">
                            <div>{formatBytes(media.size)}</div>
                            <div className="mt-0.5">{new Date(media.createdAt).toLocaleDateString()}</div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => window.open(media.url, '_blank')}
                              className="px-2 py-1"
                            >
                              <Download className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleDelete(media._id)}
                              className="px-2 py-1"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop Table View */}
                  <div className="hidden sm:block overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0">
                    <table className="w-full min-w-full text-[10px] sm:text-xs">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider w-10">
                            <input
                              type="checkbox"
                              checked={selectedFilesForDelete.size === filteredMedia.length && filteredMedia.length > 0}
                              onChange={handleSelectAll}
                              className="w-3 h-3 sm:w-4 sm:h-4"
                            />
                          </th>
                          <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">File</th>
                          <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Type</th>
                          <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Size</th>
                          <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">Uploaded</th>
                          <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {paginatedMedia.map((media) => (
                          <tr key={media._id} className={`hover:bg-gray-50 ${selectedFilesForDelete.has(media._id) ? 'bg-blue-50' : ''}`}>
                            <td className="px-2 sm:px-3 py-1.5 sm:py-2">
                              <input
                                type="checkbox"
                                checked={selectedFilesForDelete.has(media._id)}
                                onChange={() => handleToggleFileSelection(media._id)}
                                className="w-3 h-3 sm:w-4 sm:h-4"
                              />
                            </td>
                            <td className="px-2 sm:px-3 py-1.5 sm:py-2">
                              <div className="flex items-center gap-2">
                                <MediaThumbnail url={media.url} mimeType={media.mimeType} name={media.originalName} />
                                <div className="text-[10px] sm:text-xs font-medium text-gray-900 truncate max-w-[150px] md:max-w-xs">
                                  {media.originalName}
                                </div>
                              </div>
                            </td>
                            <td className="px-2 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap">
                              <div className="flex items-center gap-1 text-[10px] sm:text-xs text-gray-900">
                                {getMediaTypeIcon(media.mimeType)}
                                {media.mimeType.split('/')[1].toUpperCase()}
                              </div>
                            </td>
                            <td className="px-2 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap text-[10px] sm:text-xs text-gray-900">
                              {formatBytes(media.size)}
                            </td>
                            <td className="px-2 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap text-[10px] sm:text-xs text-gray-500">
                              {new Date(media.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right">
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => window.open(media.url, '_blank')}
                                >
                                  <Download className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => handleDelete(media._id)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
                  {paginatedMedia.map((media) => (
                    <div key={media._id} className={`bg-gray-50 rounded-lg overflow-hidden hover:shadow-md transition-shadow relative ${selectedFilesForDelete.has(media._id) ? 'ring-2 ring-blue-500' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selectedFilesForDelete.has(media._id)}
                        onChange={() => handleToggleFileSelection(media._id)}
                        className="absolute top-2 left-2 z-10 w-4 h-4 sm:w-5 sm:h-5 cursor-pointer"
                      />
                      <div className="aspect-square bg-gray-200 flex items-center justify-center relative">
                        {media.mimeType.startsWith('image') ? (
                          <img
                            src={media.url}
                            alt={media.originalName}
                            className="w-full h-full object-cover"
                          />
                        ) : media.mimeType.startsWith('video') ? (
                          <Video className="w-10 h-10 text-gray-400" />
                        ) : (
                          <FileText className="w-10 h-10 text-gray-400" />
                        )}
                      </div>
                      <div className="p-1.5 sm:p-2">
                        <div className="text-[10px] sm:text-xs font-medium truncate mb-1" title={media.originalName}>
                          {media.originalName}
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="text-[10px] text-gray-500">
                            {formatBytes(media.size)}
                          </div>
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="p-1"
                              onClick={() => window.open(media.url, '_blank')}
                            >
                              <Download className="w-2.5 h-2.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              className="p-1"
                              onClick={() => handleDelete(media._id)}
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {filteredMedia.length === 0 && (
                <div className="text-center py-8 sm:py-12 text-gray-500 text-xs sm:text-sm">
                  No media files found.
                </div>
              )}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t mt-4">
                  <div className="text-xs sm:text-sm text-gray-600">
                    Showing {(currentPage - 1) * filesPerPage + 1} to {Math.min(currentPage * filesPerPage, totalMedia)} of {totalMedia} files
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

        <Alert
          isOpen={alertState.isOpen}
          onClose={() => setAlertState({ ...alertState, isOpen: false })}
          title={alertState.title}
          message={alertState.message}
          type={alertState.type}
          showConfirm={alertState.showConfirm}
          onConfirm={alertState.onConfirm}
        />
    </>
  );
};
