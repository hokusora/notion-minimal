import {
  collection,
  doc,
  query,
  where,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase.ts';
import { Page, Database, Row, ColumnSchema, MediaItem } from '../types/index.ts';

const INITIAL_BLOCKS = JSON.stringify([
  {
    id: 'b-1',
    type: 'heading',
    props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left', level: 1 },
    content: [{ type: 'text', text: 'Welcome to your Notion Cloud Workspace', styles: {} }],
    children: []
  },
  {
    id: 'b-2',
    type: 'paragraph',
    props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
    content: [
      { type: 'text', text: 'This workspace is synced in real-time with ', styles: {} },
      { type: 'text', text: 'Google Sign-In & Cloud Firestore', styles: { bold: true } },
      { type: 'text', text: '. Every keystroke, block, page, and uploaded image is permanently stored in the cloud.', styles: {} }
    ],
    children: []
  },
  {
    id: 'b-3',
    type: 'heading',
    props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left', level: 2 },
    content: [{ type: 'text', text: 'Quick Features', styles: {} }],
    children: []
  },
  {
    id: 'b-4',
    type: 'bulletListItem',
    props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
    content: [
      { type: 'text', text: 'Type ', styles: {} },
      { type: 'text', text: '/', styles: { code: true } },
      { type: 'text', text: ' on any new line to insert headings, checklists, code blocks, or images.', styles: {} }
    ],
    children: []
  },
  {
    id: 'b-5',
    type: 'checkListItem',
    props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left', checked: true },
    content: [{ type: 'text', text: 'Persistent multi-device cloud synchronization', styles: {} }],
    children: []
  },
  {
    id: 'b-6',
    type: 'checkListItem',
    props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left', checked: true },
    content: [{ type: 'text', text: 'Direct drag-and-drop Firebase Cloud Storage file uploads', styles: {} }],
    children: []
  },
  {
    id: 'b-7',
    type: 'checkListItem',
    props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left', checked: false },
    content: [{ type: 'text', text: 'Create nested sub-pages in the sidebar', styles: {} }],
    children: []
  }
]);

const INITIAL_SCHEMA: ColumnSchema[] = [
  { id: 'col-name', name: 'Task Name', type: 'text' },
  {
    id: 'col-status',
    name: 'Status',
    type: 'status',
    options: [
      { id: 'opt-todo', label: 'Not Started', color: '#E3E2E0' },
      { id: 'opt-inprogress', label: 'In Progress', color: '#D3E5EF' },
      { id: 'opt-done', label: 'Completed', color: '#DBEDDB' },
      { id: 'opt-archived', label: 'Archived', color: '#FDECC8' },
    ]
  },
  {
    id: 'col-tags',
    name: 'Tags',
    type: 'tags',
    options: [
      { id: 'tag-work', label: 'Work', color: '#D3E5EF' },
      { id: 'tag-personal', label: 'Personal', color: '#FDECC8' },
      { id: 'tag-ideas', label: 'Ideas', color: '#F5E0E9' }
    ]
  },
  { id: 'col-estimate', name: 'Story Points', type: 'number' }
];

// --- Subscribe to User Pages in Real-time ---
export function subscribeUserPages(
  userId: string,
  onUpdate: (pages: Page[]) => void
): () => void {
  const pagesCol = collection(db, 'pages');
  const q = query(pagesCol, where('userId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const pages: Page[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        pages.push({
          id: docSnap.id,
          userId: data.userId,
          title: data.title || 'Untitled',
          icon: data.icon ?? '📄',
          content: data.content || '',
          parentId: data.parentId || null,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt || new Date().toISOString(),
        });
      });
      // Sort: root pages first, then chronological
      pages.sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
      onUpdate(pages);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, 'pages');
    }
  );
}

// --- Subscribe to User Databases in Real-time ---
export function subscribeUserDatabases(
  userId: string,
  onUpdate: (databases: Database[]) => void
): () => void {
  const dbsCol = collection(db, 'databases');
  const q = query(dbsCol, where('userId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const databases: Database[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        databases.push({
          id: docSnap.id,
          userId: data.userId,
          title: data.title || 'Untitled Database',
          icon: data.icon ?? '📊',
          schema: data.schema || JSON.stringify(INITIAL_SCHEMA),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt || new Date().toISOString(),
        });
      });
      databases.sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
      onUpdate(databases);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, 'databases');
    }
  );
}

