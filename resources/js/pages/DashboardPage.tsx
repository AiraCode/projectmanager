import { Calendar, Clock, TrendingUp, DollarSign, CheckCircle2, AlertTriangle, XCircle, Layers, ArrowUpRight } from 'lucide-react';
import { NavLink } from 'react-router';
import { PROJECT } from '@/data/mockData';
import { StatusBadge, ProgressBar, formatRupiah, PageHeader, Card, KpiCard } from '@/components/ui';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const miniChart = PROJECT.weeklyData.slice(20, 42).map(w => ({
  week: `W${w.week}`,
  Planned: w.plannedCumulative,
  Actual: w.actualCumulative > 0 ? w.actualCumulative : undefined,
}));

export default function DashboardPage() {
  const p = PROJECT;
  const budgetUsedPct = Math.round((p.usedBudget / p.totalBudget) * 100);
  const remaining = p.totalBudget - p.usedBudget;
  const budgetHealth = budgetUsedPct <= 80 ? 'good' : budgetUsedPct <= 95 ? 'warning' : 'critical';

  const statusCounts = p.mainJobs.reduce((acc, mj) => {
    acc[mj.status] = (acc[mj.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-screen-2xl space-y-6">
      <PageHeader
        title="Project Dashboard"
        subtitle={`${p.company} — ${p.name}`}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-neutral-400 font-medium hidden sm:inline">Project Status:</span>
            <StatusBadge status={p.status} size="md" />
          </div>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          label="Overall Progress"
          value={`${p.overallProgress}%`}
          sub="Weighted completion"
          icon={TrendingUp}
          accent
        />
        <KpiCard
          label="Timeline Progress"
          value={`Hari ke-${p.hariKe}`}
          sub={`${p.sisaHari} days remaining`}
          icon={Clock}
        />
        <KpiCard
          label="Realisasi Budget"
          value={formatRupiah(p.usedBudget)}
          sub={`${budgetUsedPct}% of ${formatRupiah(p.totalBudget)}`}
          icon={DollarSign}
        />
        <KpiCard
          label="Sisa Budget"
          value={formatRupiah(remaining)}
          sub={budgetHealth === 'good' ? 'Budget on track' : budgetHealth === 'warning' ? 'Approaching ceiling' : 'Budget critical'}
          icon={DollarSign}
        />
      </div>

      {/* Main Grid: Project Info & S-Curve Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Project Information */}
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-brand" />
                <span className="text-[13px] font-bold text-neutral-800 tracking-tight">Project Information</span>
              </div>
              <NavLink to="/project" className="text-[11px] font-semibold text-brand hover:text-brand-dark flex items-center gap-0.5">
                Details <ArrowUpRight size={12} />
              </NavLink>
            </div>

            <div className="space-y-3">
              {[
                { label: 'Project Name', value: p.name },
                { label: 'Company', value: p.company },
                { label: 'Project Manager', value: p.projectManager },
                { label: 'Start Date', value: p.startDate },
                { label: 'Target Finish', value: p.endDate },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-start gap-3">
                  <span className="text-[12px] text-neutral-400 font-medium flex-shrink-0">{label}</span>
                  <span className="text-[12.5px] text-neutral-800 font-semibold text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-neutral-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-neutral-600">Total Project Weight</span>
              <span className="text-[12px] font-bold text-brand">{p.overallProgress}%</span>
            </div>
            <ProgressBar value={p.overallProgress} size="md" />
            <div className="flex justify-between text-[11px] text-neutral-400 mt-2">
              <span>Day {p.hariKe} elapsed</span>
              <span>{p.sisaHari} days left</span>
            </div>
          </div>
        </Card>

        {/* S-Curve preview */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-brand" />
              <span className="text-[13px] font-bold text-neutral-800 tracking-tight">S-Curve Overview</span>
              <span className="text-[11px] text-neutral-400 font-medium">(Weeks 21–42)</span>
            </div>
            <NavLink to="/scurve" className="text-[11px] font-semibold text-brand hover:text-brand-dark flex items-center gap-0.5">
              Full S-Curve <ArrowUpRight size={12} />
            </NavLink>
          </div>

          <div className="w-full h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={miniChart} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="plannedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1E46D9" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#1E46D9" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16A34A" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F3F6" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94A3B8' }} interval={2} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                  formatter={(v) => [`${Number(v).toFixed(1)}%`, '']}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                <Area type="monotone" dataKey="Planned" stroke="#1E46D9" strokeWidth={2.5} fill="url(#plannedGrad)" dot={false} />
                <Area type="monotone" dataKey="Actual" stroke="#16A34A" strokeWidth={2.5} fill="url(#actualGrad)" dot={false} connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Bottom Grid: Main Job Progress List & Status / Budget Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main Job Progress List */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-brand" />
              <span className="text-[13px] font-bold text-neutral-800 tracking-tight">Main Job Progress ({p.mainJobs.length})</span>
            </div>
            <NavLink to="/tasks" className="text-[11px] font-semibold text-brand hover:text-brand-dark flex items-center gap-0.5">
              Manage Tasks <ArrowUpRight size={12} />
            </NavLink>
          </div>

          <div className="space-y-3 max-h-84 overflow-y-auto scrollbar-thin pr-1">
            {p.mainJobs.map(mj => (
              <div key={mj.id} className="p-2.5 rounded-lg border border-neutral-100 hover:border-neutral-200 hover:bg-neutral-50/40 transition-colors">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded bg-brand/10 text-brand text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {mj.code}
                    </span>
                    <span className="text-[12.5px] text-neutral-800 font-semibold truncate">{mj.name}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge status={mj.status} size="xs" />
                    <span className="text-[12px] font-bold text-neutral-800 w-9 text-right">{mj.progress}%</span>
                  </div>
                </div>
                <div className="pl-7.5">
                  <ProgressBar value={mj.progress} size="xs" showLabel={false} />
                  <div className="flex justify-between items-center text-[10.5px] text-neutral-400 mt-1">
                    <span>{mj.subMainJobs.length} Sub Main Jobs</span>
                    <span>Weight: {mj.weight}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Status Summary & Budget Health */}
        <div className="space-y-5">
          {/* Status Breakdown */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3.5 pb-2.5 border-b border-neutral-100">
              <AlertTriangle size={15} className="text-brand" />
              <span className="text-[13px] font-bold text-neutral-800 tracking-tight">Status Breakdown</span>
            </div>

            <div className="space-y-2">
              {([
                { s: 'Completed', icon: CheckCircle2, color: 'text-brand' },
                { s: 'On Track', icon: TrendingUp, color: 'text-success' },
                { s: 'At Risk', icon: AlertTriangle, color: 'text-warning' },
                { s: 'Delayed', icon: XCircle, color: 'text-danger' },
                { s: 'Open', icon: Layers, color: 'text-neutral-400' },
              ] as const).map(({ s, icon: Icon, color }) => (
                <div key={s} className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-neutral-50">
                  <div className="flex items-center gap-2">
                    <Icon size={14} className={color} />
                    <span className="text-[12.5px] text-neutral-600 font-medium">{s}</span>
                  </div>
                  <span className="text-[12.5px] font-bold text-neutral-800">{statusCounts[s] || 0}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Budget Health */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-neutral-100">
              <span className="text-[13px] font-bold text-neutral-800 tracking-tight">Budget Realization</span>
              <NavLink to="/budget" className="text-[11px] font-semibold text-brand hover:text-brand-dark flex items-center gap-0.5">
                Budget <ArrowUpRight size={12} />
              </NavLink>
            </div>

            <div className="space-y-2.5">
              <div className="flex justify-between items-baseline text-[12px]">
                <span className="text-neutral-500 font-medium">Realisasi</span>
                <span className="font-bold text-neutral-900">{formatRupiah(p.usedBudget)}</span>
              </div>
              <ProgressBar
                value={budgetUsedPct}
                size="sm"
                color={budgetHealth === 'good' ? 'brand' : budgetHealth === 'warning' ? 'warning' : 'danger'}
                showLabel={false}
              />
              <div className="flex justify-between text-[11px] text-neutral-400 font-medium">
                <span>{budgetUsedPct}% used</span>
                <span>{formatRupiah(remaining)} remaining</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
