import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Search,
  PanelLeftClose,
  Copy,
  MoreHorizontal,
  LogIn,
  LogOut,
  User as UserIcon,
  Shield,
  Sparkles,
} from 'lucide-react';
import { Page, Database, ActiveItem } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { isUserAdmin } from '../services/workspace.ts';
import { AuthModal } from './AuthModal.tsx';

interface SidebarProps {
  pages: Page[];
  databases: Database[];
  activeItem: ActiveItem | null;
  onSelectItem: (item: ActiveItem) => void;
  onCreatePage: (parentId?: string | null) => void;
  onDeletePage: (id: string) => void;
  onDuplicatePage: (id: string) => void;
  onCreateDatabase: () => void;
  onDeleteDatabase: (id: string) => void;
  onOpenAuthModal?: () => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  pages,
  databases,
  activeItem,
  onSelectItem,
  onCreatePage,
  onDeletePage,
  onDuplicatePage,
  onCreateDatabase,
  onDeleteDatabase,
  isOpen,
  onToggleOpen,
}) => {
  const { user, signIn, signInGuest, signOut, authError } = useAuth();
  const isAdmin = isUserAdmin(user?.email);
  const [collapsedPages, setCollapsedPages] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const togglePageCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedPages((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Build recursive page hierarchy
  const rootPages = pages.filter((p) => !p.parentId);
  const getSubPages = (parentId: string) => pages.filter((p) => p.parentId === parentId);

  const filteredPages = searchQuery.trim()
    ? pages.filter((p) => p.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : null;

  const renderPageItem = (page: Page, level = 0) => {
    const subPages = getSubPages(page.id);
    const hasChildren = subPages.length > 0;
    const isCollapsed = Boolean(collapsedPages[page.id]);
    const isActive = activeItem?.type === 'page' && activeItem.id === page.id;
    const isHovered = hoveredItemId === page.id;
    const isMenuOpen = menuOpenId === page.id;

    return (
      <div key={page.id} className="select-none text-[13px]">
        <div
          onMouseEnter={() => setHoveredItemId(page.id)}
          onMouseLeave={() => {
            setHoveredItemId(null);
            if (menuOpenId === page.id) setMenuOpenId(null);
          }}
          onClick={() => onSelectItem({ type: 'page', id: page.id })}
          style={{ paddingLeft: `${12 + level * 14}px` }}
          className={`group flex items-center justify-between py-1.5 pr-2 rounded-md cursor-pointer transition-colors ${
            isActive
              ? 'bg-[#EAE8E4] text-[#37352F] font-medium'
              : 'text-[#5A5852] hover:bg-[#EFECE8] hover:text-[#37352F]'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => togglePageCollapse(page.id, e)}
                className="w-4 h-4 flex items-center justify-center text-[#787774] hover:text-[#37352F] rounded hover:bg-neutral-200/50"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <span className="w-4" />
            )}

            <span className="text-sm shrink-0">{page.icon || '📄'}</span>
            <span className="truncate flex-1">{page.title || 'Untitled'}</span>
          </div>

          {/* Quick Actions on Hover */}
          <div className={`flex items-center gap-0.5 shrink-0 ${isHovered || isMenuOpen ? 'opacity-100' : 'opacity-0'}`}>
            <button
              type="button"
              title="Add sub-page"
              onClick={(e) => {
                e.stopPropagation();
                onCreatePage(page.id);
                setCollapsedPages((prev) => ({ ...prev, [page.id]: false }));
              }}
              className="p-1 rounded hover:bg-[#DDD8D1] text-[#787774] hover:text-[#37352F] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>

            <div className="relative">
              <button
                type="button"
                title="Page options"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpenId(isMenuOpen ? null : page.id);
                }}
                className="p-1 rounded hover:bg-[#DDD8D1] text-[#787774] hover:text-[#37352F] transition-colors"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>

              {isMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-36 bg-white border border-neutral-200 rounded-md shadow-lg py-1 z-30 animate-in fade-in"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onDuplicatePage(page.id);
                      setMenuOpenId(null);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-[#37352F] hover:bg-neutral-100 flex items-center gap-2"
                  >
                    <Copy className="w-3.5 h-3.5 text-neutral-500" /> Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDeletePage(page.id);
                      setMenuOpenId(null);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sub-pages list */}
        {hasChildren && !isCollapsed && (
          <div className="mt-0.5">
            {subPages.map((subPage) => renderPageItem(subPage, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className={`fixed md:static inset-y-0 left-0 z-30 w-64 bg-[#F7F6F5] border-r border-[rgba(55,53,47,0.09)] flex flex-col transition-transform duration-200 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full md:hidden'
      }`}
    >
      {/* Workspace Header & User Profile Bar */}
      <div className="p-3 border-b border-[rgba(55,53,47,0.06)] relative">
        <div className="flex items-center justify-between">
          {user ? (
            <div
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 min-w-0 flex-1 p-1 -ml-1 rounded-md hover:bg-[#EAE8E4] cursor-pointer transition-colors"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded-full shrink-0 border border-black/10 object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-[#37352F] text-white flex items-center justify-center font-bold text-xs shrink-0">
                  {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-xs text-[#37352F] truncate">
                  {user.displayName || 'My Notion Cloud'}
                </div>
                <div className="text-[10px] text-[#787774] truncate flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>Cloud Synced</span>
                </div>
              </div>
              <ChevronDown className="w-3 h-3 text-[#787774] shrink-0" />
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded bg-[#37352F] text-white flex items-center justify-center font-bold text-xs">
                N
              </div>
              <span className="font-semibold text-sm text-[#37352F] truncate">Notion Cloud</span>
            </div>
          )}

          <button
            type="button"
            onClick={onToggleOpen}
            title="Collapse sidebar"
            className="p-1 rounded text-[#787774] hover:text-[#37352F] hover:bg-[#EAE8E4] transition-colors ml-1"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* User Account Dropdown */}
        {user && isUserMenuOpen && (
          <div
            className="absolute left-3 right-3 top-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg p-2 z-40 animate-in fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-1.5 border-b border-neutral-100 mb-1">
              <div className="text-xs font-medium text-[#37352F] truncate">{user.displayName}</div>
              <div className="text-[11px] text-[#787774] truncate">{user.email}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                signOut();
                setIsUserMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-md transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        )}
      </div>

      {/* Guest Sign-In Banner if Unauthenticated */}
      {!user && (
        <div className="m-2 p-2.5 bg-white border border-[rgba(55,53,47,0.1)] rounded-lg shadow-2xs space-y-2">
          <div className="flex items-start gap-2">
            <UserIcon className="w-4 h-4 text-[#787774] mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-[#37352F]">Cloud Sync</div>
              <div className="text-[11px] text-[#787774] leading-relaxed">
                Sync documents permanently with Firebase Auth &amp; Firestore.
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={async () => {
                try {
                  await signIn();
                } catch {
                  setIsAuthModalOpen(true);
                }
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 bg-[#37352F] text-white rounded-md text-xs font-medium hover:bg-black transition-colors shadow-2xs cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In with Google</span>
            </button>

            <button
              type="button"
              onClick={() => signInGuest()}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 bg-neutral-100 hover:bg-neutral-200 text-[#37352F] rounded-md text-xs font-medium transition-colors cursor-pointer border border-neutral-200"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Instant Guest Cloud Access</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="text-[10px] text-center text-[#787774] hover:text-[#37352F] hover:underline cursor-pointer py-0.5"
            >
              Email login or Vercel domain help &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="px-3 pt-2 pb-1.5">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-[#9B9A97] absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search pages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-[#EFECE8] hover:bg-[#EAE8E4] focus:bg-white text-[#37352F] placeholder-[#9B9A97] pl-8 pr-2.5 py-1.5 rounded-md border border-transparent focus:border-[rgba(55,53,47,0.16)] outline-none transition-colors"
          />
        </div>
      </div>

      {/* Navigation Content */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4">
        {/* Admin Navigation Section */}
        {isAdmin && (
          <div className="pb-1 border-b border-[rgba(55,53,47,0.06)]">
            <div
              onClick={() => onSelectItem({ type: 'admin' })}
              className={`group flex items-center justify-between px-3 py-1.5 rounded-md cursor-pointer transition-colors text-[13px] ${
                activeItem?.type === 'admin'
                  ? 'bg-[#37352F] text-white font-medium shadow-2xs'
                  : 'text-[#37352F] hover:bg-[#EFECE8]'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <Shield
                  className={`w-3.5 h-3.5 shrink-0 ${
                    activeItem?.type === 'admin' ? 'text-emerald-400' : 'text-[#787774]'
                  }`}
                />
                <span className="truncate font-medium">Admin Media Center</span>
              </div>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  activeItem?.type === 'admin'
                    ? 'bg-neutral-800 text-emerald-300'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                Admin
              </span>
            </div>
          </div>
        )}

        {/* Document Pages Section */}
        <div>
          <div className="flex items-center justify-between px-2 pb-1 text-[11px] font-semibold text-[#9B9A97] uppercase tracking-wider">
            <span>Pages</span>
            <button
              type="button"
              onClick={() => onCreatePage()}
              title="Add page"
              className="p-0.5 rounded hover:bg-[#EAE8E4] text-[#787774] hover:text-[#37352F] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-0.5">
            {filteredPages ? (
              filteredPages.length > 0 ? (
                filteredPages.map((page) => renderPageItem(page, 0))
              ) : (
                <div className="text-xs text-[#9B9A97] px-3 py-2">No matching pages</div>
              )
            ) : rootPages.length > 0 ? (
              rootPages.map((page) => renderPageItem(page, 0))
            ) : (
              <div className="text-xs text-[#9B9A97] px-3 py-2 italic">No pages created yet</div>
            )}
          </div>
        </div>

        {/* Databases Section */}
        <div>
          <div className="flex items-center justify-between px-2 pb-1 text-[11px] font-semibold text-[#9B9A97] uppercase tracking-wider">
            <span>Databases</span>
            <button
              type="button"
              onClick={onCreateDatabase}
              title="Add database"
              className="p-0.5 rounded hover:bg-[#EAE8E4] text-[#787774] hover:text-[#37352F] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-0.5">
            {databases.map((db) => {
              const isActive = activeItem?.type === 'database' && activeItem.id === db.id;
              return (
                <div
                  key={db.id}
                  onClick={() => onSelectItem({ type: 'database', id: db.id })}
                  className={`group flex items-center justify-between px-3 py-1.5 rounded-md cursor-pointer transition-colors text-[13px] ${
                    isActive
                      ? 'bg-[#EAE8E4] text-[#37352F] font-medium'
                      : 'text-[#5A5852] hover:bg-[#EFECE8] hover:text-[#37352F]'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-sm shrink-0">{db.icon || '📊'}</span>
                    <span className="truncate">{db.title || 'Untitled Database'}</span>
                  </div>
                  <button
                    type="button"
                    title="Delete database"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteDatabase(db.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#DDD8D1] text-neutral-400 hover:text-red-600 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

            {databases.length === 0 && (
              <div className="text-xs text-[#9B9A97] px-3 py-1 italic">No databases</div>
            )}
          </div>
        </div>
      </div>

      {/* Footer / Quick Add */}
      <div className="p-2 border-t border-[rgba(55,53,47,0.06)]">
        <button
          type="button"
          onClick={() => onCreatePage()}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#787774] hover:text-[#37352F] hover:bg-[#EFECE8] rounded-md transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New page</span>
        </button>
      </div>

      <AuthModal
        isOpen={isAuthModalOpen || Boolean(authError?.isUnauthorizedDomain)}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </aside>
  );
};
