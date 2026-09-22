import { useState, useEffect, Fragment } from 'react';
import { usePage, router } from '@inertiajs/react';
import { Plus, Search, ChevronDown, ChevronRight, Lock, CheckSquare, Square, Shield, Calendar, Layers, Info, Trash2, Edit2, ListTodo, TableProperties, Download, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Project, PROJECT, MainJob, SubMainJob, SubSubtask, Status, DependencyType } from '@/data/mockData';
import { recalculateSchedule } from '@/utils/scheduleEngine';
import { recalculateProgress } from '@/utils/progressEngine';
import { exportToCSV } from '@/utils/exportEngine';
import { StatusBadge, ProgressBar, PageHeader, Card, Button, Modal, Toast, EmptyState, formatDateDisplay } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

const STATUSES: Status[] = ['Open', 'On Track', 'At Risk', 'Delayed', 'Cancelled', 'Completed'];

export default function TasksPage() {
  const { user } = useAuth();
  const pageProps = usePage().props as any;
  const project = pageProps?.project;
  const divisions = pageProps?.divisions || [];
  const availableProjects = pageProps?.availableProjects || [];
  
  // Role checks:
  // - PIC: can add/edit/delete tasks and sub-tasks, toggle checklist in their project
  // - Worker: can ONLY check/uncheck tasks assigned to their division
  // - Admin (Utama / Progres): strictly read-only, NO modification allowed
  const authUser = pageProps?.auth?.user || user;
  const rawRole = (pageProps?.userRole || authUser?.role || authUser?.rawRole || '').toString().toLowerCase();
  const isPIC    = authUser?.isPIC === true || rawRole === 'pic';
  const isWorker = authUser?.isWorker === true || rawRole === 'worker';
  const isAdmin  = authUser?.isAdminUtama === true || authUser?.isAdminProgres === true || rawRole === 'admin_utama' || rawRole === 'admin_progres' || rawRole === 'admin';
  
  const [projectData, setProjectData] = useState<Project>(() => {
    if (!project || !project.mainJobs) {
      return recalculateSchedule(recalculateProgress(PROJECT));
    }
    return recalculateSchedule(recalculateProgress(project));
  });

  useEffect(() => {
    if (project && project.mainJobs) {
      setProjectData(recalculateSchedule(recalculateProgress(project)));
    }
  }, [project]);
  
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<Status | ''>('');
  const [viewMode, setViewMode] = useState<'checklist' | 'table'>('checklist');
  const [expandedMJ, setExpandedMJ] = useState<Record<string, boolean>>({ 'mj-1': true, 'mj-01': true });
  const [expandedSMJ, setExpandedSMJ] = useState<Record<string, boolean>>({ 'smj-1': true, 'smj-1-1': true });
  
  // Modals
  const [showAddMainJobModal, setShowAddMainJobModal] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState<{ smjId: string; smjDbId?: number; parentSmj?: SubMainJob; task?: SubSubtask } | null>(null);
  const [showAddSubMainJobModal, setShowAddSubMainJobModal] = useState<{ mjId: string; mjDbId?: number; mjName: string } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const toggleMJ = (id: string) => setExpandedMJ(p => ({ ...p, [id]: !p[id] }));
  const toggleSMJ = (id: string) => setExpandedSMJ(p => ({ ...p, [id]: !p[id] }));

  // Add Main Task (Main Job / Level 1 WBS)
  const handleSaveMainJob = (name: string, weight: number, start?: string, end?: string) => {
    if (!projectData.id || !name) return;
    
    router.post(`/projects/${projectData.id}/main-wbs`, {
      name,
      weight,
      start: start || null,
      end: end || null,
    }, {
      preserveScroll: true,
      onSuccess: () => {
        setToastMsg(`Main Task "${name}" berhasil ditambahkan.`);
        setShowAddMainJobModal(false);
      },
      onError: (errors) => {
        console.error('Error adding Main Task:', errors);
        const errText = Object.values(errors).flat().join(', ');
        setToastMsg(`Gagal menambahkan Main Task: ${errText || 'Periksa input Anda'}`);
      },
    });
  };

  // Delete Main Task (Main Job)
  const handleDeleteMainJob = (mjId: string, mjDbId: number | undefined, mjName: string) => {
    if (!confirm(`Hapus Main Task "${mjName}" beserta seluruh Sub Task dan pekerjaannya?`)) return;
    const targetDbId = mjDbId || (mjId.startsWith('mj-') ? mjId.replace('mj-', '') : mjId);
    if (projectData.id && targetDbId) {
      router.delete(`/projects/${projectData.id}/main-wbs/${targetDbId}`, {
        preserveScroll: true,
        onSuccess: () => {
          setProjectData(prev => {
            const newData = { ...prev };
            newData.mainJobs = newData.mainJobs.filter(mj => mj.id !== mjId);
            return recalculateSchedule(recalculateProgress(newData));
          });
          setToastMsg(`Main Task "${mjName}" berhasil dihapus.`);
        },
        onError: () => setToastMsg('Gagal menghapus Main Task dari server.'),
      });
    }
  };

  // Add Sub Task (Sub Main Job under Main Job)
  const handleSaveSubMainJob = (mjId: string, name: string, weight: number, mjDbId?: number) => {
    if (!projectData.id || !name) return;
    
    const cleanMainId = mjDbId || (mjId.startsWith('mj-') ? parseInt(mjId.replace('mj-', '')) : parseInt(mjId));
    router.post(`/projects/${projectData.id}/sub-wbs`, {
      main_wbs_id: cleanMainId,
      name: name,
      weight: weight,
    }, {
      preserveScroll: true,
      onSuccess: () => {
        setToastMsg(`Sub Task "${name}" berhasil ditambahkan.`);
        setShowAddSubMainJobModal(null);
      },
      onError: (errors) => {
        console.error('Error adding Sub Task:', errors);
        const errText = Object.values(errors).flat().join(', ');
        setToastMsg(`Gagal menambahkan Sub Task: ${errText || 'Periksa input Anda'}`);
      },
    });
  };

  // Delete Sub Task (Sub Main Job)
  const handleDeleteSubMainJob = (mjId: string, smjId: string, smjDbId: number | undefined, smjName: string) => {
    if (!confirm(`Hapus Sub Task "${smjName}" beserta seluruh task di dalamnya?`)) return;
    const targetDbId = smjDbId || (smjId.startsWith('smj-') ? smjId.replace('smj-', '') : smjId);
    if (projectData.id && targetDbId) {
      router.delete(`/projects/${projectData.id}/sub-wbs/${targetDbId}`, {
        preserveScroll: true,
        onSuccess: () => {
          setProjectData(prev => {
            const newData = { ...prev };
            newData.mainJobs = newData.mainJobs.map(mj => {
              if (mj.id !== mjId) return mj;
              return { ...mj, subMainJobs: mj.subMainJobs.filter(smj => smj.id !== smjId) };
            });
            return recalculateSchedule(recalculateProgress(newData));
          });
          setToastMsg(`Sub Task "${smjName}" berhasil dihapus.`);
        },
        onError: () => setToastMsg('Gagal menghapus Sub Task dari server.'),
      });
    }
  };

  // Add or Edit Sub-Subtask (Task)
  const handleSaveSubtask = (smjId: string, taskData: Partial<SubSubtask> & { smjDbId?: number; divisionId?: number; weight?: number }) => {
    if (!projectData.id || !taskData.name) return;
    
    const cleanSubWbsId = taskData.smjDbId || (smjId.startsWith('smj-') ? parseInt(smjId.replace('smj-', '')) : parseInt(smjId));
    const payload = {
      sub_wbs_id: cleanSubWbsId,
      name: taskData.name,
      weight: taskData.weight !== undefined ? Number(taskData.weight) : undefined,
      divisions_id: taskData.divisionId || null,
      duration: taskData.duration || 1,
      start: taskData.startDate || null,
      predecessor: taskData.predecessor || null,
      dep_type: taskData.depType || 'FS',
      lag: taskData.lag || 0,
    };

    if (taskData.id) {
      router.put(`/projects/${projectData.id}/tasks/${taskData.id}`, payload, {
        preserveScroll: true,
        onSuccess: () => {
          setProjectData(prev => {
            const newData = { ...prev };
            newData.mainJobs = newData.mainJobs.map(mj => ({
              ...mj,
              subMainJobs: mj.subMainJobs.map(smj => {
                if (smj.id !== smjId) return smj;
                return {
                  ...smj,
                  subtasks: smj.subtasks.map(st => {
                    if (st.id !== taskData.id) return st;
                    return {
                      ...st,
                      name: taskData.name || st.name,
                      weight: taskData.weight !== undefined ? Number(taskData.weight) : st.weight,
                    };
                  })
                };
              })
            }));
            return recalculateSchedule(recalculateProgress(newData));
          });
          setToastMsg(`Task "${taskData.name}" berhasil diperbarui.`);
          setShowAddTaskModal(null);
        },
        onError: (errors) => {
          console.error('Error updating task:', errors);
          const errText = Object.values(errors).flat().join(', ');
          setToastMsg(`Gagal memperbarui task: ${errText || 'Periksa input Anda'}`);
        },
      });
    } else {
      router.post(`/projects/${projectData.id}/tasks`, payload, {
        preserveScroll: true,
        onSuccess: () => {
          setToastMsg(`Task "${taskData.name}" berhasil ditambahkan.`);
          setShowAddTaskModal(null);
        },
        onError: (errors) => {
          console.error('Error adding task:', errors);
          const errText = Object.values(errors).flat().join(', ');
          setToastMsg(`Gagal menyimpan task: ${errText || 'Periksa input Anda'}`);
        },
      });
    }
  };

  const handleDeleteSubtask = (smjId: string, taskId: string, taskName: string) => {
    if (!confirm(`Hapus tugas "${taskName}"?`)) return;
    if (projectData.id && taskId) {
      router.delete(`/projects/${projectData.id}/tasks/${taskId}`, {
        preserveScroll: true,
        onSuccess: () => {
          setProjectData(prev => {
            const newData = { ...prev };
            newData.mainJobs = newData.mainJobs.map(mj => ({
              ...mj,
              subMainJobs: mj.subMainJobs.map(smj => {
                if (smj.id !== smjId) return smj;
                return { ...smj, subtasks: smj.subtasks.filter(st => st.id !== taskId) };
              })
            }));
            return recalculateSchedule(recalculateProgress(newData));
          });
          setToastMsg(`Task "${taskName}" berhasil dihapus.`);
        },
        onError: () => setToastMsg('Gagal menghapus task dari server.'),
      });
    }
  };

  // Checklist authorization:
  // - Admin (Utama & Progres): FALSE (strictly read-only)
  // - PIC: FALSE (PIC CANNOT check tasks, only manages and adds tasks)
  // - Worker: TRUE only if worker's division matches the task's division
  const isAuthorizedToCheck = (taskDivision: string) => {
    if (isAdmin || isPIC) return false;
    if (isWorker) {
      const workerDiv = (user?.division ?? pageProps?.division ?? '').trim().toLowerCase();
      const targetDiv = (taskDivision ?? '').trim().toLowerCase();
      return workerDiv !== '' && (workerDiv === targetDiv || targetDiv === 'general' || targetDiv === 'internal');
    }
    return false;
  };

  const handleCheck = (taskId: string, authorized: boolean, taskName: string) => {
    if (!authorized) {
      if (isAdmin) {
        setToastMsg('Aksi Dibatasi: Role Admin bersifat Read-Only dan tidak boleh mencentang tugas.');
      } else if (isPIC) {
        setToastMsg('Aksi Dibatasi: Role PIC hanya dapat menambah dan mengatur jadwal tugas. Eksekusi centang checklist hanya dapat dilakukan oleh Pekerja (Worker) divisi terkait.');
      } else if (isWorker) {
        setToastMsg(`Aksi Dibatasi: Anda terdaftar di divisi "${user?.division || pageProps?.division || 'Pekerja'}". Anda hanya berwenang mencentang tugas divisi Anda.`);
      } else {
        setToastMsg('Anda tidak memiliki izin mencentang tugas ini.');
      }
      return;
    }
    
    // Send toggle to backend
    if (projectData.id) {
      router.post(`/projects/${projectData.id}/tasks/${taskId}/toggle`, {}, {
        preserveScroll: true,
        preserveState: true,
      });
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
      
      return recalculateSchedule(recalculateProgress(newData));
    });
    
    const wasChecked = projectData.mainJobs.some(mj => mj.subMainJobs.some(smj => smj.subtasks.some(st => st.id === taskId && st.checked)));
    setToastMsg(wasChecked ? `Tugas "${taskName}" ditandai belum selesai.` : `Tugas "${taskName}" ditandai selesai ✓`);
  };

  const filteredMJs = projectData.mainJobs.map(mj => {
    if (!isWorker) return mj;
    const workerDiv = (user?.division ?? pageProps?.division ?? '').trim().toLowerCase();
    
    // Filter SMJs and STs to only show worker's own tasks
    const filteredSmjs = mj.subMainJobs.map(smj => {
      const filteredSts = smj.subtasks.filter(st => {
        const targetDiv = (st.division || smj.pic || '').trim().toLowerCase();
        return workerDiv !== '' && workerDiv === targetDiv;
      });
      return { ...smj, subtasks: filteredSts };
    }).filter(smj => smj.subtasks.length > 0);

    return { ...mj, subMainJobs: filteredSmjs };
  }).filter(mj => {
    if (isWorker && mj.subMainJobs.length === 0) return false;
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
        subtitle={`WBS 3-Tingkat: Main Job → Sub Task (Sub Main Job) → Task (${projectData.name || 'Project'})`}
        actions={
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-neutral-500 hidden sm:inline">
              Role: <strong className="text-neutral-800">{user?.displayRole || user?.role}</strong>
              {isAdmin && <span className="ml-1 text-warning font-semibold">(Read-Only)</span>}
              {isPIC && <span className="ml-1 text-emerald-600 font-semibold">(PIC - Kelola & Tambah Task)</span>}
              {isWorker && <span className="ml-1 text-blue-600 font-semibold">· Divisi: {user?.division || 'Internal'}</span>}
            </span>

            {isWorker && availableProjects.length > 1 && (
              <select
                className="bg-white border border-neutral-200 text-[12px] font-semibold text-neutral-800 rounded-md px-2 py-1"
                value={projectData.id?.replace('p-', '')}
                onChange={(e) => router.get(`/tasks?project_id=${e.target.value}`)}
              >
                {availableProjects.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            )}

            {isPIC && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowAddMainJobModal(true)}
                icon={Plus}
                className="text-[12px] h-[34px]"
              >
                Add Main Task
              </Button>
            )}
            
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

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari Main Job, Sub Task, atau Task…"
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
              <div
                onClick={() => toggleMJ(mj.id)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-neutral-50/70 transition-colors text-left cursor-pointer"
              >
                <div className="text-neutral-400 flex-shrink-0">
                  {expandedMJ[mj.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
                <div className="w-6 h-6 rounded bg-brand text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                  <span className="text-[10px] font-bold">{mj.code}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] sm:text-[16px] font-black text-neutral-900 truncate">{mj.name}</div>
                  <div className="text-[12.5px] text-neutral-600 font-bold hidden sm:block mt-0.5">
                    Bobot Main Job: {mj.weight}%
                  </div>
                </div>
                <div className="flex items-center gap-2.5 sm:gap-3 flex-shrink-0 ml-2">
                  <span className="text-[12px] font-semibold text-neutral-500 hidden sm:inline">
                    {mj.subMainJobs.length} Sub Tasks
                  </span>
                  <StatusBadge status={mj.status} size="sm" />
                  <div className="w-16 hidden md:block">
                    <ProgressBar value={mj.progress} size="xs" showLabel={false} />
                  </div>
                  <span className="text-[15px] sm:text-[16px] font-black text-neutral-900 w-12 text-right">{mj.progress}%</span>

                  {/* PIC can add Sub Task & delete Main Task */}
                  {isPIC && (
                    <div className="flex items-center gap-1.5 ml-1" onClick={e => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowAddSubMainJobModal({
                            mjId: mj.id,
                            mjDbId: (mj as any).dbId,
                            mjName: mj.name,
                          });
                        }}
                        className="py-1 px-2.5 text-[11px] h-7 bg-white hover:bg-neutral-50 border-neutral-300"
                        icon={Plus}
                      >
                        Add Sub Task
                      </Button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMainJob(mj.id, (mj as any).dbId, mj.name)}
                        className="p-1.5 text-neutral-400 hover:text-danger bg-white hover:bg-red-50 rounded border border-neutral-200 shadow-xs transition-colors"
                        title="Hapus Main Task"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Level 2: Sub Tasks (Sub Main Jobs) */}
              {expandedMJ[mj.id] && (
                <div className="border-t border-neutral-100 divide-y divide-neutral-100 bg-neutral-50/30">
                  {mj.subMainJobs.map(smj => (
                    <SubMainJobSection
                      key={smj.id}
                      smj={smj}
                      expanded={!!expandedSMJ[smj.id]}
                      onToggle={() => toggleSMJ(smj.id)}
                      isAuthorizedToCheck={isAuthorizedToCheck}
                      isPIC={isPIC}
                      isAdmin={isAdmin}
                      onOpenAddModal={() => {
                        setExpandedSMJ(p => ({ ...p, [smj.id]: true }));
                        setShowAddTaskModal({ smjId: smj.id, smjDbId: (smj as any).dbId, parentSmj: smj });
                      }}
                      onOpenEditModal={(task) => setShowAddTaskModal({ smjId: smj.id, smjDbId: (smj as any).dbId, parentSmj: smj, task })}
                      onDeleteSubMainJob={() => handleDeleteSubMainJob(mj.id, smj.id, (smj as any).dbId, smj.name)}
                      onDeleteTask={(taskId, taskName) => handleDeleteSubtask(smj.id, taskId, taskName)}
                      onCheck={handleCheck}
                    />
                  ))}
                  {mj.subMainJobs.length === 0 && (
                    <div className="px-10 py-3 text-[12px] text-neutral-400 italic">
                      Belum ada Sub Task. {isPIC && "Klik 'Add Sub Task' untuk menambahkan."}
                    </div>
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
                <tr className="text-[12px] font-bold text-neutral-600 uppercase tracking-wider">
                  <th className="px-4 py-3">WBS Code</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Bobot</th>
                  <th className="px-4 py-3">Divisi</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Progress</th>
                  <th className="px-4 py-3">Start Date</th>
                  <th className="px-4 py-3">Finish Date</th>
                  <th className="px-4 py-3 text-right">Dur</th>
                  <th className="px-4 py-3">Pred</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-[13px]">
                {filteredMJs.map(mj => (
                  <Fragment key={mj.id}>
                    {/* Main Job Row */}
                    <tr className="bg-brand/5 hover:bg-brand/10 transition-colors">
                      <td className="px-4 py-3 font-bold text-brand">{mj.code}</td>
                      <td className="px-4 py-3 font-bold text-neutral-900 text-[14px]">{mj.name}</td>
                      <td className="px-4 py-3 text-right font-black text-brand text-[13px]">{mj.weight}%</td>
                      <td className="px-4 py-3 text-neutral-500 font-medium">—</td>
                      <td className="px-4 py-3"><StatusBadge status={mj.status} size="sm" /></td>
                      <td className="px-4 py-3 text-right font-black text-brand text-[14px]">{mj.progress}%</td>
                      <td className="px-4 py-3 text-neutral-600 font-medium">{formatDateDisplay(mj.startDate)}</td>
                      <td className="px-4 py-3 text-neutral-600 font-medium">{formatDateDisplay(mj.finishDate)}</td>
                      <td className="px-4 py-3 text-right text-neutral-400">—</td>
                      <td className="px-4 py-3 text-neutral-400">—</td>
                    </tr>
                    
                    {/* Sub Main Job Rows */}
                    {mj.subMainJobs.map(smj => (
                      <Fragment key={smj.id}>
                        <tr className="bg-neutral-50 hover:bg-neutral-100/70 transition-colors">
                          <td className="px-4 py-2.5 pl-8 font-bold text-neutral-700">{smj.code}</td>
                          <td className="px-4 py-2.5 font-bold text-neutral-800 text-[13.5px]">{smj.name}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-neutral-800 text-[12.5px]">{smj.weight}%</td>
                          <td className="px-4 py-2.5">
                            <span className="px-2 py-0.5 bg-white border border-neutral-200 rounded text-[11px] font-bold text-neutral-600">
                              {smj.pic}
                            </span>
                          </td>
                          <td className="px-4 py-2.5"><StatusBadge status={smj.status} size="xs" /></td>
                          <td className="px-4 py-2.5 text-right font-black text-neutral-800 text-[13px]">{smj.progress}%</td>
                          <td className="px-4 py-2.5 text-neutral-600 font-medium">{formatDateDisplay(smj.startDate)}</td>
                          <td className="px-4 py-2.5 text-neutral-600 font-medium">{formatDateDisplay(smj.finishDate)}</td>
                          <td className="px-4 py-2.5 text-right text-neutral-400">—</td>
                          <td className="px-4 py-2.5 text-neutral-400">—</td>
                        </tr>
                        
                        {/* Sub-Subtask Rows */}
                        {smj.subtasks.map(st => (
                          <tr key={st.id} className="hover:bg-neutral-50/50 transition-colors">
                            <td className="px-4 py-2 pl-12 font-mono text-[12px] text-neutral-500 font-semibold">{st.code}</td>
                            <td className="px-4 py-2 text-neutral-800 font-medium flex items-center gap-2">
                              {st.checked && <CheckSquare size={14} className="text-success" />}
                              <span className={st.checked ? 'line-through text-neutral-400' : 'text-neutral-900 font-medium'}>{st.name}</span>
                            </td>
                            <td className="px-4 py-2 text-right font-bold text-blue-700 text-[12px]">{st.weight ?? 100}%</td>
                            <td className="px-4 py-2 text-neutral-600 text-[11.5px]">{st.division || smj.pic}</td>
                            <td className="px-4 py-2"><StatusBadge status={st.checked ? 'Completed' : st.status} size="xs" /></td>
                            <td className="px-4 py-2 text-right font-bold text-neutral-800 text-[13px]">
                              {st.checked ? '100' : st.progress}%
                            </td>
                            <td className="px-4 py-2 text-neutral-600">{formatDateDisplay(st.startDate)}</td>
                            <td className="px-4 py-2 text-neutral-600">{formatDateDisplay(st.finishDate)}</td>
                            <td className="px-4 py-2 text-right text-neutral-600">{st.duration}d</td>
                            <td className="px-4 py-2 font-mono text-[11.5px] text-neutral-500">
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

      {/* Modal Add Main Task (Main Job) */}
      {showAddMainJobModal && (
        <AddMainTaskModal
          onClose={() => setShowAddMainJobModal(false)}
          onSave={handleSaveMainJob}
        />
      )}

      {/* Modal Add Sub Task (Sub Main Job under Main Job) */}
      {showAddSubMainJobModal && (
        <AddSubMainJobModal
          mjName={showAddSubMainJobModal.mjName}
          onClose={() => setShowAddSubMainJobModal(null)}
          onSave={(name, weight) => handleSaveSubMainJob(showAddSubMainJobModal.mjId, name, weight, showAddSubMainJobModal.mjDbId)}
        />
      )}

      {/* Modal Add / Edit Task (Sub-Subtask) */}
      {showAddTaskModal && (
        <AddSubtaskModal
          smjId={showAddTaskModal.smjId}
          smjDbId={showAddTaskModal.smjDbId}
          parentSmj={showAddTaskModal.parentSmj}
          divisions={divisions}
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
  smj, expanded, onToggle, isAuthorizedToCheck, isPIC, isAdmin, onOpenAddModal, onOpenEditModal, onDeleteSubMainJob, onDeleteTask, onCheck
}: {
  smj: SubMainJob;
  expanded: boolean;
  onToggle: () => void;
  isAuthorizedToCheck: (taskDivisi: string) => boolean;
  isPIC: boolean;
  isAdmin: boolean;
  onOpenAddModal: () => void;
  onOpenEditModal: (task: SubSubtask) => void;
  onDeleteSubMainJob: () => void;
  onDeleteTask: (taskId: string, taskName: string) => void;
  onCheck: (id: string, auth: boolean, name: string) => void;
}) {
  return (
    <div className="transition-colors">
      <div className="flex items-center gap-3 pl-6 sm:pl-9 pr-4 py-3 hover:bg-neutral-50/80">
        <button onClick={onToggle} className="text-neutral-400 hover:text-neutral-600 flex-shrink-0">
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <div className="w-5 h-5 rounded bg-neutral-200/80 flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-bold text-neutral-700">{smj.code}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] sm:text-[15px] font-bold text-neutral-900 truncate">{smj.name}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[12px] text-neutral-600 font-semibold">Sub Task (Sub Main Job) · Bobot: {smj.weight}%</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <StatusBadge status={smj.status} size="sm" />
          <span className="text-[13px] sm:text-[14px] font-black text-neutral-800 w-10 text-right">{smj.progress}%</span>
          
          {/* Only PIC can add tasks / delete sub tasks */}
          {isPIC && (
            <div className="flex items-center gap-1.5 ml-1">
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenAddModal}
                className="py-1 px-2.5 text-[11px] h-7 bg-white hover:bg-neutral-50 border-neutral-300"
                icon={Plus}
              >
                Add Task
              </Button>
              <button
                type="button"
                onClick={onDeleteSubMainJob}
                className="p-1.5 text-neutral-400 hover:text-danger bg-white hover:bg-red-50 rounded border border-neutral-200 shadow-xs transition-colors"
                title="Hapus Sub Task"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Level 3: Sub-Subtasks (Tasks) */}
      {expanded && (
        <div className="pl-12 sm:pl-16 pr-4 pb-3 pt-1 space-y-2">
          {smj.subtasks.length === 0 ? (
            <div className="py-2 text-[12.5px] text-neutral-400 italic">
              Belum ada Task.{isPIC && " Klik 'Add Task' untuk menambahkan pekerjaan."}
            </div>
          ) : (
            smj.subtasks.map(st => {
              const authorized = isAuthorizedToCheck(st.division || smj.pic);
              return (
                <SubtaskRow
                  key={st.id}
                  st={st}
                  divisi={st.division || smj.pic}
                  isChecked={st.checked}
                  canCheck={authorized}
                  canEdit={isPIC}
                  onCheck={() => onCheck(st.id, authorized, st.name)}
                  onEdit={() => onOpenEditModal(st)}
                  onDelete={() => onDeleteTask(st.id, st.name)}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function SubtaskRow({ st, divisi, isChecked, canCheck, canEdit, onCheck, onEdit, onDelete }: {
  st: SubSubtask;
  divisi: string;
  isChecked: boolean;
  canCheck: boolean;
  canEdit: boolean;
  onCheck: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group flex items-start sm:items-center gap-3 p-3 rounded-lg border transition-all ${
        isChecked
          ? 'bg-success-light/40 border-success/30'
          : 'bg-white border-neutral-200/80 hover:border-neutral-300 shadow-xs'
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={onCheck}
        aria-label={`Toggle checklist for ${st.name}`}
        className={`mt-0.5 sm:mt-0 flex-shrink-0 transition-transform active:scale-90 ${
          canCheck ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
        }`}
      >
        {isChecked ? (
          <CheckSquare size={19} className="text-success" />
        ) : (
          <Square size={19} className="text-neutral-300 hover:text-neutral-500" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-bold text-neutral-500 font-mono">{st.code}</span>
          <span className={`text-[13.5px] sm:text-[14.5px] font-semibold ${isChecked ? 'line-through text-neutral-400' : 'text-neutral-900'}`}>
            {st.name}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-bold">
            Bobot {st.weight ?? 100}%
          </span>
          {!canCheck && <Lock size={12} className="text-neutral-300" title="Anda tidak berhak mengubah tugas ini" />}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1.5 text-[11.5px] text-neutral-500">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-100 border border-neutral-200 text-[11px] font-semibold text-neutral-700">
            <Shield size={10} />
            Divisi: {divisi}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-neutral-700 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-200">
            <Calendar size={12} className="text-brand" />
            Jadwal: {formatDateDisplay(st.startDate)} s/d {formatDateDisplay(st.finishDate)}
          </span>
          <span className="text-neutral-600 font-medium">Durasi: {st.duration} hari</span>
          {st.daysLeft !== undefined && st.daysLeft > 0 && !isChecked && (
            <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[11px]">
              Sisa {st.daysLeft} hari
            </span>
          )}
          {st.predecessor && (
            <span className="font-medium text-neutral-600">
              Pred: {st.predecessor} ({st.depType || 'FS'}{st.lag ? ` +${st.lag}d` : ''})
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5 flex-shrink-0 self-end sm:self-center">
        <StatusBadge status={isChecked ? 'Completed' : st.status} size="sm" />
        <span className="text-[13px] sm:text-[14px] font-bold text-neutral-800 w-10 text-right">
          {isChecked ? 100 : st.progress}%
        </span>
        {/* Edit / Delete: PIC only */}
        {canEdit && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
            <button onClick={onEdit} className="p-1.5 text-neutral-500 hover:text-brand bg-white hover:bg-neutral-50 rounded border border-neutral-200 shadow-xs" title="Edit Task (Nama & Bobot)">
              <Edit2 size={14} />
            </button>
            <button onClick={onDelete} className="p-1.5 text-neutral-500 hover:text-danger bg-white hover:bg-neutral-50 rounded border border-neutral-200 shadow-xs" title="Delete Task">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AddSubMainJobModal({ mjName, onClose, onSave }: { mjName: string; onClose: () => void; onSave: (name: string, weight: number) => void }) {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('10');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim(), parseFloat(weight) || 10);
  };

  return (
    <Modal
      title="Tambah Sub Task Baru (Sub Main Job)"
      subtitle={`Di bawah kelompok WBS: ${mjName}`}
      onClose={onClose}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[12px] font-bold text-neutral-700 mb-1">
            Nama Sub Task <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Contoh: REVIEW DOKUMEN & PERIZINAN"
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 bg-white"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-[12px] font-bold text-neutral-700 mb-1">
            Bobot Pekerjaan (%)
          </label>
          <input
            type="number"
            min="1"
            max="100"
            value={weight}
            onChange={e => setWeight(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" size="sm" type="submit">
            Simpan Sub Task
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AddMainTaskModal({ onClose, onSave }: { onClose: () => void; onSave: (name: string, weight: number, start?: string, end?: string) => void }) {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('5');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim(), parseFloat(weight) || 5, startDate, endDate);
  };

  return (
    <Modal
      title="Tambah Main Task Baru (Kelompok Utama WBS)"
      subtitle="Menambahkan kelompok pekerjaan tingkat 1 ke proyek"
      onClose={onClose}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[12px] font-bold text-neutral-700 mb-1">
            Nama Main Task <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Contoh: COMMISSIONING & HANDOVER"
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 bg-white"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-[12px] font-bold text-neutral-700 mb-1">
            Bobot Pekerjaan (%)
          </label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={weight}
            onChange={e => setWeight(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Tanggal Mulai</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
            />
          </div>
          <div>
            <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Tanggal Selesai</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" size="sm" type="submit">
            Simpan Main Task
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AddSubtaskModal({
  smjId,
  smjDbId,
  parentSmj,
  divisions,
  onClose,
  onSave,
  initialData
}: {
  smjId: string;
  smjDbId?: number;
  parentSmj?: SubMainJob;
  divisions: { id: number; divisi: string }[];
  onClose: () => void;
  onSave: (taskData: Partial<SubSubtask> & { smjDbId?: number; divisionId?: number }) => void;
  initialData?: SubSubtask;
}) {
  const [name, setName] = useState(initialData?.name || '');
  const [startDate, setStartDate] = useState(initialData?.startDate || new Date().toISOString().slice(0, 10));
  const [duration, setDuration] = useState(initialData?.duration?.toString() || '5');
  const [divisionId, setDivisionId] = useState<string>(divisions[0]?.id?.toString() || '');
  const [predecessor, setPredecessor] = useState(initialData?.predecessor || '');
  const [depType, setDepType] = useState<DependencyType>(initialData?.depType || 'FS');
  const [lag, setLag] = useState(initialData?.lag?.toString() || '0');

  // Calculate sibling task weights
  const otherTasksWeight = parentSmj?.subtasks
    ? parentSmj.subtasks
        .filter(t => t.id !== initialData?.id)
        .reduce((sum, t) => sum + (Number(t.weight) || 0), 0)
    : 0;

  const defaultWeight = initialData?.weight !== undefined
    ? initialData.weight.toString()
    : (Math.max(0, Math.round((100 - otherTasksWeight) * 100) / 100) || 10).toString();

  const [weight, setWeight] = useState(defaultWeight);

  const currentWeightNum = parseFloat(weight) || 0;
  const totalWeight = Math.round((otherTasksWeight + currentWeightNum) * 100) / 100;
  const isOverWeight = totalWeight > 100;
  const isUnderWeight = totalWeight < 100;
  const isExactWeight = totalWeight === 100;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (isOverWeight) return; // Strict validation: cannot save if > 100%
    if (currentWeightNum <= 0) return;

    onSave({
      id: initialData?.id,
      smjDbId,
      name,
      weight: currentWeightNum,
      divisionId: divisionId ? parseInt(divisionId) : undefined,
      startDate,
      duration: parseInt(duration) || 1,
      predecessor,
      depType,
      lag: parseInt(lag) || 0
    });
  };

  return (
    <Modal
      title={initialData ? "Edit Task (Nama & Bobot)" : "Tambah Task Baru (Sub-Subtask)"}
      subtitle={initialData ? `Mengedit: ${initialData.code} — ${initialData.name}` : "Tambahkan rincian pekerjaan spesifik proyek"}
      onClose={onClose}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">
            Deskripsi Task <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Persiapan dan review dokumen vendor..."
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 bg-white font-medium"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">
              Bobot Task (%) <span className="text-danger">*</span>
            </label>
            <input
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              required
              value={weight}
              onChange={e => setWeight(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border text-[13px] outline-none bg-white font-bold transition-all ${
                isOverWeight
                  ? 'border-danger focus:border-danger ring-2 ring-danger/15 text-danger'
                  : 'border-neutral-200 focus:border-brand text-neutral-900'
              }`}
            />
            <span className="text-[10.5px] text-neutral-400 mt-1 block">
              Bobot task lain di Sub Task ini: {Math.round(otherTasksWeight * 100) / 100}%
            </span>
          </div>

          <div>
            <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Divisi Penanggung Jawab</label>
            <select
              value={divisionId}
              onChange={e => setDivisionId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
            >
              {divisions.map(d => (
                <option key={d.id} value={d.id}>{d.divisi}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Real-time Weight Indicator */}
        {isOverWeight && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-danger text-[12px] flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle size={17} className="flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Total bobot task melebihi 100% (saat ini {totalWeight}%).</span>
              <p className="text-[11px] text-red-600 mt-0.5">Sesuaikan bobot task sebelum menyimpan.</p>
            </div>
          </div>
        )}

        {isUnderWeight && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[12px] flex items-start gap-2.5">
            <AlertTriangle size={17} className="flex-shrink-0 mt-0.5 text-amber-600" />
            <div>
              <span className="font-bold">Total bobot saat ini {totalWeight}%.</span>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Sisa {Math.round((100 - totalWeight) * 100) / 100}% belum teralokasi. Anda tetap dapat menyimpan jika task lain akan diinput berikutnya.
              </p>
            </div>
          </div>
        )}

        {isExactWeight && (
          <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-[12px] flex items-center gap-2.5">
            <CheckCircle2 size={17} className="flex-shrink-0 text-success" />
            <span className="font-bold">Total alokasi bobot pas 100%.</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Durasi (Hari)</label>
            <input
              type="number"
              min="1"
              value={duration}
              onChange={e => setDuration(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
            />
          </div>
          <div>
            <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Tanggal Mulai</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Predecessor</label>
            <input
              placeholder="e.g. 1.1.1"
              value={predecessor}
              onChange={e => setPredecessor(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
            />
          </div>
          <div>
            <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Tipe Dependensi</label>
            <select
              value={depType}
              onChange={e => setDepType(e.target.value as DependencyType)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
            >
              <option value="FS">Finish-to-Start (FS)</option>
              <option value="SS">Start-to-Start (SS)</option>
              <option value="FF">Finish-to-Finish (FF)</option>
              <option value="SF">Start-to-Finish (SF)</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            disabled={isOverWeight || currentWeightNum <= 0}
            className={isOverWeight ? 'opacity-50 cursor-not-allowed' : ''}
          >
            Simpan Task
          </Button>
        </div>
      </form>
    </Modal>
  );
}
