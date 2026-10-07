import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import { Check, Loader2, AlertCircle, ChevronRight, Cloud, LogIn, Sparkles } from 'lucide-react';
import { Page, SaveStatus } from '../types/index.ts';
import { IconPicker } from './IconPicker.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { recordUploadedMedia } from '../services/workspace.ts';

interface DocumentEditorProps {
  page: Page;
  pages: Page[];
  onUpdatePage: (id: string, updates: Partial<Page>) => Promise<void>;
  onNavigateToPage: (id: string) => void;
}

// Inner Editor component keyed by page.id to ensure clean BlockNote initialization
const InnerBlockEditor: React.FC<{
  initialContentString: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  onChangeContent: (contentJson: string) => void;
}> = ({ initialContentString, userId, userEmail, userName, onChangeContent }) => {
  // Parse initial blocks safely
  const initialContent = useMemo(() => {
    try {
      if (!initialContentString) return undefined;
      const parsed = JSON.parse(initialContentString);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : undefined;
    } catch (e) {
      console.warn('Failed to parse page content blocks:', e);
      return undefined;
    }
  }, [initialContentString]);

  // Resilient multi-tier file upload handler with streaming support
  const handleUploadFile = async (file: File): Promise<string> => {
    // 1. Primary: High-speed server multipart upload to /api/upload/file
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload/file', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const url = data.url || data.streamUrl;
        if (url) {
          if (userId) {
            recordUploadedMedia({
              userId,
              userEmail: userEmail || 'user@workspace.com',
              userName: userName || 'User',
              fileName: file.name,
              fileUrl: url,
              fileKey: data.key || '',
              fileSize: file.size,
              mimeType: file.type || 'image/png',
            }).catch((err) => console.warn('[Record media warning]:', err));
          }
          return url;
        }
      }
    } catch (uploadErr) {
      console.warn('[Upload] Multipart upload attempt failed, trying direct binary stream:', uploadErr);
    }

    // 2. Secondary: Raw binary stream PUT to /api/upload/direct
    try {
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueKey = `uploads/${Date.now()}-${cleanName}`;
      const directRes = await fetch(`/api/upload/direct?key=${encodeURIComponent(uniqueKey)}`, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
      });

      if (directRes.ok) {
        return `/${uniqueKey}`;
      }
    } catch (putErr) {
      console.warn('[Upload] Direct binary PUT failed:', putErr);
    }

    // 3. Tertiary: Base64 JSON upload to /api/upload/base64
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const b64Res = await fetch('/api/upload/base64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: base64Data,
          filename: file.name,
          contentType: file.type,
        }),
      });

      if (b64Res.ok) {
        const data = await b64Res.json();
        return data.url || data.streamUrl;
      }

      // 4. Quaternary: If file is compact (< 700KB), inline Base64 data URL
      if (file.size < 700 * 1024) {
        return base64Data;
      }
    } catch (b64Err) {
      console.error('[Upload] Base64 upload fallback error:', b64Err);
    }

    throw new Error('Upload failed. Please check file format and try again.');
  };

  const editor = useCreateBlockNote({
    initialContent,
    uploadFile: handleUploadFile,
  });

  return (
    <div className="blocknote-wrapper -ml-12 min-h-[400px]">
      <BlockNoteView
        editor={editor}
        theme="light"
        onChange={() => {
          const blocks = editor.document;
          onChangeContent(JSON.stringify(blocks));
        }}
      />
    </div>
  );
};

