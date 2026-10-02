import React, { useState, useMemo, useEffect } from 'react';
import { usePage, Link, router } from '@inertiajs/react';
import {
  FolderOpen, Plus, Calendar, Layers, ChevronDown, ChevronRight,
  Edit2, Trash2, Link2, CheckCircle2, AlertTriangle, ArrowLeft,
  Sparkles, Shield, Clock, HelpCircle, Save, Check, X, Search,
  BarChart2, CheckSquare, Lock, Info, Network, Trash
} from 'lucide-react';
import mermaid from 'mermaid';
import { PageHeader, Card, Button, Modal, formatDateDisplay } from '@/components/ui';

interface DependencyItem {
  id: number;
  dependency_group_id?: number | null;
  predecessor_wbs_id: string;
  predecessor_name: string;
  dependency_type: 'FS' | 'SS' | 'FF' | 'SF';
  lag_days: number;
}

interface WbsTask {
  id: string;
  code: string;
  sub_wbs_id: number;
  name: string;
  division_id: number;
  division_name: string;
  vendor: string;
  start: string;
  end: string;
  duration_days: number;
  predecessor?: string;
  dep_type?: string;
  lag?: number;
  lead?: number;
  requires_evidence: boolean;
  dependencies: DependencyItem[];
}

interface SubWbs {
  id: number;
  code: string;
  main_wbs_id: number;
  name: string;
  weight: number;
  start: string;
  end: string;
  wbsTasks: WbsTask[];
}

interface MainWbs {
  id: number;
  code: string;
  list_main_wbs_names_id: number;
  name: string;
  weight: number;
  start: string;
  end: string;
  subWbs: SubWbs[];
}

interface ProjectData {
  id: number;
  title: string;
  status: string;
  setup_status: 'pending_setup' | 'active';
  start: string | null;
  end: string | null;
  company: string;
  manager: string;
  mainWbs: MainWbs[];
}

interface DivisionOption {
  id: number;
  divisi: string;
}

