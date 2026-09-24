import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { usePage, router } from '@inertiajs/react';
import {
  Plus, Search, ChevronDown, ChevronRight, Lock, CheckSquare, Square,
  Shield, Calendar, Layers, Info, Trash2, Edit2, ListTodo, TableProperties,
  Download, AlertCircle, AlertTriangle, CheckCircle2, Clock, UploadCloud,
  FileText, Sparkles, X, Eye, CalendarDays, Sliders, Paperclip
} from 'lucide-react';
import { Project, PROJECT, MainJob, SubMainJob, SubSubtask, Status, DependencyType } from '@/data/mockData';
import { recalculateSchedule } from '@/utils/scheduleEngine';
import { recalculateProgress } from '@/utils/progressEngine';
import { exportToCSV } from '@/utils/exportEngine';
import { StatusBadge, ProgressBar, PageHeader, Card, Button, Modal, Toast, EmptyState, formatDateDisplay, formatDivisionName } from '@/components/ui';
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
  
  // Modals & Enhanced Features State
  const [showMainJobModal, setShowMainJobModal] = useState<{
    mode: 'create' | 'edit';
    id?: string;
    dbId?: number;
    name?: string;
    weight?: number;
    startDate?: string;
    finishDate?: string;
  } | null>(null);
  const [showAddTaskModal, setShowAddTaskModal] = useState<{ smjId: string; smjDbId?: number; parentSmj?: SubMainJob; task?: SubSubtask } | null>(null);
  const [showAddSubMainJobModal, setShowAddSubMainJobModal] = useState<{ mjId: string; mjDbId?: number; mjName: string; parentWeight?: number; currentSubCount?: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [uncheckConfirm, setUncheckConfirm] = useState<{
    taskId: string;
    taskName: string;
    prevProgress?: number;
  } | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<{
    name: string;
    url?: string;
    size?: string;
  } | null>(null);
  const [todaySectionOpen, setTodaySectionOpen] = useState(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Dynamic Today's Tasks
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const todayTasks = useMemo(() => {
    const list: Array<{
      st: SubSubtask;
      parentSmj: SubMainJob;
      parentMj: MainJob;
      timingStatus: 'active' | 'starting' | 'due' | 'overdue';
    }> = [];

    projectData.mainJobs.forEach(mj => {
      mj.subMainJobs.forEach(smj => {
        smj.subtasks.forEach(st => {
          if (!st.startDate && !st.finishDate) return;
          const start = st.startDate || '';
          const end = st.finishDate || st.startDate || '';
          const isDone = st.checked || st.progress >= 100;

          if (end < todayStr && !isDone) {
            list.push({ st, parentSmj: smj, parentMj: mj, timingStatus: 'overdue' });
          } else if (end === todayStr) {
            list.push({ st, parentSmj: smj, parentMj: mj, timingStatus: 'due' });
          } else if (start === todayStr) {
            list.push({ st, parentSmj: smj, parentMj: mj, timingStatus: 'starting' });
          } else if (start <= todayStr && end >= todayStr) {
            list.push({ st, parentSmj: smj, parentMj: mj, timingStatus: 'active' });
          }
        });
      });
    });

    return list;
  }, [projectData, todayStr]);

  const toggleMJ = (id: string) => setExpandedMJ(p => ({ ...p, [id]: !p[id] }));
  const toggleSMJ = (id: string) => setExpandedSMJ(p => ({ ...p, [id]: !p[id] }));

  // Add / Edit Main Task (Main Job / Level 1 WBS)
  const handleSaveMainJob = (name: string, weight: number, start?: string, end?: string, targetId?: string, targetDbId?: number) => {
    if (!projectData.id || !name) return;

    if (targetId) {
      const cleanDbId = targetDbId || (targetId.startsWith('mj-') ? parseInt(targetId.replace('mj-', '')) : parseInt(targetId));
      router.put(`/projects/${projectData.id}/main-wbs/${cleanDbId}`, {
        name,
        weight,
        start: start || null,
        end: end || null,
      }, {
        preserveScroll: true,
        onSuccess: () => {
          setToastMsg(`Main Task "${name}" updated successfully.`);
          setShowMainJobModal(null);
        },
        onError: (errors) => {
          console.error('Error updating Main Task:', errors);
          const errText = Object.values(errors).flat().join(', ');
          setToastMsg(`Failed to update Main Task: ${errText || 'Please check your input'}`);
        },
      });
    } else {
      router.post(`/projects/${projectData.id}/main-wbs`, {
        name,
        weight,
        start: start || null,
        end: end || null,
      }, {
        preserveScroll: true,
        onSuccess: () => {
          setToastMsg(`Main Task "${name}" added successfully.`);
          setShowMainJobModal(null);
        },
        onError: (errors) => {
          console.error('Error adding Main Task:', errors);
          const errText = Object.values(errors).flat().join(', ');
          setToastMsg(`Failed to add Main Task: ${errText || 'Please check your input'}`);
        },
      });
    }
  };

  // Delete Main Task (Main Job)
  const handleDeleteMainJob = (mjId: string, mjDbId: number | undefined, mjName: string) => {
    setDeleteConfirm({
      title: 'Delete Main Task',
      message: `Delete Main Task "${mjName}" along with all its Sub Tasks and task items?`,
      onConfirm: () => {
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
              setToastMsg(`Main Task "${mjName}" deleted successfully.`);
            },
            onError: () => setToastMsg('Failed to delete Main Task from server.'),
          });
        }
      },
    });
  };

  // Add Sub Task (Sub Main Job under Main Job)
  const handleSaveSubMainJob = (mjId: string, name: string, mjDbId?: number) => {
    if (!projectData.id || !name) return;

    const cleanMainId = mjDbId || (mjId.startsWith('mj-') ? parseInt(mjId.replace('mj-', '')) : parseInt(mjId));
    router.post(`/projects/${projectData.id}/sub-wbs`, {
      main_wbs_id: cleanMainId,
      name: name,
    }, {
      preserveScroll: true,
      onSuccess: () => {
        setToastMsg(`Sub Task "${name}" added successfully.`);
        setShowAddSubMainJobModal(null);
      },
      onError: (errors) => {
        console.error('Error adding Sub Task:', errors);
        const errText = Object.values(errors).flat().join(', ');
        setToastMsg(`Failed to add Sub Task: ${errText || 'Please check your input'}`);
      },
    });
  };

  // Delete Sub Task (Sub Main Job)
  const handleDeleteSubMainJob = (mjId: string, smjId: string, smjDbId: number | undefined, smjName: string) => {
    setDeleteConfirm({
      title: 'Delete Sub Task',
      message: `Delete Sub Task "${smjName}" along with all tasks inside it?`,
      onConfirm: () => {
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
              setToastMsg(`Sub Task "${smjName}" deleted successfully.`);
            },
            onError: () => setToastMsg('Failed to delete Sub Task from server.'),
          });
        }
      },
    });
  };

  // Add or Edit Sub-Subtask (Task)
  const handleSaveSubtask = (smjId: string, taskData: Partial<SubSubtask> & { smjDbId?: number; divisionId?: number }) => {
    if (!projectData.id || !taskData.name) return;

    const cleanSubWbsId = taskData.smjDbId || (smjId.startsWith('smj-') ? parseInt(smjId.replace('smj-', '')) : parseInt(smjId));
    const payload = {
      sub_wbs_id: cleanSubWbsId,
      name: taskData.name,
      divisions_id: taskData.divisionId || null,
      duration: taskData.duration || 1,
      start: taskData.startDate || null,
      predecessor: taskData.predecessor || null,
      dep_type: taskData.depType || 'FS',
      lag: taskData.lag || 0,
      weight: taskData.weight !== undefined ? taskData.weight : 100,
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
                      weight: taskData.weight !== undefined ? taskData.weight : st.weight,
                      duration: taskData.duration ?? st.duration,
                      startDate: taskData.startDate ?? st.startDate,
                      predecessor: taskData.predecessor !== undefined ? taskData.predecessor : st.predecessor,
                      depType: taskData.depType || st.depType,
                      lag: taskData.lag ?? st.lag,
                      lead: taskData.lead ?? st.lead,
                      evidence: taskData.evidence ?? st.evidence,
                    };
                  })
                };
              })
            }));
            return recalculateSchedule(recalculateProgress(newData));
          });
          setToastMsg(`Task "${taskData.name}" updated successfully.`);
          setShowAddTaskModal(null);
        },
        onError: (errors) => {
          console.error('Error updating task:', errors);
          const errText = Object.values(errors).flat().join(', ');
          setToastMsg(`Failed to update task: ${errText || 'Please check your input'}`);
        },
      });
    } else {
      router.post(`/projects/${projectData.id}/tasks`, payload, {
        preserveScroll: true,
        onSuccess: () => {
          setProjectData(prev => {
            const newData = { ...prev };
            const newTaskId = `st-custom-${Date.now()}`;
            const targetSmj = newData.mainJobs.flatMap(m => m.subMainJobs).find(s => s.id === smjId);
            const nextIndex = (targetSmj?.subtasks?.length || 0) + 1;
            const generatedCode = targetSmj ? `${targetSmj.code}.${nextIndex}` : `1.1.${nextIndex}`;

            newData.mainJobs = newData.mainJobs.map(mj => ({
              ...mj,
              subMainJobs: mj.subMainJobs.map(smj => {
                if (smj.id !== smjId) return smj;
                const newSubtask: SubSubtask = {
                  id: newTaskId,
                  code: generatedCode,
                  name: taskData.name!,
                  weight: taskData.weight !== undefined ? taskData.weight : 100,
                  division: divisions.find(d => d.id === taskData.divisionId)?.divisi || smj.pic,
                  duration: taskData.duration || 1,
                  startDate: taskData.startDate || new Date().toISOString().slice(0, 10),
                  finishDate: taskData.startDate || new Date().toISOString().slice(0, 10),
                  daysLeft: taskData.duration || 1,
                  progress: 0,
                  status: 'Open',
                  predecessor: taskData.predecessor,
                  depType: taskData.depType || 'FS',
                  lag: taskData.lag || 0,
                  lead: taskData.lead || 0,
                  evidence: taskData.evidence,
                  checked: false,
                };
                return {
                  ...smj,
                  subtasks: [...smj.subtasks, newSubtask]
                };
              })
            }));
            return recalculateSchedule(recalculateProgress(newData));
          });
          setToastMsg(`Task "${taskData.name}" added successfully.`);
          setShowAddTaskModal(null);
        },
        onError: (errors) => {
          console.error('Error adding task:', errors);
          const errText = Object.values(errors).flat().join(', ');
          setToastMsg(`Failed to save task: ${errText || 'Please check your input'}`);
        },
      });
    }
  };

  const handleDeleteSubtask = (smjId: string, taskId: string, taskName: string) => {
    setDeleteConfirm({
      title: 'Delete Task',
      message: `Delete task "${taskName}"?`,
      onConfirm: () => {
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
              setToastMsg(`Task "${taskName}" successfully deleted.`);
            },
            onError: () => setToastMsg('Failed to delete task from server.'),
          });
        }
      },
    });
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

  // Continuous Progress Slider Update (0–100%)
  const handleProgressChange = (taskId: string, newProgress: number, authorized: boolean, taskName: string) => {
    if (!authorized) {
      if (isAdmin) {
        setToastMsg('Action Restricted: Admin role is Read-Only.');
      } else if (isPIC) {
        setToastMsg('Action Restricted: Progress slider can only be updated by workers of the assigned division.');
      } else {
        setToastMsg('You do not have permission to update progress for this task.');
      }
      return;
    }

    const clamped = Math.max(0, Math.min(100, Math.round(newProgress)));
    const isCompleted = clamped === 100;

    setProjectData(prev => {
      const newData = { ...prev };
      newData.mainJobs = newData.mainJobs.map(mj => ({
        ...mj,
        subMainJobs: mj.subMainJobs.map(smj => ({
          ...smj,
          subtasks: smj.subtasks.map(st => {
            if (st.id === taskId) {
              const prev = st.progress < 100 ? st.progress : (st.prevProgress || 0);
              return {
                ...st,
                progress: clamped,
                checked: isCompleted,
                prevProgress: prev,
              };
            }
            return st;
          })
        }))
      }));
      return recalculateSchedule(recalculateProgress(newData));
    });

    if (clamped === 100) {
      setToastMsg(`Task "${taskName}" marked as completed (100%) ✓`);
      if (projectData.id) {
        router.post(`/projects/${projectData.id}/tasks/${taskId}/toggle`, {}, {
          preserveScroll: true,
          preserveState: true,
        });
      }
    }
  };

  // Checkbox toggle with Uncheck Confirmation Modal
  const handleCheck = (taskId: string, authorized: boolean, taskName: string) => {
    if (!authorized) {
      if (isAdmin) {
        setToastMsg('Action Restricted: Admin role is Read-Only and cannot check off tasks.');
      } else if (isPIC) {
        setToastMsg('Action Restricted: PICs can only add and schedule tasks. Completing the checklist can only be performed by workers of the assigned division.');
      } else if (isWorker) {
        setToastMsg(`Action Restricted: You are assigned to the "${user?.division || pageProps?.division || 'Worker'}" division. You may only check tasks assigned to your division.`);
      } else {
        setToastMsg('You do not have permission to check this task.');
      }
      return;
    }

    // Find current task state
    let currentTask: SubSubtask | undefined;
    for (const mj of projectData.mainJobs) {
      for (const smj of mj.subMainJobs) {
        const found = smj.subtasks.find(st => st.id === taskId);
        if (found) {
          currentTask = found;
          break;
        }
      }
      if (currentTask) break;
    }

    if (!currentTask) return;

    // Requirement 3: If already completed/checked, show confirmation modal to prevent accidental uncheck!
    if (currentTask.checked || currentTask.progress >= 100) {
      setUncheckConfirm({
        taskId,
        taskName,
        prevProgress: currentTask.prevProgress,
      });
      return;
    }

    // If incomplete, mark completed (100%)
    handleProgressChange(taskId, 100, true, taskName);
  };

  const confirmUncheck = () => {
    if (!uncheckConfirm) return;
    const { taskId, taskName, prevProgress } = uncheckConfirm;
    const revertProgress = (prevProgress !== undefined && prevProgress < 100) ? prevProgress : 0;

    setProjectData(prev => {
      const newData = { ...prev };
      newData.mainJobs = newData.mainJobs.map(mj => ({
        ...mj,
        subMainJobs: mj.subMainJobs.map(smj => ({
          ...smj,
          subtasks: smj.subtasks.map(st => {
            if (st.id === taskId) {
              return {
                ...st,
                progress: revertProgress,
                checked: false,
              };
            }
            return st;
          })
        }))
      }));
      return recalculateSchedule(recalculateProgress(newData));
    });

    if (projectData.id) {
      router.post(`/projects/${projectData.id}/tasks/${taskId}/toggle`, {}, {
        preserveScroll: true,
        preserveState: true,
      });
    }

    setToastMsg(`Task "${taskName}" marked as incomplete.`);
    setUncheckConfirm(null);
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
        subtitle={`3-Tier WBS: Main Job → Sub Task (Sub Main Job) → Task (${projectData.name || 'Project'})`}
        actions={
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-neutral-500 hidden sm:inline">
              Role: <strong className="text-neutral-800">{user?.displayRole || user?.role}</strong>
              {isAdmin && <span className="ml-1 text-warning font-semibold">(Read-Only)</span>}
              {isPIC && <span className="ml-1 text-emerald-600 font-semibold">(PIC - Manage & Add Tasks)</span>}
              {isWorker && <span className="ml-1 text-blue-600 font-semibold">· Division: {user?.division || 'Internal'}</span>}
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
                onClick={() => setShowMainJobModal({ mode: 'create' })}
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
            placeholder="Search Main Job, Sub Task, or Task…"
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

      {/* Today's Tasks Section (Requirement 9) */}
      <div className="bg-gradient-to-r from-blue-50/70 via-white to-indigo-50/70 rounded-2xl border-2 border-brand/20 p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand text-white flex items-center justify-center shadow-xs">
              <CalendarDays size={18} />
            </div>
            <div>
              <h2 className="text-[16px] font-black text-neutral-900 flex items-center gap-2">
                Today's Tasks
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-brand text-white">
                  {todayTasks.length}
                </span>
              </h2>
              <p className="text-[12px] text-neutral-500 font-medium">
                Active or scheduled tasks for today ({new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setTodaySectionOpen(!todaySectionOpen)}
            className="text-[12px] font-bold text-brand hover:underline flex items-center gap-1"
          >
            {todaySectionOpen ? 'Collapse' : 'Expand'}
            <ChevronDown size={14} className={`transform transition-transform ${todaySectionOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {todaySectionOpen && (
          <div>
            {todayTasks.length === 0 ? (
              <div className="p-4 rounded-xl bg-white border border-neutral-200/80 text-center text-neutral-500 text-[12.5px]">
                <CheckCircle2 size={24} className="mx-auto text-emerald-500 mb-1.5" />
                <p className="font-bold text-neutral-800">No tasks scheduled for today</p>
                <p className="text-[11.5px] text-neutral-400 mt-0.5">All active project tasks are on schedule. Explore the WBS hierarchy below for upcoming items.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {todayTasks.map(({ st, parentSmj, timingStatus }) => {
                  const authorized = isAuthorizedToCheck(st.division || parentSmj.pic);
                  return (
                    <TodayTaskCard
                      key={st.id}
                      st={st}
                      parentSmj={parentSmj}
                      timingStatus={timingStatus}
                      canCheck={authorized}
                      onCheck={() => handleCheck(st.id, authorized, st.name)}
                      onProgressChange={(val) => handleProgressChange(st.id, val, authorized, st.name)}
                      onOpenEvidence={(ev) => setEvidencePreview(ev)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
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
                    Main Job Weight: {mj.weight}%
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

                  {/* PIC can add Sub Task, edit Main Task & delete Main Task */}
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
                            parentWeight: mj.weight,
                            currentSubCount: mj.subMainJobs.length,
                          });
                        }}
                        className="py-1 px-2.5 text-[11px] h-7 bg-white hover:bg-neutral-50 border-neutral-300"
                        icon={Plus}
                      >
                        Add Sub Task
                      </Button>
                      <button
                        type="button"
                        onClick={() => setShowMainJobModal({
                          mode: 'edit',
                          id: mj.id,
                          dbId: (mj as any).dbId,
                          name: mj.name,
                          weight: mj.weight,
                          startDate: mj.startDate,
                          finishDate: mj.finishDate
                        })}
                        className="p-1.5 text-neutral-400 hover:text-brand bg-white hover:bg-neutral-50 rounded border border-neutral-200 shadow-xs transition-colors"
                        title="Edit Main Task (Name & Weight)"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMainJob(mj.id, (mj as any).dbId, mj.name)}
                        className="p-1.5 text-neutral-400 hover:text-danger bg-white hover:bg-red-50 rounded border border-neutral-200 shadow-xs transition-colors"
                        title="Delete Main Task"
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
                      onProgressChange={handleProgressChange}
                      onOpenEvidence={(ev) => setEvidencePreview(ev)}
                    />
                  ))}
                  {mj.subMainJobs.length === 0 && (
                    <div className="px-10 py-3 text-[12px] text-neutral-400 italic">
                      No Sub Tasks yet. {isPIC && "Click 'Add Sub Task' to create one."}
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
                  <th className="px-4 py-3 text-right">Weight</th>
                  <th className="px-4 py-3">Division</th>
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
                              {formatDivisionName(smj.pic)}
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
                            <td className="px-4 py-2 text-neutral-600 text-[11.5px]">{formatDivisionName(st.division || smj.pic)}</td>
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

      {/* Modal Add / Edit Main Task (Main Job) */}
      {showMainJobModal && (
        <MainJobModal
          initialData={showMainJobModal.mode === 'edit' ? showMainJobModal : undefined}
          onClose={() => setShowMainJobModal(null)}
          onSave={(name, weight, start, end) => handleSaveMainJob(
            name,
            weight,
            start,
            end,
            showMainJobModal.mode === 'edit' ? showMainJobModal.id : undefined,
            showMainJobModal.mode === 'edit' ? showMainJobModal.dbId : undefined
          )}
        />
      )}

      {/* Modal Add Sub Task (Sub Main Job under Main Job) */}
      {showAddSubMainJobModal && (
        <AddSubMainJobModal
          mjName={showAddSubMainJobModal.mjName}
          parentWeight={showAddSubMainJobModal.parentWeight}
          currentSubCount={showAddSubMainJobModal.currentSubCount}
          onClose={() => setShowAddSubMainJobModal(null)}
          onSave={(name) => handleSaveSubMainJob(showAddSubMainJobModal.mjId, name, showAddSubMainJobModal.mjDbId)}
        />
      )}

      {/* Modal Add / Edit Task (Sub-Subtask) */}
      {showAddTaskModal && (
        <AddSubtaskModal
          smjId={showAddTaskModal.smjId}
          smjDbId={showAddTaskModal.smjDbId}
          parentSmj={showAddTaskModal.parentSmj}
          mainJobs={projectData.mainJobs}
          divisions={divisions}
          initialData={showAddTaskModal.task}
          onClose={() => setShowAddTaskModal(null)}
          onSave={(taskData) => handleSaveSubtask(showAddTaskModal.smjId, taskData)}
        />
      )}

      {/* Action Toast Feedback */}
      {deleteConfirm && (
        <Modal
          title={deleteConfirm.title}
          onClose={() => setDeleteConfirm(null)}
          size="sm"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-red-50/80 border border-red-200/80 text-red-900">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0 text-danger shadow-2xs">
                <Trash2 size={20} />
              </div>
              <div className="text-[12.5px] leading-relaxed pt-0.5">
                <p className="font-semibold text-neutral-800">
                  {deleteConfirm.message}
                </p>
                <p className="text-[11.5px] text-neutral-500 mt-1">
                  This action cannot be undone and will permanently remove associated data.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                icon={Trash2}
                onClick={() => {
                  const action = deleteConfirm.onConfirm;
                  setDeleteConfirm(null);
                  action();
                }}
              >
                Yes, Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Uncheck Confirmation Modal (Requirement 3) */}
      {uncheckConfirm && (
        <UncheckConfirmModal
          taskName={uncheckConfirm.taskName}
          onClose={() => setUncheckConfirm(null)}
          onConfirm={confirmUncheck}
        />
      )}

      {/* Evidence Preview Modal (Requirement 8) */}
      {evidencePreview && (
        <EvidencePreviewModal
          evidence={evidencePreview}
          onClose={() => setEvidencePreview(null)}
        />
      )}

      {/* Action Toast Feedback */}
      {toastMsg && (
        <Toast message={toastMsg} onClose={() => setToastMsg(null)} />
      )}
    </div>
  );
}

function TodayTaskCard({
  st,
  parentSmj,
  timingStatus,
  canCheck,
  onCheck,
  onProgressChange,
  onOpenEvidence
}: {
  st: SubSubtask;
  parentSmj: SubMainJob;
  timingStatus: 'active' | 'starting' | 'due' | 'overdue';
  canCheck: boolean;
  onCheck: () => void;
  onProgressChange: (val: number) => void;
  onOpenEvidence: (evidence: any) => void;
}) {
  const isChecked = st.checked || st.progress >= 100;

  return (
    <div className={`p-3.5 rounded-xl border bg-white shadow-xs transition-all ${
      isChecked ? 'border-success/30 bg-emerald-50/20' : 'border-neutral-200 hover:border-neutral-300'
    }`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="font-mono text-[11.5px] font-bold text-neutral-500">{st.code}</span>
          <span className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 text-[10.5px] font-bold">
            {formatDivisionName(st.division || parentSmj.pic)}
          </span>
          {timingStatus === 'overdue' && (
            <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10.5px] font-bold">
              Overdue
            </span>
          )}
          {timingStatus === 'due' && (
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10.5px] font-bold">
              Due Today
            </span>
          )}
          {timingStatus === 'starting' && (
            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10.5px] font-bold">
              Starts Today
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded text-[10.5px] font-semibold text-blue-700 bg-blue-50 border border-blue-200">
            Weight {st.weight ?? 100}%
          </span>
        </div>
        <StatusBadge status={isChecked ? 'Completed' : st.status} size="xs" />
      </div>

      <h4 className={`text-[13.5px] font-bold mb-2.5 leading-snug break-words ${
        isChecked ? 'line-through text-neutral-400' : 'text-neutral-900'
      }`}>
        {st.name}
      </h4>

      {/* Progress Slider & Checkbox */}
      <div className="space-y-2 pt-2 border-t border-neutral-100">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1">
            <button
              type="button"
              onClick={onCheck}
              className={`flex-shrink-0 transition-transform active:scale-95 ${
                canCheck ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
              }`}
              title={isChecked ? "Click to uncheck (will prompt confirmation)" : "Click to mark 100% completed"}
            >
              {isChecked ? (
                <CheckSquare size={18} className="text-success" />
              ) : (
                <Square size={18} className="text-neutral-300 hover:text-neutral-500" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={st.progress}
              disabled={!canCheck}
              onChange={(e) => onProgressChange(parseInt(e.target.value))}
              className={`w-full h-2 rounded-lg appearance-none cursor-pointer bg-neutral-200 accent-brand ${
                !canCheck ? 'opacity-40 cursor-not-allowed' : 'hover:accent-blue-700'
              }`}
            />
          </div>
          <span className="text-[12.5px] font-black text-neutral-800 w-11 text-right tabular-nums">
            {st.progress}%
          </span>
        </div>

        {/* Evidence badge & details */}
        <div className="flex items-center justify-between text-[11px] pt-1 text-neutral-500">
          <span>{formatDateDisplay(st.startDate)} – {formatDateDisplay(st.finishDate)}</span>
          {st.evidence && (
            <button
              type="button"
              onClick={() => onOpenEvidence(st.evidence)}
              className="inline-flex items-center gap-1 text-brand font-bold hover:underline"
            >
              <Paperclip size={12} />
              Evidence ({st.evidence.name})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SubMainJobSection({
  smj, expanded, onToggle, isAuthorizedToCheck, isPIC, isAdmin, onOpenAddModal, onOpenEditModal, onDeleteSubMainJob, onDeleteTask, onCheck, onProgressChange, onOpenEvidence
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
  onProgressChange: (id: string, progress: number, auth: boolean, name: string) => void;
  onOpenEvidence: (evidence: any) => void;
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
            <span className="text-[12px] text-neutral-600 font-semibold">Sub Task (Sub Main Job) · Weight: {smj.weight}%</span>
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
                title="Delete Sub Task"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Level 3: Sub-Subtasks (Tasks) */}
      {expanded && (
        <div className="pl-6 sm:pl-16 pr-4 pb-3 pt-1 space-y-2">
          {smj.subtasks.length === 0 ? (
            <div className="py-2 text-[12.5px] text-neutral-400 italic">
              No tasks yet.{isPIC && " Click 'Add Task' to add task items."}
            </div>
          ) : (
            smj.subtasks.map(st => {
              const authorized = isAuthorizedToCheck(st.division || smj.pic);
              return (
                <SubtaskRow
                  key={st.id}
                  st={st}
                  divisi={st.division || smj.pic}
                  isChecked={st.checked || st.progress >= 100}
                  canCheck={authorized}
                  canEdit={isPIC}
                  onCheck={() => onCheck(st.id, authorized, st.name)}
                  onProgressChange={(val) => onProgressChange(st.id, val, authorized, st.name)}
                  onEdit={() => onOpenEditModal(st)}
                  onDelete={() => onDeleteTask(st.id, st.name)}
                  onOpenEvidence={onOpenEvidence}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function SubtaskRow({
  st, divisi, isChecked, canCheck, canEdit, onCheck, onProgressChange, onEdit, onDelete, onOpenEvidence
}: {
  st: SubSubtask;
  divisi: string;
  isChecked: boolean;
  canCheck: boolean;
  canEdit: boolean;
  onCheck: () => void;
  onProgressChange: (val: number) => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenEvidence: (evidence: any) => void;
}) {
  return (
    <div
      className={`group flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-3.5 rounded-xl border transition-all ${
        isChecked
          ? 'bg-success-light/40 border-success/30'
          : 'bg-white border-neutral-200/80 hover:border-neutral-300 shadow-xs'
      }`}
    >
      <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
        {/* Checkbox */}
        <button
          onClick={onCheck}
          aria-label={`Toggle checklist for ${st.name}`}
          className={`mt-0.5 sm:mt-0 flex-shrink-0 transition-transform active:scale-90 ${
            canCheck ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
          }`}
          title={isChecked ? "Click to uncheck (will prompt confirmation)" : "Click to complete 100%"}
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
            <span className={`text-[13.5px] sm:text-[14.5px] font-semibold break-words ${isChecked ? 'line-through text-neutral-400' : 'text-neutral-900'}`}>
              {st.name}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-bold">
              Weight {st.weight ?? 100}%
            </span>
            {!canCheck && <Lock size={12} className="text-neutral-300" title="You are not authorized to check or adjust progress for this task" />}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1.5 text-[11.5px] text-neutral-500">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-100 border border-neutral-200 text-[11px] font-semibold text-neutral-700">
              <Shield size={10} />
              Division: {formatDivisionName(divisi)}
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-neutral-700 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-200">
              <Calendar size={12} className="text-brand" />
              Schedule: {formatDateDisplay(st.startDate)} to {formatDateDisplay(st.finishDate)}
            </span>
            <span className="text-neutral-600 font-medium">Duration: {st.duration} days</span>
            {st.daysLeft !== undefined && st.daysLeft > 0 && !isChecked && (
              <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[11px]">
                {st.daysLeft} days left
              </span>
            )}
            {st.predecessor && (
              <span className="font-medium text-neutral-600">
                Pred: {st.predecessor} ({st.depType || 'FS'}
                {st.lag ? ` +${st.lag}d lag` : ''}
                {st.lead ? ` -${st.lead}d lead` : ''})
              </span>
            )}
            {st.evidence && (
              <button
                type="button"
                onClick={() => onOpenEvidence(st.evidence)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold hover:bg-emerald-100 transition-colors"
                title="View attached evidence"
              >
                <Paperclip size={11} />
                Evidence Attached
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Progress Slider (0–100%) & Status Badges */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 self-stretch sm:self-center border-t sm:border-t-0 border-neutral-100 pt-2 sm:pt-0">
        {/* Progress Slider */}
        <div className="flex items-center gap-2 flex-1 sm:flex-initial">
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={st.progress}
            disabled={!canCheck}
            onChange={(e) => onProgressChange(parseInt(e.target.value))}
            className={`w-28 sm:w-32 h-2 rounded-lg appearance-none cursor-pointer bg-neutral-200 accent-brand ${
              !canCheck ? 'opacity-40 cursor-not-allowed' : 'hover:accent-blue-700'
            }`}
            title={`Adjust task progress (Current: ${st.progress}%)`}
          />
          <span className="text-[12.5px] font-black text-neutral-800 w-11 text-right tabular-nums">
            {st.progress}%
          </span>
        </div>

        {/* Quick Presets for Desktop */}
        {canCheck && (
          <div className="hidden xl:flex items-center gap-0.5 bg-neutral-100 p-0.5 rounded border border-neutral-200 text-[10px] font-bold text-neutral-600">
            {[0, 25, 50, 75, 100].map(val => (
              <button
                key={val}
                type="button"
                onClick={() => onProgressChange(val)}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  st.progress === val ? 'bg-brand text-white font-extrabold' : 'hover:bg-neutral-200 text-neutral-700'
                }`}
                title={`Set to ${val}%`}
              >
                {val}%
              </button>
            ))}
          </div>
        )}

        <StatusBadge status={isChecked ? 'Completed' : st.status} size="sm" />

        {/* Edit / Delete: PIC only */}
        {canEdit && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
            <button onClick={onEdit} className="p-1.5 text-neutral-500 hover:text-brand bg-white hover:bg-neutral-50 rounded border border-neutral-200 shadow-xs" title="Edit Task (Name & Weight)">
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

function UncheckConfirmModal({
  taskName,
  onClose,
  onConfirm
}: {
  taskName: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title="Uncheck Task?"
      subtitle="Confirm marking task as incomplete"
      onClose={onClose}
      size="sm"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-900">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 text-amber-700 shadow-2xs">
            <AlertTriangle size={20} />
          </div>
          <div className="text-[12.5px] leading-relaxed pt-0.5">
            <p className="font-semibold text-neutral-800">
              Are you sure you want to mark this task as incomplete?
            </p>
            <p className="font-bold text-neutral-900 mt-1">
              "{taskName}"
            </p>
            <p className="text-[11.5px] text-neutral-500 mt-1">
              This will unmark the task from 100% completion. Progress will be restored to in-progress.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onConfirm}
            className="bg-amber-600 hover:bg-amber-700 border-amber-600 text-white"
          >
            Uncheck
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EvidencePreviewModal({
  evidence,
  onClose
}: {
  evidence: { name: string; url?: string; size?: string };
  onClose: () => void;
}) {
  return (
    <Modal
      title="Task Evidence Preview"
      subtitle={evidence.name}
      onClose={onClose}
      size="md"
    >
      <div className="space-y-4">
        {evidence.url ? (
          <div className="rounded-xl overflow-hidden border border-neutral-200 bg-neutral-900 flex items-center justify-center max-h-[60vh]">
            <img src={evidence.url} alt={evidence.name} className="max-w-full max-h-[60vh] object-contain" />
          </div>
        ) : (
          <div className="p-8 rounded-xl border border-neutral-200 bg-neutral-50 text-center">
            <FileText size={48} className="mx-auto text-brand mb-2" />
            <h4 className="font-bold text-neutral-800 text-[14px]">{evidence.name}</h4>
            <p className="text-[12px] text-neutral-500 mt-1">{evidence.size || 'Attached file'}</p>
          </div>
        )}
        <div className="flex justify-end pt-2 border-t border-neutral-100">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SearchablePredecessorSelect({
  value,
  onChange,
  availableSubMainJobs,
  currentTaskId,
  currentTaskCode
}: {
  value: string;
  onChange: (val: string) => void;
  availableSubMainJobs: SubMainJob[];
  currentTaskId?: string;
  currentTaskCode?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const query = search.trim().toLowerCase();

  // Find currently selected label
  let selectedLabel = 'None (No Predecessor)';
  if (value) {
    for (const smj of availableSubMainJobs) {
      if (smj.code === value) {
        selectedLabel = `${smj.code} - ${smj.name} (Sub Task)`;
        break;
      }
      const st = (smj.subtasks || []).find(s => s.code === value);
      if (st) {
        selectedLabel = `${st.code} - ${st.name}`;
        break;
      }
    }
  }

  // Filter tasks
  const filteredGroups = availableSubMainJobs.map(smj => {
    const smjMatches = !query || smj.name.toLowerCase().includes(query) || smj.code.toLowerCase().includes(query);
    const matchingTasks = (smj.subtasks || []).filter(st => {
      if (st.id === currentTaskId || st.code === currentTaskCode) return false;
      if (!query) return true;
      return st.name.toLowerCase().includes(query) ||
             st.code.toLowerCase().includes(query) ||
             (st.division && st.division.toLowerCase().includes(query));
    });

    return {
      smj,
      matchingTasks,
      visible: smjMatches || matchingTasks.length > 0,
    };
  }).filter(g => g.visible);

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] bg-white cursor-pointer flex items-center justify-between hover:border-neutral-300 focus:border-brand"
      >
        <span className={`truncate ${value ? 'font-bold text-neutral-800' : 'text-neutral-400'}`}>
          {selectedLabel}
        </span>
        <ChevronDown size={14} className={`text-neutral-400 transform transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white rounded-xl border border-neutral-200 shadow-xl max-h-64 flex flex-col overflow-hidden">
          {/* Search box inside dropdown */}
          <div className="p-2 border-b border-neutral-100 bg-neutral-50 flex items-center gap-1.5">
            <Search size={14} className="text-neutral-400 ml-1" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search predecessor by name or code (e.g. civil, WBS)..."
              className="w-full px-2 py-1 text-[12px] bg-transparent outline-none font-medium"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-neutral-400 hover:text-neutral-600 p-1"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="overflow-y-auto divide-y divide-neutral-100 flex-1 p-1">
            {/* None Option */}
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-[12.5px] rounded-lg transition-colors font-medium ${
                !value ? 'bg-brand/10 text-brand font-bold' : 'text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              None (No Predecessor)
            </button>

            {filteredGroups.length === 0 ? (
              <div className="py-4 text-center text-[12px] text-neutral-400 italic">
                No matching tasks found for "{search}"
              </div>
            ) : (
              filteredGroups.map(({ smj, matchingTasks }) => (
                <div key={smj.id || smj.code} className="pt-1.5 pb-1">
                  <div className="px-3 py-1 text-[11px] font-black text-neutral-400 uppercase tracking-wider">
                    {smj.code} · {smj.name}
                  </div>
                  {/* Sub-Task option */}
                  <button
                    type="button"
                    onClick={() => {
                      onChange(smj.code);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-[12.5px] rounded-lg transition-colors flex items-center justify-between ${
                      value === smj.code ? 'bg-brand text-white font-bold' : 'text-neutral-800 hover:bg-neutral-50'
                    }`}
                  >
                    <span className="truncate">
                      <strong>{smj.code}</strong> - {smj.name}
                    </span>
                    <span className={`text-[10.5px] px-1.5 py-0.5 rounded font-bold ${
                      value === smj.code ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-600'
                    }`}>
                      Sub-Task
                    </span>
                  </button>

                  {/* Specific Task items */}
                  {matchingTasks.map(st => (
                    <button
                      key={st.id || st.code}
                      type="button"
                      onClick={() => {
                        onChange(st.code);
                        setIsOpen(false);
                      }}
                      className={`w-full text-left pl-6 pr-3 py-1.5 text-[12px] rounded-lg transition-colors flex items-center justify-between ${
                        value === st.code ? 'bg-brand text-white font-bold' : 'text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      <span className="truncate">
                        <strong>{st.code}</strong> - {st.name}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AddSubMainJobModal({
  mjName,
  parentWeight = 0,
  currentSubCount = 0,
  onClose,
  onSave
}: {
  mjName: string;
  parentWeight?: number;
  currentSubCount?: number;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim());
  };

  return (
    <Modal
      title="Add New Sub Task (Sub Main Job)"
      subtitle={`Under WBS Group: ${mjName}`}
      onClose={onClose}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[12px] font-bold text-neutral-700 mb-1">
            Sub Task Name <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. DOCUMENT REVIEW & PERMITS"
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 bg-white font-medium"
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" disabled={!name.trim()}>
            Save Sub Task
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MainJobModal({
  initialData,
  onClose,
  onSave
}: {
  initialData?: {
    id?: string;
    dbId?: number;
    name?: string;
    weight?: number;
    startDate?: string;
    finishDate?: string;
  };
  onClose: () => void;
  onSave: (name: string, weight: number, start?: string, end?: string) => void;
}) {
  const isEdit = !!initialData?.id;
  const [name, setName] = useState(initialData?.name || '');
  const [weight, setWeight] = useState(initialData?.weight !== undefined ? initialData.weight.toString() : '5');
  const [startDate, setStartDate] = useState(initialData?.startDate || new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(initialData?.finishDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim(), parseFloat(weight) || 0, startDate, endDate);
  };

  return (
    <Modal
      title={isEdit ? "Edit Main Task (Primary WBS Group)" : "Add New Main Task (Primary WBS Group)"}
      subtitle={isEdit ? `Modify Level 1 primary job group: ${initialData?.name}` : "Add a Level 1 primary job group to the project"}
      onClose={onClose}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[12px] font-bold text-neutral-700 mb-1">
            Main Task Name <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. COMMISSIONING & HANDOVER"
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 bg-white font-medium"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-[12px] font-bold text-neutral-700 mb-1">
            Weight Allocation (%) <span className="text-danger">*</span>
          </label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            required
            value={weight}
            onChange={e => setWeight(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white font-bold"
          />
          <span className="text-[11px] text-neutral-400 mt-1 block">
            This weight will be automatically divided equally across all Sub Tasks inside it.
          </span>
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
            <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">Finish Date</label>
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
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" disabled={!name.trim()}>
            {isEdit ? "Update Main Task" : "Save Main Task"}
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
  mainJobs = [],
  divisions,
  onClose,
  onSave,
  initialData
}: {
  smjId: string;
  smjDbId?: number;
  parentSmj?: SubMainJob;
  mainJobs?: MainJob[];
  divisions: { id: number; divisi: string }[];
  onClose: () => void;
  onSave: (taskData: Partial<SubSubtask> & { smjDbId?: number; divisionId?: number }) => void;
  initialData?: SubSubtask;
}) {
  const isEdit = !!initialData?.id;
  const [name, setName] = useState(initialData?.name || '');
  const [weight, setWeight] = useState(initialData?.weight !== undefined ? initialData.weight.toString() : '100');
  const [startDate, setStartDate] = useState(initialData?.startDate || new Date().toISOString().slice(0, 10));
  const [duration, setDuration] = useState(initialData?.duration?.toString() || '5');
  const [divisionId, setDivisionId] = useState<string>(
    initialData?.division
      ? (divisions.find(d => d.divisi.toLowerCase() === initialData.division.toLowerCase())?.id?.toString() || divisions[0]?.id?.toString() || '')
      : (divisions[0]?.id?.toString() || '')
  );
  const [predecessor, setPredecessor] = useState(initialData?.predecessor || '');
  const [depType, setDepType] = useState<DependencyType>(initialData?.depType || 'FS');
  const [lag, setLag] = useState(initialData?.lag ? initialData.lag.toString() : '0');
  const [lead, setLead] = useState(initialData?.lead ? initialData.lead.toString() : '0');
  const [evidence, setEvidence] = useState<{
    name: string;
    size: string;
    type: string;
    previewUrl?: string;
  } | null>(initialData?.evidence || null);

  // Available SubMainJobs across the project
  const availableSubMainJobs = (mainJobs && mainJobs.length > 0)
    ? mainJobs.flatMap(mj => mj.subMainJobs || [])
    : (parentSmj ? [parentSmj] : []);

  // Calculate finish date preview
  const finishDatePreview = useMemo(() => {
    try {
      const d = new Date(startDate);
      const dur = parseInt(duration) || 1;
      d.setDate(d.getDate() + dur);
      return d.toISOString().slice(0, 10);
    } catch {
      return startDate;
    }
  }, [startDate, duration]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSave({
      id: initialData?.id,
      smjDbId,
      name: name.trim(),
      weight: parseFloat(weight) || 100,
      divisionId: divisionId ? parseInt(divisionId) : undefined,
      startDate,
      duration: parseInt(duration) || 1,
      predecessor: predecessor || undefined,
      depType,
      lag: parseInt(lag) || 0,
      lead: parseInt(lead) || 0,
      evidence: evidence || undefined,
    });
  };

  return (
    <Modal
      title={isEdit ? "Edit Task (Sub-task Item)" : "Add New Task (Sub-task Item)"}
      subtitle={isEdit ? `Editing: ${initialData.code} — ${initialData.name}` : "Add project task breakdown item with single-column layout"}
      onClose={onClose}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        {/* 1. Task Name / Description */}
        <div>
          <label className="block text-[12px] font-bold text-neutral-700 mb-1">
            Task Description / Name <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Build 15 Concrete Columns / Review vendor documents"
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 bg-white font-medium"
            autoFocus
          />
        </div>

        {/* 2. Weight (%) */}
        <div>
          <label className="block text-[12px] font-bold text-neutral-700 mb-1">
            Weight Allocation (%) <span className="text-danger">*</span>
          </label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            required
            value={weight}
            onChange={e => setWeight(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand font-bold bg-white"
          />
          <span className="text-[11px] text-neutral-400 mt-1 block">
            Relative weight contribution to the parent Sub Task.
          </span>
        </div>

        {/* 3. Responsible Division */}
        <div>
          <label className="block text-[12px] font-bold text-neutral-700 mb-1">
            Responsible Division <span className="text-danger">*</span>
          </label>
          <select
            value={divisionId}
            onChange={e => setDivisionId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white font-medium"
          >
            {divisions.map(d => (
              <option key={d.id} value={d.id}>{formatDivisionName(d.divisi)}</option>
            ))}
          </select>
        </div>

        {/* 4. Start Date */}
        <div>
          <label className="block text-[12px] font-bold text-neutral-700 mb-1">
            Start Date <span className="text-danger">*</span>
          </label>
          <input
            type="date"
            required
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
          />
        </div>

        {/* 5. Duration (Days) & Calculated Finish Date */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[12px] font-bold text-neutral-700">
              Duration (Days) <span className="text-danger">*</span>
            </label>
            <span className="text-[11px] text-neutral-500 font-semibold">
              Finish Date: <strong className="text-brand">{formatDateDisplay(finishDatePreview)}</strong>
            </span>
          </div>
          <input
            type="number"
            min="1"
            required
            value={duration}
            onChange={e => setDuration(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white font-semibold"
          />
        </div>

        {/* 6. Predecessor (Searchable) */}
        <div>
          <label className="block text-[12px] font-bold text-neutral-700 mb-1">
            Predecessor (Searchable)
          </label>
          <SearchablePredecessorSelect
            value={predecessor}
            onChange={setPredecessor}
            availableSubMainJobs={availableSubMainJobs}
            currentTaskId={initialData?.id}
            currentTaskCode={initialData?.code}
          />
        </div>

        {/* 7. Dependency Type */}
        <div>
          <label className="block text-[12px] font-bold text-neutral-700 mb-1">
            Dependency Type
          </label>
          <select
            value={depType}
            onChange={e => setDepType(e.target.value as DependencyType)}
            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white font-medium"
          >
            <option value="FS">Finish-to-Start (FS) — default</option>
            <option value="SS">Start-to-Start (SS)</option>
            <option value="FF">Finish-to-Finish (FF)</option>
            <option value="SF">Start-to-Finish (SF)</option>
          </select>
        </div>

        {/* 8. Lag & Lead UI Inputs (Clearly separated) */}
        <div className="space-y-2 pt-1 border-t border-neutral-100">
          <div className="flex items-center justify-between">
            <label className="block text-[12px] font-bold text-neutral-700">
              Lag & Lead Timing
            </label>
            <span className="text-[11px] text-neutral-400">Dependency adjustments</span>
          </div>

          <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50/70 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-bold text-neutral-800 flex items-center gap-1.5">
                  <Clock size={13} className="text-amber-600" />
                  Lag (Delay)
                </span>
                <span className="text-[11px] text-neutral-400 font-semibold">[ +days ]</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={lag}
                  onChange={e => {
                    const v = e.target.value;
                    setLag(v);
                    if (parseInt(v) > 0) setLead('0');
                  }}
                  className="w-full px-3 py-1.5 rounded border border-neutral-200 text-[13px] font-bold outline-none focus:border-brand bg-white"
                  placeholder="0"
                />
                <span className="text-[12px] text-neutral-500 font-medium">days</span>
              </div>
              <p className="text-[11px] text-neutral-500 mt-1 leading-tight">
                Wait N days after predecessor finishes before starting this task.
              </p>
            </div>

            <div className="border-t border-neutral-200/60 pt-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-bold text-neutral-800 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-blue-600" />
                  Lead (Acceleration)
                </span>
                <span className="text-[11px] text-neutral-400 font-semibold">[ -days ]</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={lead}
                  onChange={e => {
                    const v = e.target.value;
                    setLead(v);
                    if (parseInt(v) > 0) setLag('0');
                  }}
                  className="w-full px-3 py-1.5 rounded border border-neutral-200 text-[13px] font-bold outline-none focus:border-brand bg-white"
                  placeholder="0"
                />
                <span className="text-[12px] text-neutral-500 font-medium">days</span>
              </div>
              <p className="text-[11px] text-neutral-500 mt-1 leading-tight">
                Start N days earlier before predecessor finishes (work overlap).
              </p>
            </div>
          </div>
        </div>

        {/* 9. Task Evidence Upload (Requirement 8) */}
        <div className="space-y-1.5 pt-1 border-t border-neutral-100">
          <label className="block text-[12px] font-bold text-neutral-700">
            Task Evidence (Photo / Document)
          </label>
          {evidence ? (
            <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {evidence.previewUrl ? (
                  <img src={evidence.previewUrl} alt="Evidence preview" className="w-11 h-11 rounded-lg object-cover border border-neutral-200 flex-shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-lg bg-brand/10 text-brand flex items-center justify-center flex-shrink-0">
                    <FileText size={20} />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[12.5px] font-bold text-neutral-800 truncate">{evidence.name}</div>
                  <div className="text-[11px] text-neutral-500">{evidence.size} · Attached</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEvidence(null)}
                className="p-1.5 rounded text-neutral-400 hover:text-danger hover:bg-red-50 transition-colors"
                title="Remove evidence"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-neutral-200 hover:border-brand rounded-xl cursor-pointer bg-neutral-50/50 hover:bg-brand/5 transition-colors">
              <UploadCloud size={24} className="text-neutral-400 mb-1" />
              <span className="text-[12.5px] font-bold text-neutral-700">Click or drag & drop evidence file / photo</span>
              <span className="text-[11px] text-neutral-400 mt-0.5">Supports PNG, JPG, or PDF up to 10MB</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const isImg = file.type.startsWith('image/');
                    const sizeFormatted = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
                    const previewUrl = isImg ? URL.createObjectURL(file) : undefined;
                    setEvidence({
                      name: file.name,
                      size: sizeFormatted,
                      type: file.type,
                      previewUrl,
                    });
                  }
                }}
              />
            </label>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            disabled={!name.trim()}
          >
            {isEdit ? "Update Task" : "Save Task"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
