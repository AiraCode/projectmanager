import { useState, useId } from 'react';
import { usePage, Link, router } from '@inertiajs/react';
import { Calendar, FolderOpen, Plus, ShieldAlert, Sparkles } from 'lucide-react';
import { PageHeader, Button, Modal, formatDateDisplay } from '@/components/ui';

interface Project {
  id: number;
  name: string;
  company: string;
  manager: string;
  status: string;
  progress: number;
  planned_progress?: number;
  start_date: string | null;
  end_date: string | null;
}

interface CompanyItem {
  id: number;
  name: string;
}

export default function ProjectListPage() {
  const { projects = [], canCreate = false, companies = [], auth } = usePage().props as any;
  const role = auth?.user?.role ?? '';
  const isAdminProgres = role === 'admin_progres';
  const isAdminUtama   = role === 'admin_utama';
  const isPIC          = role === 'pic';

  // Modal create project state (PIC only)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [companyId, setCompanyId] = useState<string>('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Project name is required.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    router.post('/projectlistpage', {
      title: title.trim(),
      company_id: companyId || null,
      company_name: newCompanyName.trim() || null,
      start: startDate,
      end: endDate,
    }, {
      onError: (errors) => {
        setErrorMsg(Object.values(errors)[0] as string || 'Failed to create project.');
        setSubmitting(false);
      },
      onFinish: () => {
        setSubmitting(false);
      },
    });
  };

