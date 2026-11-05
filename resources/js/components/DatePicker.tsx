import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

export interface DatePickerProps {
  value?: string | null; // Format: 'YYYY-MM-DD'
  onChange: (value: string) => void;
  placeholder?: string;
  min?: string | null; // Format: 'YYYY-MM-DD'
  max?: string | null; // Format: 'YYYY-MM-DD'
  disabled?: boolean;
  required?: boolean;
  className?: string;
  inputClassName?: string;
  accentColor?: 'brand' | 'violet';
  size?: 'sm' | 'md';
  id?: string;
  name?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/**
 * Format YYYY-MM-DD string to DD/MM/YYYY for friendly presentation.
 */
function formatDisplayDate(ymd?: string | null): string {
  if (!ymd) return '';
  const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return ymd;
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
}

type ViewMode = 'days' | 'months' | 'years';

export default function DatePicker({
  value,
  onChange,
  placeholder = 'Select date...',
  min,
  max,
  disabled = false,
  required = false,
  className = '',
  inputClassName = '',
  accentColor = 'brand',
  size = 'md',
  id,
  name,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('days');
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  // Today's date reference
  const today = useMemo(() => {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth(), // 0-indexed
      day: now.getDate(),
      str: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    };
  }, []);

  // Parse current value
  const parsedValue = useMemo(() => {
    if (!value) return null;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return {
      year: parseInt(match[1], 10),
      month: parseInt(match[2], 10) - 1, // 0-indexed
      day: parseInt(match[3], 10),
      str: value,
    };
  }, [value]);

  // Calendar view navigation state
  const [viewYear, setViewYear] = useState<number>(() => parsedValue?.year ?? today.year);
  const [viewMonth, setViewMonth] = useState<number>(() => parsedValue?.month ?? today.month);

  // Reset view to 'days' and sync dates when opened or when value changes
  useEffect(() => {
    if (parsedValue) {
      setViewYear(parsedValue.year);
      setViewMonth(parsedValue.month);
    } else {
      setViewYear(today.year);
      setViewMonth(today.month);
    }
    if (isOpen) {
      setViewMode('days');
    }
  }, [value, isOpen]);

  // Calculate popup position via getBoundingClientRect (fixed to viewport, portaled to document.body)
  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
      setIsOpen(false);
      return;
    }

    const popupWidth = 304;
    const popupHeight = 360;
    const gap = 6;

    let top = rect.bottom + gap;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Open upward only if insufficient space below AND sufficient space above
    if (spaceBelow < popupHeight && spaceAbove >= popupHeight) {
      top = rect.top - popupHeight - gap;
    }

    // Horizontal alignment
    let left = rect.left;
    if (left + popupWidth > window.innerWidth - 12) {
      left = Math.max(12, rect.right - popupWidth);
    }
    if (left < 12) {
      left = 12;
    }