export const DocumentEditor: React.FC<DocumentEditorProps> = ({
  page,
  pages,
  onUpdatePage,
  onNavigateToPage,
}) => {
  const { user, signIn } = useAuth();
  const [title, setTitle] = useState(page.title);
  const [icon, setIcon] = useState<string | null>(page.icon);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');

  // References for debounce timer and pending updates
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<Partial<Page>>({});

  // Synchronize local states when switching pages
  useEffect(() => {
    setTitle(page.title);
    setIcon(page.icon);
    setSaveStatus('saved');
    pendingUpdatesRef.current = {};
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, [page.id]);

  // Flush any pending updates when component unmounts or before unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (Object.keys(pendingUpdatesRef.current).length > 0) {
        onUpdatePage(page.id, pendingUpdatesRef.current);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (Object.keys(pendingUpdatesRef.current).length > 0) {
        onUpdatePage(page.id, pendingUpdatesRef.current);
      }
    };
  }, [page.id, onUpdatePage]);

  // Compute breadcrumb path
  const breadcrumbs = useMemo(() => {
    const trail: Page[] = [];
    let current: Page | undefined = page;
    while (current) {
      trail.unshift(current);
      if (current.parentId) {
        current = pages.find((p) => p.id === current?.parentId);
      } else {
        break;
      }
    }
    return trail;
  }, [page, pages]);

  // Debounced auto-save function (750ms delay for snappier feedback)
  const triggerDebouncedSave = (newUpdates: Partial<Page>) => {
    pendingUpdatesRef.current = {
      ...pendingUpdatesRef.current,
      ...newUpdates,
    };
    setSaveStatus('saving');

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const toSave = { ...pendingUpdatesRef.current };
        pendingUpdatesRef.current = {};
        await onUpdatePage(page.id, toSave);
        setSaveStatus('saved');
      } catch (err) {
        console.error('[DocumentEditor] Auto-save error:', err);
        setSaveStatus('error');
      }
    }, 750);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTitle(val);
    triggerDebouncedSave({ title: val });
  };

  const handleIconChange = (newIcon: string | null) => {
    setIcon(newIcon);
    triggerDebouncedSave({ icon: newIcon });
  };

  const handleContentChange = (contentJson: string) => {
    triggerDebouncedSave({ content: contentJson });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-y-auto">
      {/* Top Bar with Breadcrumbs & Auto-Save Status */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-[rgba(55,53,47,0.06)] px-8 py-2.5 flex items-center justify-between">
        {/* Breadcrumb Trail */}
        <div className="flex items-center gap-1.5 text-xs text-[#787774] min-w-0">
          <span className="hover:text-[#37352F] cursor-pointer">Workspace</span>
          {breadcrumbs.map((b, idx) => (
            <React.Fragment key={b.id}>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              <button
                type="button"
                onClick={() => onNavigateToPage(b.id)}
                className={`truncate hover:text-[#37352F] transition-colors ${
                  idx === breadcrumbs.length - 1 ? 'font-medium text-[#37352F]' : ''
                }`}
              >
                {b.icon ? `${b.icon} ` : ''}
                {b.title || 'Untitled'}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Top Bar Actions & Status */}
        <div className="flex items-center gap-3 text-xs text-[#787774]">
          {/* Cloud Sync Status Indicator */}
          {user ? (
            <div
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-[11px] font-medium shadow-2xs"
              title={`Logged in as ${user.email} - Cloud Firestore real-time synchronization enabled`}
            >
              <Cloud className="w-3 h-3 text-emerald-600" />
              <span>Cloud Sync Active</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          ) : (
            <button
              type="button"
              onClick={signIn}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#37352F] text-white text-[11px] font-medium hover:bg-neutral-800 transition-colors shadow-2xs"
              title="Sign in with Google to enable permanent multi-device sync"
            >
              <LogIn className="w-3 h-3" />
              <span>Google Sign-In</span>
            </button>
          )}

          {/* Quiet Auto-Save Indicator */}
          <div className="flex items-center gap-1.5">
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1 text-[#787774]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-emerald-600 transition-opacity">
                <Check className="w-3.5 h-3.5" />
                <span>Saved</span>
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1 text-red-600">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Save warning</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Document Content Canvas */}
      <div className="flex-1 max-w-4xl w-full mx-auto px-12 pt-12 pb-32">
        {/* Page Icon */}
        <div className="mb-4">
          <IconPicker currentIcon={icon} onSelect={handleIconChange} />
        </div>

        {/* Editable Title */}
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          placeholder="Untitled"
          className="w-full text-4xl font-bold tracking-tight text-[#37352F] placeholder:text-[#C4C3C0] border-none outline-none bg-transparent mb-6 pb-2"
        />

        {/* BlockNote Document Editor */}
        <InnerBlockEditor
          key={page.id}
          initialContentString={page.content}
          userId={user?.uid}
          userEmail={user?.email || undefined}
          userName={user?.displayName || undefined}
          onChangeContent={handleContentChange}
        />
      </div>
    </div>
  );
};
