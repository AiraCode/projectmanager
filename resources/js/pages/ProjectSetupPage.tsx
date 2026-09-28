import React, { useState, useMemo } from 'react';
import { usePage, Link, router } from '@inertiajs/react';
import {
  FolderOpen, Plus, Calendar, Layers, ChevronDown, ChevronRight,
  Edit2, Trash2, Link2, CheckCircle2, AlertTriangle, ArrowLeft,
  Sparkles, Shield, Clock, HelpCircle, Save, Check, X, Search
} from 'lucide-react';
import { PageHeader, Button, Modal, formatDateDisplay } from '@/components/ui';

interface DependencyItem {
  id: number;
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

  // Form States - Main Task
  const [mainForm, setMainForm] = useState({ name: '', weight: 5.0, start: proj.start || '', end: proj.end || '' });
  // Form States - Sub Task
  const [subForm, setSubForm] = useState({ name: '', start: proj.start || '', end: proj.end || '' });
  // Form States - Leaf Task
  const [taskForm, setTaskForm] = useState({
    name: '',
    divisions_id: divisions[0]?.id || 1,
    start: proj.start || '',
    end: proj.end || '',
    duration: 5,
    vendor: 'INTERNAL',
    requires_evidence: false,
    predecessor: '',
    dep_type: 'FS',
    lag: 0,
  });

  // Form States - Dependency Modal
  const [depForm, setDepForm] = useState({
    predecessor_wbs_id: '',
    dependency_type: 'FS' as 'FS' | 'SS' | 'FF' | 'SF',
    lag_days: 0,
  });

  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  // Leaf Task Add / Edit Handlers
  const openAddTask = (subId: number) => {
    const today = new Date().toISOString().slice(0, 10);
    const in5Days = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    setTaskForm({
      name: '',
      divisions_id: divisions[0]?.id || 1,
      start: proj.start || today,
      end: in5Days,
      duration: 5,
      vendor: 'INTERNAL',
      requires_evidence: false,
      predecessor: '',
      dep_type: 'FS',
      lag: 0,
    });
    setActionError(null);
    setTaskModal({ isOpen: true, mode: 'add', parentId: subId });
  };

  const openEditTask = (item: WbsTask) => {
    setTaskForm({
      name: item.name,
      divisions_id: item.division_id || divisions[0]?.id || 1,
      start: item.start || proj.start || '',
      end: item.end || proj.end || '',
      duration: item.duration_days || 1,
      vendor: item.vendor || 'INTERNAL',
      requires_evidence: item.requires_evidence || false,
      predecessor: item.predecessor || '',
      dep_type: item.dep_type || 'FS',
      lag: item.lag || 0,
    });
    setActionError(null);
    setTaskModal({ isOpen: true, mode: 'edit', item });
  };

