import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Type,
  CheckCircle2,
  Tag as TagIcon,
  Hash,
  MoreHorizontal,
  ChevronDown,
  X
} from 'lucide-react';
import { Database, ColumnSchema, ColumnType, Row } from '../types/index.ts';
import { IconPicker } from './IconPicker.tsx';

interface DatabaseViewProps {
  database: Database;
  onUpdateDatabase: (id: string, updates: Partial<Database>) => Promise<void>;
  onAddRow: (databaseId: string, properties?: Record<string, unknown>) => Promise<void>;
  onUpdateRow: (databaseId: string, rowId: string, properties: Record<string, unknown>) => Promise<void>;
  onDeleteRow: (databaseId: string, rowId: string) => Promise<void>;
}

const DEFAULT_TAG_COLORS = [
  { label: 'Blue', color: '#D3E5EF' },
  { label: 'Green', color: '#DBEDDB' },
  { label: 'Yellow', color: '#FDECC8' },
  { label: 'Pink', color: '#F5E0E9' },
  { label: 'Purple', color: '#E8DEEE' },
  { label: 'Gray', color: '#E3E2E0' },
];

export const DatabaseView: React.FC<DatabaseViewProps> = ({
  database,
  onUpdateDatabase,
  onAddRow,
  onUpdateRow,
  onDeleteRow,
}) => {
  const [activeCell, setActiveCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState<{ rowId: string; colId: string } | null>(null);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<ColumnType>('text');

  // Parse columns schema
  let columns: ColumnSchema[] = [];
  try {
    columns = JSON.parse(database.schema);
    if (!Array.isArray(columns)) columns = [];
  } catch {
    columns = [{ id: 'col-name', name: 'Name', type: 'text' }];
  }

  const rows = database.rows || [];

  const handleTitleChange = (newTitle: string) => {
    onUpdateDatabase(database.id, { title: newTitle });
  };

  const handleIconChange = (newIcon: string | null) => {
    onUpdateDatabase(database.id, { icon: newIcon });
  };

  // Add a new column to schema
  const handleCreateColumn = () => {
    if (!newColName.trim()) return;

    const newColumn: ColumnSchema = {
      id: `col-${Date.now()}`,
      name: newColName.trim(),
      type: newColType,
    };

    if (newColType === 'status') {
      newColumn.options = [
        { id: 'opt-notstarted', label: 'Not Started', color: '#E3E2E0' },
        { id: 'opt-inprogress', label: 'In Progress', color: '#D3E5EF' },
        { id: 'opt-done', label: 'Completed', color: '#DBEDDB' },
      ];
    } else if (newColType === 'tags') {
      newColumn.options = [
        { id: 'tag-1', label: 'Feature', color: '#D3E5EF' },
        { id: 'tag-2', label: 'Bug', color: '#F5E0E9' },
        { id: 'tag-3', label: 'Research', color: '#FDECC8' },
      ];
    }

    const updatedColumns = [...columns, newColumn];
    onUpdateDatabase(database.id, { schema: JSON.stringify(updatedColumns) });
    setNewColName('');
    setIsAddingColumn(false);
  };

  // Delete a column
  const handleDeleteColumn = (colId: string) => {
    if (columns.length <= 1) return; // Keep at least one column
    const updated = columns.filter((c) => c.id !== colId);
    onUpdateDatabase(database.id, { schema: JSON.stringify(updated) });
  };

  // Parse row properties
  const getRowProps = (row: Row): Record<string, unknown> => {
    try {
      return JSON.parse(row.properties);
    } catch {
      return {};
    }
  };

  const handleCellBlur = (row: Row, colId: string, val: unknown) => {
    const current = getRowProps(row);
    if (current[colId] === val) return;
    onUpdateRow(database.id, row.id, { [colId]: val });
  };

  const toggleTag = (row: Row, colId: string, tagLabel: string) => {
    const current = getRowProps(row);
    const existingTags = Array.isArray(current[colId]) ? (current[colId] as string[]) : [];
    const hasTag = existingTags.includes(tagLabel);
    const newTags = hasTag ? existingTags.filter((t) => t !== tagLabel) : [...existingTags, tagLabel];
    onUpdateRow(database.id, row.id, { [colId]: newTags });
  };

  const getColumnIcon = (type: ColumnType) => {
    switch (type) {
      case 'text':
        return <Type className="w-3.5 h-3.5 text-[#9B9A97]" />;
      case 'status':
        return <CheckCircle2 className="w-3.5 h-3.5 text-[#9B9A97]" />;
      case 'tags':
        return <TagIcon className="w-3.5 h-3.5 text-[#9B9A97]" />;
      case 'number':
        return <Hash className="w-3.5 h-3.5 text-[#9B9A97]" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-y-auto">
      {/* Header bar */}
      <div className="px-8 pt-8 pb-4">
        <div className="flex items-center gap-3 mb-2">
          <IconPicker currentIcon={database.icon} onSelect={handleIconChange} />
          <input
            type="text"
            value={database.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Untitled Database"
            className="text-3xl font-bold tracking-tight text-[#37352F] outline-none border-none bg-transparent placeholder:text-[#C4C3C0] flex-1"
          />
        </div>

        <div className="flex items-center justify-between text-xs text-[#787774] mt-2 pb-2 border-b border-[rgba(55,53,47,0.06)]">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[#37352F]">Table View</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums font-mono">{rows.length} {rows.length === 1 ? 'row' : 'rows'}</span>
          </div>
          <button
            type="button"
            onClick={() => onAddRow(database.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#37352F] text-white rounded-md text-xs font-medium hover:bg-neutral-800 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New row</span>
          </button>
        </div>
      </div>

      {/* Spreadsheet Table Container */}
      <div className="flex-1 px-8 pb-16 overflow-x-auto">
        <div className="inline-block min-w-full align-middle border border-[rgba(55,53,47,0.09)] rounded-lg overflow-hidden bg-white shadow-xs">
          <table className="min-w-full border-collapse text-left text-[13px]">
            {/* Table Header */}
            <thead>
              <tr className="bg-[#FAF9F7] border-b border-[rgba(55,53,47,0.09)]">
                <th className="w-10 px-3 py-2 text-center text-[#9B9A97] font-normal border-r border-[rgba(55,53,47,0.09)]">
                  #
                </th>
                {columns.map((col) => (
                  <th
                    key={col.id}
                    className="group relative px-3 py-2 font-medium text-[#787774] border-r border-[rgba(55,53,47,0.09)] min-w-[180px]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 truncate">
                        {getColumnIcon(col.type)}
                        <span className="truncate">{col.name}</span>
                      </div>
                      {columns.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteColumn(col.id)}
                          title="Delete column"
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-neutral-200 text-neutral-400 hover:text-red-500 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                {/* Add column header */}
                <th className="w-32 px-3 py-2 font-normal text-[#9B9A97]">
                  {isAddingColumn ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        placeholder="Column name"
                        value={newColName}
                        onChange={(e) => setNewColName(e.target.value)}
                        className="text-xs px-1.5 py-0.5 border border-neutral-300 rounded w-20 outline-none"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateColumn();
                          if (e.key === 'Escape') setIsAddingColumn(false);
                        }}
                      />
                      <select
                        value={newColType}
                        onChange={(e) => setNewColType(e.target.value as ColumnType)}
                        className="text-[11px] bg-white border border-neutral-300 rounded px-1 py-0.5 outline-none"
                      >
                        <option value="text">Text</option>
                        <option value="status">Status</option>
                        <option value="tags">Tags</option>
                        <option value="number">Number</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleCreateColumn}
                        className="text-xs text-blue-600 font-medium"
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsAddingColumn(true)}
                      className="flex items-center gap-1 text-[#787774] hover:text-[#37352F] text-xs transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add column</span>
                    </button>
                  )}
                </th>
              </tr>
            </thead>

            {/* Table Rows */}
            <tbody className="divide-y divide-[rgba(55,53,47,0.09)]">
              {rows.map((row, rowIdx) => {
                const props = getRowProps(row);
                return (
                  <tr
                    key={row.id}
                    className="hover:bg-[#FBFBFA] transition-colors group"
                  >
                    {/* Row index + delete */}
                    <td className="w-10 px-2 py-2 text-center text-[#9B9A97] font-mono text-xs tabular-nums border-r border-[rgba(55,53,47,0.09)] relative">
                      <span className="group-hover:hidden">{rowIdx + 1}</span>
                      <button
                        type="button"
                        onClick={() => onDeleteRow(database.id, row.id)}
                        title="Delete row"
                        className="hidden group-hover:inline-flex items-center justify-center text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>

                    {/* Column Cells */}
                    {columns.map((col) => {
                      const val = props[col.id];
                      const isDropdownOpen = dropdownOpen?.rowId === row.id && dropdownOpen?.colId === col.id;

                      return (
                        <td
                          key={col.id}
                          className="px-3 py-2 border-r border-[rgba(55,53,47,0.09)] text-[#37352F] relative"
                        >
                          {col.type === 'text' && (
                            <input
                              type="text"
                              defaultValue={(val as string) || ''}
                              onBlur={(e) => handleCellBlur(row, col.id, e.target.value)}
                              placeholder="Empty"
                              className="w-full bg-transparent border-none outline-none placeholder:text-[#C4C3C0] focus:ring-1 focus:ring-neutral-400 rounded px-1 py-0.5 -mx-1"
                            />
                          )}

                          {col.type === 'number' && (
                            <input
                              type="number"
                              defaultValue={(val as number) ?? ''}
                              onBlur={(e) => {
                                const num = e.target.value === '' ? null : Number(e.target.value);
                                handleCellBlur(row, col.id, num);
                              }}
                              placeholder="0"
                              className="w-full bg-transparent border-none outline-none font-mono tabular-nums placeholder:text-[#C4C3C0] focus:ring-1 focus:ring-neutral-400 rounded px-1 py-0.5 -mx-1"
                            />
                          )}

                          {col.type === 'status' && (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() =>
                                  setDropdownOpen(
                                    isDropdownOpen ? null : { rowId: row.id, colId: col.id }
                                  )
                                }
                                className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs transition-colors"
                                style={{
                                  backgroundColor:
                                    val === 'Completed'
                                      ? '#DBEDDB'
                                      : val === 'In Progress'
                                      ? '#D3E5EF'
                                      : val === 'Archived'
                                      ? '#FDECC8'
                                      : '#E3E2E0',
                                  color: '#37352F',
                                }}
                              >
                                <span className="font-medium">{(val as string) || 'Not Started'}</span>
                                <ChevronDown className="w-3 h-3 text-neutral-500" />
                              </button>

                              {isDropdownOpen && (
                                <>
                                  <div
                                    className="fixed inset-0 z-30"
                                    onClick={() => setDropdownOpen(null)}
                                  />
                                  <div className="absolute left-0 top-full mt-1 w-36 bg-white border border-neutral-200 rounded-md shadow-lg py-1 z-40">
                                    {['Not Started', 'In Progress', 'Completed', 'Archived'].map((status) => (
                                      <button
                                        key={status}
                                        type="button"
                                        onClick={() => {
                                          handleCellBlur(row, col.id, status);
                                          setDropdownOpen(null);
                                        }}
                                        className="w-full text-left px-3 py-1.5 text-xs text-[#37352F] hover:bg-neutral-100 flex items-center justify-between"
                                      >
                                        <span>{status}</span>
                                        {val === status && <CheckCircle2 className="w-3 h-3 text-neutral-700" />}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          )}

                          {col.type === 'tags' && (
                            <div className="relative">
                              <div
                                onClick={() =>
                                  setDropdownOpen(
                                    isDropdownOpen ? null : { rowId: row.id, colId: col.id }
                                  )
                                }
                                className="flex flex-wrap items-center gap-1 cursor-pointer min-h-[24px]"
                              >
                                {Array.isArray(val) && val.length > 0 ? (
                                  (val as string[]).map((tagStr) => (
                                    <span
                                      key={tagStr}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-[#37352F] bg-[#E8DEEE]"
                                    >
                                      {tagStr}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[#C4C3C0] text-xs">Empty</span>
                                )}
                              </div>

                              {isDropdownOpen && (
                                <>
                                  <div
                                    className="fixed inset-0 z-30"
                                    onClick={() => setDropdownOpen(null)}
                                  />
                                  <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-neutral-200 rounded-md shadow-lg p-1.5 z-40">
                                    <div className="text-[11px] font-semibold text-[#9B9A97] px-2 py-1 uppercase">
                                      Select tags
                                    </div>
                                    {['Frontend', 'Backend', 'Design', 'Infrastructure', 'Urgent', 'Documentation'].map((tagOption) => {
                                      const currentTags = Array.isArray(val) ? (val as string[]) : [];
                                      const isSelected = currentTags.includes(tagOption);
                                      return (
                                        <button
                                          key={tagOption}
                                          type="button"
                                          onClick={() => toggleTag(row, col.id, tagOption)}
                                          className={`w-full text-left px-2 py-1 text-xs rounded flex items-center justify-between mb-0.5 ${
                                            isSelected ? 'bg-neutral-100 font-medium' : 'hover:bg-neutral-50'
                                          }`}
                                        >
                                          <span>{tagOption}</span>
                                          {isSelected && <span className="text-emerald-600 text-xs">✓</span>}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}

                    {/* Empty cell for column header alignment */}
                    <td className="w-32 px-3 py-2" />
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Quick row add row at table bottom */}
          <div className="p-2 border-t border-[rgba(55,53,47,0.09)] bg-[#FAF9F7]/60">
            <button
              type="button"
              onClick={() => onAddRow(database.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#787774] hover:text-[#37352F] hover:bg-[#EFECE8] rounded-md transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