// --- Subscribe to Database Rows in Real-time ---
export function subscribeDatabaseRows(
  userId: string,
  databaseId: string,
  onUpdate: (rows: Row[]) => void
): () => void {
  const rowsCol = collection(db, 'rows');
  const q = query(
    rowsCol,
    where('userId', '==', userId),
    where('databaseId', '==', databaseId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const rows: Row[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        rows.push({
          id: docSnap.id,
          userId: data.userId,
          databaseId: data.databaseId,
          properties: data.properties || '{}',
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt || new Date().toISOString(),
        });
      });
      rows.sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
      onUpdate(rows);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, 'rows');
    }
  );
}

// --- Save / Update Page in Firestore ---
export async function syncSavePage(page: Page, userId: string): Promise<void> {
  const pageRef = doc(db, 'pages', page.id);
  const payload = {
    id: page.id,
    userId,
    title: page.title || 'Untitled',
    icon: page.icon || '📄',
    content: page.content || '',
    parentId: page.parentId || null,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(pageRef, payload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `pages/${page.id}`);
  }
}

// --- Create Page in Firestore ---
export async function syncCreatePage(
  input: { title?: string; icon?: string | null; parentId?: string | null; content?: string },
  userId: string
): Promise<Page> {
  const pageId = crypto.randomUUID();
  const now = new Date().toISOString();
  const newPage: Page = {
    id: pageId,
    userId,
    title: input.title?.trim() || 'Untitled',
    icon: input.icon ?? '📄',
    content: input.content || JSON.stringify([
      {
        id: crypto.randomUUID(),
        type: 'paragraph',
        props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
        content: [],
        children: []
      }
    ]),
    parentId: input.parentId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const pageRef = doc(db, 'pages', pageId);
  try {
    await setDoc(pageRef, {
      ...newPage,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return newPage;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `pages/${pageId}`);
  }
}

// --- Delete Page and Descendants in Firestore ---
export async function syncDeletePage(pageId: string, allPages: Page[]): Promise<void> {
  const toDelete = new Set<string>([pageId]);
  let added = true;
  while (added) {
    added = false;
    for (const p of allPages) {
      if (p.parentId && toDelete.has(p.parentId) && !toDelete.has(p.id)) {
        toDelete.add(p.id);
        added = true;
      }
    }
  }

  const batch = writeBatch(db);
  for (const id of toDelete) {
    batch.delete(doc(db, 'pages', id));
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `pages/${pageId}`);
  }
}

// --- Save / Create Database in Firestore ---
export async function syncCreateDatabase(
  input: { title?: string; icon?: string | null; schema?: string },
  userId: string
): Promise<Database> {
  const dbId = crypto.randomUUID();
  const now = new Date().toISOString();
  const newDb: Database = {
    id: dbId,
    userId,
    title: input.title?.trim() || 'Untitled Database',
    icon: input.icon ?? '📊',
    schema: input.schema || JSON.stringify(INITIAL_SCHEMA),
    createdAt: now,
    updatedAt: now,
    rows: []
  };

  const dbRef = doc(db, 'databases', dbId);
  try {
    await setDoc(dbRef, {
      ...newDb,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Create an initial empty row
    const firstRow: Row = {
      id: crypto.randomUUID(),
      userId,
      databaseId: dbId,
      properties: JSON.stringify({
        'col-name': 'Sample task entry',
        'col-status': 'Not Started'
      }),
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(doc(db, 'rows', firstRow.id), {
      ...firstRow,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    newDb.rows = [firstRow];
    return newDb;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `databases/${dbId}`);
  }
}

export async function syncUpdateDatabase(
  databaseId: string,
  updates: Partial<Database>,
  userId: string
): Promise<void> {
  const dbRef = doc(db, 'databases', databaseId);
  try {
    await setDoc(dbRef, {
      ...updates,
      userId,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `databases/${databaseId}`);
  }
}

export async function syncDeleteDatabase(databaseId: string, userId: string): Promise<void> {
  try {
    // Delete parent database doc
    await deleteDoc(doc(db, 'databases', databaseId));

    // Delete associated rows
    const rowsCol = collection(db, 'rows');
    const q = query(rowsCol, where('userId', '==', userId), where('databaseId', '==', databaseId));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `databases/${databaseId}`);
  }
}

// --- Row Operations in Firestore ---
export async function syncAddRow(
  databaseId: string,
  properties: Record<string, unknown>,
  userId: string
): Promise<Row> {
  const rowId = crypto.randomUUID();
  const now = new Date().toISOString();
  const newRow: Row = {
    id: rowId,
    userId,
    databaseId,
    properties: JSON.stringify(properties),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'rows', rowId), {
      ...newRow,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return newRow;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `rows/${rowId}`);
  }
}

export async function syncUpdateRow(
  rowId: string,
  properties: Record<string, unknown>,
  existingPropertiesJson: string,
  userId: string,
  databaseId: string
): Promise<void> {
  let existing = {};
  try {
    existing = JSON.parse(existingPropertiesJson);
  } catch {
    existing = {};
  }
  const merged = { ...existing, ...properties };

  try {
    await setDoc(
      doc(db, 'rows', rowId),
      {
        id: rowId,
        userId,
        databaseId,
        properties: JSON.stringify(merged),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `rows/${rowId}`);
  }
}

export async function syncDeleteRow(rowId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'rows', rowId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `rows/${rowId}`);
  }
}

// --- Workspace Seeding for New User ---
export async function checkAndSeedInitialWorkspace(userId: string): Promise<void> {
  try {
    const pagesCol = collection(db, 'pages');
    const q = query(pagesCol, where('userId', '==', userId));
    const snap = await getDocs(q);

    if (snap.empty) {
      console.log('[Workspace] Seeding initial onboarding documents for user:', userId);
      const pageId = crypto.randomUUID();
      const dbId = crypto.randomUUID();
      const now = new Date().toISOString();

      // Seed Starter Page
      await setDoc(doc(db, 'pages', pageId), {
        id: pageId,
        userId,
        title: 'Welcome to Notion Cloud',
        icon: '📝',
        content: INITIAL_BLOCKS,
        parentId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Seed Starter Database
      await setDoc(doc(db, 'databases', dbId), {
        id: dbId,
        userId,
        title: 'Sprint Roadmap & Milestones',
        icon: '📊',
        schema: JSON.stringify(INITIAL_SCHEMA),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Seed Starter Rows
      const row1Id = crypto.randomUUID();
      await setDoc(doc(db, 'rows', row1Id), {
        id: row1Id,
        userId,
        databaseId: dbId,
        properties: JSON.stringify({
          'col-name': 'Google Sign-In Authentication',
          'col-status': 'Completed',
          'col-tags': ['Work'],
          'col-estimate': 5,
        }),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const row2Id = crypto.randomUUID();
      await setDoc(doc(db, 'rows', row2Id), {
        id: row2Id,
        userId,
        databaseId: dbId,
        properties: JSON.stringify({
          'col-name': 'Real-time Cloud Firestore synchronization',
          'col-status': 'In Progress',
          'col-tags': ['Work'],
          'col-estimate': 3,
        }),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn('[Workspace] Warning while checking/seeding user workspace:', err);
  }
}

// --- Admin Constants & Verification ---
export const ADMIN_EMAIL = 'hoangkhuongsp1@gmail.com';

export function isUserAdmin(email?: string | null): boolean {
  return email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

// --- Record Uploaded Media in Firestore ---
export async function recordUploadedMedia(item: Omit<MediaItem, 'id' | 'createdAt'>): Promise<MediaItem> {
  const mediaId = crypto.randomUUID();
  const now = new Date().toISOString();
  const mediaRef = doc(db, 'media', mediaId);

  const newMedia: MediaItem = {
    id: mediaId,
    ...item,
    createdAt: now,
  };

  try {
    await setDoc(mediaRef, {
      ...newMedia,
      createdAt: serverTimestamp(),
    });
    return newMedia;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `media/${mediaId}`);
  }
}

// --- Subscribe to All Media for Admin Dashboard ---
export function subscribeAllMedia(
  onUpdate: (media: MediaItem[]) => void
): () => void {
  const mediaCol = collection(db, 'media');

  return onSnapshot(
    mediaCol,
    (snapshot) => {
      const items: MediaItem[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          userId: data.userId,
          userEmail: data.userEmail || 'unknown@user.com',
          userName: data.userName || 'Anonymous',
          fileName: data.fileName || 'file',
          fileUrl: data.fileUrl || '',
          fileKey: data.fileKey || '',
          fileSize: Number(data.fileSize) || 0,
          mimeType: data.mimeType || 'application/octet-stream',
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString(),
        });
      });
      // Sort newest first
      items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      onUpdate(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'media');
    }
  );
}

// --- Admin Delete Media Item ---
export async function deleteMediaItem(item: MediaItem): Promise<void> {
  try {
    // 1. Delete Firestore metadata record
    await deleteDoc(doc(db, 'media', item.id));

    // 2. Delete physical file from disk via server endpoint
    if (item.fileKey) {
      fetch(`/api/files/delete?key=${encodeURIComponent(item.fileKey)}`, {
        method: 'DELETE',
      }).catch((e) => console.warn('[Delete physical file warning]:', e));
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `media/${item.id}`);
  }
}