function getProjectTitleClasses(title: string) {
  const len = (title || '').trim().length;
  if (len <= 20) {
    return 'text-[20px] sm:text-[22px] font-black leading-tight tracking-tight';
  } else if (len <= 40) {
    return 'text-[17px] sm:text-[18.5px] font-extrabold leading-snug tracking-tight';
  } else {
    return 'text-[14.5px] sm:text-[15.5px] font-bold leading-snug line-clamp-2';
  }
}

  return (
    <div className="p-4 sm:p-6 lg:p-7 max-w-7xl mx-auto space-y-4 sm:space-y-5">
      <PageHeader
        title="Project List"
        subtitle="Select a project to view its details and progress."
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-brand-light text-brand border border-brand-border shadow-2xs">
              <FolderOpen size={14} />
              {projects?.length ?? 0} Projects
            </span>
          </div>
        }
      />

      {/* Role info alert (Admin Progres only) */}
      {isAdminProgres && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3 text-[12.5px] text-amber-800">
          <ShieldAlert size={16} className="text-amber-600 flex-shrink-0" />
          <span>
            <strong>Progress Admin Role:</strong> Dedicated monitoring for <strong>S-Curve</strong> charts. Clicking a project below will directly open its S-Curve.
          </span>
        </div>
      )}

      {(!projects || projects.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-neutral-200/80 p-8 shadow-xs">
          <div className="w-14 h-14 rounded-xl bg-brand/10 flex items-center justify-center mb-3 text-brand">
            <FolderOpen size={26} />
          </div>
          <h3 className="text-[15px] font-bold text-neutral-800 mb-1">
            {canCreate && isPIC ? "You Don't Have Any Projects Yet" : "No Projects Found"}
          </h3>
          <p className="text-[13px] text-neutral-500 max-w-md mb-4">
            {canCreate && isPIC
              ? "As a newly registered PIC, you can create the first project for your company. A standard 3-tier WBS template will be automatically initialized!"
              : "There are currently no projects registered in the system."}
          </p>
          {canCreate && isPIC && (
            <Button
              variant="primary"
              size="md"
              icon={Plus}
              onClick={() => setShowCreateModal(true)}
            >
              Create New Project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {projects.map((project: Project) => {
            return (
              <Link
                key={project.id}
                href={isAdminProgres ? `/scurve?project_id=${project.id}` : `/projects/${project.id}`}
                className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-2xl"
              >
                <div className="p-4 sm:p-5 h-full flex flex-col justify-between bg-white rounded-2xl border-[2.5px] border-[#0F172A] hover:border-[#1E3A8A] shadow-sm hover:shadow-md transition-all duration-200 group-hover:-translate-y-0.5">
                  {/* Card Header: Project Name & Dates only */}
                  <div>
                    {/* Project Name (Enlarged, Dynamic Sizing, Contained) */}
                    <div className="min-h-[50px] sm:min-h-[56px] flex items-center mb-1">
                      <h3
                        className={`${getProjectTitleClasses(project.name)} text-neutral-900 group-hover:text-brand transition-colors break-words`}
                        title={project.name}
                      >
                        {project.name}
                      </h3>
                    </div>

                    {/* Start Date & End Date */}
                    <div className="flex items-center gap-1.5 text-[12px] text-neutral-500 font-medium mb-3">
                      <Calendar size={13.5} className="text-brand flex-shrink-0" />
                      <span>
                        {project.start_date ? formatDateDisplay(project.start_date) : 'N/A'} – {project.end_date ? formatDateDisplay(project.end_date) : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Dual-Indicator Speedometer Gauge */}
                  <div className="pt-1">
                    <SpeedometerGauge
                      plan={project.planned_progress ?? 0}
                      actual={project.progress ?? 0}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Modal Create Project (PIC Only) */}
      {showCreateModal && canCreate && isPIC && (
        <Modal
          title="Create New Project (PIC)"
          onClose={() => setShowCreateModal(false)}
          size="md"
        >
          <form onSubmit={handleCreateProject} className="space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-danger-light text-danger text-[12px] font-semibold">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                Project Name / Title <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. EXPANSION PLANT PHASE 2"
                className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                required
              />
            </div>

            {/* Company selection */}
            <div>
              <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                Company <span className="text-danger">*</span>
              </label>
              {companies.length > 0 ? (
                <div className="space-y-2">
                  <select
                    value={companyId}
                    onChange={e => {
                      setCompanyId(e.target.value);
                      if (e.target.value) setNewCompanyName('');
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
                  >
                    <option value="">-- Select Registered Company --</option>
                    {companies.map((c: CompanyItem) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>

                  <div className="text-[11px] text-neutral-400 text-center font-medium">or register a new company:</div>
                  <input
                    type="text"
                    value={newCompanyName}
                    onChange={e => {
                      setNewCompanyName(e.target.value);
                      if (e.target.value) setCompanyId('');
                    }}
                    placeholder="New company name if not listed"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                  />
                </div>
              ) : (
                <input
                  type="text"
                  value={newCompanyName}
                  onChange={e => setNewCompanyName(e.target.value)}
                  placeholder="Enter your company name"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                  required
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  Start Date <span className="text-danger">*</span>
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                  required
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  Target Finish Date <span className="text-danger">*</span>
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                  required
                />
              </div>
            </div>

            <div className="p-3 bg-brand/5 border border-brand/20 rounded-lg flex items-start gap-2 text-[11.5px] text-neutral-600">
              <Sparkles size={14} className="text-brand flex-shrink-0 mt-0.5" />
              <span>
                Upon creation, the system will automatically initialize the 17-job industrial WBS template along with all sub-tasks and division assignments.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateModal(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={submitting}
              >
                Save & Open Project
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function getActualTheme(actualVal: number, planVal: number) {
  const isAhead = actualVal > planVal;
  const isComplete = actualVal >= 100;

  // Rule 6: If Actual > Plan, the Actual line turns GREEN!
  if (isAhead) {
    return {
      color: '#16A34A', // Green when ahead of plan
      isAhead: true,
      isComplete,
    };
  }

  // Normal visual threshold rules (Actual <= Plan):
  // 90–100% → Green
  // 70–90%  → Yellow
  // 0–70%   → Red
  if (actualVal >= 90) {
    return {
      color: '#16A34A',
      isAhead: false,
      isComplete,
    };
  }

  if (actualVal >= 70) {
    return {
      color: '#EAB308',
      isAhead: false,
      isComplete: false,
    };
  }

  return {
    color: '#DC2626',
    isAhead: false,
    isComplete: false,
  };
}

function SpeedometerGauge({ plan = 0, actual = 0 }: { plan?: number; actual?: number }) {
  const uniqueId = useId().replace(/:/g, '');
  const redGradId = `gauge-red-${uniqueId}`;
  const shineGradId = `gauge-shine-${uniqueId}`;

  const planVal = Math.max(0, Math.min(100, Math.round(plan)));
  const actualVal = Math.max(0, Math.min(100, Math.round(actual)));
  const actualTheme = getActualTheme(actualVal, planVal);

  const cx = 130;
  const cy = 118;
  const r = 88;
  const strokeWidth = 14;

  // Calculate coordinates on the arc for any percentage (0 to 100)
  const getPoint = (percent: number, radius: number = r) => {
    const clamped = Math.max(0, Math.min(100, percent));
    const rad = (180 + (clamped / 100) * 180) * (Math.PI / 180);
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  };

  // Helper for arc path between two percentages
  const describeArc = (startPct: number, endPct: number, radius: number = r) => {
    const p1 = getPoint(startPct, radius);
    const p2 = getPoint(endPct, radius);
    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  };

  const planTip = getPoint(planVal, 64);
  const actualTip = getPoint(actualVal, 72);

  // Key coordinates for gradient and points
  const p0 = getPoint(0);
  const p70 = getPoint(70);
  const p100 = getPoint(100);

  // Label coordinates (outside track)
  const labelRadius = r + 18;
  const p30Label = getPoint(30, labelRadius);
  const p50Label = getPoint(50, r + 16);
  const p70Label = getPoint(70, labelRadius);
  const p90Label = getPoint(90, r + 17);

  return (
    <div className="flex flex-col items-center justify-center w-full pt-1">
      <div className="relative w-full max-w-[285px] aspect-[260/142]">
        <svg viewBox="0 0 260 142" className="w-full h-full overflow-visible">
          <defs>
            {/* Linear Gradient for Zone 0% - 70%: Solid Red */}
            <linearGradient
              id={redGradId}
              x1={p0.x}
              y1={p0.y}
              x2={p70.x}
              y2={p70.y}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#DC2626" />
              <stop offset="60%" stopColor="#EA4325" />
              <stop offset="100%" stopColor="#F97316" />
            </linearGradient>

            {/* Radial Gradient for 100% Completion Shining Aura */}
            <radialGradient id={shineGradId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#34D399" stopOpacity="0.85" />
              <stop offset="45%" stopColor="#16A34A" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#16A34A" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Base Gauge Track */}
          <path
            d={describeArc(0, 100)}
            fill="none"
            stroke="#F1F5F9"
            strokeWidth={strokeWidth + 2}
            strokeLinecap="round"
          />

          {/* Dedicated rounded caps at outer ends only (0% and 100%) so internal segments have clean straight cuts */}
          <circle cx={p0.x} cy={p0.y} r={strokeWidth / 2} fill="#DC2626" />
          <circle cx={p100.x} cy={p100.y} r={strokeWidth / 2} fill="#16A34A" />

          {/* Zone 1: Red (0% - 70%) */}
          <path
            d={describeArc(0, 70)}
            fill="none"
            stroke={`url(#${redGradId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />

          {/* Zone 2: Yellow (70% - 90%) */}
          <path
            d={describeArc(70, 90)}
            fill="none"
            stroke="#EAB308"
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />

          {/* Zone 3: Green (90% - 100%) */}
          <path
            d={describeArc(90, 100)}
            fill="none"
            stroke="#16A34A"
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />

          {/* Boundary Divider Ticks at 30%, 50%, 70%, 90% */}
          {[30, 50, 70, 90].map((pct) => {
            const pInner = getPoint(pct, r - strokeWidth / 2 - 0.5);
            const pOuter = getPoint(pct, r + strokeWidth / 2 + 0.5);
            return (
              <line
                key={pct}
                x1={pInner.x}
                y1={pInner.y}
                x2={pOuter.x}
                y2={pOuter.y}
                stroke="#FFFFFF"
                strokeWidth={2.2}
                strokeLinecap="butt"
              />
            );
          })}

          {/* Threshold Markings (Enlarged and Clear, Color-Matched to Range) */}
          <text
            x={p0.x - 2}
            y={cy + 17}
            textAnchor="middle"
            fontSize="11.5"
            fontWeight="700"
            className="fill-red-600 font-bold"
          >
            0%
          </text>
          <text
            x={p30Label.x}
            y={p30Label.y}
            textAnchor="middle"
            fontSize="11.5"
            fontWeight="700"
            className="fill-red-500 font-bold"
          >
            30%
          </text>
          <text
            x={p50Label.x}
            y={p50Label.y}
            textAnchor="middle"
            fontSize="11.5"
            fontWeight="700"
            className="fill-orange-600 font-bold"
          >
            50%
          </text>
          <text
            x={p70Label.x}
            y={p70Label.y}
            textAnchor="middle"
            fontSize="11.5"
            fontWeight="700"
            className="fill-amber-600 font-bold"
          >
            70%
          </text>
          <text
            x={p90Label.x + 2}
            y={p90Label.y}
            textAnchor="middle"
            fontSize="11.5"
            fontWeight="700"
            className="fill-emerald-600 font-bold"
          >
            90%
          </text>
          <text
            x={p100.x + 2}
            y={cy + 17}
            textAnchor="middle"
            fontSize="11.5"
            fontWeight="700"
            className={`transition-all duration-300 ${
              actualTheme.isComplete
                ? 'fill-emerald-600 font-black filter drop-shadow-[0_0_5px_rgba(22,163,74,0.65)]'
                : 'fill-emerald-600 font-bold'
            }`}
          >
            100%
          </text>

          {/* Plan Pointer (Navy Dashed with Circle) */}
          <line
            x1={cx}
            y1={cy}
            x2={planTip.x}
            y2={planTip.y}
            stroke="#1E3A8A"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="4 2"
          />
          <circle cx={planTip.x} cy={planTip.y} r="3" fill="#1E3A8A" />

          {/* Actual Pointer (Dynamic Color with Tip Circle) */}
          <line
            x1={cx}
            y1={cy}
            x2={actualTip.x}
            y2={actualTip.y}
            stroke={actualTheme.color}
            strokeWidth="3.2"
            strokeLinecap="round"
            className="transition-colors duration-300"
          />
          <circle
            cx={actualTip.x}
            cy={actualTip.y}
            r="4"
            fill={actualTheme.color}
            className="transition-colors duration-300"
          />

          {/* Pivot Center */}
          <circle cx={cx} cy={cy} r="6.5" fill="#0F172A" />
          <circle cx={cx} cy={cy} r="2.5" fill="#FFFFFF" />

          {/* 100% Completion Shining Light Effect (Subtle and Eye-catching) */}
          {actualTheme.isComplete && (
            <g className="transition-opacity duration-500 pointer-events-none">
              {/* Soft pulsing halo */}
              <circle
                cx={p100.x}
                cy={p100.y}
                r="16"
                fill={`url(#${shineGradId})`}
                className="animate-pulse"
              />

              {/* Delicate 4-point star gleam flare */}
              <path
                d={`M ${p100.x} ${p100.y - 7}
                    Q ${p100.x} ${p100.y} ${p100.x + 7} ${p100.y}
                    Q ${p100.x} ${p100.y} ${p100.x} ${p100.y + 7}
                    Q ${p100.x} ${p100.y} ${p100.x - 7} ${p100.y}
                    Z`}
                fill="#FFFFFF"
                opacity="0.95"
              />

              {/* Diagonal micro-flares */}
              <path
                d={`M ${p100.x - 3.5} ${p100.y - 3.5} L ${p100.x + 3.5} ${p100.y + 3.5} M ${p100.x - 3.5} ${p100.y + 3.5} L ${p100.x + 3.5} ${p100.y - 3.5}`}
                stroke="#ECFDF5"
                strokeWidth="1"
                strokeLinecap="round"
                opacity="0.85"
              />

              {/* Bright center spark */}
              <circle cx={p100.x} cy={p100.y} r="2" fill="#FFFFFF" />
            </g>
          )}
        </svg>
      </div>

      {/* Plan vs Actual Data Legend */}
      <div className="flex items-center justify-between w-full px-2 mt-2 pt-2 border-t border-neutral-100 text-[12.5px]">
        <div className="flex items-center gap-1.5 font-bold text-neutral-800">
          <span className="w-2.5 h-2.5 rounded-full bg-[#1E3A8A] inline-block shadow-2xs flex-shrink-0" />
          <span>
            Plan: <span className="font-black text-[#1E3A8A]">{planVal}%</span>
          </span>
        </div>
        <div className="h-3.5 w-px bg-neutral-200" />
        <div className="flex items-center gap-1.5 font-bold text-neutral-800">
          <span
            className="w-2.5 h-2.5 rounded-full inline-block shadow-2xs transition-colors duration-300 flex-shrink-0"
            style={{
              backgroundColor: actualTheme.color,
              boxShadow: actualTheme.isComplete ? '0 0 8px rgba(22, 163, 74, 0.7)' : undefined,
            }}
          />
          <span className="flex items-center gap-1">
            Actual:{' '}
            <span
              className="font-black transition-colors duration-300 inline-flex items-center gap-1"
              style={{
                color: actualTheme.color,
                textShadow: actualTheme.isComplete ? '0 0 8px rgba(22, 163, 74, 0.35)' : undefined,
              }}
            >
              {actualVal}%
              {actualTheme.isComplete && (
                <Sparkles size={13} className="text-emerald-500 animate-pulse flex-shrink-0" />
              )}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