  const handleSaveTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.name.trim()) return;
    if (taskForm.start && taskForm.end && taskForm.end <= taskForm.start) {
      setActionError('Target Finish Date harus setelah Start Date (minimal 1 hari setelahnya).');
      return;
    }

    setSubmitting(true);
    setActionError(null);

    if (taskModal.mode === 'add' && taskModal.parentId) {
      router.post(`/projects/${proj.id}/tasks`, {
        sub_wbs_id: taskModal.parentId,
        name: taskForm.name.trim(),
        divisions_id: taskForm.divisions_id,
        duration: taskForm.duration,
        start: taskForm.start,
        end: taskForm.end,
        vendor: taskForm.vendor,
        requires_evidence: taskForm.requires_evidence,
        predecessor: taskForm.predecessor || null,
        dep_type: taskForm.dep_type || 'FS',
        lag: taskForm.lag || 0,
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
        end: taskForm.end,
        vendor: taskForm.vendor,
        requires_evidence: taskForm.requires_evidence,
        predecessor: taskForm.predecessor || null,
        dep_type: taskForm.dep_type || 'FS',
        lag: taskForm.lag || 0,
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
      predecessor_wbs_id: '',
      dependency_type: 'FS',
      lag_days: 0,
    });
    setActionError(null);
    setDepModal({ isOpen: true, task });
  };

  const handleAddDependency = (e: React.FormEvent) => {
    e.preventDefault();
    if (!depModal.task || !depForm.predecessor_wbs_id) return;

    setSubmitting(true);
    setActionError(null);

    router.post(`/projects/${proj.id}/tasks/${depModal.task.id}/dependencies`, {
      predecessor_wbs_id: depForm.predecessor_wbs_id,
      dependency_type: depForm.dependency_type,
      lag_days: depForm.lag_days,
    }, {
      onSuccess: () => {
        // Refresh local task dependency data
        setDepForm({ predecessor_wbs_id: '', dependency_type: 'FS', lag_days: 0 });
      },
      onError: (errs) => setActionError(Object.values(errs)[0] as string || 'Gagal menambahkan ketergantungan'),
      onFinish: () => setSubmitting(false),
    });
  };

  const handleRemoveDependency = (depId: number) => {
    if (!confirm('Hapus ketergantungan ini?')) return;
    router.delete(`/projects/${proj.id}/tasks/${depModal.task?.id}/dependencies/${depId}`, {
      preserveScroll: true,
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border-2 border-neutral-900 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link
                href="/projectlistpage"
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-neutral-500 hover:text-neutral-900 transition-colors"
              >
                <ArrowLeft size={14} /> Kembali ke Project List
              </Link>
              <span className="text-neutral-300">•</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                <Sparkles size={12} className="text-amber-600 animate-spin" style={{ animationDuration: '4s' }} />
                {proj.setup_status === 'pending_setup' ? 'WBS Setup Mode (Draft)' : 'Setup Aktif'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
              {proj.title}
            </h1>
            <p className="text-[13px] text-neutral-600 mt-1 flex flex-wrap items-center gap-y-1 gap-x-3">
              <span>Perusahaan: <strong className="text-neutral-900">{proj.company}</strong></span>
              <span>•</span>
              <span>PIC: <strong className="text-neutral-900">{proj.manager}</strong></span>
              <span>•</span>
              <span>Periode Proyek: <strong className="text-neutral-900">{proj.start ? formatDateDisplay(proj.start) : 'N/A'} – {proj.end ? formatDateDisplay(proj.end) : 'N/A'}</strong></span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="md"
              icon={Plus}
              onClick={openAddMain}
            >
              Tambah Main Task
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={CheckCircle2}
              onClick={() => setConfirmCompleteModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg transition-all"
            >
              Selesaikan & Aktifkan Proyek
            </Button>
          </div>
        </div>

        {/* Informative Guidance Banner */}
        <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-200/80 flex items-start gap-3">
          <HelpCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-[12.5px] text-blue-900 leading-relaxed">
            <strong>Petunjuk Konfigurasi:</strong> Template standar 17 Main Task telah dimuat secara otomatis. Anda dapat menambah, mengubah nama, bobot, divisi, vendor, dan keterkaitan dependensi (FS, SS, FF, SF serta jeda/lag). Pastikan seluruh task tersusun dengan rapi sebelum menekan tombol <strong>"Selesaikan & Aktifkan Proyek"</strong>.
          </div>
        </div>

        {/* Metrics Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-neutral-100">
          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Main Tasks</span>
            <div className="text-xl font-black text-neutral-900 mt-0.5">{totalMainTasks}</div>
          </div>
          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Sub Tasks</span>
            <div className="text-xl font-black text-neutral-900 mt-0.5">{totalSubTasks}</div>
          </div>
          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Leaf / WBS Tasks</span>
            <div className="text-xl font-black text-neutral-900 mt-0.5">{totalLeafTasks}</div>
          </div>
          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Total Bobot</span>
            <div className={`text-xl font-black mt-0.5 ${Math.round(totalWeight) === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {totalWeight.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* Control Bar (Search & Bulk Expand) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3.5 rounded-xl border border-neutral-200 shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Cari Main Task, Sub Task, atau nama pekerjaan..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-[12.5px] rounded-lg border border-neutral-200 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
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

        <div className="flex items-center gap-2 text-[12px]">
          <button
            onClick={expandAll}
            className="px-3 py-1.5 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 font-semibold text-neutral-700 transition-colors"
          >
            Buka Semua
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-1.5 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 font-semibold text-neutral-700 transition-colors"
          >
            Tutup Semua
          </button>
        </div>
      </div>

      {/* 3-Tier WBS Hierarchy List */}
      <div className="space-y-4">
        {filteredMainWbs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center">
            <Layers size={32} className="mx-auto text-neutral-300 mb-3" />
            <h3 className="text-base font-bold text-neutral-800">Tidak ada task yang ditemukan</h3>
            <p className="text-[13px] text-neutral-500 mt-1">Coba sesuaikan kata kunci pencarian Anda.</p>
          </div>
        ) : (
          filteredMainWbs.map((main) => {
            const isMainExpanded = expandedMainIds.has(main.id);
            const subCount = main.subWbs?.length || 0;

            return (
              <div
                key={main.id}
                className="bg-white rounded-2xl border-2 border-neutral-800 overflow-hidden shadow-xs transition-shadow hover:shadow-md"
              >
                {/* Level 1: Main Task Bar */}
                <div
                  className="p-4 sm:p-4.5 bg-neutral-900 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 cursor-pointer select-none"
                  onClick={() => toggleMain(main.id)}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-300 transition-colors"
                    >
                      {isMainExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center text-[12px] font-black text-amber-400">
                        {main.code}
                      </span>
                      <h2 className="text-[15px] sm:text-[16px] font-black tracking-tight text-white">
                        {main.name}
                      </h2>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-auto" onClick={e => e.stopPropagation()}>
                    <span className="text-[12px] font-bold px-2.5 py-1 rounded-md bg-neutral-800 text-neutral-300 border border-neutral-700">
                      Bobot: <strong className="text-white">{main.weight}%</strong>
                    </span>
                    <span className={`text-[12px] font-bold px-2.5 py-1 rounded-md ${subCount > 0 ? 'bg-neutral-800 text-neutral-300' : 'bg-amber-900/60 text-amber-300 border border-amber-600'}`}>
                      {subCount} Sub Task
                    </span>
                    <button
                      type="button"
                      onClick={() => openAddSub(main.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-bold bg-brand hover:bg-brand/90 text-white transition-colors"
                      title="Tambah Sub Task baru di bawah Main Task ini"
                    >
                      <Plus size={13} /> Sub Task
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditMain(main)}
                      className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors"
                      title="Edit Main Task"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteModal({ isOpen: true, type: 'main', id: main.id, name: main.name })}
                      className="p-1.5 rounded-lg hover:bg-red-950 text-neutral-400 hover:text-red-400 transition-colors"
                      title="Hapus Main Task"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Level 2 & 3: Sub Tasks & Leaf Tasks */}
                {isMainExpanded && (
                  <div className="p-4 sm:p-5 bg-neutral-50/50 space-y-4">
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
                            className="bg-white rounded-xl border border-neutral-300 shadow-2xs overflow-hidden"
                          >
                            {/* Sub Task Bar */}
                            <div
                              className="p-3 sm:p-3.5 bg-neutral-100/90 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 cursor-pointer select-none"
                              onClick={() => toggleSub(sub.id)}
                            >
                              <div className="flex items-center gap-2.5">
                                <button
                                  type="button"
                                  className="p-1 rounded text-neutral-500 hover:text-neutral-900 transition-colors"
                                >
                                  {isSubExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                </button>
                                <span className="text-[12px] font-black text-brand bg-brand/10 px-2 py-0.5 rounded">
                                  {sub.code}
                                </span>
                                <h3 className="text-[13.5px] font-bold text-neutral-900">
                                  {sub.name}
                                </h3>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-auto" onClick={e => e.stopPropagation()}>
                                <span className="text-[11.5px] font-semibold text-neutral-500">
                                  {leafCount} Pekerjaan
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openAddTask(sub.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold bg-white border border-neutral-300 text-neutral-800 hover:bg-neutral-50 transition-colors"
                                  title="Tambah Pekerjaan Eksekusi (Leaf WBS)"
                                >
                                  <Plus size={12} /> Task
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditSub(sub)}
                                  className="p-1 rounded text-neutral-400 hover:text-neutral-700 transition-colors"
                                  title="Edit Sub Task"
                                >
                                  <Edit2 size={13.5} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteModal({ isOpen: true, type: 'sub', id: sub.id, name: sub.name })}
                                  className="p-1 rounded text-neutral-400 hover:text-red-600 transition-colors"
                                  title="Hapus Sub Task"
                                >
                                  <Trash2 size={13.5} />
                                </button>
                              </div>
                            </div>

                            {/* Level 3: Leaf Tasks Table */}
                            {isSubExpanded && (
                              <div className="p-3 sm:p-4">
                                {leafCount === 0 ? (
                                  <div className="py-4 text-center text-[12px] text-neutral-500 italic">
                                    Belum ada pekerjaan spesifik (leaf task). Klik "+ Task" untuk menambahkan.
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-[12.5px]">
                                      <thead>
                                        <tr className="border-b border-neutral-200 text-[11px] font-black uppercase text-neutral-500 tracking-wider">
                                          <th className="pb-2 pl-1">No</th>
                                          <th className="pb-2">Nama Pekerjaan</th>
                                          <th className="pb-2">Divisi</th>
                                          <th className="pb-2">Vendor</th>
                                          <th className="pb-2">Start & End</th>
                                          <th className="pb-2">Durasi</th>
                                          <th className="pb-2">Dependensi (Predecessor)</th>
                                          <th className="pb-2 text-right pr-1">Aksi</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-neutral-100">
                                        {sub.wbsTasks.map((task) => (
                                          <tr key={task.id} className="hover:bg-neutral-50/70 transition-colors group">
                                            <td className="py-2.5 pl-1 font-mono text-[11px] text-neutral-400">
                                              {task.code}
                                            </td>
                                            <td className="py-2.5 font-bold text-neutral-900 max-w-[220px] truncate" title={task.name}>
                                              {task.name}
                                            </td>
                                            <td className="py-2.5">
                                              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200">
                                                {task.division_name}
                                              </span>
                                            </td>
                                            <td className="py-2.5 text-neutral-600 font-medium">
                                              {task.vendor || 'INTERNAL'}
                                            </td>
                                            <td className="py-2.5 font-mono text-[11.5px] text-neutral-700 whitespace-nowrap">
                                              {task.start ? formatDateDisplay(task.start) : '-'} → {task.end ? formatDateDisplay(task.end) : '-'}
                                            </td>
                                            <td className="py-2.5 font-semibold text-neutral-700">
                                              {task.duration_days} hari
                                            </td>
                                            <td className="py-2.5">
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
                                            <td className="py-2.5 text-right pr-1">
                                              <div className="inline-flex items-center gap-1">
                                                <button
                                                  type="button"
                                                  onClick={() => openEditTask(task)}
                                                  className="p-1 rounded text-neutral-400 hover:text-neutral-700 transition-colors"
                                                  title="Edit Task"
                                                >
                                                  <Edit2 size={14} />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => setDeleteModal({ isOpen: true, type: 'task', id: task.id, name: task.name })}
                                                  className="p-1 rounded text-neutral-400 hover:text-red-600 transition-colors"
                                                  title="Hapus Task"
                                                >
                                                  <Trash2 size={14} />
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md rounded-2xl border-2 border-neutral-900 p-4 shadow-xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[13px] font-bold text-neutral-800">
            Pastikan seluruh susunan pekerjaan proyek telah terverifikasi dengan benar.
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="md"
            icon={Plus}
            onClick={openAddMain}
          >
            Tambah Main Task
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={CheckCircle2}
            onClick={() => setConfirmCompleteModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
          >
            Selesaikan & Aktifkan Proyek
          </Button>
        </div>
      </div>

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
                placeholder="e.g. SIPIL WORKS, PRODUCTION MACHINE, dll"
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
      {subModal.isOpen && (
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
                  min={getMinEndDate(subForm.start)}
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
      )}

      {/* Modal Add / Edit Leaf Task (WBS) */}
      {taskModal.isOpen && (
        <Modal
          title={taskModal.mode === 'add' ? 'Tambah Pekerjaan Eksekusi (Leaf Task)' : 'Edit Pekerjaan'}
          onClose={() => setTaskModal({ isOpen: false, mode: 'add' })}
          size="lg"
        >
          <form onSubmit={handleSaveTask} className="space-y-4">
            {actionError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12px] font-semibold">
                {actionError}
              </div>
            )}
            <div>
              <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                Nama Pekerjaan <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={taskForm.name}
                onChange={e => setTaskForm({ ...taskForm, name: e.target.value })}
                placeholder="e.g. Penggalian Pondasi, Fabrikasi Tiang Baja, dll"
                className="w-full px-3.5 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  Divisi Penanggung Jawab
                </label>
                <select
                  value={taskForm.divisions_id}
                  onChange={e => setTaskForm({ ...taskForm, divisions_id: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
                >
                  {divisions.map((d: DivisionOption) => (
                    <option key={d.id} value={d.id}>{d.divisi}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  Vendor / Pelaksana
                </label>
                <input
                  type="text"
                  value={taskForm.vendor}
                  onChange={e => setTaskForm({ ...taskForm, vendor: e.target.value })}
                  placeholder="e.g. INTERNAL, PT XYZ"
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  Start Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={taskForm.start}
                  onChange={e => {
                    const newStart = e.target.value;
                    const nextForm = { ...taskForm, start: newStart };
                    if (newStart && taskForm.end && taskForm.end <= newStart) {
                      nextForm.end = getMinEndDate(newStart) || '';
                    }
                    setTaskForm(nextForm);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                  required
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  Target Finish Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={taskForm.end}
                  min={getMinEndDate(taskForm.start)}
                  onChange={e => setTaskForm({ ...taskForm, end: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                  required
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  Durasi (Hari)
                </label>
                <input
                  type="number"
                  min="1"
                  value={taskForm.duration}
                  onChange={e => {
                    const dur = Math.max(1, parseInt(e.target.value) || 1);
                    const nextForm = { ...taskForm, duration: dur };
                    if (taskForm.start) {
                      const d = new Date(taskForm.start);
                      d.setDate(d.getDate() + dur);
                      nextForm.end = d.toISOString().slice(0, 10);
                    }
                    setTaskForm(nextForm);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                />
              </div>
            </div>

            {taskForm.start && taskForm.end && taskForm.end <= taskForm.start && (
              <p className="text-[11.5px] text-red-600 font-semibold">
                Finish date harus setelah Start date (minimal 1 hari setelahnya).
              </p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-[12.5px] text-neutral-700">
                <input
                  type="checkbox"
                  checked={taskForm.requires_evidence}
                  onChange={e => setTaskForm({ ...taskForm, requires_evidence: e.target.checked })}
                  className="rounded text-brand focus:ring-brand"
                />
                Wajibkan Bukti / Dokumen Evidence saat menyelesaikan task ini
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
              <Button
                variant="outline"
                size="md"
                type="button"
                onClick={() => setTaskModal({ isOpen: false, mode: 'add' })}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                size="md"
                type="submit"
                disabled={submitting}
              >
                {submitting ? 'Menyimpan...' : 'Simpan Pekerjaan'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

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
                <div className="space-y-2">
                  {depModal.task.dependencies.map((dep) => (
                    <div
                      key={dep.id}
                      className="p-3 rounded-xl bg-white border border-neutral-200 flex items-center justify-between gap-3 shadow-2xs hover:border-neutral-300 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-black bg-indigo-100 text-indigo-800">
                          {dep.dependency_type}
                        </span>
                        <div>
                          <strong className="text-[13px] text-neutral-900 block">
                            {dep.predecessor_name}
                          </strong>
                          <span className="text-[11.5px] text-neutral-500">
                            {dep.dependency_type === 'FS' && 'Finish-to-Start (Task ini mulai setelah predecessor selesai)'}
                            {dep.dependency_type === 'SS' && 'Start-to-Start (Task ini mulai bersamaan dengan predecessor)'}
                            {dep.dependency_type === 'FF' && 'Finish-to-Finish (Task ini selesai bersamaan dengan predecessor)'}
                            {dep.dependency_type === 'SF' && 'Start-to-Finish (Task ini selesai setelah predecessor mulai)'}
                            {dep.lag_days !== 0 && ` • Jeda: ${dep.lag_days > 0 ? `+${dep.lag_days}` : dep.lag_days} hari`}
                          </span>
                        </div>
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
              )}
            </div>

            {/* Add New Dependency Form */}
            <form onSubmit={handleAddDependency} className="p-4 rounded-xl bg-neutral-50/80 border border-neutral-200 space-y-3">
              <h5 className="text-[12.5px] font-bold text-neutral-900">
                + Tambah Ketergantungan Baru
              </h5>

              <div>
                <label className="block text-[11.5px] font-bold text-neutral-700 mb-1">
                  Pilih Task Predecessor <span className="text-red-500">*</span>
                </label>
                <select
                  value={depForm.predecessor_wbs_id}
                  onChange={e => setDepForm({ ...depForm, predecessor_wbs_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
                  required
                >
                  <option value="">-- Pilih Task --</option>
                  {(allTasks || [])
                    .filter((t: any) => t.id !== depModal.task?.id)
                    .map((t: any) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.start ? formatDateDisplay(t.start) : ''} - {t.end ? formatDateDisplay(t.end) : ''})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-bold text-neutral-700 mb-1">
                    Tipe Ketergantungan <span className="text-red-500">*</span>
                  </label>
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
                  disabled={submitting || !depForm.predecessor_wbs_id}
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
