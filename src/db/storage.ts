/**
 * SQLite & JSON Persistence Engine
 * Faithfully mirrors the Prisma Schema (Page, Database, Row) with file persistence.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface PageRecord {
  id: string;
  title: string;
  icon: string | null;
  content: string; // JSON string format for BlockNote state
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ColumnSchema {
  id: string;
  name: string;
  type: 'text' | 'status' | 'tags' | 'number';
  options?: { id: string; label: string; color: string }[];
}

export interface DatabaseRecord {
  id: string;
  title: string;
  icon: string | null;
  schema: string; // JSON string representing ColumnSchema[]
  createdAt: string;
  updatedAt: string;
}

export interface RowRecord {
  id: string;
  databaseId: string;
  properties: string; // JSON string mapping column IDs to cell values
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseWithRows extends DatabaseRecord {
  rows: RowRecord[];
}

interface StorageData {
  pages: PageRecord[];
  databases: DatabaseRecord[];
  rows: RowRecord[];
}

import { syncDatabaseToS3, fetchDatabaseFromS3 } from '../services/s3.ts';

const isVercel = Boolean(process.env.VERCEL);
const DATA_DIR = isVercel ? '/tmp/data' : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'notion.db.json');

const INITIAL_BLOCKS = JSON.stringify([
  {
    id: "b-1",
    type: "heading",
    props: { textColor: "default", backgroundColor: "default", textAlignment: "left", level: 1 },
    content: [{ type: "text", text: "Welcome to Notion Minimal", styles: {} }],
    children: []
  },
  {
    id: "b-2",
    type: "paragraph",
    props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
    content: [
      { type: "text", text: "This is a lightweight, distraction-free Notion clone built with ", styles: {} },
      { type: "text", text: "BlockNote", styles: { bold: true } },
      { type: "text", text: ", ", styles: {} },
      { type: "text", text: "SQLite persistence", styles: { bold: true } },
      { type: "text", text: ", and ", styles: {} },
      { type: "text", text: "AWS S3 presigned uploads", styles: { bold: true } },
      { type: "text", text: ".", styles: {} }
    ],
    children: []
  },
  {
    id: "b-3",
    type: "heading",
    props: { textColor: "default", backgroundColor: "default", textAlignment: "left", level: 2 },
    content: [{ type: "text", text: "Quick Start Guide", styles: {} }],
    children: []
  },
  {
    id: "b-4",
    type: "bulletListItem",
    props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
    content: [
      { type: "text", text: "Type ", styles: {} },
      { type: "text", text: "/", styles: { code: true } },
      { type: "text", text: " anywhere on a new line to open the slash command menu.", styles: {} }
    ],
    children: []
  },
  {
    id: "b-5",
    type: "checkListItem",
    props: { textColor: "default", backgroundColor: "default", textAlignment: "left", checked: true },
    content: [{ type: "text", text: "Create and nest documents in the collapsible sidebar", styles: {} }],
    children: []
  },
  {
    id: "b-6",
    type: "checkListItem",
    props: { textColor: "default", backgroundColor: "default", textAlignment: "left", checked: false },
    content: [{ type: "text", text: "Drag or paste an image to test S3 presigned uploads", styles: {} }],
    children: []
  },
  {
    id: "b-7",
    type: "checkListItem",
    props: { textColor: "default", backgroundColor: "default", textAlignment: "left", checked: false },
    content: [{ type: "text", text: "Switch to Database view to manage structured spreadsheet rows", styles: {} }],
    children: []
  }
]);

const INITIAL_MEETING_BLOCKS = JSON.stringify([
  {
    id: "m-1",
    type: "heading",
    props: { textColor: "default", backgroundColor: "default", textAlignment: "left", level: 1 },
    content: [{ type: "text", text: "Weekly Engineering Sync", styles: {} }],
    children: []
  },
  {
    id: "m-2",
    type: "paragraph",
    props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
    content: [{ type: "text", text: "Agenda and action items for the platform architecture review.", styles: {} }],
    children: []
  },
  {
    id: "m-3",
    type: "heading",
    props: { textColor: "default", backgroundColor: "default", textAlignment: "left", level: 2 },
    content: [{ type: "text", text: "Action Items", styles: {} }],
    children: []
  },
  {
    id: "m-4",
    type: "checkListItem",
    props: { textColor: "default", backgroundColor: "default", textAlignment: "left", checked: true },
    content: [{ type: "text", text: "Verify Prisma schema JSONB serialization", styles: {} }],
    children: []
  },
  {
    id: "m-5",
    type: "checkListItem",
    props: { textColor: "default", backgroundColor: "default", textAlignment: "left", checked: false },
    content: [{ type: "text", text: "Configure AWS S3 bucket CORS for presigned uploads", styles: {} }],
    children: []
  }
]);

const INITIAL_SCHEMA: ColumnSchema[] = [
  { id: "col-name", name: "Task Name", type: "text" },
  {
    id: "col-status",
    name: "Status",
    type: "status",
    options: [
      { id: "opt-todo", label: "Not Started", color: "#E3E2E0" },
      { id: "opt-inprogress", label: "In Progress", color: "#D3E5EF" },
      { id: "opt-done", label: "Completed", color: "#DBEDDB" },
      { id: "opt-archived", label: "Archived", color: "#FDECC8" },
    ]
  },
  {
    id: "col-tags",
    name: "Tags",
    type: "tags",
    options: [
      { id: "tag-frontend", label: "Frontend", color: "#D3E5EF" },
      { id: "tag-backend", label: "Backend", color: "#FDECC8" },
      { id: "tag-design", label: "Design", color: "#F5E0E9" },
      { id: "tag-infra", label: "Infrastructure", color: "#E8DEEE" }
    ]
  },
  { id: "col-estimate", name: "Story Points", type: "number" }
];

function seedDefaultData(): StorageData {
  const page1Id = crypto.randomUUID();
  const page2Id = crypto.randomUUID();
  const db1Id = crypto.randomUUID();
  const now = new Date().toISOString();

  return {
    pages: [
      {
        id: page1Id,
        title: "Welcome to Notion Minimal",
        icon: "📝",
        content: INITIAL_BLOCKS,
        parentId: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: page2Id,
        title: "Weekly Engineering Sync",
        icon: "📅",
        content: INITIAL_MEETING_BLOCKS,
        parentId: page1Id, // Nested sub-page
        createdAt: now,
        updatedAt: now,
      }
    ],
    databases: [
      {
        id: db1Id,
        title: "Product Roadmap & Sprint Tasks",
        icon: "📊",
        schema: JSON.stringify(INITIAL_SCHEMA),
        createdAt: now,
        updatedAt: now,
      }
    ],
    rows: [
      {
        id: crypto.randomUUID(),
        databaseId: db1Id,
        properties: JSON.stringify({
          "col-name": "Integrate BlockNote React editor",
          "col-status": "Completed",
          "col-tags": ["Frontend"],
          "col-estimate": 3
        }),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        databaseId: db1Id,
        properties: JSON.stringify({
          "col-name": "AWS S3 presigned PUT URL generation",
          "col-status": "Completed",
          "col-tags": ["Backend", "Infrastructure"],
          "col-estimate": 5
        }),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        databaseId: db1Id,
        properties: JSON.stringify({
          "col-name": "Interactive spreadsheet database table view",
          "col-status": "In Progress",
          "col-tags": ["Frontend", "Design"],
          "col-estimate": 5
        }),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        databaseId: db1Id,
        properties: JSON.stringify({
          "col-name": "Auto-save debouncer (1000ms)",
          "col-status": "Not Started",
          "col-tags": ["Frontend"],
          "col-estimate": 2
        }),
        createdAt: now,
        updatedAt: now,
      }
    ]
  };
}

class StorageEngine {
  private data: StorageData;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_FILE)) {
      try {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(fileContent);
      } catch (err) {
        console.warn('[Storage] Failed to read database file, reseeding:', err);
        this.data = seedDefaultData();
        this.persist();
      }
    } else {
      this.data = seedDefaultData();
      this.persist();
    }

    // On startup, if S3 cloud persistence is available, hydrate latest state
    this.initCloudSync();
  }

  private async initCloudSync(): Promise<void> {
    try {
      const cloudData = await fetchDatabaseFromS3();
      if (cloudData) {
        const parsed = JSON.parse(cloudData);
        if (parsed.pages && parsed.databases && parsed.rows) {
          this.data = parsed;
          try {
            fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
          } catch {}
          console.log('[Storage] Hydrated database state from AWS S3');
        }
      }
    } catch (err) {
      console.warn('[Storage] S3 hydration warning:', err);
    }
  }

  private persist(): void {
    try {
      const json = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(DB_FILE, json, 'utf-8');
      // Asynchronously sync database to S3 for serverless persistence
      syncDatabaseToS3(json).catch(() => {});
    } catch (err) {
      console.error('[Storage] Error persisting to disk:', err);
    }
  }

  // --- Pages ---
  getPages(): PageRecord[] {
    return this.data.pages;
  }

  getPage(id: string): PageRecord | null {
    return this.data.pages.find(p => p.id === id) || null;
  }

  createPage(input: { title?: string; icon?: string | null; content?: string; parentId?: string | null }): PageRecord {
    const now = new Date().toISOString();
    const newPage: PageRecord = {
      id: crypto.randomUUID(),
      title: input.title?.trim() || "Untitled",
      icon: input.icon ?? "📄",
      content: input.content || JSON.stringify([
        {
          id: crypto.randomUUID(),
          type: "paragraph",
          props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
          content: [],
          children: []
        }
      ]),
      parentId: input.parentId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.data.pages.push(newPage);
    this.persist();
    return newPage;
  }

  updatePage(id: string, updates: Partial<Omit<PageRecord, 'id' | 'createdAt'>>): PageRecord | null {
    const pageIndex = this.data.pages.findIndex(p => p.id === id);
    if (pageIndex === -1) return null;

    const existing = this.data.pages[pageIndex];
    const updated: PageRecord = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.data.pages[pageIndex] = updated;
    this.persist();
    return updated;
  }

  deletePage(id: string): boolean {
    const pageExists = this.data.pages.some(p => p.id === id);
    if (!pageExists) return false;

    // Collect all descendant ids
    const toDelete = new Set<string>([id]);
    let added = true;
    while (added) {
      added = false;
      for (const p of this.data.pages) {
        if (p.parentId && toDelete.has(p.parentId) && !toDelete.has(p.id)) {
          toDelete.add(p.id);
          added = true;
        }
      }
    }

    this.data.pages = this.data.pages.filter(p => !toDelete.has(p.id));
    this.persist();
    return true;
  }

  // --- Databases ---
  getDatabases(): DatabaseRecord[] {
    return this.data.databases;
  }

  getDatabase(id: string): DatabaseWithRows | null {
    const db = this.data.databases.find(d => d.id === id);
    if (!db) return null;
    const rows = this.data.rows.filter(r => r.databaseId === id);
    return {
      ...db,
      rows
    };
  }

  createDatabase(input: { title?: string; icon?: string | null; schema?: string }): DatabaseWithRows {
    const now = new Date().toISOString();
    const newDb: DatabaseRecord = {
      id: crypto.randomUUID(),
      title: input.title?.trim() || "Untitled Database",
      icon: input.icon ?? "📊",
      schema: input.schema || JSON.stringify(INITIAL_SCHEMA),
      createdAt: now,
      updatedAt: now,
    };
    this.data.databases.push(newDb);

    // Create an initial empty row
    const firstRow: RowRecord = {
      id: crypto.randomUUID(),
      databaseId: newDb.id,
      properties: JSON.stringify({
        "col-name": "Sample row entry",
        "col-status": "Not Started"
      }),
      createdAt: now,
      updatedAt: now,
    };
    this.data.rows.push(firstRow);
    this.persist();

    return {
      ...newDb,
      rows: [firstRow]
    };
  }

  updateDatabase(id: string, updates: Partial<Omit<DatabaseRecord, 'id' | 'createdAt'>>): DatabaseRecord | null {
    const dbIndex = this.data.databases.findIndex(d => d.id === id);
    if (dbIndex === -1) return null;

    const existing = this.data.databases[dbIndex];
    const updated: DatabaseRecord = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.data.databases[dbIndex] = updated;
    this.persist();
    return updated;
  }

  deleteDatabase(id: string): boolean {
    const dbIndex = this.data.databases.findIndex(d => d.id === id);
    if (dbIndex === -1) return false;

    this.data.databases.splice(dbIndex, 1);
    this.data.rows = this.data.rows.filter(r => r.databaseId !== id);
    this.persist();
    return true;
  }

  // --- Rows ---
  addRow(databaseId: string, properties: Record<string, unknown> = {}): RowRecord {
    const now = new Date().toISOString();
    const newRow: RowRecord = {
      id: crypto.randomUUID(),
      databaseId,
      properties: JSON.stringify(properties),
      createdAt: now,
      updatedAt: now,
    };
    this.data.rows.push(newRow);
    this.persist();
    return newRow;
  }

  updateRow(databaseId: string, rowId: string, properties: Record<string, unknown>): RowRecord | null {
    const rowIndex = this.data.rows.findIndex(r => r.id === rowId && r.databaseId === databaseId);
    if (rowIndex === -1) return null;

    const existing = this.data.rows[rowIndex];
    let currentProps = {};
    try {
      currentProps = JSON.parse(existing.properties);
    } catch {
      currentProps = {};
    }

    const updatedProps = { ...currentProps, ...properties };
    const updatedRow: RowRecord = {
      ...existing,
      properties: JSON.stringify(updatedProps),
      updatedAt: new Date().toISOString()
    };
    this.data.rows[rowIndex] = updatedRow;
    this.persist();
    return updatedRow;
  }

  deleteRow(databaseId: string, rowId: string): boolean {
    const initialLen = this.data.rows.length;
    this.data.rows = this.data.rows.filter(r => !(r.id === rowId && r.databaseId === databaseId));
    const deleted = this.data.rows.length < initialLen;
    if (deleted) this.persist();
    return deleted;
  }
}

export const db = new StorageEngine();
