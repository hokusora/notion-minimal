import React, { useState } from 'react';
import { Smile, X } from 'lucide-react';

interface IconPickerProps {
  currentIcon: string | null;
  onSelect: (icon: string | null) => void;
  className?: string;
}

const POPULAR_EMOJIS = [
  '📝', '📄', '📅', '📊', '🚀', '💡', '🎯', '🛠️', 
  '📌', '📚', '💼', '🔬', '⚡', '🎨', '🔍', '🧩',
  '🏷️', '✅', '⭐', '🔥', '💻', '🌐', '📈', '✨',
  '☕', '🌲', '🏆', '💎', '🔑', '🧭', '⚙️', '📂'
];

export const IconPicker: React.FC<IconPickerProps> = ({ currentIcon, onSelect, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customEmoji, setCustomEmoji] = useState('');

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    setIsOpen(false);
  };

  const handleRemove = () => {
    onSelect(null);
    setIsOpen(false);
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="group relative flex items-center justify-center text-4xl hover:opacity-85 transition-opacity focus:outline-none"
        title="Change icon"
      >
        <span>{currentIcon || '📄'}</span>
        <span className="absolute -bottom-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-neutral-100 text-neutral-600 rounded p-0.5 border border-neutral-200">
          <Smile className="w-3.5 h-3.5" />
        </span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 top-full mt-2 z-50 w-72 bg-white rounded-lg shadow-xl border border-neutral-200 p-3 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-100">
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Choose an icon</span>
              {currentIcon && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="text-xs text-neutral-400 hover:text-red-600 transition-colors flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Remove
                </button>
              )}
            </div>

            {/* Quick emoji grid */}
            <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto py-1">
              {POPULAR_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleSelect(emoji)}
                  className={`w-8 h-8 flex items-center justify-center text-lg rounded hover:bg-neutral-100 transition-colors ${
                    currentIcon === emoji ? 'bg-neutral-100 ring-1 ring-neutral-300' : ''
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Custom Emoji Input */}
            <div className="mt-2 pt-2 border-t border-neutral-100 flex items-center gap-2">
              <input
                type="text"
                maxLength={2}
                placeholder="Custom emoji"
                value={customEmoji}
                onChange={(e) => setCustomEmoji(e.target.value)}
                className="flex-1 text-xs px-2 py-1 border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-neutral-400"
              />
              <button
                type="button"
                disabled={!customEmoji.trim()}
                onClick={() => {
                  if (customEmoji.trim()) {
                    handleSelect(customEmoji.trim());
                    setCustomEmoji('');
                  }
                }}
                className="px-2 py-1 text-xs bg-neutral-900 text-white rounded hover:bg-neutral-800 disabled:opacity-40 transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