    setCoords({ top, left });
  }, []);

  // Handle position tracking on scroll and resize
  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleScroll = () => {
      updatePosition();
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isOpen, updatePosition]);

  // Close on outside click or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        popupRef.current && !popupRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // 20-Year block calculation for Year view (e.g. 2020 – 2039, 2040 – 2059, etc.)
  const yearBlock = useMemo(() => {
    const startYear = Math.floor(viewYear / 20) * 20;
    const endYear = startYear + 19;
    const years: number[] = [];
    for (let y = startYear; y <= endYear; y++) {
      years.push(y);
    }
    return { startYear, endYear, years };
  }, [viewYear]);

  // Calendar month days calculation
  const calendarDays = useMemo(() => {
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sunday
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: Array<{
      day: number;
      month: number;
      year: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isDisabled: boolean;
      isToday: boolean;
      isSelected: boolean;
    }> = [];

    // Previous month padding
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isDisabled = (!!min && dateStr < min) || (!!max && dateStr > max);

      days.push({
        day,
        month: prevMonth,
        year: prevYear,
        dateStr,
        isCurrentMonth: false,
        isDisabled,
        isToday: dateStr === today.str,
        isSelected: !!parsedValue && dateStr === parsedValue.str,
      });
    }

    // Current month days
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isDisabled = (!!min && dateStr < min) || (!!max && dateStr > max);

      days.push({
        day,
        month: viewMonth,
        year: viewYear,
        dateStr,
        isCurrentMonth: true,
        isDisabled,
        isToday: dateStr === today.str,
        isSelected: !!parsedValue && dateStr === parsedValue.str,
      });
    }

    // Next month padding to fill grid
    const remaining = (7 - (days.length % 7)) % 7;
    const totalNeeded = days.length + remaining < 35 ? 35 - days.length : remaining;
    for (let day = 1; day <= totalNeeded; day++) {
      const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isDisabled = (!!min && dateStr < min) || (!!max && dateStr > max);

      days.push({
        day,
        month: nextMonth,
        year: nextYear,
        dateStr,
        isCurrentMonth: false,
        isDisabled,
        isToday: dateStr === today.str,
        isSelected: !!parsedValue && dateStr === parsedValue.str,
      });
    }

    return days;
  }, [viewYear, viewMonth, min, max, today.str, parsedValue]);

  // Navigation handlers
  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMode === 'days') {
      if (viewMonth === 0) {
        setViewMonth(11);
        setViewYear(prev => prev - 1);
      } else {
        setViewMonth(prev => prev - 1);
      }
    } else if (viewMode === 'months') {
      setViewYear(prev => prev - 1);
    } else if (viewMode === 'years') {
      setViewYear(prev => prev - 20);
    }
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMode === 'days') {
      if (viewMonth === 11) {
        setViewMonth(0);
        setViewYear(prev => prev + 1);
      } else {
        setViewMonth(prev => prev + 1);
      }
    } else if (viewMode === 'months') {
      setViewYear(prev => prev + 1);
    } else if (viewMode === 'years') {
      setViewYear(prev => prev + 20);
    }
  };

  const handleSelectDate = (dateStr: string, disabledDay: boolean) => {
    if (disabledDay) return;
    onChange(dateStr);
    setIsOpen(false);
  };

  const handleSelectToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    if ((min && today.str < min) || (max && today.str > max)) return;
    onChange(today.str);
    setIsOpen(false);
  };

  const isViolet = accentColor === 'violet';
  const themeClasses = {
    ring: isViolet ? 'ring-2 ring-violet-500/20 border-violet-500' : 'ring-2 ring-brand/20 border-brand',
    icon: isViolet ? 'text-violet-600' : 'text-brand',
    selectedDay: isViolet
      ? 'border-2 border-violet-600 bg-violet-50 text-violet-900 font-bold'
      : 'border-2 border-brand bg-brand-light text-brand font-bold',
    selectedYearMonth: isViolet
      ? 'border-2 border-violet-600 bg-violet-50 text-violet-900 font-bold'
      : 'border-2 border-brand bg-brand-light text-brand font-bold',
    link: isViolet ? 'text-violet-700 hover:text-violet-900' : 'text-brand hover:text-brand-dark',
    todayBtn: isViolet
      ? 'border border-violet-200 bg-violet-50/80 text-violet-700 hover:bg-violet-100 active:bg-violet-200'
      : 'border border-brand/25 bg-brand-light/80 text-brand hover:bg-brand-light active:bg-brand/15',
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Hidden input for HTML validation / form integrity */}
      {required && (
        <input
          type="text"
          id={id}
          name={name}
          value={value ?? ''}
          required={required}
          onChange={() => {}}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      )}

      {/* Main Trigger Button */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (!disabled) {
            setIsOpen(prev => !prev);
          }
        }}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setIsOpen(prev => !prev);
          }
        }}
        className={`w-full flex items-center justify-between gap-2 px-3.5 bg-white border border-neutral-200 rounded-xl text-left transition-all select-none cursor-pointer ${
          size === 'sm' ? 'py-1.5 text-[12px]' : 'py-2.5 text-[13px]'
        } ${
          isOpen ? themeClasses.ring + ' shadow-xs' : 'hover:border-neutral-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-neutral-50' : ''} ${inputClassName}`}
      >
        <span className={`truncate font-medium ${value ? 'text-neutral-900' : 'text-neutral-400'}`}>
          {value ? formatDisplayDate(value) : placeholder}
        </span>

        <Calendar
          size={size === 'sm' ? 14 : 16}
          className={`${value ? themeClasses.icon : 'text-neutral-400'} flex-shrink-0 transition-colors`}
        />
      </div>

      {/* Custom Calendar Popover: Portaled to document.body (Never clips, zero scrollbar issues) */}
      {isOpen && coords && createPortal(
        <div
          ref={popupRef}
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: '304px',
            zIndex: 9999,
          }}
          className="bg-white rounded-3xl border border-neutral-200 shadow-2xl p-4 select-none text-neutral-800 animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={handlePrev}
              className="p-1.5 rounded-full text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
              title="Previous"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="text-center">
              {viewMode === 'days' && (
                <>
                  <div className="text-[15px] font-bold text-neutral-900 tracking-tight">
                    {MONTH_NAMES[viewMonth]} {viewYear}
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewMode('years')}
                    className={`text-[11.5px] font-semibold underline ${themeClasses.link} cursor-pointer transition-colors block mx-auto mt-0.5`}
                  >
                    Choose month and year
                  </button>
                </>
              )}

              {viewMode === 'months' && (
                <>
                  <div className="text-[15px] font-bold text-neutral-900 tracking-tight">
                    {viewYear}
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewMode('days')}
                    className={`text-[11.5px] font-semibold underline ${themeClasses.link} cursor-pointer transition-colors block mx-auto mt-0.5`}
                  >
                    Choose date
                  </button>
                </>
              )}

              {viewMode === 'years' && (
                <>
                  <div className="text-[15px] font-bold text-neutral-900 tracking-tight">
                    {yearBlock.startYear} – {yearBlock.endYear}
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewMode('days')}
                    className={`text-[11.5px] font-semibold underline ${themeClasses.link} cursor-pointer transition-colors block mx-auto mt-0.5`}
                  >
                    Choose date
                  </button>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleNext}
              className="p-1.5 rounded-full text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
              title="Next"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* VIEW: DAYS */}
          {viewMode === 'days' && (
            <>
              {/* Days of Week Header */}
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-neutral-500 py-1.5 border-b border-dashed border-neutral-200 uppercase tracking-wider">
                {DAY_NAMES.map(d => (
                  <div key={d}>{d}</div>
                ))}
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-y-1.5 gap-x-1 pt-2">
                {calendarDays.map((d, index) => {
                  let dayStyle = 'text-neutral-800 hover:bg-neutral-100 font-medium rounded-xl';

                  if (d.isSelected) {
                    dayStyle = themeClasses.selectedDay;
                  } else if (d.isToday) {
                    dayStyle = 'border border-dashed border-neutral-300 font-bold text-neutral-900 rounded-xl hover:bg-neutral-100';
                  } else if (!d.isCurrentMonth) {
                    dayStyle = 'text-neutral-300 hover:text-neutral-600 hover:bg-neutral-50 font-normal rounded-xl';
                  }

                  if (d.isDisabled) {
                    dayStyle = 'text-neutral-300 opacity-20 cursor-not-allowed pointer-events-none rounded-xl';
                  }

                  return (
                    <button
                      key={`${d.dateStr}-${index}`}
                      type="button"
                      disabled={d.isDisabled}
                      onClick={() => handleSelectDate(d.dateStr, d.isDisabled)}
                      className={`h-8 w-8 mx-auto text-[12.5px] flex items-center justify-center transition-all ${dayStyle}`}
                    >
                      {d.day}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* VIEW: 20-YEAR GRID (Reference media_1793899379740_b694fee6.png) */}
          {viewMode === 'years' && (
            <div className="grid grid-cols-4 gap-2 pt-2 pb-1">
              {yearBlock.years.map(y => {
                const isSelected = parsedValue ? parsedValue.year === y : today.year === y;
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => {
                      setViewYear(y);
                      setViewMode('months');
                    }}
                    className={`py-2 px-1 text-[13px] rounded-xl text-center transition-all ${
                      isSelected
                        ? themeClasses.selectedYearMonth
                        : 'text-neutral-800 hover:bg-neutral-100 font-medium'
                    }`}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          )}

          {/* VIEW: 12-MONTH GRID */}
          {viewMode === 'months' && (
            <div className="grid grid-cols-3 gap-2.5 pt-2 pb-1">
              {MONTH_NAMES_SHORT.map((mShort, idx) => {
                const isSelected = parsedValue ? (parsedValue.year === viewYear && parsedValue.month === idx) : (today.year === viewYear && today.month === idx);
                return (
                  <button
                    key={mShort}
                    type="button"
                    onClick={() => {
                      setViewMonth(idx);
                      setViewMode('days');
                    }}
                    className={`py-2 px-2 text-[13px] rounded-xl text-center transition-all ${
                      isSelected
                        ? themeClasses.selectedYearMonth
                        : 'text-neutral-800 hover:bg-neutral-100 font-medium'
                    }`}
                  >
                    {MONTH_NAMES[idx]}
                  </button>
                );
              })}
            </div>
          )}

          {/* Footer: Full-width Today Button */}
          <div className="pt-3 mt-3 border-t border-neutral-100">
            <button
              type="button"
              onClick={handleSelectToday}
              className={`w-full py-2.5 rounded-xl font-bold text-[13px] text-center transition-colors cursor-pointer ${themeClasses.todayBtn}`}
            >
              Today
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
