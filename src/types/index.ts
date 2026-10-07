export interface Page {
  id: string;
  userId?: string;
  title: string;
  icon: string | null;
  content: string; // JSON string format for BlockNote state
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ColumnType = 'text' | 'status' | 'tags' | 'number';

export interface ColumnOption {
  id: string;
  label: string;
  color: string;
}

export interface ColumnSchema {
  id: string;
  name: string;
  type: ColumnType;
  options?: ColumnOption[];
}

export interface Database {
  id: string;
  userId?: string;
  title: string;
  icon: string | null;
  schema: string; // JSON string of ColumnSchema[]
  createdAt: string;
  updatedAt: string;
  rows?: Row[];
}

export interface Row {
  id: string;
  userId?: string;
  databaseId: string;
  properties: string; // JSON string mapping column IDs to cell values
  createdAt: string;
  updatedAt: string;
}

export interface MediaItem {
  id: string;
  userId: string;
  userEmail: string;
  userName?: string;
  fileName: string;
  fileUrl: string;
  fileKey: string;
  fileSize: number;
  mimeType?: string;
  createdAt: string;
}

export type ActiveItem =
  | { type: 'page'; id: string }
  | { type: 'database'; id: string }
  | { type: 'admin' };

export type SaveStatus = 'saved' | 'saving' | 'error';
