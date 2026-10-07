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
      // Fallback: Guest mode loads from backend API
      const loadGuestWorkspace = async () => {
        try {
          setIsLoading(true);
          const [pagesRes, dbRes] = await Promise.all([
            fetch('/api/pages').catch(() => null),
            fetch('/api/databases').catch(() => null),
          ]);

          const pagesData: Page[] = pagesRes && pagesRes.ok ? await pagesRes.json() : [];
          const dbData: Database[] = dbRes && dbRes.ok ? await dbRes.json() : [];

          setPages(pagesData);
          setDatabases(dbData);

          if (!activeItem) {
            if (pagesData.length > 0) {
              handleSelectItem({ type: 'page', id: pagesData[0].id });
            } else if (dbData.length > 0) {
              handleSelectItem({ type: 'database', id: dbData[0].id });
            }
          }
        } catch (err) {
          console.warn('[App] Guest mode load fallback warning:', err);
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
        // Guest mode fetch
        fetch(`/api/databases/${activeItem.id}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((fullDb: Database | null) => {
            if (fullDb) {
              setDatabases((prev) =>
                prev.map((d) => (d.id === fullDb.id ? fullDb : d))
              );
            }
          })
          .catch((err) => console.error('[App] Failed to load database rows:', err));
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
      // Guest API fallback
      try {
        const res = await fetch('/api/pages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Untitled', icon: '📄', parentId }),
        });
        if (res.ok) {
          const newPage: Page = await res.json();
          setPages((prev) => [...prev, newPage]);
          handleSelectItem({ type: 'page', id: newPage.id });
        }
      } catch (err) {
        console.error('[App] Error creating page in guest API:', err);
      }
    }
  };

  const handleUpdatePage = async (id: string, updates: Partial<Page>) => {
    // Optimistic update
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );

    const target = pages.find((p) => p.id === id);
    if (!target) return;

    const merged = { ...target, ...updates };

    if (user) {
      await syncSavePage(merged, user.uid);
    } else {
      await fetch(`/api/pages/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
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
      await fetch(`/api/pages/${id}`, { method: 'DELETE' });
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
      const res = await fetch('/api/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled Database', icon: '📊' }),
      });
      if (res.ok) {
        const newDb: Database = await res.json();
        setDatabases((prev) => [...prev, newDb]);
        handleSelectItem({ type: 'database', id: newDb.id });
      }
    }
  };

  const handleUpdateDatabase = async (id: string, updates: Partial<Database>) => {
    setDatabases((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...updates } : d))
    );

    if (user) {
      await syncUpdateDatabase(id, updates, user.uid);
    } else {
      await fetch(`/api/databases/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
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
      await fetch(`/api/databases/${id}`, { method: 'DELETE' });
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
      const res = await fetch(`/api/databases/${databaseId}/rows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties }),
      });
      if (res.ok) {
        const newRow = await res.json();
        setDatabases((prev) =>
          prev.map((d) => {
            if (d.id === databaseId) {
              return { ...d, rows: [...(d.rows || []), newRow] };
            }
            return d;
          })
        );
      }
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

    // Optimistic update
    setDatabases((prev) =>
      prev.map((d) => {
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
      })
    );

    if (user) {
      await syncUpdateRow(rowId, properties, existingProperties, user.uid, databaseId);
    } else {
      await fetch(`/api/databases/${databaseId}/rows/${rowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties }),
      });
    }
  };

  const handleDeleteRow = async (databaseId: string, rowId: string) => {
    setDatabases((prev) =>
      prev.map((d) => {
        if (d.id === databaseId) {
          return {
            ...d,
            rows: (d.rows || []).filter((r) => r.id !== rowId),
          };
        }
        return d;
      })
    );

    if (user) {
      await syncDeleteRow(rowId);
    } else {
      await fetch(`/api/databases/${databaseId}/rows/${rowId}`, {
        method: 'DELETE',
      });
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
