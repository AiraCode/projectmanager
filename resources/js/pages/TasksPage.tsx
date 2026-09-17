import { useState, useEffect, Fragment } from 'react';
import { Plus, Search, Filter, ChevronDown, ChevronRight, Lock, Loader2, CheckSquare, Square, Shield, Calendar, Layers, Info, Trash2, Edit2, ListTodo, TableProperties, Download } from 'lucide-react';
import { Project, PROJECT, MainJob, SubMainJob, SubSubtask, Status, DependencyType } from '@/data/mockData';
import { recalculateSchedule } from '@/utils/scheduleEngine';
import { recalculateProgress } from '@/utils/progressEngine';
import { exportToCSV } from '@/utils/exportEngine';
import { StatusBadge, ProgressBar, PageHeader, Card, Button, Modal, Toast, EmptyState } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

const STATUSES: Status[] = ['Open', 'On Track', 'At Risk', 'Delayed', 'Cancelled', 'Completed'];

export default function TasksPage() {
  const { user } = useAuth();
  
  // Initialize with recalculated progress and schedule so initial mock data is also correct
  const [projectData, setProjectData] = useState<Project>(() => recalculateSchedule(recalculateProgress(PROJECT)));
  
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<Status | ''>('');
  const [viewMode, setViewMode] = useState<'checklist' | 'table'>('checklist');
  const [expandedMJ, setExpandedMJ] = useState<Record<string, boolean>>({ 'mj-01': true, 'mj-04': true });
  const [expandedSMJ, setExpandedSMJ] = useState<Record<string, boolean>>({ 'smj-1-1': true, 'smj-4-5': true });
  
  // showAddTaskModal stores { smjId } for Add, or { smjId, task } for Edit
  const [showAddTaskModal, setShowAddTaskModal] = useState<{ smjId: string, task?: SubSubtask } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const toggleMJ = (id: string) => setExpandedMJ(p => ({ ...p, [id]: !p[id] }));
  const toggleSMJ = (id: string) => setExpandedSMJ(p => ({ ...p, [id]: !p[id] }));

  const handleSaveSubtask = (smjId: string, taskData: Partial<SubSubtask>) => {
    setProjectData(prev => {
      const newData = { ...prev };
      newData.mainJobs = newData.mainJobs.map(mj => ({
        ...mj,
        subMainJobs: mj.subMainJobs.map(smj => {
          if (smj.id !== smjId) return smj;
          
          let updatedSubtasks = [...smj.subtasks];
          if (taskData.id) {
            // Edit
            updatedSubtasks = updatedSubtasks.map(st => st.id === taskData.id ? { ...st, ...taskData } as SubSubtask : st);
          } else {
            // Add
            const newId = `st-${Date.now()}`;
            const newCode = `${smj.code}.${updatedSubtasks.length + 1}`;
            
            const newTask: SubSubtask = {
              id: newId,
              code: newCode,
              name: taskData.name!,
              startDate: taskData.startDate!,
              finishDate: taskData.startDate!, // Will be recalculated by scheduleEngine
              duration: Number(taskData.duration || 1),
              daysLeft: Number(taskData.duration || 1),
              progress: 0,
              status: 'Open',
              predecessor: taskData.predecessor,
              depType: taskData.depType as DependencyType,
              lag: Number(taskData.lag || 0),
              weight: 0.1,
              checked: false,
            };
            updatedSubtasks.push(newTask);
          }
          return { ...smj, subtasks: updatedSubtasks };
        })
      }));
      // Recalculate progress and schedule before saving
      return recalculateSchedule(recalculateProgress(newData));
    });
    setToastMsg(`Sub-Subtask "${taskData.name}" berhasil ${taskData.id ? 'diperbarui' : 'ditambahkan'}. Jadwal otomatis disesuaikan.`);
    setShowAddTaskModal(null);
  };

  const handleDeleteSubtask = (smjId: string, taskId: string, taskName: string) => {
    if (!confirm(`Hapus tugas "${taskName}"?`)) return;
    setProjectData(prev => {
      const newData = { ...prev };
      newData.mainJobs = newData.mainJobs.map(mj => ({
        ...mj,
        subMainJobs: mj.subMainJobs.map(smj => {
          if (smj.id !== smjId) return smj;
          return { ...smj, subtasks: smj.subtasks.filter(st => st.id !== taskId) };
        })
      }));
      // Recalculate progress and schedule after deleting
      return recalculateSchedule(recalculateProgress(newData));
    });
    setToastMsg(`Sub-Subtask "${taskName}" berhasil dihapus. Jadwal otomatis disesuaikan.`);
  };

  const isAuthorized = (pic: string) => {
    if (user?.role === 'Admin') return true;
    if (!user?.pic) return false;
    return user.pic.toLowerCase() === pic.toLowerCase();
  };

  const handleCheck = (taskId: string, authorized: boolean, taskName: string) => {
    if (!authorized) {
      setToastMsg(`Aksi dibatasi: Hanya PIC yang bersangkutan atau Admin yang dapat mengubah checklist.`);
      return;
    }
    
    setProjectData(prev => {
      let isCheckedNow = false;
      const newData = { ...prev };
      newData.mainJobs = newData.mainJobs.map(mj => ({
        ...mj,
        subMainJobs: mj.subMainJobs.map(smj => ({
          ...smj,
          subtasks: smj.subtasks.map(st => {
            if (st.id === taskId) {
              isCheckedNow = !st.checked;
              return { ...st, checked: isCheckedNow };
            }
            return st;
          })
        }))
      }));
      
      // Recalculate progress first, then schedule (since schedule depends on completion status for daysLeft)
      return recalculateSchedule(recalculateProgress(newData));
    });
    
    // Determine the message (could be cleaner but this works)
    const wasChecked = projectData.mainJobs.some(mj => mj.subMainJobs.some(smj => smj.subtasks.some(st => st.id === taskId && st.checked)));
    setToastMsg(wasChecked ? `Tugas "${taskName}" ditandai belum selesai.` : `Tugas "${taskName}" ditandai selesai ✓`);
  };

  const filteredMJs = projectData.mainJobs.filter(mj => {
    if (search && !mj.name.toLowerCase().includes(search.toLowerCase()) &&
        !mj.subMainJobs.some(smj => smj.name.toLowerCase().includes(search.toLowerCase()) ||
          smj.subtasks.some(st => st.name.toLowerCase().includes(search.toLowerCase())))) return false;
    if (filterStatus && mj.status !== filterStatus &&
        !mj.subMainJobs.some(smj => smj.status === filterStatus)) return false;
    return true;
  });

  const handleExportCSV = () => {
    const headers = ['WBS Code', 'Level', 'Description', 'PIC', 'Status', 'Progress (%)', 'Start Date', 'Finish Date', 'Duration', 'Predecessor'];
    const rows: any[][] = [];
    
    filteredMJs.forEach(mj => {
      rows.push([mj.code, 'Main Job', mj.name, '-', mj.status, mj.progress, mj.startDate || '-', mj.finishDate || '-', '-', '-']);
      mj.subMainJobs.forEach(smj => {
        rows.push([smj.code, 'Sub Main Job', smj.name, smj.pic, smj.status, smj.progress, smj.startDate || '-', smj.finishDate || '-', '-', '-']);
        smj.subtasks.forEach(st => {
          const predStr = st.predecessor ? `${st.predecessor} (${st.depType || 'FS'}${st.lag ? '+'+st.lag : ''})` : '-';
          rows.push([st.code, 'Sub-Subtask', st.name, smj.pic, st.checked ? 'Completed' : st.status, st.checked ? 100 : st.progress, st.startDate, st.finishDate, st.duration, predStr]);
        });
      });
    });
    
    exportToCSV(`Tasks_Export_${new Date().toISOString().slice(0,10)}`, headers, rows);
    setToastMsg('Tasks exported to CSV successfully.');
  };

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-screen-2xl space-y-5">
      <PageHeader
        title="Task Management"
        subtitle="3-tier WBS hierarchy: Main Job → Sub Main Job → Sub-Subtask"
        actions={
          <div className="flex items-center gap-4">
            <span className="text-[12px] text-neutral-500 hidden sm:inline">
              Role: <strong className="text-neutral-800">{user?.role}</strong> ({user?.pic || 'All Scope'})
            </span>
            
            <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg border border-neutral-200">
              <button
                onClick={() => setViewMode('checklist')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-bold transition-all ${
                  viewMode === 'checklist'
                    ? 'bg-brand text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <ListTodo size={14} /> <span className="hidden sm:inline">Checklist View</span>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-bold transition-all ${
                  viewMode === 'table'
                    ? 'bg-brand text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <TableProperties size={14} /> <span className="hidden sm:inline">Table View</span>
              </button>
            </div>
            
            <Button variant="outline" size="sm" onClick={handleExportCSV} icon={Download} className="text-[12px] h-[34px]">
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
          </div>
        }
      />

      {/* Role explanation banner */}
      <div className="p-3.5 sm:p-4 rounded-xl bg-brand-light/60 border border-brand-border flex items-start gap-3">
        <Info size={16} className="text-brand flex-shrink-0 mt-0.5" />
        <div className="text-[12.5px] text-neutral-700 flex-1">
          <span className="font-semibold text-brand">WBS Hierarchy & Permission Rule: </span>
          <strong>Main Job</strong> and <strong>Sub Main Job</strong> form the fixed company template with assigned PICs.
          Project-specific work is entered at the <strong>Sub-Subtask</strong> level.
          PICs can only check off Sub-Subtasks assigned to their authorized department.
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search Main Jobs, Sub Main Jobs, or Sub-Subtasks…"
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 bg-white shadow-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as Status | '')}
            className="px-3 py-2 rounded-lg border border-neutral-200 text-[13px] text-neutral-700 outline-none focus:border-brand bg-white shadow-xs"
          >
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {(search || filterStatus) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(''); setFilterStatus(''); }}
              className="text-[12px]"
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Content Rendering based on View Mode */}
      {viewMode === 'checklist' ? (
        <div className="space-y-3">
          {filteredMJs.map(mj => (
            <Card key={mj.id} className="overflow-hidden">
              {/* Level 1: Main Job Header */}
              <button
                onClick={() => toggleMJ(mj.id)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-neutral-50/70 transition-colors text-left"
              >
                <div className="text-neutral-400 flex-shrink-0">
                  {expandedMJ[mj.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
                <div className="w-6 h-6 rounded bg-brand text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                  <span className="text-[10px] font-bold">{mj.code}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-bold text-neutral-900 truncate">{mj.name}</div>
                  <div className="text-[11px] text-neutral-400 font-medium hidden sm:block">
                    Main Job (Fixed Template)
                  </div>
                </div>
                <div className="flex items-center gap-2.5 sm:gap-3 flex-shrink-0 ml-2">
                  <span className="text-[11px] font-medium text-neutral-400 hidden sm:inline">
                    {mj.subMainJobs.length} Sub Main Jobs
                  </span>
                  <StatusBadge status={mj.status} size="xs" />
                  <div className="w-16 hidden md:block">
                    <ProgressBar value={mj.progress} size="xs" showLabel={false} />
                  </div>
                  <span className="text-[12px] font-bold text-neutral-800 w-9 text-right">{mj.progress}%</span>
                </div>
              </button>

              {/* Level 2: Sub Main Jobs */}
              {expandedMJ[mj.id] && (
                <div className="border-t border-neutral-100 divide-y divide-neutral-100 bg-neutral-50/30">
                  {mj.subMainJobs.map(smj => (
                    <SubMainJobSection
                      key={smj.id}
                      smj={smj}
                      expanded={!!expandedSMJ[smj.id]}
                      onToggle={() => toggleSMJ(smj.id)}
                      isAuthorized={isAuthorized(smj.pic)}
                      onOpenAddModal={() => setShowAddTaskModal({ smjId: smj.id })}
                      onOpenEditModal={(task) => setShowAddTaskModal({ smjId: smj.id, task })}
                      onDeleteTask={(taskId, taskName) => handleDeleteSubtask(smj.id, taskId, taskName)}
                      onCheck={handleCheck}
                      isAdmin={user?.role === 'Admin'}
                    />
                  ))}
                  {mj.subMainJobs.length === 0 && (
                    <div className="px-10 py-3 text-[12px] text-neutral-400 italic">No Sub Main Jobs in template.</div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin max-h-[70vh]">
            <table className="w-full min-w-[1000px] text-left border-collapse">
              <thead className="bg-neutral-100/80 border-b border-neutral-200 sticky top-0 z-10">
                <tr className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                  <th className="px-4 py-3">WBS Code</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">PIC</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Progress</th>
                  <th className="px-4 py-3">Start Date</th>
                  <th className="px-4 py-3">Finish Date</th>
                  <th className="px-4 py-3 text-right">Dur</th>
                  <th className="px-4 py-3">Pred</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-[12px]">
                {filteredMJs.map(mj => (
                  <Fragment key={mj.id}>
                    {/* Main Job Row */}
                    <tr className="bg-brand/5 hover:bg-brand/10 transition-colors">
                      <td className="px-4 py-2.5 font-bold text-brand">{mj.code}</td>
                      <td className="px-4 py-2.5 font-bold text-neutral-900">{mj.name}</td>
                      <td className="px-4 py-2.5 text-neutral-500 font-medium">—</td>
                      <td className="px-4 py-2.5"><StatusBadge status={mj.status} size="xs" /></td>
                      <td className="px-4 py-2.5 text-right font-bold text-brand">{mj.progress}%</td>
                      <td className="px-4 py-2.5 text-neutral-600 font-medium">{mj.startDate || '—'}</td>
                      <td className="px-4 py-2.5 text-neutral-600 font-medium">{mj.finishDate || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-neutral-400">—</td>
                      <td className="px-4 py-2.5 text-neutral-400">—</td>
                    </tr>
                    
                    {/* Sub Main Job Rows */}
                    {mj.subMainJobs.map(smj => (
                      <Fragment key={smj.id}>
                        <tr className="bg-neutral-50 hover:bg-neutral-100/70 transition-colors">
                          <td className="px-4 py-2.5 pl-8 font-semibold text-neutral-700">{smj.code}</td>
                          <td className="px-4 py-2.5 font-semibold text-neutral-800">{smj.name}</td>
                          <td className="px-4 py-2.5">
                            <span className="px-1.5 py-0.5 bg-white border border-neutral-200 rounded text-[10px] font-bold text-neutral-600">
                              {smj.pic}
                            </span>
                          </td>
                          <td className="px-4 py-2.5"><StatusBadge status={smj.status} size="xs" /></td>
                          <td className="px-4 py-2.5 text-right font-bold text-neutral-700">{smj.progress}%</td>
                          <td className="px-4 py-2.5 text-neutral-600 font-medium">{smj.startDate || '—'}</td>
                          <td className="px-4 py-2.5 text-neutral-600 font-medium">{smj.finishDate || '—'}</td>
                          <td className="px-4 py-2.5 text-right text-neutral-400">—</td>
                          <td className="px-4 py-2.5 text-neutral-400">—</td>
                        </tr>
                        
                        {/* Sub-Subtask Rows */}
                        {smj.subtasks.map(st => (
                          <tr key={st.id} className="hover:bg-neutral-50/50 transition-colors">
                            <td className="px-4 py-2 pl-12 font-mono text-[11px] text-neutral-500">{st.code}</td>
                            <td className="px-4 py-2 text-neutral-700 flex items-center gap-2">
                              {st.checked && <CheckSquare size={13} className="text-success" />}
                              <span className={st.checked ? 'line-through text-neutral-400' : ''}>{st.name}</span>
                            </td>
                            <td className="px-4 py-2 text-neutral-400 text-[11px]">{smj.pic}</td>
                            <td className="px-4 py-2"><StatusBadge status={st.checked ? 'Completed' : st.status} size="xs" /></td>
                            <td className="px-4 py-2 text-right font-semibold text-neutral-600">
                              {st.checked ? '100' : st.progress}%
                            </td>
                            <td className="px-4 py-2 text-neutral-600">{st.startDate}</td>
                            <td className="px-4 py-2 text-neutral-600">{st.finishDate}</td>
                            <td className="px-4 py-2 text-right text-neutral-600">{st.duration}d</td>
                            <td className="px-4 py-2 font-mono text-[11px] text-neutral-500">
                              {st.predecessor ? `${st.predecessor} (${st.depType || 'FS'}${st.lag ? `+${st.lag}` : ''})` : '—'}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {filteredMJs.length === 0 && (
        <EmptyState
          icon={Search}
          title="No tasks match your filter"
          description="Try clearing your search keyword or selecting 'All Statuses'."
          action={
            <Button variant="outline" size="sm" onClick={() => { setSearch(''); setFilterStatus(''); }}>
              Clear Filters
            </Button>
          }
        />
      )}

      {/* Add/Edit Sub-Subtask Modal */}
      {showAddTaskModal && (
        <AddSubtaskModal
          smjId={showAddTaskModal.smjId}
          initialData={showAddTaskModal.task}
          onClose={() => setShowAddTaskModal(null)}
          onSave={(taskData) => handleSaveSubtask(showAddTaskModal.smjId, taskData)}
        />
      )}

      {/* Action Toast Feedback */}
      {toastMsg && (
        <Toast message={toastMsg} onClose={() => setToastMsg(null)} />
      )}
    </div>
  );
}

function SubMainJobSection({
  smj, expanded, onToggle, isAuthorized, onOpenAddModal, onOpenEditModal, onDeleteTask, onCheck, isAdmin
}: {
  smj: SubMainJob;
  expanded: boolean;
  onToggle: () => void;
  isAuthorized: boolean;
  onOpenAddModal: () => void;
  onOpenEditModal: (task: SubSubtask) => void;
  onDeleteTask: (taskId: string, taskName: string) => void;
  onCheck: (id: string, auth: boolean, name: string) => void;
  isAdmin: boolean;
}) {
  return (
    <div className="transition-colors">
      <div className="flex items-center gap-3 pl-6 sm:pl-9 pr-4 py-2.5 hover:bg-neutral-50/80">
        <button onClick={onToggle} className="text-neutral-400 hover:text-neutral-600 flex-shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="w-5 h-5 rounded bg-neutral-200/80 flex items-center justify-center flex-shrink-0">
          <span className="text-[9.5px] font-bold text-neutral-700">{smj.code}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-semibold text-neutral-800 truncate">{smj.name}</span>
            {!isAuthorized && (
              <span title="Hanya PIC bertanggung jawab yang dapat mengubah tugas ini" className="text-neutral-400">
                <Lock size={12} />
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200">
              PIC: {smj.pic}
            </span>
            <span className="text-[10.5px] text-neutral-400 font-medium">Sub Main Job (Fixed)</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={smj.status} size="xs" />
          <span className="text-[11.5px] font-bold text-neutral-700 w-8 text-right">{smj.progress}%</span>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenAddModal}
              className="py-1 px-2 text-[11px] h-7"
              icon={Plus}
            >
              Add
            </Button>
          )}
        </div>
      </div>

      {/* Level 3: Project-Specific Sub-Subtasks */}
      {expanded && (
        <div className="pl-12 sm:pl-16 pr-4 pb-3 pt-1 space-y-1.5">
          {smj.subtasks.length === 0 ? (
            <div className="py-2 text-[12px] text-neutral-400 italic">
              No Sub-Subtasks added yet. {isAdmin && "Click 'Add' to enter project-specific tasks."}
            </div>
          ) : (
            smj.subtasks.map(st => (
                <SubtaskRow
                  key={st.id}
                  st={st}
                  isChecked={st.checked}
                  auth={isAuthorized}
                  isAdmin={isAdmin}
                  onCheck={() => onCheck(st.id, isAuthorized, st.name)}
                  onEdit={() => onOpenEditModal(st)}
                  onDelete={() => onDeleteTask(st.id, st.name)}
                />
              )
            )
          )}
        </div>
      )}
    </div>
  );
}

function SubtaskRow({ st, isChecked, auth, isAdmin, onCheck, onEdit, onDelete }: {
  st: SubSubtask;
  isChecked: boolean;
  auth: boolean;
  isAdmin: boolean;
  onCheck: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group flex items-start sm:items-center gap-3 p-2.5 rounded-lg border transition-all ${
        isChecked
          ? 'bg-success-light/40 border-success/30'
          : 'bg-white border-neutral-200/80 hover:border-neutral-300 shadow-xs'
      }`}
    >
      <button
        onClick={onCheck}
        disabled={!auth}
        aria-label={`Toggle checklist for ${st.name}`}
        className={`mt-0.5 sm:mt-0 flex-shrink-0 transition-transform active:scale-90 ${
          auth ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
        }`}
      >
        {isChecked ? (
          <CheckSquare size={17} className="text-success" />
        ) : (
          <Square size={17} className="text-neutral-300 hover:text-neutral-500" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-neutral-500">{st.code}</span>
          <span className={`text-[12.5px] font-medium ${isChecked ? 'line-through text-neutral-400' : 'text-neutral-800'}`}>
            {st.name}
          </span>
          {!auth && <Lock size={11} className="text-neutral-300" />}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-neutral-400">
          <span>{st.startDate} → {st.finishDate}</span>
          <span>Duration: {st.duration}d</span>
          {st.predecessor && (
            <span className="font-medium text-neutral-500">
              Pred: {st.predecessor} ({st.depType || 'FS'}{st.lag ? ` +${st.lag}d` : ''})
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
        <StatusBadge status={isChecked ? 'Completed' : st.status} size="xs" />
        <span className="text-[11px] font-bold text-neutral-700 w-7 text-right">
          {isChecked ? 100 : st.progress}%
        </span>
        {isAdmin && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
            <button onClick={onEdit} className="p-1.5 text-neutral-400 hover:text-brand bg-white hover:bg-neutral-50 rounded border border-neutral-200 shadow-xs" title="Edit Task">
              <Edit2 size={13} />
            </button>
            <button onClick={onDelete} className="p-1.5 text-neutral-400 hover:text-danger bg-white hover:bg-neutral-50 rounded border border-neutral-200 shadow-xs" title="Delete Task">
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AddSubtaskModal({ smjId, onClose, onSave, initialData }: { smjId: string; onClose: () => void; onSave: (taskData: Partial<SubSubtask>) => void; initialData?: SubSubtask }) {
  const [name, setName] = useState(initialData?.name || '');
  const [startDate, setStartDate] = useState(initialData?.startDate || new Date().toISOString().slice(0, 10));
  const [duration, setDuration] = useState(initialData?.duration?.toString() || '5');
  const [predecessor, setPredecessor] = useState(initialData?.predecessor || '');
  const [depType, setDepType] = useState<DependencyType>(initialData?.depType || 'FS');
  const [lag, setLag] = useState(initialData?.lag?.toString() || '0');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 300));
    setSaving(false);
    onSave({
      id: initialData?.id,
      name,
      startDate,
      duration: parseInt(duration) || 1,
      predecessor,
      depType,
      lag: parseInt(lag) || 0
    });
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={initialData ? "Edit Sub-Subtask" : "Add Project-Specific Sub-Subtask"}
      subtitle={initialData ? `Editing task ${initialData.code}` : `Adding task under Sub Main Job ${smjId}`}
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">
            Task Description <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Persiapan dan review dokumen vendor..."
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 bg-white"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
            />
          </div>
          <div>
            <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Duration (Days)</label>
            <input
              type="number"
              min="1"
              value={duration}
              onChange={e => setDuration(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1">
            <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Predecessor</label>
            <input
              placeholder="e.g. 1.1.1"
              value={predecessor}
              onChange={e => setPredecessor(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
            />
          </div>
          <div className="col-span-1">
            <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Dependency</label>
            <select
              value={depType}
              onChange={e => setDepType(e.target.value as DependencyType)}
              className="w-full px-2.5 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
            >
              <option value="FS">FS (Finish-Start)</option>
              <option value="SS">SS (Start-Start)</option>
              <option value="FF">FF (Finish-Finish)</option>
              <option value="SF">SF (Start-Finish)</option>
            </select>
          </div>
          <div className="col-span-1">
            <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Lag / Lead (d)</label>
            <input
              type="number"
              value={lag}
              onChange={e => setLag(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" loading={saving}>
            Save Sub-Subtask
          </Button>
        </div>
      </form>
    </Modal>
  );
}