export default function ProjectSetupPage() {
  const { project, divisions = [], allTasks = [], userRole, flash = {} } = usePage().props as any;
  const proj: ProjectData = project;

  // Search & Expand State
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedMainIds, setExpandedMainIds] = useState<Set<number>>(() => {
    // Expand first 3 main tasks by default
    const set = new Set<number>();
    (proj.mainWbs || []).slice(0, 3).forEach(m => set.add(m.id));
    return set;
  });
  const [expandedSubIds, setExpandedSubIds] = useState<Set<number>>(() => {
    const set = new Set<number>();
    (proj.mainWbs || []).forEach(m => (m.subWbs || []).forEach(s => set.add(s.id)));
    return set;
  });

  // Modal States
  const [mainModal, setMainModal] = useState<{ isOpen: boolean; mode: 'add' | 'edit'; item?: MainWbs }>({ isOpen: false, mode: 'add' });
  const [subModal, setSubModal] = useState<{ isOpen: boolean; mode: 'add' | 'edit'; parentId?: number; item?: SubWbs }>({ isOpen: false, mode: 'add' });
  const [taskModal, setTaskModal] = useState<{ isOpen: boolean; mode: 'add' | 'edit'; parentId?: number; item?: WbsTask }>({ isOpen: false, mode: 'add' });
  const [depModal, setDepModal] = useState<{ isOpen: boolean; task?: WbsTask }>({ isOpen: false });
  const [confirmCompleteModal, setConfirmCompleteModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; type: 'main' | 'sub' | 'task'; id: any; name: string } | null>(null);
  const [deleteDepModal, setDeleteDepModal] = useState<{ isOpen: boolean; id: number } | null>(null);

  // Form States - Main Task
  const [mainForm, setMainForm] = useState({ name: '', weight: 5.0, start: proj.start || '', end: proj.end || '' });
  // Form States - Sub Task
  const [subForm, setSubForm] = useState({ name: '', start: proj.start || '', end: proj.end || '' });
  // Form States - Leaf Task
  const [taskForm, setTaskForm] = useState({
    name: '',
    divisions_id: divisions[0]?.id || 1,
    start: proj.start || '',
    duration: 5,
    vendor: 'INTERNAL',
    requires_evidence: false,
    predecessor_wbs_id: '',   // ID of predecessor WBS task
    dep_type: 'FS' as 'FS' | 'SS' | 'FF' | 'SF',
    lag: 0,
  });

  // Form States - Dependency Modal
  const [depForm, setDepForm] = useState({
    predecessor_wbs_ids: [] as string[],
    dependency_type: 'FS' as 'FS' | 'SS' | 'FF' | 'SF',
    lag_days: 0,
  });

  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [chartModal, setChartModal] = useState(false);
  
  useEffect(() => {
    if (depModal.isOpen && depModal.task) {
      let foundTask = undefined;
      for (const m of (proj.mainWbs || [])) {
        for (const s of (m.subWbs || [])) {
          const t = s.wbsTasks?.find(t => t.id === depModal.task?.id);
          if (t) { foundTask = t; break; }
        }
        if (foundTask) break;
      }
      if (foundTask) setDepModal(prev => ({ ...prev, task: foundTask }));
    }
  }, [proj]);

  const handleClearAllTasks = () => {
    if (!confirm('Apakah Anda yakin ingin menghapus SEMUA task? Tindakan ini tidak dapat dibatalkan.')) return;
    setSubmitting(true);
    router.delete(`/projects/${proj.id}/clear-wbs`, {
      preserveScroll: true,
      onFinish: () => setSubmitting(false),
    });
  };

  const getMermaidGraph = () => {
    let graph = 'graph LR\n';
    const allTasksLocal: WbsTask[] = [];
    (proj.mainWbs || []).forEach(m => {
      (m.subWbs || []).forEach(s => {
        (s.wbsTasks || []).forEach(t => allTasksLocal.push(t));
      });
    });
    allTasksLocal.forEach(t => {
      if(!t.dependencies) return;
      t.dependencies.forEach(dep => {
        const pred = allTasksLocal.find(w => w.id === dep.predecessor_wbs_id || w.code === dep.predecessor_wbs_id);
        if(pred) {
           const pName = pred.name.replace(/"/g, "'");
           const tName = t.name.replace(/"/g, "'");
           graph += `  Task${pred.id}["${pName}"] -->|${dep.dependency_type}| Task${t.id}["${tName}"]\n`;
        }
      });
    });
    if (graph === 'graph LR\n') graph += '  A["Belum ada relasi predecessor"]';
    return graph;
  };

  useEffect(() => {
    if (chartModal) {
      mermaid.initialize({ startOnLoad: true, theme: 'default' });
      setTimeout(() => mermaid.contentLoaded(), 100);
    }
  }, [chartModal, proj]);

  const dependencyGroups = useMemo(() => {
    const groups = new Map<number | string, DependencyItem[]>();
    for (const dependency of depModal.task?.dependencies ?? []) {
      const key = dependency.dependency_group_id ?? `dependency-${dependency.id}`;
      const group = groups.get(key) ?? [];
      group.push(dependency);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [depModal.task?.dependencies]);

  // Toggle Accordions
  const toggleMain = (id: number) => {
    setExpandedMainIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSub = (id: number) => {
    setExpandedSubIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const mainSet = new Set<number>();
    const subSet = new Set<number>();
    (proj.mainWbs || []).forEach(m => {
      mainSet.add(m.id);
      (m.subWbs || []).forEach(s => subSet.add(s.id));
    });
    setExpandedMainIds(mainSet);
    setExpandedSubIds(subSet);
  };

  const collapseAll = () => {
    setExpandedMainIds(new Set());
    setExpandedSubIds(new Set());
  };

  // Helper date auto-push
  const getMinEndDate = (startDate: string) => {
    if (!startDate) return undefined;
    const next = new Date(startDate);
    next.setDate(next.getDate() + 1);
    return next.toISOString().slice(0, 10);
  };

  // Summary Metrics
  const totalMainTasks = proj.mainWbs?.length || 0;
  const totalSubTasks = useMemo(() => {
    return (proj.mainWbs || []).reduce((acc, m) => acc + (m.subWbs?.length || 0), 0);
  }, [proj.mainWbs]);
  const totalLeafTasks = useMemo(() => {
    return (proj.mainWbs || []).reduce((acc, m) => {
      return acc + (m.subWbs || []).reduce((subAcc, s) => subAcc + (s.wbsTasks?.length || 0), 0);
    }, 0);
  }, [proj.mainWbs]);
  const totalWeight = useMemo(() => {
    return (proj.mainWbs || []).reduce((acc, m) => acc + (Number(m.weight) || 0), 0);
  }, [proj.mainWbs]);

  // Main Task Add / Edit Handlers
  const openAddMain = () => {
    setMainForm({ name: '', weight: 5.0, start: proj.start || '', end: proj.end || '' });
    setActionError(null);
    setMainModal({ isOpen: true, mode: 'add' });
  };

  const openEditMain = (item: MainWbs) => {
    setMainForm({
      name: item.name,
      weight: item.weight,
      start: item.start || proj.start || '',
      end: item.end || proj.end || ''
    });
    setActionError(null);
    setMainModal({ isOpen: true, mode: 'edit', item });
  };

  const handleSaveMain = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mainForm.name.trim()) return;
    if (mainForm.start && mainForm.end && mainForm.end <= mainForm.start) {
      setActionError('End date harus setelah Start date (minimal +1 hari).');
      return;
    }

    setSubmitting(true);
    setActionError(null);

    if (mainModal.mode === 'add') {
      router.post(`/projects/${proj.id}/main-wbs`, {
        name: mainForm.name.trim(),
        weight: mainForm.weight,
        start: mainForm.start || null,
        end: mainForm.end || null,
      }, {
        onSuccess: () => setMainModal({ isOpen: false, mode: 'add' }),
        onError: (errs) => setActionError(Object.values(errs)[0] as string || 'Gagal menyimpan Main Task'),
        onFinish: () => setSubmitting(false),
      });
    } else if (mainModal.item) {
      router.put(`/projects/${proj.id}/main-wbs/${mainModal.item.id}`, {
        name: mainForm.name.trim(),
        weight: mainForm.weight,
        start: mainForm.start || null,
        end: mainForm.end || null,
      }, {
        onSuccess: () => setMainModal({ isOpen: false, mode: 'add' }),
        onError: (errs) => setActionError(Object.values(errs)[0] as string || 'Gagal mengubah Main Task'),
        onFinish: () => setSubmitting(false),
      });
    }
  };

  // Sub Task Add / Edit Handlers
  const openAddSub = (mainId: number) => {
    setSubForm({ name: '', start: proj.start || '', end: proj.end || '' });
    setActionError(null);
    setSubModal({ isOpen: true, mode: 'add', parentId: mainId });
  };

  const openEditSub = (item: SubWbs) => {
    setSubForm({
      name: item.name,
      start: item.start || proj.start || '',
      end: item.end || proj.end || ''
    });
    setActionError(null);
    setSubModal({ isOpen: true, mode: 'edit', item });
  };

  const handleSaveSub = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subForm.name.trim()) return;
    if (subForm.start && subForm.end && subForm.end <= subForm.start) {
      setActionError('End date harus setelah Start date (minimal +1 hari).');
      return;
    }

    setSubmitting(true);
    setActionError(null);

    if (subModal.mode === 'add' && subModal.parentId) {
      router.post(`/projects/${proj.id}/sub-wbs`, {
        main_wbs_id: subModal.parentId,
        name: subForm.name.trim(),
        start: subForm.start || null,
        end: subForm.end || null,
      }, {
        onSuccess: () => setSubModal({ isOpen: false, mode: 'add' }),
        onError: (errs) => setActionError(Object.values(errs)[0] as string || 'Gagal menyimpan Sub Task'),
        onFinish: () => setSubmitting(false),
      });
    } else if (subModal.item) {
      router.put(`/projects/${proj.id}/sub-wbs/${subModal.item.id}`, {
        name: subForm.name.trim(),
        start: subForm.start || null,
        end: subForm.end || null,
      }, {
        onSuccess: () => setSubModal({ isOpen: false, mode: 'add' }),
        onError: (errs) => setActionError(Object.values(errs)[0] as string || 'Gagal mengubah Sub Task'),
        onFinish: () => setSubmitting(false),
      });
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Helper: get a flat list of ALL leaf tasks across all mainWbs (used for predecessor picker)
  const allLeafTasks = useMemo(() => {
    const tasks: WbsTask[] = [];
    (proj.mainWbs || []).forEach(m => {
      (m.subWbs || []).forEach(s => {
        (s.wbsTasks || []).forEach(t => tasks.push(t));
      });
    });
    return tasks;
  }, [proj.mainWbs]);

  // Helper: calculate start date from predecessor + dependency type + lag
  const calcStartFromPredecessor = (
    predecessorId: string,
    depType: 'FS' | 'SS' | 'FF' | 'SF',
    lag: number,
    duration: number,
  ): string => {
    const pred = allLeafTasks.find(t => String(t.id) === String(predecessorId));
    if (!pred) return taskForm.start;

    const addDays = (dateStr: string, days: number): string => {
      const d = new Date(dateStr);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };

    if (!pred.start || !pred.end) return taskForm.start;

    // FS: this task starts after predecessor finishes (+lag)
    if (depType === 'FS') return addDays(pred.end, 1 + lag);
    // SS: this task starts when predecessor starts (+lag)
    if (depType === 'SS') return addDays(pred.start, lag);
    // FF: this task should finish when predecessor finishes → start = predEnd - duration + lag
    if (depType === 'FF') return addDays(pred.end, lag - duration + 1);
    // SF: this task finishes when predecessor starts → start = predStart - duration + lag
    if (depType === 'SF') return addDays(pred.start, lag - duration + 1);
    return taskForm.start;
  };

  // Helper: compute end date from start + duration
  const calcEndDate = (start: string, duration: number): string => {
    if (!start) return '';
    const d = new Date(start);
    d.setDate(d.getDate() + Math.max(1, duration) - 1);
    return d.toISOString().slice(0, 10);
  };

  useEffect(() => {
    if (taskModal.isOpen && taskForm.predecessor_wbs_id) {
      const newStart = calcStartFromPredecessor(
        taskForm.predecessor_wbs_id,
        taskForm.dep_type,
        taskForm.lag,
        taskForm.duration
      );
      if (newStart !== taskForm.start) {
        setTaskForm(prev => ({ ...prev, start: newStart }));
      }
    }
  }, [taskForm.predecessor_wbs_id, taskForm.dep_type, taskForm.lag, taskForm.duration, taskModal.isOpen]);

  // Leaf Task Add / Edit Handlers
  const openAddTask = (subId: number) => {
    const startDate = proj.start || new Date().toISOString().slice(0, 10);
    setTaskForm({
      name: '',
      divisions_id: divisions[0]?.id || 1,
      start: startDate,
      duration: 5,
      vendor: 'INTERNAL',
      requires_evidence: false,
      predecessor_wbs_id: '',
      dep_type: 'FS',
      lag: 0,
    });
    setActionError(null);
    setTaskModal({ isOpen: true, mode: 'add', parentId: subId });
  };

  const openEditTask = (item: WbsTask) => {
    // Find existing predecessor from dependencies list
    const firstDep = item.dependencies?.[0];
    setTaskForm({
      name: item.name,
      divisions_id: item.division_id || divisions[0]?.id || 1,
      start: item.start || proj.start || '',
      duration: item.duration_days || 1,
      vendor: item.vendor || 'INTERNAL',
      requires_evidence: item.requires_evidence || false,
      predecessor_wbs_id: firstDep ? String(firstDep.predecessor_wbs_id) : '',
      dep_type: (firstDep?.dependency_type as any) || 'FS',
      lag: firstDep?.lag_days ?? 0,
    });
    setActionError(null);
    setTaskModal({ isOpen: true, mode: 'edit', item });
  };

  const handleSaveTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.name.trim()) return;
    if (!taskForm.start) {
      setActionError('Start Date harus diisi.');
      return;
    }

    // Auto-calculate end date from start + duration
    const computedEnd = calcEndDate(taskForm.start, taskForm.duration);

    setSubmitting(true);
    setActionError(null);

    if (taskModal.mode === 'add' && taskModal.parentId) {
      router.post(`/projects/${proj.id}/tasks`, {
        sub_wbs_id: taskModal.parentId,
        name: taskForm.name.trim(),
        divisions_id: taskForm.divisions_id,
        duration: taskForm.duration,
        start: taskForm.start,
        end: computedEnd,
        vendor: taskForm.vendor,
        requires_evidence: taskForm.requires_evidence,
        // Pass predecessor if selected — backend handles saving as TaskDependency
        predecessor: taskForm.predecessor_wbs_id || null,
        dep_type: taskForm.dep_type,
        lag: taskForm.lag,
      }, {
        onSuccess: () => setTaskModal({ isOpen: false, mode: 'add' }),
        onError: (errs) => setActionError(Object.values(errs)[0] as string || 'Gagal menyimpan Task'),
        onFinish: () => setSubmitting(false),
      });
    } else if (taskModal.item) {
      router.put(`/projects/${proj.id}/tasks/${taskModal.item.id}`, {
        name: taskForm.name.trim(),
        divisions_id: taskForm.divisions_id,
        duration: taskForm.duration,
        start: taskForm.start,
        end: computedEnd,
        vendor: taskForm.vendor,
        requires_evidence: taskForm.requires_evidence,
        predecessor: taskForm.predecessor_wbs_id || null,
        dep_type: taskForm.dep_type,
        lag: taskForm.lag,
      }, {
        onSuccess: () => setTaskModal({ isOpen: false, mode: 'add' }),
        onError: (errs) => setActionError(Object.values(errs)[0] as string || 'Gagal mengubah Task'),
        onFinish: () => setSubmitting(false),
      });
    }
  };

  // Dependency Management Handlers
  const openManageDependencies = (task: WbsTask) => {
    setDepForm({
      predecessor_wbs_ids: [],
      dependency_type: 'FS',
      lag_days: 0,
    });
    setActionError(null);
    setDepModal({ isOpen: true, task });
  };

  const handleAddDependency = (e: React.FormEvent) => {
    e.preventDefault();
    if (!depModal.task || depForm.predecessor_wbs_ids.length === 0) return;

    setSubmitting(true);
    setActionError(null);

    router.post(`/projects/${proj.id}/tasks/${depModal.task.id}/dependencies`, {
      predecessor_wbs_ids: depForm.predecessor_wbs_ids,
      dependency_type: depForm.dependency_type,
      lag_days: depForm.lag_days,
    }, {
      onSuccess: () => {
        // Refresh local task dependency data
        setDepForm({ predecessor_wbs_ids: [], dependency_type: 'FS', lag_days: 0 });
      },
      onError: (errs) => setActionError(Object.values(errs)[0] as string || 'Gagal menambahkan ketergantungan'),
      onFinish: () => setSubmitting(false),
    });
  };

  const handleRemoveDependency = (depId: number) => {
    setDeleteDepModal({ isOpen: true, id: depId });
  };

  const executeRemoveDependency = () => {
    if (!deleteDepModal) return;
    setSubmitting(true);
    router.delete(`/projects/${proj.id}/tasks/${depModal.task?.id}/dependencies/${deleteDepModal.id}`, {
      preserveScroll: true,
      onSuccess: () => setDeleteDepModal(null),
      onError: (errs) => setActionError(Object.values(errs)[0] as string || 'Gagal menghapus ketergantungan'),
      onFinish: () => setSubmitting(false),
    });
  };

  // Deletion Execution
  const handleDeleteExecute = () => {
    if (!deleteModal) return;
    setSubmitting(true);

    if (deleteModal.type === 'main') {
      router.delete(`/projects/${proj.id}/main-wbs/${deleteModal.id}`, {
        onSuccess: () => setDeleteModal(null),
        onFinish: () => setSubmitting(false),
      });
    } else if (deleteModal.type === 'sub') {
      router.delete(`/projects/${proj.id}/sub-wbs/${deleteModal.id}`, {
        onSuccess: () => setDeleteModal(null),
        onFinish: () => setSubmitting(false),
      });
    } else if (deleteModal.type === 'task') {
      router.delete(`/projects/${proj.id}/tasks/${deleteModal.id}`, {
        onSuccess: () => setDeleteModal(null),
        onFinish: () => setSubmitting(false),
      });
    }
  };

  // Complete Setup Execution
  const handleCompleteSetup = () => {
    // Validate all main tasks have at least 1 subtask
    for (const m of proj.mainWbs || []) {
      if (!m.subWbs || m.subWbs.length === 0) {
        alert(`Main Task "${m.name}" belum memiliki Sub Task. Harap tambahkan minimal 1 Sub Task.`);
        return;
      }
    }

    setSubmitting(true);
    router.post(`/projects/${proj.id}/setup/complete`, {}, {
      onError: (errs) => {
        alert(Object.values(errs)[0] as string || 'Gagal menyelesaikan konfigurasi proyek.');
        setSubmitting(false);
      },
      onFinish: () => setSubmitting(false),
    });
  };

  // Filtered Main Tasks for Search
  const filteredMainWbs = useMemo(() => {
    if (!searchTerm.trim()) return proj.mainWbs || [];
    const term = searchTerm.toLowerCase();

    return (proj.mainWbs || []).map(m => {
      const matchMain = m.name.toLowerCase().includes(term) || m.code.includes(term);
      const filteredSubs = (m.subWbs || []).map(s => {
        const matchSub = s.name.toLowerCase().includes(term) || s.code.includes(term);
        const filteredTasks = (s.wbsTasks || []).filter(t =>
          t.name.toLowerCase().includes(term) ||
          t.code.includes(term) ||
          (t.division_name && t.division_name.toLowerCase().includes(term))
        );
        if (matchSub || filteredTasks.length > 0) {
          return { ...s, wbsTasks: filteredTasks };
        }
        return null;
      }).filter(Boolean) as SubWbs[];

      if (matchMain || filteredSubs.length > 0) {
        return { ...m, subWbs: filteredSubs };
      }
      return null;
    }).filter(Boolean) as MainWbs[];
  }, [proj.mainWbs, searchTerm]);

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto space-y-6">
      {/* Top Breadcrumb & PageHeader */}
      <div>
        <div className="flex items-center gap-2 text-[12px] font-semibold text-neutral-500 mb-2">
          <Link
            href="/projectlistpage"
            className="hover:text-brand flex items-center gap-1 transition-colors"
          >
            <ArrowLeft size={13} /> Project List
          </Link>
        </div>


        <PageHeader
          title={proj.title}
          subtitle={`Perusahaan: ${proj.company} • PIC: ${proj.manager} • Periode Proyek: ${proj.start ? formatDateDisplay(proj.start) : 'N/A'} – ${proj.end ? formatDateDisplay(proj.end) : 'N/A'}`}
          actions={
            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                icon={Network}
                onClick={() => window.open(`/projects/${project.id}/predecessors`, '_blank')}
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                Lihat Predecessor
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={Trash}
                onClick={handleClearAllTasks}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                Hapus Semua Task
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={Plus}
                onClick={openAddMain}
              >
                Tambah Main Task
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={CheckCircle2}
                onClick={() => setConfirmCompleteModal(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs"
              >
                Selesaikan & Aktifkan Proyek
              </Button>
            </div>
          }
        />
      </div>

      {/* Guidance & Stats Card */}
      <Card className="p-4 sm:p-5 space-y-4">


        {/* Metrics Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/80 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Main Tasks</span>
              <div className="text-xl font-black text-neutral-900 mt-0.5">{totalMainTasks}</div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-brand-light text-brand flex items-center justify-center">
              <Layers size={18} />
            </div>
          </div>
          <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/80 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Sub Tasks</span>
              <div className="text-xl font-black text-neutral-900 mt-0.5">{totalSubTasks}</div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <FolderOpen size={18} />
            </div>
          </div>
          <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/80 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Leaf / WBS Tasks</span>
              <div className="text-xl font-black text-neutral-900 mt-0.5">{totalLeafTasks}</div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <CheckSquare size={18} />
            </div>
          </div>
          <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/80 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Total Bobot</span>
              <div className={`text-xl font-black mt-0.5 ${Math.round(totalWeight) === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {totalWeight.toFixed(1)}%
              </div>
            </div>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${Math.round(totalWeight) === 100 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              <BarChart2 size={18} />
            </div>
          </div>
        </div>
      </Card>

      {/* Control Bar (Search & Bulk Expand) */}
      <Card className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Cari Main Task, Sub Task, atau nama pekerjaan..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-[12.5px] rounded-lg border border-neutral-200 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 bg-white"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={expandAll}
          >
            Buka Semua
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={collapseAll}
          >
            Tutup Semua
          </Button>
        </div>
      </Card>

      {/* 3-Tier WBS Hierarchy List */}
      <div className="space-y-4">
        {filteredMainWbs.length === 0 ? (
          <Card className="p-12 text-center">
            <Layers size={32} className="mx-auto text-neutral-300 mb-3" />
            <h3 className="text-base font-bold text-neutral-800">Tidak ada task yang ditemukan</h3>
            <p className="text-[13px] text-neutral-500 mt-1">Coba sesuaikan kata kunci pencarian Anda.</p>
          </Card>
        ) : (
          filteredMainWbs.map((main) => {
            const isMainExpanded = expandedMainIds.has(main.id);
            const subCount = main.subWbs?.length || 0;

            return (
              <Card key={main.id} className="overflow-hidden">
                {/* Level 1: Main Task Bar */}
                <div
                  className="w-full flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3.5 bg-white hover:bg-neutral-50/70 border-b border-neutral-200/80 transition-colors text-left cursor-pointer select-none"
                  onClick={() => toggleMain(main.id)}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="text-neutral-400 flex-shrink-0 mt-1">
                      {isMainExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                    <div className="w-6 h-6 rounded bg-brand text-white flex items-center justify-center flex-shrink-0 shadow-xs mt-0.5">
                      <span className="text-[10px] font-bold">{main.code}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-[15px] sm:text-[16px] font-black text-neutral-900 leading-snug break-words">
                        {main.name}
                      </h2>
                      <div className="flex items-center gap-2 mt-1 text-[12px] text-neutral-600 font-semibold flex-wrap">
                        <span>Bobot: <strong className="text-neutral-900 font-bold">{main.weight}%</strong></span>
                        <span className="text-neutral-300">•</span>
                        <span>{subCount} Sub Tasks</span>
                        {main.start && main.end && (
                          <>
                            <span className="text-neutral-300">•</span>
                            <span className="text-neutral-500 font-medium font-mono text-[11.5px]">
                              {formatDateDisplay(main.start)} – {formatDateDisplay(main.end)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 self-start md:self-center pl-9 md:pl-0" onClick={e => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={Plus}
                      onClick={() => openAddSub(main.id)}
                      className="py-1 px-2.5 text-[11px] h-7 bg-white hover:bg-neutral-50 border-neutral-300 flex-shrink-0"
                    >
                      Add Sub Task
                    </Button>
                    <button
                      type="button"
                      onClick={() => openEditMain(main)}
                      className="p-1.5 text-neutral-400 hover:text-brand bg-white hover:bg-neutral-50 rounded border border-neutral-200 shadow-xs transition-colors flex-shrink-0"
                      title="Edit Main Task"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteModal({ isOpen: true, type: 'main', id: main.id, name: main.name })}
                      className="p-1.5 text-neutral-400 hover:text-danger bg-white hover:bg-red-50 rounded border border-neutral-200 shadow-xs transition-colors flex-shrink-0"
                      title="Hapus Main Task"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Level 2 & 3: Sub Tasks & Leaf Tasks */}
                {isMainExpanded && (
                  <div className="p-3 sm:p-4 bg-neutral-50/40 space-y-3">
                    {subCount === 0 ? (
                      <div className="p-6 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 text-center">
                        <AlertTriangle size={24} className="mx-auto text-amber-600 mb-2" />
                        <h4 className="text-[13px] font-bold text-amber-900">Belum ada Sub Task</h4>
                        <p className="text-[12px] text-amber-700 mt-0.5 mb-3">
                          Main task ini membutuhkan minimal 1 Sub Task agar proyek dapat aktif.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          icon={Plus}
                          onClick={() => openAddSub(main.id)}
                        >
                          Tambah Sub Task Sekarang
                        </Button>
                      </div>
                    ) : (
                      main.subWbs.map((sub) => {
                        const isSubExpanded = expandedSubIds.has(sub.id);
                        const leafCount = sub.wbsTasks?.length || 0;

                        return (
                          <div
                            key={sub.id}
                            className="bg-white rounded-lg border border-neutral-200 shadow-2xs overflow-hidden"
                          >
                            {/* Sub Task Bar */}
                            <div
                              className="px-3.5 py-2.5 bg-neutral-50/80 border-b border-neutral-200/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 cursor-pointer select-none hover:bg-neutral-100/60 transition-colors"
                              onClick={() => toggleSub(sub.id)}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <button
                                  type="button"
                                  className="text-neutral-400 hover:text-neutral-700 transition-colors flex-shrink-0"
                                >
                                  {isSubExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                </button>
                                <span className="text-[11px] font-bold text-brand bg-brand-light border border-brand-border px-1.5 py-0.5 rounded">
                                  {sub.code}
                                </span>
                                <h3 className="text-[13.5px] font-bold text-neutral-900 truncate">
                                  {sub.name}
                                </h3>
                                <span className="text-[11.5px] text-neutral-500 font-medium ml-1">
                                  ({leafCount} Pekerjaan)
                                </span>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0" onClick={e => e.stopPropagation()}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  icon={Plus}
                                  onClick={() => openAddTask(sub.id)}
                                  className="py-0.5 px-2 text-[11px] h-6.5 bg-white hover:bg-neutral-50 border-neutral-300"
                                >
                                  Task
                                </Button>
                                <button
                                  type="button"
                                  onClick={() => openEditSub(sub)}
                                  className="p-1 text-neutral-400 hover:text-brand bg-white hover:bg-neutral-50 rounded border border-neutral-200 shadow-xs transition-colors"
                                  title="Edit Sub Task"
                                >
                                  <Edit2 size={12.5} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteModal({ isOpen: true, type: 'sub', id: sub.id, name: sub.name })}
                                  className="p-1 text-neutral-400 hover:text-danger bg-white hover:bg-red-50 rounded border border-neutral-200 shadow-xs transition-colors"
                                  title="Hapus Sub Task"
                                >
                                  <Trash2 size={12.5} />
                                </button>
                              </div>
                            </div>

                            {/* Level 3: Leaf Tasks Table */}
                            {isSubExpanded && (
                              <div className="p-3 overflow-x-auto scrollbar-thin">
                                {leafCount === 0 ? (
                                  <div className="py-4 text-center text-[12px] text-neutral-400 italic">
                                    Belum ada pekerjaan spesifik (leaf task). Klik "+ Task" untuk menambahkan.
                                  </div>
                                ) : (
                                  <table className="w-full min-w-[760px] text-left text-[12.5px] border-collapse">
                                    <thead>
                                      <tr className="bg-neutral-100/70 border-b border-neutral-200 text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                                        <th className="py-2.5 px-3">WBS Code</th>
                                        <th className="py-2.5 px-3">Nama Pekerjaan</th>
                                        <th className="py-2.5 px-3">Divisi</th>
                                        <th className="py-2.5 px-3">Vendor</th>
                                        <th className="py-2.5 px-3">Start & End</th>
                                        <th className="py-2.5 px-3">Durasi</th>
                                        <th className="py-2.5 px-3">Dependensi (Predecessor)</th>
                                        <th className="py-2.5 px-3 text-right">Aksi</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100">
                                      {sub.wbsTasks.map((task) => (
                                        <tr key={task.id} className="hover:bg-neutral-50/70 transition-colors">
                                          <td className="py-2.5 px-3 font-mono text-[11px] text-neutral-500 font-semibold">
                                            {task.code}
                                          </td>
                                          <td className="py-2.5 px-3 font-bold text-neutral-900 max-w-[220px] truncate" title={task.name}>
                                            {task.name}
                                          </td>
                                          <td className="py-2.5 px-3">
                                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200">
                                              {task.division_name}
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-3 text-neutral-600 font-medium">
                                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                              {task.vendor || 'INTERNAL'}
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-3 font-mono text-[11.5px] text-neutral-600 whitespace-nowrap">
                                            {task.start ? formatDateDisplay(task.start) : '-'} → {task.end ? formatDateDisplay(task.end) : '-'}
                                          </td>
                                          <td className="py-2.5 px-3 font-semibold text-neutral-700">
                                            <span className="px-2 py-0.5 bg-neutral-100 rounded text-[11.5px]">
                                              {task.duration_days} hari
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-3">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                              {task.dependencies && task.dependencies.length > 0 ? (
                                                task.dependencies.map((dep) => (
                                                  <span
                                                    key={dep.id}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                                                    title={`Predecessor: ${dep.predecessor_name} (${dep.dependency_type}, Lag: ${dep.lag_days}d)`}
                                                  >
                                                    <Link2 size={11} />
                                                    <span className="font-mono">{dep.dependency_type}</span>
                                                    {dep.lag_days !== 0 && (
                                                      <span className="text-[10px] text-indigo-500">
                                                        {dep.lag_days > 0 ? `+${dep.lag_days}d` : `${dep.lag_days}d`}
                                                      </span>
                                                    )}
                                                  </span>
                                                ))
                                              ) : (
                                                <span className="text-[11px] text-neutral-400 italic">
                                                  Tidak ada
                                                </span>
                                              )}
                                              <button
                                                type="button"
                                                onClick={() => openManageDependencies(task)}
                                                className="p-1 rounded text-neutral-400 hover:text-brand hover:bg-brand/10 transition-colors ml-1"
                                                title="Atur Ketergantungan (Predecessor)"
                                              >
                                                <Link2 size={13} />
                                              </button>
                                            </div>
                                          </td>
                                          <td className="py-2.5 px-3 text-right">
                                            <div className="inline-flex items-center gap-1">
                                              <button
                                                type="button"
                                                onClick={() => openEditTask(task)}
                                                className="p-1 text-neutral-400 hover:text-brand bg-white hover:bg-neutral-50 rounded border border-neutral-200 shadow-xs transition-colors"
                                                title="Edit Task"
                                              >
                                                <Edit2 size={13} />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setDeleteModal({ isOpen: true, type: 'task', id: task.id, name: task.name })}
                                                className="p-1 text-neutral-400 hover:text-danger bg-white hover:bg-red-50 rounded border border-neutral-200 shadow-xs transition-colors"
                                                title="Hapus Task"
                                              >
                                                <Trash2 size={13} />
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md rounded-xl border border-neutral-200/90 p-4 shadow-lg flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[13px] font-semibold text-neutral-700">
            Pastikan seluruh susunan pekerjaan proyek telah terverifikasi dengan benar sebelum diaktifkan.
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            icon={Network}
            onClick={() => window.open(`/projects/${project.id}/predecessors`, '_blank')}
            className="text-blue-600 border-blue-200 hover:bg-blue-50"
          >
            Lihat Predecessor
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={Trash}
            onClick={handleClearAllTasks}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            Hapus Semua Task
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={Plus}
            onClick={openAddMain}
          >
            Tambah Main Task
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={CheckCircle2}
            onClick={() => setConfirmCompleteModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs"
          >
            Selesaikan & Aktifkan Proyek
          </Button>
        </div>
      </div>

              {/* Predecessor Chart Modal */}
        {chartModal && (
          <Modal title="Visualisasi Predecessor" onClose={() => setChartModal(false)} size="xl">
            <div className="p-4 overflow-auto bg-white rounded-lg" style={{ minHeight: '400px' }}>
              <div className="mermaid">
                {getMermaidGraph()}
              </div>
            </div>
          </Modal>
        )}

        {/* Modal Add / Edit Main Task */}
      {mainModal.isOpen && (
        <Modal
          title={mainModal.mode === 'add' ? 'Tambah Main Task Baru' : 'Edit Main Task'}
          onClose={() => setMainModal({ isOpen: false, mode: 'add' })}
          size="md"
        >
          <form onSubmit={handleSaveMain} className="space-y-4">
            {actionError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12px] font-semibold">
                {actionError}
              </div>
            )}
            <div>
              <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                Nama Main Task <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={mainForm.name}
                onChange={e => setMainForm({ ...mainForm, name: e.target.value })}
                placeholder="e.g. CIVIL WORKS, PRODUCTION MACHINE, dll"
                className="w-full px-3.5 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                required
              />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                Bobot Proyek (%) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={mainForm.weight}
                onChange={e => setMainForm({ ...mainForm, weight: parseFloat(e.target.value) || 0 })}
                className="w-full px-3.5 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={mainForm.start}
                  onChange={e => {
                    const newStart = e.target.value;
                    const nextForm = { ...mainForm, start: newStart };
                    if (newStart && mainForm.end && mainForm.end <= newStart) {
                      nextForm.end = getMinEndDate(newStart) || '';
                    }
                    setMainForm(nextForm);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={mainForm.end}
                  min={getMinEndDate(mainForm.start)}
                  onChange={e => setMainForm({ ...mainForm, end: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
              <Button
                variant="outline"
                size="md"
                type="button"
                onClick={() => setMainModal({ isOpen: false, mode: 'add' })}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                size="md"
                type="submit"
                disabled={submitting}
              >
                {submitting ? 'Menyimpan...' : 'Simpan Main Task'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Add / Edit Sub Task */}
      {subModal.isOpen && (() => {
        const parentMain = proj.mainWbs?.find(m => m.id === (subModal.parentId || subModal.item?.main_wbs_id));
        const mainStart = parentMain?.start || '';
        const mainEnd = parentMain?.end || '';

        return (
          <Modal
            title={subModal.mode === 'add' ? 'Tambah Sub Task Baru' : 'Edit Sub Task'}
            onClose={() => setSubModal({ isOpen: false, mode: 'add' })}
            size="md"
          >
          <form onSubmit={handleSaveSub} className="space-y-4">
            {actionError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12px] font-semibold">
                {actionError}
              </div>
            )}
            <div>
              <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                Nama Sub Task <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={subForm.name}
                onChange={e => setSubForm({ ...subForm, name: e.target.value })}
                placeholder="e.g. SUBSTRUCTURE, SUPERSTRUCTURE, PIPING, dll"
                className="w-full px-3.5 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={subForm.start}
                  min={mainStart}
                  max={mainEnd}
                  onChange={e => {
                    const newStart = e.target.value;
                    const nextForm = { ...subForm, start: newStart };
                    if (newStart && subForm.end && subForm.end <= newStart) {
                      nextForm.end = getMinEndDate(newStart) || '';
                    }
                    setSubForm(nextForm);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={subForm.end}
                  min={getMinEndDate(subForm.start) || mainStart}
                  max={mainEnd}
                  onChange={e => setSubForm({ ...subForm, end: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
              <Button
                variant="outline"
                size="md"
                type="button"
                onClick={() => setSubModal({ isOpen: false, mode: 'add' })}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                size="md"
                type="submit"
                disabled={submitting}
              >
                {submitting ? 'Menyimpan...' : 'Simpan Sub Task'}
              </Button>
            </div>
          </form>
        </Modal>
        );
      })()}

      {/* Modal Add / Edit Leaf Task (WBS) */}
      {taskModal.isOpen && (() => {
        // Preview computed end date (for display only, actual save uses computed value)
        const previewEnd = calcEndDate(taskForm.start, taskForm.duration);
        // Is a predecessor selected?
        const hasPredecessor = !!taskForm.predecessor_wbs_id;
        const selectedPred = hasPredecessor ? allLeafTasks.find(t => String(t.id) === taskForm.predecessor_wbs_id) : null;
        
        let parentSub: SubWbs | undefined;
        for (const m of (proj.mainWbs || [])) {
          const s = m.subWbs?.find(s => s.id === (taskModal.parentId || taskModal.item?.sub_wbs_id));
          if (s) { parentSub = s; break; }
        }
        const minStart = parentSub?.start || proj.start || '';
        const maxEnd = parentSub?.end || proj.end || '';

        return (
          <Modal
            title={taskModal.mode === 'add' ? 'Add New Task (Sub-task Item)' : 'Edit Task (Sub-task Item)'}
            subtitle={taskModal.mode === 'add' ? 'Add specific project task breakdown item' : 'Edit project task breakdown item'}
            onClose={() => setTaskModal({ isOpen: false, mode: 'add' })}
            size="md"
          >
            <form onSubmit={handleSaveTask} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
              {actionError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12px] font-semibold flex items-center gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0" />
                  {actionError}
                </div>
              )}

              {/* Task Name */}
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  Task Description <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={taskForm.name}
                  onChange={e => setTaskForm({ ...taskForm, name: e.target.value })}
                  placeholder="e.g. Preparation and review of vendor documents..."
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 bg-white font-medium"
                  required
                />
              </div>

              {/* Division */}
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  Responsible Division <span className="text-red-500">*</span>
                </label>
                <select
                  value={taskForm.divisions_id}
                  onChange={e => setTaskForm({ ...taskForm, divisions_id: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white font-medium"
                >
                  {divisions.map((d: DivisionOption) => (
                    <option key={d.id} value={d.id}>{d.divisi}</option>
                  ))}
                </select>
              </div>

              {/* Duration and Start Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                    Duration (Days) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={taskForm.duration}
                    onChange={e => setTaskForm({ ...taskForm, duration: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white text-[13px] outline-none focus:border-brand font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={taskForm.start}
                    min={minStart}
                    max={maxEnd}
                    onChange={e => setTaskForm({ ...taskForm, start: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
                    required
                  />
                </div>
              </div>

              {/* Predecessor (Full Width) */}
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  Predecessor (WBS Task / Sub-sub Task)
                </label>
                <select
                  value={taskForm.predecessor_wbs_id}
                  onChange={e => setTaskForm({ ...taskForm, predecessor_wbs_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
                >
                  <option value="">None (No Predecessor)</option>
                  {allLeafTasks
                    .filter(t => t.id !== taskModal.item?.id)
                    .map(t => (
                      <option key={t.id} value={t.id}>
                        [{t.code}] {t.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Dependency Type (Full Width) */}
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  Dependency Type
                </label>
                <select
                  value={taskForm.dep_type}
                  onChange={e => setTaskForm({ ...taskForm, dep_type: e.target.value as 'FS' | 'SS' | 'FF' | 'SF' })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white font-medium"
                >
                  <option value="FS">Finish-to-Start (FS)</option>
                  <option value="SS">Start-to-Start (SS)</option>
                  <option value="FF">Finish-to-Finish (FF)</option>
                  <option value="SF">Start-to-Finish (SF)</option>
                </select>
              </div>

              {/* Lag and Lead */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-100">
                <div>
                  <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                    Lag (Days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={taskForm.lag}
                    onChange={e => setTaskForm({ ...taskForm, lag: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] font-bold outline-none focus:border-brand bg-white"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                    Lead (Days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={0}
                    onChange={() => {}}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] font-bold outline-none focus:border-brand bg-white"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Evidence Requirement */}
              <div className="pt-2 border-t border-neutral-100">
                 <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 transition-colors">
                   <input 
                     type="checkbox" 
                     checked={taskForm.requires_evidence} 
                     onChange={e => setTaskForm({ ...taskForm, requires_evidence: e.target.checked })} 
                     className="w-4 h-4 rounded text-brand border-neutral-300 focus:ring-brand" 
                   />
                   <div className="flex flex-col">
                     <span className="text-[13px] font-bold text-neutral-800">Requires Evidence for Completion</span>
                     <span className="text-[11.5px] text-neutral-500">Workers must upload a file/photo to mark this task 100% complete.</span>
                   </div>
                 </label>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setTaskModal({ isOpen: false, mode: 'add' })}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  disabled={submitting || !taskForm.name.trim()}
                >
                  {submitting ? 'Saving...' : 'Save Task'}
                </Button>
              </div>
            </form>
          </Modal>
        );
      })()}

      {/* Modal Manage Dependencies (Predecessors & Types: FS, SS, FF, SF) */}
      {depModal.isOpen && depModal.task && (
        <Modal
          title={`Kelola Ketergantungan: ${depModal.task.name}`}
          onClose={() => setDepModal({ isOpen: false })}
          size="lg"
        >
          <div className="space-y-5">
            {/* Task Info Header */}
            <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 text-[12.5px] flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-neutral-500 font-medium">Task ID:</span>{' '}
                <strong className="font-mono text-neutral-900">{depModal.task.id}</strong>
              </div>
              <div>
                <span className="text-neutral-500 font-medium">Jadwal:</span>{' '}
                <strong>{depModal.task.start ? formatDateDisplay(depModal.task.start) : '-'} → {depModal.task.end ? formatDateDisplay(depModal.task.end) : '-'}</strong>
              </div>
              <div>
                <span className="text-neutral-500 font-medium">Durasi:</span>{' '}
                <strong>{depModal.task.duration_days} hari</strong>
              </div>
            </div>

            {actionError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12px] font-semibold">
                {actionError}
              </div>
            )}

            {/* List of existing dependencies */}
            <div>
              <h4 className="text-[13px] font-bold text-neutral-900 mb-2 flex items-center gap-1.5">
                <Link2 size={15} className="text-brand" />
                Predecessor Terhubung ({depModal.task.dependencies?.length || 0})
              </h4>

              {(!depModal.task.dependencies || depModal.task.dependencies.length === 0) ? (
                <div className="p-4 text-center rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-500 text-[12.5px] italic">
                  Belum ada predecessor yang terhubung dengan task ini.
                </div>
              ) : (
                <div className="space-y-3">
                  {dependencyGroups.map((dependencies, groupIndex) => (
                    <div key={dependencies[0].dependency_group_id ?? `dependency-${groupIndex}`} className="p-3 rounded-xl bg-white border border-neutral-200 shadow-2xs">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-black bg-indigo-100 text-indigo-800">
                          {dependencies[0].dependency_type}
                        </span>
                        <span className="text-[11.5px] text-neutral-500">
                          {dependencies.length > 1
                            ? `Semua ${dependencies.length} predecessor wajib terpenuhi`
                            : dependencies[0].dependency_type === 'FS'
                              ? 'Finish-to-Start (Task mulai setelah predecessor selesai)'
                              : dependencies[0].dependency_type === 'SS'
                                ? 'Start-to-Start (Task mulai setelah predecessor mulai)'
                                : dependencies[0].dependency_type === 'FF'
                                  ? 'Finish-to-Finish (Task selesai setelah predecessor selesai)'
                                  : 'Start-to-Finish (Task selesai setelah predecessor mulai)'}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {dependencies.map(dep => (
                          <div key={dep.id} className="flex items-center justify-between gap-3">
                            <div>
                              <strong className="text-[13px] text-neutral-900">{dep.predecessor_name}</strong>
                              {dep.lag_days !== 0 && (
                                <span className="ml-2 text-[11px] text-neutral-500">
                                  Jeda: {dep.lag_days > 0 ? `+${dep.lag_days}` : dep.lag_days} hari
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveDependency(dep.id)}
                              className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Hapus Ketergantungan"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add New Dependency Form */}
            <form onSubmit={handleAddDependency} className="p-4 rounded-xl bg-neutral-50/80 border border-neutral-200 space-y-3">
              <h5 className="text-[12.5px] font-bold text-neutral-900">
                + Tambah Ketergantungan Baru
              </h5>

              <div>
                <label className="block text-[11.5px] font-bold text-neutral-700 mb-1">
                  Pilih Task Predecessor (bisa lebih dari satu) <span className="text-red-500">*</span>
                </label>
                <select
                  multiple
                  size={6}
                  value={depForm.predecessor_wbs_ids}
                  onChange={e => setDepForm({
                    ...depForm,
                    predecessor_wbs_ids: Array.from(e.currentTarget.selectedOptions, option => option.value),
                  })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
                  required
                >
                  {(allTasks || [])
                    .filter((t: any) => t.id !== depModal.task?.id)
                    .map((t: any) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.start ? formatDateDisplay(t.start) : ''} - {t.end ? formatDateDisplay(t.end) : ''})
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-[11px] text-neutral-500">Gunakan Ctrl (Windows) atau Command (Mac) untuk memilih beberapa tugas sekaligus.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11.5px] font-bold text-neutral-700">
                      Tipe Ketergantungan <span className="text-red-500">*</span>
                    </label>
                    <div className="relative group">
                      <Info size={14} className="text-brand cursor-help" />
                      <div className="pointer-events-none absolute bottom-full right-[-10px] mb-2 w-[280px] opacity-0 group-hover:opacity-100 transition-opacity z-10 p-3 bg-neutral-800 text-white text-[11px] rounded-xl shadow-xl leading-relaxed">
                        <div className="font-bold text-[12px] mb-2 border-b border-neutral-600 pb-1">Panduan Relasi (Dependency)</div>
                        <ul className="space-y-2">
                          <li><strong className="text-emerald-400">FS (Finish-to-Start):</strong> Task B mulai setelah Task A selesai. <br/><span className="text-neutral-400 text-[10.5px] italic">Contoh: Pekerjaan Plesteran mulai setelah Dinding selesai.</span></li>
                          <li><strong className="text-blue-400">SS (Start-to-Start):</strong> Task B mulai bersamaan dengan Task A.</li>
                          <li><strong className="text-purple-400">FF (Finish-to-Finish):</strong> Task B selesai bersamaan dengan Task A.</li>
                          <li><strong className="text-orange-400">SF (Start-to-Finish):</strong> Task B selesai setelah Task A mulai.</li>
                        </ul>
                        <div className="mt-2 pt-2 border-t border-neutral-600">
                          <strong className="text-yellow-400">Jeda (Lag):</strong> Waktu tunggu (hari).<br/>
                          <span className="text-neutral-400 text-[10px]">Positif (+) = menunda mulai, Negatif (-) = mulai lebih awal (percepatan).</span>
                        </div>
                        <div className="absolute top-full right-3 border-4 border-transparent border-t-neutral-800" />
                      </div>
                    </div>
                  </div>
                  <select
                    value={depForm.dependency_type}
                    onChange={e => setDepForm({ ...depForm, dependency_type: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white font-semibold"
                  >
                    <option value="FS">FS: Finish-to-Start (Standar)</option>
                    <option value="SS">SS: Start-to-Start</option>
                    <option value="FF">FF: Finish-to-Finish</option>
                    <option value="SF">SF: Start-to-Finish</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11.5px] font-bold text-neutral-700 mb-1">
                    Jeda / Lag (Hari)
                  </label>
                  <input
                    type="number"
                    value={depForm.lag_days}
                    onChange={e => setDepForm({ ...depForm, lag_days: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
                  />
                  <span className="text-[10.5px] text-neutral-500 mt-0.5 block">
                    Nilai positif (+) = jeda hari, negatif (-) = percepatan (lead time).
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  disabled={submitting || depForm.predecessor_wbs_ids.length === 0}
                  icon={Link2}
                >
                  {submitting ? 'Menyambungkan...' : 'Hubungkan Predecessor'}
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal: Delete */}
      {deleteModal && (
        <Modal
          title={`Hapus ${deleteModal.type === 'main' ? 'Main Task' : deleteModal.type === 'sub' ? 'Sub Task' : 'Pekerjaan'}`}
          onClose={() => setDeleteModal(null)}
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-[13px] text-neutral-600">
              Apakah Anda yakin ingin menghapus <strong>"{deleteModal.name}"</strong>?
              {deleteModal.type !== 'task' && ' Seluruh sub-task dan pekerjaan di bawahnya juga akan ikut terhapus.'}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <Button variant="outline" size="sm" onClick={() => setDeleteModal(null)}>
                Batal
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDeleteExecute}
                disabled={submitting}
              >
                {submitting ? 'Menghapus...' : 'Ya, Hapus'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal: Delete Dependency */}
      {deleteDepModal && (
        <Modal
          title="Hapus Ketergantungan Predecessor"
          onClose={() => setDeleteDepModal(null)}
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-[13px] text-neutral-600">
              Apakah Anda yakin ingin menghapus relasi predecessor ini?
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <Button variant="outline" size="sm" onClick={() => setDeleteDepModal(null)}>
                Batal
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={executeRemoveDependency}
                disabled={submitting}
              >
                {submitting ? 'Menghapus...' : 'Ya, Hapus'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal: Complete Setup */}
      {confirmCompleteModal && (
        <Modal
          title="Konfirmasi Penyelesaian Setup Proyek"
          onClose={() => setConfirmCompleteModal(false)}
          size="md"
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
              <CheckCircle2 size={24} className="text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="text-[13px] text-emerald-900 leading-relaxed">
                Anda akan menyelesaikan konfigurasi template WBS dan mengaktifkan proyek <strong>{proj.title}</strong>.
                Seluruh perhitungan jadwal, dependensi FS/FF/SS/SF, dan progress akan dihitung secara otomatis dan proyek akan langsung muncul di Dashboard aktif.
              </div>
            </div>

            <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 text-[12.5px] space-y-1.5">
              <div className="flex justify-between">
                <span className="text-neutral-500">Total Main Task:</span>
                <strong className="text-neutral-900">{totalMainTasks}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Total Sub Task:</span>
                <strong className="text-neutral-900">{totalSubTasks}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Total Leaf WBS Task:</span>
                <strong className="text-neutral-900">{totalLeafTasks}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Total Bobot:</span>
                <strong className={Math.round(totalWeight) === 100 ? 'text-emerald-600' : 'text-amber-600'}>
                  {totalWeight.toFixed(1)}%
                </strong>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <Button
                variant="outline"
                size="md"
                onClick={() => setConfirmCompleteModal(false)}
              >
                Kembali Periksa
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleCompleteSetup}
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                {submitting ? 'Memproses Jadwal...' : 'Ya, Aktifkan Proyek'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
