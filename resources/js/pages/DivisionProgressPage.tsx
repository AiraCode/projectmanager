import { useState } from 'react';
import { usePage } from '@inertiajs/react';
import { Users, CheckCircle2, Clock, ListChecks, ChevronDown, ChevronRight, CheckSquare, Square, Shield } from 'lucide-react';
import { PageHeader, Card, ProgressBar, StatusBadge, formatDateDisplay } from '@/components/ui';

interface TaskItem {
  id: string;
  name: string;
  weight: number;
  is_completed: boolean;
  status: string;
  subMainJob: string;
  mainJob: string;
  start: string | null;
  end: string | null;
}

interface DivisionGroup {
  division: string;
  total: number;
  completed: number;
  remaining: number;
  percentage: number;
  tasks: TaskItem[];
}

export default function DivisionProgressPage() {
  const { project, divisionGroups = [], userRole, userDivision } = usePage().props as any;

  const isWorkerDivision = userRole === 'worker' || !!userDivision;
  const activeDivisionName = userDivision || (divisionGroups.length === 1 ? divisionGroups[0]?.division : null);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    divisionGroups.forEach((g: DivisionGroup, i: number) => {
      // Automatically expand user's division, or first division
      if (isWorkerDivision || i === 0) init[g.division] = true;
    });
    return init;
  });

  const toggle = (division: string) => {
    setExpanded(prev => ({ ...prev, [division]: !prev[division] }));
  };

  const totalTasks = divisionGroups.reduce((acc: number, g: DivisionGroup) => acc + g.total, 0);
  const totalCompleted = divisionGroups.reduce((acc: number, g: DivisionGroup) => acc + g.completed, 0);
  const overallPercentage = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-screen-2xl space-y-6">
      <PageHeader
        title={
          isWorkerDivision && activeDivisionName
            ? `Progres Divisi: ${activeDivisionName} ${project?.name ? `· ${project.name}` : ''}`
            : `Progress per Divisi ${project?.name ? `· ${project.name}` : ''}`
        }
        subtitle={
          isWorkerDivision && activeDivisionName
            ? `Monitoring realisasi dan beban kerja khusus Divisi ${activeDivisionName} pada project ini`
            : "Monitoring realisasi dan beban kerja per divisi berdasarkan struktur tugas WBS"
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-brand-light text-brand border border-brand-border shadow-2xs">
              <Users size={14} />
              {isWorkerDivision && activeDivisionName
                ? `Divisi ${activeDivisionName}`
                : `${divisionGroups.length} Divisi Terlibat`}
            </span>
          </div>
        }
      />

      {/* KPI Overview Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          {
            label: 'Total Divisi',
            value: `${divisionGroups.length} Divisi`,
            sub: 'Divisi terdaftar dalam project',
            icon: Users,
            color: 'text-brand bg-brand-light',
          },
          {
            label: 'Total Pekerjaan',
            value: `${totalTasks} Tasks`,
            sub: 'Seluruh rincian tugas WBS',
            icon: ListChecks,
            color: 'text-indigo-600 bg-indigo-50',
          },
          {
            label: 'Tugas Selesai',
            value: `${totalCompleted} Selesai`,
            sub: `${totalTasks - totalCompleted} tugas tersisa`,
            icon: CheckCircle2,
            color: 'text-emerald-600 bg-emerald-50',
          },
          {
            label: 'Rata-rata Progres',
            value: `${overallPercentage}%`,
            sub: 'Tingkat penyelesaian keseluruhan',
            icon: Clock,
            color: 'text-amber-600 bg-amber-50',
          },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <Card key={label} className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">{label}</div>
              <div className="text-[18px] sm:text-[20px] font-black text-neutral-900 leading-tight mt-0.5">{value}</div>
              <div className="text-[11px] text-neutral-500 mt-0.5 truncate">{sub}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Division Cards List */}
      <div className="space-y-4">
        {divisionGroups.map((group: DivisionGroup) => {
          const isExp = !!expanded[group.division];
          const progressColor: 'brand' | 'warning' | 'danger' =
            group.percentage >= 90 ? 'brand' : group.percentage >= 70 ? 'warning' : 'danger';

          return (
            <Card key={group.division} className="overflow-hidden border border-neutral-200/80 shadow-xs">
              {/* Header card */}
              <div
                onClick={() => toggle(group.division)}
                className="w-full flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 sm:p-5 hover:bg-neutral-50/70 transition-colors cursor-pointer"
              >
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <button
                    type="button"
                    className="mt-0.5 sm:mt-0 p-1 text-neutral-400 hover:text-neutral-600 flex-shrink-0"
                    aria-label="Toggle detail"
                  >
                    {isExp ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </button>

                  <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 text-brand flex items-center justify-center flex-shrink-0 font-bold text-sm">
                    {group.division.slice(0, 2).toUpperCase()}
                  </div>

                  <div className="min-w-0">
                    <h3 className="text-[15px] sm:text-[16px] font-black text-neutral-900 tracking-tight truncate">
                      {group.division}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-neutral-500 mt-0.5">
                      <span>Total: <strong className="text-neutral-800">{group.total}</strong></span>
                      <span className="text-neutral-300">·</span>
                      <span className="text-emerald-600 font-semibold">Completed: {group.completed}</span>
                      <span className="text-neutral-300">·</span>
                      <span className="text-neutral-600 font-medium">Remaining: {group.remaining}</span>
                    </div>
                  </div>
                </div>

                {/* Progress bar and metrics */}
                <div className="flex items-center gap-4 sm:gap-6 flex-shrink-0 pl-11 md:pl-0">
                  <div className="w-40 sm:w-56">
                    <div className="flex justify-between text-[11.5px] font-bold text-neutral-700 mb-1">
                      <span>Progres Tugas</span>
                      <span className="text-[13px] font-black text-brand">{group.percentage}%</span>
                    </div>
                    <ProgressBar value={group.percentage} color={progressColor} size="sm" showLabel={false} />
                  </div>

                  <div className="hidden sm:flex flex-col items-end text-right min-w-[75px]">
                    <span className="text-[16px] sm:text-[18px] font-black text-neutral-900 leading-none">
                      {group.percentage}%
                    </span>
                    <span className="text-[10.5px] font-semibold text-neutral-400 mt-0.5 uppercase tracking-wider">
                      Selesai
                    </span>
                  </div>
                </div>
              </div>

              {/* Expandable Task list */}
              {isExp && (
                <div className="border-t border-neutral-100 bg-neutral-50/40 p-4 sm:p-5 space-y-2">
                  <div className="text-[12px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
                    Daftar Pekerjaan ({group.tasks.length} Tasks)
                  </div>

                  {group.tasks.length === 0 ? (
                    <div className="py-4 text-center text-[12.5px] text-neutral-400 italic">
                      Tidak ada tugas yang terdaftar untuk divisi ini.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {group.tasks.map((task: TaskItem) => (
                        <div
                          key={task.id}
                          className={`flex items-start sm:items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                            task.is_completed
                              ? 'bg-success-light/30 border-success/30'
                              : 'bg-white border-neutral-200/80 shadow-2xs hover:border-neutral-300'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="mt-0.5 sm:mt-0 flex-shrink-0">
                              {task.is_completed ? (
                                <CheckSquare size={17} className="text-emerald-600" />
                              ) : (
                                <Square size={17} className="text-neutral-300" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-[13px] font-bold ${task.is_completed ? 'line-through text-neutral-400' : 'text-neutral-900'}`}>
                                  {task.name}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-neutral-400 mt-1">
                                <span className="font-semibold text-neutral-600 truncate max-w-[220px]">
                                  {task.subMainJob}
                                </span>
                                <span>·</span>
                                <span className="text-neutral-500 truncate max-w-[220px]">
                                  {task.mainJob}
                                </span>
                                {(task.start || task.end) && (
                                  <>
                                    <span>·</span>
                                    <span>{formatDateDisplay(task.start)} → {formatDateDisplay(task.end)}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 flex-shrink-0">
                            {task.weight > 0 && (
                              <span className="text-[11.5px] font-semibold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200 hidden sm:inline">
                                Bobot: {task.weight}%
                              </span>
                            )}
                            <StatusBadge status={task.is_completed ? 'Completed' : (task.status as any)} size="xs" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}

        {divisionGroups.length === 0 && (
          <div className="p-12 text-center bg-white rounded-xl border border-neutral-200/80">
            <Shield size={32} className="mx-auto text-neutral-300 mb-2" />
            <h3 className="text-[15px] font-bold text-neutral-800">Belum Ada Data Divisi</h3>
            <p className="text-[13px] text-neutral-500 mt-1">
              Project ini belum memiliki tugas WBS yang dialokasikan ke divisi.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
