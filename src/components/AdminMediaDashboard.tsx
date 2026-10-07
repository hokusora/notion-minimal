import React, { useState, useEffect, useMemo } from 'react';
import {
  HardDrive,
  Users,
  Files,
  Search,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Shield,
  Filter,
  FileText,
  Image as ImageIcon
} from 'lucide-react';
import { MediaItem } from '../types/index.ts';
import { subscribeAllMedia, deleteMediaItem, ADMIN_EMAIL } from '../services/workspace.ts';
import { useAuth } from '../context/AuthContext.tsx';

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export const AdminMediaDashboard: React.FC = () => {
  const { user } = useAuth();
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<MediaItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Subscribe to real-time media updates
  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = subscribeAllMedia((items) => {
      setMediaList(items);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Compute aggregate metrics
  const totalStorageBytes = useMemo(() => {
    return mediaList.reduce((acc, curr) => acc + (curr.fileSize || 0), 0);
  }, [mediaList]);

  // Aggregate by user
  const userStats = useMemo(() => {
    const map = new Map<
      string,
      {
        userId: string;
        userEmail: string;
        userName: string;
        fileCount: number;
        totalBytes: number;
      }
    >();

    for (const item of mediaList) {
      const existing = map.get(item.userId) || {
        userId: item.userId,
        userEmail: item.userEmail || 'unknown@user.com',
        userName: item.userName || 'Anonymous User',
        fileCount: 0,
        totalBytes: 0,
      };

      existing.fileCount += 1;
      existing.totalBytes += item.fileSize || 0;
      map.set(item.userId, existing);
    }

    return Array.from(map.values()).sort((a, b) => b.totalBytes - a.totalBytes);
  }, [mediaList]);

  // Filtered media items
  const filteredMedia = useMemo(() => {
    return mediaList.filter((item) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        item.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.userEmail.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesUser =
        selectedUserFilter === 'all' || item.userId === selectedUserFilter;

      return matchesSearch && matchesUser;
    });
  }, [mediaList, searchQuery, selectedUserFilter]);

  const handleCopyUrl = (item: MediaItem) => {
    const fullUrl = item.fileUrl.startsWith('http')
      ? item.fileUrl
      : `${window.location.origin}${item.fileUrl}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      setIsDeleting(true);
      await deleteMediaItem(itemToDelete);
      setItemToDelete(null);
    } catch (err) {
      console.error('[Admin] Delete media failed:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // 5GB Free Tier constant in bytes
  const FREE_TIER_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;
  const freeTierPercent = Math.min(
    100,
    parseFloat(((totalStorageBytes / FREE_TIER_LIMIT_BYTES) * 100).toFixed(2))
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FAF9F7] overflow-y-auto">
      {/* Top Bar Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-[rgba(55,53,47,0.08)] px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center shadow-xs">
            <Shield className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-[#37352F] flex items-center gap-2">
              <span>Admin Media & Storage Center</span>
              <span className="text-[10px] font-medium bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                Admin Mode
              </span>
            </h1>
            <p className="text-[11px] text-[#787774]">
              Authenticated as <span className="font-mono text-[#37352F]">{user?.email || ADMIN_EMAIL}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#787774]">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F7F6F5] border border-[rgba(55,53,47,0.08)]">
            <HardDrive className="w-3.5 h-3.5 text-[#37352F]" />
            <span className="font-mono tabular-nums font-medium text-[#37352F]">
              {formatBytes(totalStorageBytes)}
            </span>{' '}
            / 5.0 GB Free Tier
          </span>
        </div>
      </div>

      <div className="max-w-6xl w-full mx-auto px-8 py-6 space-y-6">
        {/* Metric Cards Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Total Storage */}
          <div className="bg-white p-5 rounded-xl border border-[rgba(55,53,47,0.08)] shadow-2xs">
            <div className="flex items-center justify-between mb-3 text-xs text-[#787774]">
              <span className="font-medium">Total Storage Used</span>
              <HardDrive className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-[#37352F] mb-2">
              {formatBytes(totalStorageBytes)}
            </div>
            <div className="space-y-1">
              <div className="w-full bg-neutral-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(freeTierPercent, 1)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-[#787774]">
                <span>{freeTierPercent}% of 5 GB</span>
                <span>Spark Free Tier</span>
              </div>
            </div>
          </div>

          {/* Card 2: Total Files */}
          <div className="bg-white p-5 rounded-xl border border-[rgba(55,53,47,0.08)] shadow-2xs">
            <div className="flex items-center justify-between mb-3 text-xs text-[#787774]">
              <span className="font-medium">Uploaded Media Files</span>
              <Files className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-[#37352F] mb-1">
              {mediaList.length}
            </div>
            <p className="text-[11px] text-[#787774]">
              {mediaList.filter((m) => m.mimeType?.startsWith('image/')).length} images,{' '}
              {mediaList.filter((m) => !m.mimeType?.startsWith('image/')).length} other files
            </p>
          </div>

          {/* Card 3: Uploaders */}
          <div className="bg-white p-5 rounded-xl border border-[rgba(55,53,47,0.08)] shadow-2xs">
            <div className="flex items-center justify-between mb-3 text-xs text-[#787774]">
              <span className="font-medium">Active Uploading Users</span>
              <Users className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-[#37352F] mb-1">
              {userStats.length}
            </div>
            <p className="text-[11px] text-[#787774]">
              User accounts with persistent cloud storage usage
            </p>
          </div>
        </div>

        {/* User Quota Breakdown Table */}
        <div className="bg-white rounded-xl border border-[rgba(55,53,47,0.08)] shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[rgba(55,53,47,0.06)] flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold text-[#37352F] uppercase tracking-wider">
                Per-User Storage Quota Breakdown
              </h2>
              <p className="text-[11px] text-[#787774]">
                Aggregated storage consumption and file totals per user account
              </p>
            </div>
            {selectedUserFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedUserFilter('all')}
                className="text-xs text-emerald-700 hover:text-emerald-900 font-medium"
              >
                Clear User Filter
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAF9F7] text-[#787774] border-b border-[rgba(55,53,47,0.06)]">
                  <th className="py-2.5 px-5 font-medium">User Profile</th>
                  <th className="py-2.5 px-4 font-medium">Email</th>
                  <th className="py-2.5 px-4 font-medium text-right">Files</th>
                  <th className="py-2.5 px-4 font-medium text-right">Total Storage</th>
                  <th className="py-2.5 px-5 font-medium text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(55,53,47,0.06)] text-[#37352F]">
                {userStats.length > 0 ? (
                  userStats.map((u) => {
                    const isSelected = selectedUserFilter === u.userId;
                    return (
                      <tr
                        key={u.userId}
                        className={`hover:bg-[#FBFBFA] transition-colors ${
                          isSelected ? 'bg-emerald-50/60' : ''
                        }`}
                      >
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-6 h-6 rounded-full bg-[#37352F] text-white flex items-center justify-center font-bold text-[10px]">
                              {u.userName.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-[#37352F] truncate">
                              {u.userName}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-[#787774]">
                          {u.userEmail}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {u.fileCount}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-medium tabular-nums text-[#37352F]">
                          {formatBytes(u.totalBytes)}
                        </td>
                        <td className="py-3 px-5 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedUserFilter(isSelected ? 'all' : u.userId)
                            }
                            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                              isSelected
                                ? 'bg-emerald-700 text-white'
                                : 'bg-[#F2EFE9] text-[#37352F] hover:bg-[#EAE8E4]'
                            }`}
                          >
                            {isSelected ? 'Viewing Files' : 'Filter Files'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-[#787774] italic">
                      No user upload activity recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Media Explorer & Management Section */}
        <div className="bg-white rounded-xl border border-[rgba(55,53,47,0.08)] shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-[rgba(55,53,47,0.06)] flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold text-[#37352F] uppercase tracking-wider">
                Uploaded Media Explorer ({filteredMedia.length})
              </h2>
              <p className="text-[11px] text-[#787774]">
                Browse, preview, and permanently delete user attachments
              </p>
            </div>

            {/* Search & Filter Controls */}
            <div className="flex items-center gap-2">
              <div className="relative flex items-center min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-[#9B9A97] absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search filename or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs bg-[#F7F6F5] focus:bg-white text-[#37352F] placeholder-[#9B9A97] pl-8 pr-2.5 py-1.5 rounded-md border border-[rgba(55,53,47,0.1)] outline-none transition-colors"
                />
              </div>

              {/* User filter selector */}
              <div className="relative flex items-center">
                <Filter className="w-3.5 h-3.5 text-[#787774] absolute left-2.5 pointer-events-none" />
                <select
                  value={selectedUserFilter}
                  onChange={(e) => setSelectedUserFilter(e.target.value)}
                  className="text-xs bg-[#F7F6F5] text-[#37352F] pl-8 pr-6 py-1.5 rounded-md border border-[rgba(55,53,47,0.1)] outline-none cursor-pointer"
                >
                  <option value="all">All Users</option>
                  {userStats.map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {u.userName} ({u.userEmail})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Media Items Table */}
          {isLoading ? (
            <div className="p-12 flex flex-col items-center justify-center text-[#787774] gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#37352F]" />
              <span className="text-xs">Loading media assets...</span>
            </div>
          ) : filteredMedia.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#FAF9F7] text-[#787774] border-b border-[rgba(55,53,47,0.06)]">
                    <th className="py-2.5 px-4 font-medium">Preview & Name</th>
                    <th className="py-2.5 px-4 font-medium">Uploader</th>
                    <th className="py-2.5 px-4 font-medium text-right">Size</th>
                    <th className="py-2.5 px-4 font-medium">Upload Date</th>
                    <th className="py-2.5 px-4 font-medium text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(55,53,47,0.06)] text-[#37352F]">
                  {filteredMedia.map((item) => {
                    const isCopied = copiedId === item.id;
                    const isImg = item.mimeType?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(item.fileName);

                    return (
                      <tr key={item.id} className="hover:bg-[#FBFBFA] transition-colors">
                        {/* Thumbnail & File Name */}
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-[#EFECE8] border border-[rgba(55,53,47,0.08)] flex items-center justify-center shrink-0 overflow-hidden">
                              {isImg ? (
                                <img
                                  src={item.fileUrl}
                                  alt={item.fileName}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    // Fallback to icon if load fails
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <FileText className="w-5 h-5 text-[#787774]" />
                              )}
                            </div>
                            <div className="min-w-0 max-w-xs">
                              <div
                                className="font-medium text-[#37352F] truncate hover:underline cursor-pointer"
                                title={item.fileName}
                                onClick={() => window.open(item.fileUrl, '_blank')}
                              >
                                {item.fileName}
                              </div>
                              <div className="text-[10px] text-[#787774] font-mono truncate">
                                {item.fileKey || 'uploads/file'}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Uploader */}
                        <td className="py-2.5 px-4">
                          <div className="text-xs text-[#37352F] font-medium truncate">
                            {item.userName}
                          </div>
                          <div className="text-[11px] text-[#787774] font-mono truncate">
                            {item.userEmail}
                          </div>
                        </td>

                        {/* Size */}
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#37352F]">
                          {formatBytes(item.fileSize)}
                        </td>

                        {/* Date */}
                        <td className="py-2.5 px-4 text-[#787774] text-[11px] whitespace-nowrap">
                          {new Date(item.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleCopyUrl(item)}
                              title="Copy URL"
                              className="p-1.5 rounded hover:bg-[#EAE8E4] text-[#787774] hover:text-[#37352F] transition-colors"
                            >
                              {isCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <a
                              href={item.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              title="Open in new tab"
                              className="p-1.5 rounded hover:bg-[#EAE8E4] text-[#787774] hover:text-[#37352F] transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            <button
                              type="button"
                              onClick={() => setItemToDelete(item)}
                              title="Delete file permanently"
                              className="p-1.5 rounded hover:bg-red-50 text-neutral-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-[#787774]">
              <Files className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
              <p className="text-xs font-medium text-[#37352F]">No media assets found</p>
              <p className="text-[11px] mt-0.5">
                {searchQuery || selectedUserFilter !== 'all'
                  ? 'No files matching the current search criteria.'
                  : 'Files uploaded by users inside Notion pages will appear here.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-[rgba(55,53,47,0.1)] animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 mb-3 text-red-600">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="font-semibold text-sm text-[#37352F]">Delete Media File</h3>
            </div>
            <p className="text-xs text-[#787774] mb-4 leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong className="text-[#37352F]">{itemToDelete.fileName}</strong> uploaded by{' '}
              <span className="font-mono text-neutral-600">{itemToDelete.userEmail}</span>? This will remove the file from the server disk and cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setItemToDelete(null)}
                className="px-3 py-1.5 text-xs text-[#787774] hover:text-[#37352F] hover:bg-neutral-100 rounded-md font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md font-medium hover:bg-red-700 transition-colors flex items-center gap-1.5 shadow-2xs"
              >
                {isDeleting && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
