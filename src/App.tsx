import { useState, useEffect, useCallback, useRef } from 'react';
import { PanelLeft, Plus, Loader2 } from 'lucide-react';
import { Page, Database, ActiveItem } from './types/index.ts';
import { Sidebar } from './components/Sidebar.tsx';
import { DocumentEditor } from './components/DocumentEditor.tsx';
import { DatabaseView } from './components/DatabaseView.tsx';
import { AdminMediaDashboard } from './components/AdminMediaDashboard.tsx';
import { useAuth } from './context/AuthContext.tsx';
import {
  subscribeUserPages,
  subscribeUserDatabases,
  subscribeDatabaseRows,
  syncSavePage,
  syncCreatePage,
  syncDeletePage,
  syncCreateDatabase,
  syncUpdateDatabase,
  syncDeleteDatabase,
  syncAddRow,
  syncUpdateRow,
  syncDeleteRow,
  getInitialGuestWorkspace,
  saveGuestWorkspaceData,
} from './services/workspace.ts';

export default function App() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [pages, setPages] = useState<Page[]>([]);
  const [databases, setDatabases] = useState<Database[]>([]);
  const [activeItem, setActiveItem] = useState<ActiveItem | null>(() => {
    // Restore from URL query params or localStorage
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const viewParam = urlParams.get('view');
      if (viewParam === 'admin') return { type: 'admin' };
      const pageParam = urlParams.get('page');
      if (pageParam) return { type: 'page', id: pageParam };
      const dbParam = urlParams.get('db');
      if (dbParam) return { type: 'database', id: dbParam };

      const cached = localStorage.getItem('notion_active_item');
      if (cached) return JSON.parse(cached);
    } catch {}
    return null;
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const initialSelectionDoneRef = useRef(false);

  // Sync active item to URL and localStorage so reloads preserve location
  const handleSelectItem = useCallback((item: ActiveItem | null) => {
    setActiveItem(item);
    if (!item) {
      try {
        localStorage.removeItem('notion_active_item');
        const url = new URL(window.location.href);
        url.searchParams.delete('page');
        url.searchParams.delete('db');
        url.searchParams.delete('view');
        window.history.replaceState({}, '', url.toString());
      } catch {}
      return;
    }

    try {
      localStorage.setItem('notion_active_item', JSON.stringify(item));
      const url = new URL(window.location.href);
      if (item.type === 'admin') {
        url.searchParams.set('view', 'admin');
        url.searchParams.delete('page');
        url.searchParams.delete('db');
      } else if (item.type === 'page') {
        url.searchParams.set('page', item.id);
        url.searchParams.delete('db');
        url.searchParams.delete('view');
      } else {
        url.searchParams.set('db', item.id);
        url.searchParams.delete('page');
        url.searchParams.delete('view');
      }
      window.history.replaceState({}, '', url.toString());
    } catch {}
  }, []);

  // --- Real-Time Cloud Firestore Subscriptions for Authenticated User ---
  useEffect(() => {
    if (isAuthLoading) return;

    if (user) {
      setIsLoading(true);
      initialSelectionDoneRef.current = false;

      const unsubscribePages = subscribeUserPages(user.uid, (cloudPages) => {
        setPages(cloudPages);
        setIsLoading(false);

        // Auto-select if no selection or item not found
        if (!initialSelectionDoneRef.current && cloudPages.length > 0) {
          initialSelectionDoneRef.current = true;
          setActiveItem((curr) => {
            if (curr?.type === 'admin') return curr;
            if (curr?.type === 'page' && cloudPages.some((p) => p.id === curr.id)) {
              return curr;
            }
            if (curr?.type === 'database') return curr;
            handleSelectItem({ type: 'page', id: cloudPages[0].id });
            return { type: 'page', id: cloudPages[0].id };
          });
        }
      });

      const unsubscribeDbs = subscribeUserDatabases(user.uid, (cloudDbs) => {
        setDatabases((prev) => {
          // Merge rows from prev if existing
          return cloudDbs.map((cdb) => {
            const existing = prev.find((p) => p.id === cdb.id);
            return {
              ...cdb,
              rows: existing?.rows || cdb.rows || [],
            };
          });
        });
      });

      return () => {
        unsubscribePages();
        unsubscribeDbs();
      };
    } else {
      // Fallback: Guest mode loads from client cache / built-in starter templates, with background backend sync
      const loadGuestWorkspace = async () => {
        try {
          setIsLoading(true);
          let loadedPages: Page[] = [];
          let loadedDbs: Database[] = [];

          // 1. Attempt fetching from backend API if running
          try {
            const [pagesRes, dbRes] = await Promise.all([
              fetch('/api/pages').catch(() => null),
              fetch('/api/databases').catch(() => null),
            ]);

            if (pagesRes && pagesRes.ok) loadedPages = await pagesRes.json();
            if (dbRes && dbRes.ok) loadedDbs = await dbRes.json();
          } catch {}

          // 2. Fallback to client-side starter workspace & localStorage (Zero-failure on Vercel)
          if (loadedPages.length === 0 && loadedDbs.length === 0) {
            const localData = getInitialGuestWorkspace();
            loadedPages = localData.pages;
            loadedDbs = localData.databases;
          }

          setPages(loadedPages);
          setDatabases(loadedDbs);

          if (!activeItem) {
            if (loadedPages.length > 0) {
              handleSelectItem({ type: 'page', id: loadedPages[0].id });
            } else if (loadedDbs.length > 0) {
              handleSelectItem({ type: 'database', id: loadedDbs[0].id });
            }
          }
        } catch (err) {
          console.warn('[App] Guest mode load notice:', err);
          const localData = getInitialGuestWorkspace();
          setPages(localData.pages);
          setDatabases(localData.databases);
        } finally {
          setIsLoading(false);
        }
      };

      loadGuestWorkspace();
    }
  }, [user, isAuthLoading, handleSelectItem]);

  // Real-time Row Subscription when Active Item is a Database
  useEffect(() => {
    if (activeItem?.type === 'database') {
      if (user) {
        const unsubscribeRows = subscribeDatabaseRows(user.uid, activeItem.id, (rows) => {
          setDatabases((prev) =>
            prev.map((d) => (d.id === activeItem.id ? { ...d, rows } : d))
          );
        });
        return () => unsubscribeRows();
      } else {
        // Guest mode fetch with local row fallback
        fetch(`/api/databases/${activeItem.id}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((fullDb: Database | null) => {
            if (fullDb && fullDb.rows && fullDb.rows.length > 0) {
              setDatabases((prev) =>
                prev.map((d) => (d.id === fullDb.id ? fullDb : d))
              );
            }
          })
          .catch(() => {});
      }
    }
  }, [activeItem, user]);

  // --- Page Handlers ---
  const handleCreatePage = async (parentId: string | null = null) => {
    if (user) {
      try {
        const newPage = await syncCreatePage({ parentId, title: 'Untitled', icon: '📄' }, user.uid);
        setPages((prev) => [...prev, newPage]);
        handleSelectItem({ type: 'page', id: newPage.id });
      } catch (err) {
        console.error('[App] Error creating page in Firestore:', err);
      }
    } else {
      // Guest mode: instant local creation with persistent storage
      const newPage: Page = {
        id: 'guest-page-' + Math.random().toString(36).slice(2, 9),
        userId: 'guest',
        title: 'Untitled',
        icon: '📄',
        content: JSON.stringify([
          {
            id: 'b-' + Math.random().toString(36).slice(2, 9),
            type: 'paragraph',
            props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
            content: [],
            children: []
          }
        ]),
        parentId: parentId || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const updated = [...pages, newPage];
      setPages(updated);
      saveGuestWorkspaceData(updated, databases);
      handleSelectItem({ type: 'page', id: newPage.id });

      // Optional backend sync
      fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled', icon: '📄', parentId }),
      }).catch(() => {});
    }
  };

  const handleUpdatePage = async (id: string, updates: Partial<Page>) => {
    // Optimistic update
    const updatedPages = pages.map((p) => (p.id === id ? { ...p, ...updates } : p));
    setPages(updatedPages);

    const target = pages.find((p) => p.id === id);
    if (!target) return;

    const merged = { ...target, ...updates };

    if (user) {
      await syncSavePage(merged, user.uid);
    } else {
      saveGuestWorkspaceData(updatedPages, databases);
      fetch(`/api/pages/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).catch(() => {});
    }
  };

  const handleDeletePage = async (id: string) => {
    const remaining = pages.filter((p) => p.id !== id && p.parentId !== id);
    setPages(remaining);

    if (activeItem?.type === 'page' && activeItem.id === id) {
      if (remaining.length > 0) {
        handleSelectItem({ type: 'page', id: remaining[0].id });
      } else if (databases.length > 0) {
        handleSelectItem({ type: 'database', id: databases[0].id });
      } else {
        handleSelectItem(null);
      }
    }

    if (user) {
      await syncDeletePage(id, pages);
    } else {
      saveGuestWorkspaceData(remaining, databases);
      fetch(`/api/pages/${id}`, { method: 'DELETE' }).catch(() => {});
    }
  };

  const handleDuplicatePage = async (id: string) => {
    const source = pages.find((p) => p.id === id);
    if (!source) return;

    if (user) {
      const duplicated = await syncCreatePage(
        {
          title: `${source.title} (Copy)`,
          icon: source.icon,
          content: source.content,
          parentId: source.parentId,
        },
        user.uid
      );
      setPages((prev) => [...prev, duplicated]);
      handleSelectItem({ type: 'page', id: duplicated.id });
    } else {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${source.title} (Copy)`,
          icon: source.icon,
          content: source.content,
          parentId: source.parentId,
        }),
      });
      if (res.ok) {
        const duplicated: Page = await res.json();
        setPages((prev) => [...prev, duplicated]);
        handleSelectItem({ type: 'page', id: duplicated.id });
      }
    }
  };

  // --- Database Handlers ---
  const handleCreateDatabase = async () => {
    if (user) {
      try {
        const newDb = await syncCreateDatabase({ title: 'Untitled Database', icon: '📊' }, user.uid);
        setDatabases((prev) => [...prev, newDb]);
        handleSelectItem({ type: 'database', id: newDb.id });
      } catch (err) {
        console.error('[App] Error creating database in Firestore:', err);
      }
    } else {
      // Guest mode instant creation
      const newDb: Database = {
        id: 'guest-db-' + Math.random().toString(36).slice(2, 9),
        userId: 'guest',
        title: 'Untitled Database',
        icon: '📊',
        schema: JSON.stringify([
          { id: 'col-name', name: 'Name', type: 'text' },
          { id: 'col-status', name: 'Status', type: 'status', options: [
            { id: 'opt-1', label: 'Not Started', color: '#E3E2E0' },
            { id: 'opt-2', label: 'Done', color: '#DBEDDB' }
          ]}
        ]),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rows: []
      };
      const updated = [...databases, newDb];
      setDatabases(updated);
      saveGuestWorkspaceData(pages, updated);
      handleSelectItem({ type: 'database', id: newDb.id });

      fetch('/api/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled Database', icon: '📊' }),
      }).catch(() => {});
    }
  };

  const handleUpdateDatabase = async (id: string, updates: Partial<Database>) => {
    const updated = databases.map((d) => (d.id === id ? { ...d, ...updates } : d));
    setDatabases(updated);

    if (user) {
      await syncUpdateDatabase(id, updates, user.uid);
    } else {
      saveGuestWorkspaceData(pages, updated);
      fetch(`/api/databases/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).catch(() => {});
    }
  };

  const handleDeleteDatabase = async (id: string) => {
    const remaining = databases.filter((d) => d.id !== id);
    setDatabases(remaining);

    if (activeItem?.type === 'database' && activeItem.id === id) {
      if (pages.length > 0) {
        handleSelectItem({ type: 'page', id: pages[0].id });
      } else if (remaining.length > 0) {
        handleSelectItem({ type: 'database', id: remaining[0].id });
      } else {
        handleSelectItem(null);
      }
    }

    if (user) {
      await syncDeleteDatabase(id, user.uid);
    } else {
      saveGuestWorkspaceData(pages, remaining);
      fetch(`/api/databases/${id}`, { method: 'DELETE' }).catch(() => {});
    }
  };

  const handleAddRow = async (databaseId: string, properties: Record<string, unknown> = {}) => {
    if (user) {
      const newRow = await syncAddRow(databaseId, properties, user.uid);
      setDatabases((prev) =>
        prev.map((d) => {
          if (d.id === databaseId) {
            return { ...d, rows: [...(d.rows || []), newRow] };
          }
          return d;
        })
      );
    } else {
      const newRow: any = {
        id: 'guest-row-' + Math.random().toString(36).slice(2, 9),
        databaseId,
        properties: JSON.stringify(properties),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const updated = databases.map((d) => {
        if (d.id === databaseId) {
          return { ...d, rows: [...(d.rows || []), newRow] };
        }
        return d;
      });
      setDatabases(updated);
      saveGuestWorkspaceData(pages, updated);

      fetch(`/api/databases/${databaseId}/rows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties }),
      }).catch(() => {});
    }
  };

  const handleUpdateRow = async (
    databaseId: string,
    rowId: string,
    properties: Record<string, unknown>
  ) => {
    const currentDb = databases.find((d) => d.id === databaseId);
    const currentRow = currentDb?.rows?.find((r) => r.id === rowId);
    const existingProperties = currentRow?.properties || '{}';

    const updated = databases.map((d) => {
      if (d.id === databaseId) {
        const updatedRows = (d.rows || []).map((r) => {
          if (r.id === rowId) {
            let existing = {};
            try {
              existing = JSON.parse(r.properties);
            } catch {
              existing = {};
            }
            return {
              ...r,
              properties: JSON.stringify({ ...existing, ...properties }),
            };
          }
          return r;
        });
        return { ...d, rows: updatedRows };
      }
      return d;
    });

    setDatabases(updated);

    if (user) {
      await syncUpdateRow(rowId, properties, existingProperties, user.uid, databaseId);
    } else {
      saveGuestWorkspaceData(pages, updated);
      fetch(`/api/databases/${databaseId}/rows/${rowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties }),
      }).catch(() => {});
    }
  };

  const handleDeleteRow = async (databaseId: string, rowId: string) => {
    const updated = databases.map((d) => {
      if (d.id === databaseId) {
        return {
          ...d,
          rows: (d.rows || []).filter((r) => r.id !== rowId),
        };
      }
      return d;
    });

    setDatabases(updated);

    if (user) {
      await syncDeleteRow(rowId);
    } else {
      saveGuestWorkspaceData(pages, updated);
      fetch(`/api/databases/${databaseId}/rows/${rowId}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
  };

  const currentPage =
    activeItem?.type === 'page'
      ? pages.find((p) => p.id === activeItem.id) || null
      : null;

  const currentDatabase =
    activeItem?.type === 'database'
      ? databases.find((d) => d.id === activeItem.id) || null
      : null;

  if (isAuthLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-[#FAF9F7] text-[#787774]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded bg-[#37352F] text-white flex items-center justify-center font-bold text-sm">
            N
          </div>
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-[#37352F] font-sans">
      {/* Sidebar Tree */}
      <Sidebar
        pages={pages}
        databases={databases}
        activeItem={activeItem}
        onSelectItem={handleSelectItem}
        onCreatePage={handleCreatePage}
        onDeletePage={handleDeletePage}
        onDuplicatePage={handleDuplicatePage}
        onCreateDatabase={handleCreateDatabase}
        onDeleteDatabase={handleDeleteDatabase}
        isOpen={isSidebarOpen}
        onToggleOpen={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        {/* Sidebar Toggle Button when sidebar is collapsed */}
        {!isSidebarOpen && (
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            title="Expand sidebar"
            className="fixed top-2.5 left-3 z-30 p-1.5 rounded-md text-[#787774] hover:text-[#37352F] hover:bg-[#EFECE8] bg-white border border-[rgba(55,53,47,0.12)] shadow-xs transition-colors"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}

        {/* Document Editor View */}
        {currentPage && (
          <DocumentEditor
            page={currentPage}
            pages={pages}
            onUpdatePage={handleUpdatePage}
            onNavigateToPage={(id) => handleSelectItem({ type: 'page', id })}
          />
        )}

        {/* Database Spreadsheet View */}
        {currentDatabase && (
          <DatabaseView
            database={currentDatabase}
            onUpdateDatabase={handleUpdateDatabase}
            onAddRow={handleAddRow}
            onUpdateRow={handleUpdateRow}
            onDeleteRow={handleDeleteRow}
          />
        )}

        {/* Admin Media Dashboard View */}
        {activeItem?.type === 'admin' && (
          <AdminMediaDashboard />
        )}

        {/* Empty Workspace State */}
        {!currentPage && !currentDatabase && activeItem?.type !== 'admin' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-[#787774]">
            <div className="w-12 h-12 rounded-xl bg-[#F7F6F5] border border-[rgba(55,53,47,0.09)] flex items-center justify-center text-2xl mb-4">
              📝
            </div>
            <h2 className="text-xl font-semibold text-[#37352F] mb-1">No page selected</h2>
            <p className="text-sm text-[#787774] mb-4 max-w-sm">
              Select a page or database from the sidebar, or create a fresh document to start writing.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCreatePage()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#37352F] text-white rounded-md text-xs font-medium hover:bg-neutral-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New document</span>
              </button>
              <button
                type="button"
                onClick={handleCreateDatabase}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-[rgba(55,53,47,0.16)] text-[#37352F] rounded-md text-xs font-medium hover:bg-[#F7F6F5] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New database</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
