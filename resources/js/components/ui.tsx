import React, { useState, useEffect } from 'react';
import { Status } from '@/data/mockData';
import { X, Loader2 } from 'lucide-react';

export const STATUS_CONFIG: Record<Status, { label: string; bg: string; text: string; dot: string }> = {
  'Open':      { label: 'Open',      bg: 'bg-neutral-100',     text: 'text-neutral-600',   dot: 'bg-neutral-400' },
  'On Track':  { label: 'On Track',  bg: 'bg-success-light',   text: 'text-success',       dot: 'bg-success' },
  'At Risk':   { label: 'At Risk',   bg: 'bg-warning-light',   text: 'text-warning',       dot: 'bg-warning' },
  'Delayed':   { label: 'Delayed',   bg: 'bg-danger-light',    text: 'text-danger',        dot: 'bg-danger' },
  'Cancelled': { label: 'Cancelled', bg: 'bg-neutral-100',     text: 'text-neutral-400',   dot: 'bg-neutral-400' },
  'Completed': { label: 'Completed', bg: 'bg-brand-light',     text: 'text-brand',         dot: 'bg-brand' },
};

export function StatusBadge({ status, size = 'sm' }: { status: Status; size?: 'xs' | 'sm' | 'md' }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG['Open'];
  const sz = size === 'xs' ? 'px-2 py-0.5 text-[11px]' : size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${c.bg} ${c.text} ${sz}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

export function ProgressBar({
  value,
  size = 'md',
  color = 'brand',
  showLabel = true,
}: {
  value: number;
  size?: 'xs' | 'sm' | 'md';
  color?: 'brand' | 'success' | 'warning' | 'danger';
  showLabel?: boolean;
}) {
  const h = size === 'xs' ? 'h-1' : size === 'sm' ? 'h-1.5' : 'h-2';
  const fillColor = color === 'brand' ? 'bg-brand' : color === 'success' ? 'bg-success' : color === 'warning' ? 'bg-warning' : 'bg-danger';
  const boundedVal = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-2.5">
      <div className={`flex-1 bg-neutral-200 rounded-full ${h} overflow-hidden`}>
        <div
          className={`${h} ${fillColor} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${boundedVal}%` }}
        />
      </div>
      {showLabel && <span className="text-[12px] font-semibold text-neutral-700 w-9 text-right">{value}%</span>}
    </div>
  );
}

export function formatRupiah(n: number): string {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}M`;
  return `Rp ${n.toLocaleString('id-ID')}`;
}

export function formatRupiahFull(n: number): string {
  return `Rp ${n.toLocaleString('id-ID')}`;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-[20px] lg:text-[22px] font-bold text-neutral-900 tracking-tight leading-tight">{title}</h1>
        {subtitle && <p className="text-[13px] text-neutral-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap flex-shrink-0">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-lg border border-neutral-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  accent?: boolean;
}) {
  return (
    <Card className="p-4 lg:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] lg:text-[12px] font-semibold text-neutral-400 uppercase tracking-wide mb-1.5">{label}</div>
          <div className={`text-[22px] lg:text-[26px] font-bold tracking-tight leading-none ${accent ? 'text-brand' : 'text-neutral-900'}`}>{value}</div>
          {sub && <div className="text-[11px] lg:text-[12px] text-neutral-500 mt-1.5 truncate">{sub}</div>}
        </div>
        {Icon && (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${accent ? 'bg-brand-light' : 'bg-neutral-100'}`}>
            <Icon size={18} className={accent ? 'text-brand' : 'text-neutral-500'} />
          </div>
        )}
      </div>
    </Card>
  );
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  loading = false,
  disabled = false,
  icon: Icon,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  const base = 'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-150 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100';
  
  const sizeStyles = {
    sm: 'px-2.5 py-1.5 text-[12px] gap-1.5',
    md: 'px-3.5 py-2 text-[13px] gap-2',
    lg: 'px-4 py-2.5 text-[14px] gap-2.5',
  }[size];

  const variantStyles = {
    primary: 'bg-brand text-white hover:bg-brand-dark shadow-sm',
    secondary: 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200',
    danger: 'bg-danger text-white hover:bg-red-700 shadow-sm',
    outline: 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 shadow-sm',
    ghost: 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
  }[variant];

  return (
    <button
      className={`${base} ${sizeStyles} ${variantStyles} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 size={size === 'sm' ? 13 : 15} className="animate-spin" />
      ) : Icon ? (
        <Icon size={size === 'sm' ? 13 : 15} />
      ) : null}
      {children}
    </button>
  );
}

export function Modal({
  isOpen = true,
  onClose,
  title,
  subtitle,
  children,
  maxWidth,
  size = 'md',
}: {
  isOpen?: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const resolvedMaxWidth = maxWidth || (
    size === 'sm' ? 'max-w-md' :
    size === 'lg' ? 'max-w-3xl' :
    size === 'xl' ? 'max-w-5xl' : 'max-w-xl'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-neutral-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
      <div className={`relative bg-white rounded-xl shadow-2xl border border-neutral-200 w-full ${resolvedMaxWidth} z-10 modal-enter overflow-hidden flex flex-col max-h-[90vh]`}>
        <div className="flex items-start justify-between p-5 border-b border-neutral-100 flex-shrink-0">
          <div>
            <h2 className="text-[16px] font-bold text-neutral-900 tracking-tight">{title}</h2>
            {subtitle && <p className="text-[12px] text-neutral-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto scrollbar-thin">
          {children}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-400 mb-3.5">
        <Icon size={24} />
      </div>
      <h3 className="text-[14px] font-semibold text-neutral-800 mb-1">{title}</h3>
      {description && <p className="text-[12.5px] text-neutral-500 max-w-sm mb-4">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}

export function Toast({
  message,
  type = 'success',
  onClose,
}: {
  message: string;
  type?: 'success' | 'danger' | 'info';
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bg = type === 'success' ? 'bg-success text-white' : type === 'danger' ? 'bg-danger text-white' : 'bg-brand text-white';

  return (
    <div className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg shadow-lg text-[13px] font-medium flex items-center gap-2.5 toast-enter ${bg}`}>
      <span>{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}
