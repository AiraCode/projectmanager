import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X, Search } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
  badge?: string;
  badgeColor?: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  value: string | number;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  clearable?: boolean;
  align?: 'left' | 'right';
  variant?: 'default' | 'filter' | 'inline';
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  className = '',
  buttonClassName = '',
  dropdownClassName = '',
  disabled = false,
  required = false,
  searchable = false,
  clearable = false,
  align = 'left',
  variant = 'default',
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const strValue = String(value ?? '');
  const selectedOption = options.find(opt => String(opt.value) === strValue);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      if (searchable) {
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, searchable]);

  const handleSelect = (val: string | number) => {
    onChange(String(val));
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchQuery('');
  };

  const filteredOptions = searchQuery.trim()
    ? options.filter(opt =>
        opt.label.toLowerCase().includes(searchQuery.toLowerCase().trim())
      )
    : options;

  const isFilterActive = variant === 'filter' && strValue !== '';

  return (
    <div
      ref={containerRef}
      className={`relative ${variant === 'inline' ? 'inline-block' : 'w-full'} ${className}`}
    >
      {/* Hidden input for HTML form validation if required */}
      {required && (
        <input
          type="text"
          value={strValue}
          required={required}
          onChange={() => {}}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen(prev => !prev);
            setSearchQuery('');
          }
        }}
        className={
          buttonClassName ||
          (variant === 'inline'
            ? `h-full px-3 py-2 flex items-center gap-1.5 text-[12px] font-bold bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border-l border-neutral-200 transition-colors select-none focus:outline-none ${
                isOpen ? 'bg-neutral-200/90 text-violet-700' : ''
              }`
            : variant === 'filter'
            ? `w-full h-[38px] px-3 rounded-xl border text-[13px] font-medium flex items-center justify-between gap-2 transition-all duration-150 select-none cursor-pointer focus:outline-none ${
                isFilterActive
                  ? 'bg-violet-50/90 border-violet-300 text-violet-900 font-semibold shadow-xs ring-2 ring-violet-200/50'
                  : 'bg-white border-neutral-200 hover:border-neutral-300 text-neutral-700 shadow-2xs hover:bg-neutral-50/80 focus:ring-2 focus:ring-violet-400/30'
              }`
            : `w-full px-3 py-2 text-[13px] rounded-xl border flex items-center justify-between gap-2 transition-all bg-white cursor-pointer select-none focus:outline-none ${
                isOpen
                  ? 'border-violet-400 ring-2 ring-violet-400/25 shadow-xs'
                  : 'border-neutral-200 hover:border-neutral-300 shadow-2xs'
              } ${disabled ? 'opacity-50 cursor-not-allowed bg-neutral-50' : ''}`)
        }
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="truncate flex items-center gap-2">
          {selectedOption?.badgeColor && (
            <span
              className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${selectedOption.badgeColor}`}
            >
              {selectedOption.badge || selectedOption.label}
            </span>
          )}
          <span
            className={
              !selectedOption || selectedOption.value === ''
                ? variant === 'filter'
                  ? 'text-neutral-700 font-medium'
                  : 'text-neutral-400'
                : 'text-neutral-800'
            }
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>

        <span className="flex items-center gap-1 shrink-0 ml-1">
          {clearable && isFilterActive && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="p-0.5 -mr-0.5 rounded-full hover:bg-violet-200/70 text-violet-600 hover:text-violet-900 transition-colors"
              title="Clear selection"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown
            size={variant === 'inline' ? 12 : 14}
            className={`text-neutral-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-violet-600' : ''
            }`}
          />
        </span>
      </button>

      {/* Custom Dropdown Popover */}
      {isOpen && (
        <div
          className={`absolute top-full mt-1.5 bg-white rounded-2xl border border-violet-100 shadow-xl shadow-violet-950/10 z-50 py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${
            variant === 'inline'
              ? 'w-48 right-0'
              : 'w-full min-w-[180px] max-w-sm'
          } ${dropdownClassName}`}
          style={{
            boxShadow:
              '0 10px 25px -5px rgba(124, 58, 237, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
          }}
          role="listbox"
        >
          {/* Quick Search inside dropdown if searchable */}
          {searchable && (
            <div className="px-2.5 pb-2 pt-1 border-b border-neutral-100">
              <div className="relative">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Type to search..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full text-[11.5px] bg-neutral-50/90 border border-neutral-200 rounded-lg pl-7 pr-2.5 py-1 text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-1.5 focus:ring-violet-400 focus:bg-white transition-all"
                />
                <Search
                  size={11}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
                />
              </div>
            </div>
          )}

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto p-1 space-y-0.5 scrollbar-thin">
            {filteredOptions.map(opt => {
              const isSelected = String(opt.value) === strValue;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-[12.5px] transition-colors select-none ${
                    opt.disabled
                      ? 'opacity-40 cursor-not-allowed'
                      : isSelected
                      ? 'bg-violet-50 text-violet-900 font-semibold'
                      : 'text-neutral-700 hover:bg-neutral-50/80 font-medium'
                  }`}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="flex items-center gap-2 truncate">
                    {opt.badgeColor && (
                      <span
                        className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${opt.badgeColor}`}
                      >
                        {opt.badge || opt.label}
                      </span>
                    )}
                    <span className="truncate">{opt.label}</span>
                  </div>
                  {isSelected && (
                    <Check size={14} className="text-violet-600 shrink-0 ml-2" />
                  )}
                </button>
              );
            })}

            {filteredOptions.length === 0 && (
              <div className="py-4 text-center text-[12px] text-neutral-400">
                No options found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
