import { useState, useMemo } from 'react';
import { router } from '@inertiajs/react';
import {
  FolderTree, Plus, Edit2, Trash2, GripVertical, ArrowUp, ArrowDown,
  Check, CheckCircle2, Star, AlertCircle, Clock, Layers, ChevronDown, ChevronRight,
  Shield, Scale, Sparkles
} from 'lucide-react';
import SuperAdminLayout from '@/components/SuperAdminLayout';
import { Button, Modal } from '@/components/ui';

interface SubTaskItem {
  id: number;
  template_main_task_id: number;
  code: string;
  name: string;
  default_pic_division: string;
  weight: number;
  order_index: number;
  default_duration: number;
}

interface MainTaskItem {
  id: number;
  template_id: number;
  code: string;
  name: string;
  weight: number;
  order_index: number;
  sub_tasks: SubTaskItem[];
}

interface TemplateItem {
  id: number;
  name: string;
  description: string | null;
  is_default: boolean;
  main_tasks_count?: number;
}

interface SelectedTemplate extends TemplateItem {
  main_tasks: MainTaskItem[];
}

interface DivisionItem {
  id: number;
  divisi: string;
}

interface Props {
  templates: TemplateItem[];
  selectedTemplate: SelectedTemplate | null;
  divisions: DivisionItem[];
}

export default function TemplateManagementPage({ templates, selectedTemplate, divisions = [] }: Props) {
  // Collapsed / expanded state for main task accordions
  const [expandedMainIds, setExpandedMainIds] = useState<Set<number>>(() => {
    const s = new Set<number>();
    (selectedTemplate?.main_tasks || []).forEach(m => s.add(m.id));
    return s;
  });

  // Drag and drop tracking
  const [draggedMainIndex, setDraggedMainIndex] = useState<number | null>(null);
  const [draggedSubInfo, setDraggedSubInfo] = useState<{ mainTaskId: number; index: number } | null>(null);

  // Modals
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false);
  const [showEditTemplateModal, setShowEditTemplateModal] = useState(false);
  const [showDeleteTemplateModal, setShowDeleteTemplateModal] = useState(false);

  const [mainTaskModal, setMainTaskModal] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    task?: MainTaskItem;
  }>({ open: false, mode: 'create' });

  const [subTaskModal, setSubTaskModal] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    mainTaskId?: number;
    subTask?: SubTaskItem;
  }>({ open: false, mode: 'create' });

  const [deleteTaskModal, setDeleteTaskModal] = useState<{
    open: boolean;
    type: 'main' | 'sub';
    id: number;
    name: string;
    parentMainId?: number;
  }>({ open: false, type: 'main', id: 0, name: '' });

  // Form states
  const [templateForm, setTemplateForm] = useState({ name: '', description: '', is_default: false });
  const [mainForm, setMainForm] = useState({ code: '', name: '', weight: 0 });
  const [subForm, setSubForm] = useState({
    code: '',
    name: '',
    default_pic_division: 'General',
    weight: 0,
    default_duration: 14,
  });

  const [submitting, setSubmitting] = useState(false);

  const toggleAccordion = (id: number) => {
    setExpandedMainIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectTemplate = (id: number) => {
    router.get('/admin/templates', { id }, { preserveState: true, preserveScroll: true });
  };

  const handleSetDefault = (id: number) => {
    setSubmitting(true);
    router.post(`/admin/templates/${id}/set-default`, {}, {
      preserveScroll: true,
      onFinish: () => setSubmitting(false),
    });
  };

  const handleCreateTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    router.post('/admin/templates', templateForm, {
      preserveScroll: true,
      onSuccess: () => {
        setShowCreateTemplateModal(false);
        setTemplateForm({ name: '', description: '', is_default: false });
      },
      onFinish: () => setSubmitting(false),
    });
  };

  const handleUpdateTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;
    setSubmitting(true);
    router.put(`/admin/templates/${selectedTemplate.id}`, templateForm, {
      preserveScroll: true,
      onSuccess: () => setShowEditTemplateModal(false),
      onFinish: () => setSubmitting(false),
    });
  };

  const handleDeleteTemplate = () => {
    if (!selectedTemplate) return;
    setSubmitting(true);
    router.delete(`/admin/templates/${selectedTemplate.id}`, {
      preserveScroll: true,
      onSuccess: () => setShowDeleteTemplateModal(false),
      onFinish: () => setSubmitting(false),
    });
  };

  // Main task handlers
  const handleSaveMainTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;
    setSubmitting(true);

    if (mainTaskModal.mode === 'create') {
      router.post(`/admin/templates/${selectedTemplate.id}/main-tasks`, mainForm, {
        preserveScroll: true,
        onSuccess: () => setMainTaskModal({ open: false, mode: 'create' }),
        onFinish: () => setSubmitting(false),
      });
    } else if (mainTaskModal.task) {
      router.put(`/admin/templates/${selectedTemplate.id}/main-tasks/${mainTaskModal.task.id}`, mainForm, {
        preserveScroll: true,
        onSuccess: () => setMainTaskModal({ open: false, mode: 'create' }),
        onFinish: () => setSubmitting(false),
      });
    }
  };

  const handleMoveMainTask = (fromIndex: number, toIndex: number) => {
    if (!selectedTemplate || !selectedTemplate.main_tasks) return;
    const items = [...selectedTemplate.main_tasks];
    if (toIndex < 0 || toIndex >= items.length) return;

    const [moved] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, moved);

    const orderedIds = items.map(it => it.id);
    router.post(`/admin/templates/${selectedTemplate.id}/main-tasks/reorder`, { ordered_ids: orderedIds }, {
      preserveScroll: true,
    });
  };

  // Sub task handlers
  const handleSaveSubTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;
    setSubmitting(true);

    if (subTaskModal.mode === 'create' && subTaskModal.mainTaskId) {
      router.post(`/admin/templates/${selectedTemplate.id}/main-tasks/${subTaskModal.mainTaskId}/sub-tasks`, subForm, {
        preserveScroll: true,
        onSuccess: () => setSubTaskModal({ open: false, mode: 'create' }),
        onFinish: () => setSubmitting(false),
      });
    } else if (subTaskModal.subTask) {
      router.put(`/admin/templates/${selectedTemplate.id}/sub-tasks/${subTaskModal.subTask.id}`, subForm, {
        preserveScroll: true,
        onSuccess: () => setSubTaskModal({ open: false, mode: 'create' }),
        onFinish: () => setSubmitting(false),
      });
    }
  };

  const handleMoveSubTask = (mainTaskId: number, fromIndex: number, toIndex: number) => {
    if (!selectedTemplate) return;
    const main = selectedTemplate.main_tasks.find(m => m.id === mainTaskId);
    if (!main || !main.sub_tasks) return;
    const items = [...main.sub_tasks];
    if (toIndex < 0 || toIndex >= items.length) return;

    const [moved] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, moved);

    const orderedIds = items.map(it => it.id);
    router.post(`/admin/templates/${selectedTemplate.id}/main-tasks/${mainTaskId}/sub-tasks/reorder`, { ordered_ids: orderedIds }, {
      preserveScroll: true,
    });
  };

  const handleConfirmDeleteTask = () => {
    if (!selectedTemplate) return;
    setSubmitting(true);

    if (deleteTaskModal.type === 'main') {
      router.delete(`/admin/templates/${selectedTemplate.id}/main-tasks/${deleteTaskModal.id}`, {
        preserveScroll: true,
        onSuccess: () => setDeleteTaskModal({ open: false, type: 'main', id: 0, name: '' }),
        onFinish: () => setSubmitting(false),
      });
    } else {
      router.delete(`/admin/templates/${selectedTemplate.id}/sub-tasks/${deleteTaskModal.id}`, {
        preserveScroll: true,
        onSuccess: () => setDeleteTaskModal({ open: false, type: 'main', id: 0, name: '' }),
        onFinish: () => setSubmitting(false),
      });
    }
  };

  // Calculations
  const stats = useMemo(() => {
    if (!selectedTemplate || !selectedTemplate.main_tasks) {
      return { totalMain: 0, totalSub: 0, totalWeight: 0 };
    }
    const totalMain = selectedTemplate.main_tasks.length;
    let totalSub = 0;
    let totalWeight = 0;

    selectedTemplate.main_tasks.forEach(m => {
      totalWeight += Number(m.weight) || 0;
      totalSub += (m.sub_tasks || []).length;
    });

    return { totalMain, totalSub, totalWeight: Math.round(totalWeight * 100) / 100 };
  }, [selectedTemplate]);

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-violet-900 via-indigo-900 to-slate-900 rounded-2xl p-6 text-white shadow-lg border border-violet-800/40 relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-200 text-[11px] font-bold tracking-wider uppercase mb-2">
                Dynamic WBS Template Management
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white">
                Master Project Templates
              </h1>
              <p className="text-[13px] text-violet-200/80 max-w-2xl mt-1">
                Configure initial WBS structures (17 Main Tasks and Sub Tasks) dynamically. Edit codes, names, weights, and reorder position with drag & drop or position controls without hardcoded constraints.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  setTemplateForm({ name: '', description: '', is_default: false });
                  setShowCreateTemplateModal(true);
                }}
                className="bg-violet-600 hover:bg-violet-500 border-none shadow-md font-semibold"
              >
                New Template
              </Button>
            </div>
          </div>
        </div>

        {/* Template Selector Bar */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-bold text-neutral-500 uppercase tracking-wider">
              Active Template:
            </span>
            <div className="relative min-w-[280px]">
              <select
                value={selectedTemplate?.id || ''}
                onChange={e => handleSelectTemplate(Number(e.target.value))}
                className="w-full px-3.5 py-2 pr-9 rounded-xl border border-neutral-300 bg-white text-[13.5px] font-bold text-neutral-900 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-600/15"
              >
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.is_default ? '★ [Default]' : ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedTemplate?.is_default ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[12px] font-bold">
                Default Master Template
              </span>
            ) : selectedTemplate ? (
              <Button
                variant="outline"
                size="sm"
                loading={submitting}
                onClick={() => handleSetDefault(selectedTemplate.id)}
                className="text-amber-700 hover:bg-amber-50 border-amber-200 font-semibold"
              >
                Set as Default
              </Button>
            ) : null}
          </div>

          {selectedTemplate && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTemplateForm({
                    name: selectedTemplate.name,
                    description: selectedTemplate.description || '',
                    is_default: selectedTemplate.is_default,
                  });
                  setShowEditTemplateModal(true);
                }}
              >
                Edit Info
              </Button>

              {!selectedTemplate.is_default && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteTemplateModal(true)}
                  className="text-red-600 hover:bg-red-50 border-red-200"
                >
                  Delete
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Stats Summary Cards */}
        {selectedTemplate && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-neutral-200 p-4.5 shadow-xs flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center text-violet-700 flex-shrink-0">
                <FolderTree size={20} />
              </div>
              <div>
                <p className="text-[12px] font-medium text-neutral-500">Main Tasks (Level 1)</p>
                <h3 className="text-xl font-black text-neutral-900">{stats.totalMain} Tasks</h3>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 p-4.5 shadow-xs flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 flex-shrink-0">
                <Layers size={20} />
              </div>
              <div>
                <p className="text-[12px] font-medium text-neutral-500">Sub Tasks (Level 2)</p>
                <h3 className="text-xl font-black text-neutral-900">{stats.totalSub} Tasks</h3>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 p-4.5 shadow-xs flex items-center gap-3.5">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                Math.abs(stats.totalWeight - 100) < 0.01 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}>
                <Scale size={20} />
              </div>
              <div>
                <p className="text-[12px] font-medium text-neutral-500">Cumulative Weight</p>
                <h3 className="text-xl font-black text-neutral-900">{stats.totalWeight}%</h3>
              </div>
            </div>
          </div>
        )}

        {/* Template Main Structure & WBS Tasks */}
        {selectedTemplate ? (
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-50/60">
              <div>
                <h2 className="text-[16px] font-black text-neutral-900">
                  WBS Structure & Tasks Hierarchy
                </h2>
                <p className="text-[12px] text-neutral-500 mt-0.5">
                  Drag handles or use position arrows to reorder. Click "Add Sub Task" to add tasks under any main job.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const all = new Set<number>();
                    (selectedTemplate.main_tasks || []).forEach(m => all.add(m.id));
                    setExpandedMainIds(all);
                  }}
                >
                  Expand All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpandedMainIds(new Set())}
                >
                  Collapse All
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setMainForm({
                      code: String((selectedTemplate.main_tasks?.length || 0) + 1),
                      name: '',
                      weight: 0,
                    });
                    setMainTaskModal({ open: true, mode: 'create' });
                  }}
                  className="bg-violet-600 hover:bg-violet-500"
                >
                  Add Main Task
                </Button>
              </div>
            </div>

            {/* Main Tasks List */}
            <div className="divide-y divide-neutral-200">
              {(!selectedTemplate.main_tasks || selectedTemplate.main_tasks.length === 0) ? (
                <div className="p-12 text-center text-neutral-500">
                  <FolderTree size={36} className="mx-auto text-neutral-300 mb-2" />
                  <p className="text-[14px] font-bold text-neutral-700">No Main Tasks yet</p>
                  <p className="text-[12px] text-neutral-400 mt-1">Click "Add Main Task" to create the first step in this template.</p>
                </div>
              ) : (
                selectedTemplate.main_tasks.map((mainTask, mIdx) => {
                  const isExpanded = expandedMainIds.has(mainTask.id);
                  const subTasks = mainTask.sub_tasks || [];

                  return (
                    <div
                      key={mainTask.id}
                      draggable
                      onDragStart={() => setDraggedMainIndex(mIdx)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => {
                        if (draggedMainIndex !== null && draggedMainIndex !== mIdx) {
                          handleMoveMainTask(draggedMainIndex, mIdx);
                          setDraggedMainIndex(null);
                        }
                      }}
                      className={`transition-colors ${
                        draggedMainIndex === mIdx ? 'bg-violet-50/60 opacity-60' : 'bg-white hover:bg-neutral-50/40'
                      }`}
                    >
                      {/* Main Task Row */}
                      <div className="p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Drag handle */}
                          <div
                            className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-700 p-1"
                            title="Drag to reorder Main Task"
                          >
                            <GripVertical size={16} />
                          </div>

                          {/* Accordion toggle */}
                          <button
                            type="button"
                            onClick={() => toggleAccordion(mainTask.id)}
                            className="p-1 rounded-md text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100"
                          >
                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </button>

                          {/* Main Task Code Badge */}
                          <span className="w-8 h-8 rounded-lg bg-violet-600 text-white font-bold text-[13px] flex items-center justify-center flex-shrink-0 shadow-xs">
                            {mainTask.code || mIdx + 1}
                          </span>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-[14px] font-bold text-neutral-900 tracking-tight truncate">
                                {mainTask.name}
                              </h3>
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                                Weight: {mainTask.weight}%
                              </span>
                              <span className="text-[11px] font-medium text-neutral-500">
                                {subTasks.length} Sub Tasks
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {/* Move up / down */}
                          <button
                            type="button"
                            disabled={mIdx === 0}
                            onClick={() => handleMoveMainTask(mIdx, mIdx - 1)}
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 disabled:pointer-events-none"
                            title="Move Up"
                          >
                            <ArrowUp size={15} />
                          </button>
                          <button
                            type="button"
                            disabled={mIdx === selectedTemplate.main_tasks.length - 1}
                            onClick={() => handleMoveMainTask(mIdx, mIdx + 1)}
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 disabled:pointer-events-none"
                            title="Move Down"
                          >
                            <ArrowDown size={15} />
                          </button>

                          {/* Add Subtask */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSubForm({
                                code: `${mainTask.code || mIdx + 1}.${subTasks.length + 1}`,
                                name: '',
                                default_pic_division: 'General',
                                weight: 0,
                                default_duration: 14,
                              });
                              setSubTaskModal({ open: true, mode: 'create', mainTaskId: mainTask.id });
                            }}
                            className="text-violet-700 hover:bg-violet-50 text-[12px] font-bold"
                          >
                            Add Sub Task
                          </Button>

                          {/* Edit Main Task */}
                          <button
                            type="button"
                            onClick={() => {
                              setMainForm({
                                code: mainTask.code,
                                name: mainTask.name,
                                weight: mainTask.weight,
                              });
                              setMainTaskModal({ open: true, mode: 'edit', task: mainTask });
                            }}
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
                            title="Edit Main Task"
                          >
                            <Edit2 size={15} />
                          </button>

                          {/* Delete Main Task */}
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTaskModal({
                                open: true,
                                type: 'main',
                                id: mainTask.id,
                                name: mainTask.name,
                              });
                            }}
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50"
                            title="Delete Main Task"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      {/* Nested Sub Tasks */}
                      {isExpanded && (
                        <div className="bg-neutral-50/70 border-t border-neutral-200/70 pl-8 sm:pl-14 pr-4 py-3 space-y-2">
                          {subTasks.length === 0 ? (
                            <div className="py-3 px-4 rounded-xl border border-dashed border-neutral-300 text-center text-[12.5px] text-neutral-400 bg-white">
                              No Sub Tasks in this section. Click "Add Sub Task" above to add one.
                            </div>
                          ) : (
                            subTasks.map((sub, sIdx) => (
                              <div
                                key={sub.id}
                                draggable
                                onDragStart={() => setDraggedSubInfo({ mainTaskId: mainTask.id, index: sIdx })}
                                onDragOver={e => e.preventDefault()}
                                onDrop={() => {
                                  if (
                                    draggedSubInfo &&
                                    draggedSubInfo.mainTaskId === mainTask.id &&
                                    draggedSubInfo.index !== sIdx
                                  ) {
                                    handleMoveSubTask(mainTask.id, draggedSubInfo.index, sIdx);
                                    setDraggedSubInfo(null);
                                  }
                                }}
                                className="p-3 bg-white rounded-xl border border-neutral-200 flex items-center justify-between gap-3 shadow-2xs hover:border-violet-300 transition-colors"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-700 p-0.5"
                                    title="Drag to reorder Sub Task"
                                  >
                                    <GripVertical size={14} />
                                  </div>

                                  <span className="px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-800 font-mono text-[11.5px] font-bold border border-neutral-200 flex-shrink-0">
                                    {sub.code || `${mainTask.code}.${sIdx + 1}`}
                                  </span>

                                  <span className="text-[13px] font-semibold text-neutral-800 truncate">
                                    {sub.name}
                                  </span>

                                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex-shrink-0">
                                    Division: {sub.default_pic_division || 'General'}
                                  </span>

                                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0 flex items-center gap-1">
                                    <Clock size={11} />
                                    {sub.default_duration || 14}d
                                  </span>

                                  {sub.weight > 0 && (
                                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex-shrink-0">
                                      {sub.weight}%
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    type="button"
                                    disabled={sIdx === 0}
                                    onClick={() => handleMoveSubTask(mainTask.id, sIdx, sIdx - 1)}
                                    className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 disabled:pointer-events-none"
                                    title="Move Up"
                                  >
                                    <ArrowUp size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={sIdx === subTasks.length - 1}
                                    onClick={() => handleMoveSubTask(mainTask.id, sIdx, sIdx + 1)}
                                    className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 disabled:pointer-events-none"
                                    title="Move Down"
                                  >
                                    <ArrowDown size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSubForm({
                                        code: sub.code,
                                        name: sub.name,
                                        default_pic_division: sub.default_pic_division,
                                        weight: sub.weight,
                                        default_duration: sub.default_duration,
                                      });
                                      setSubTaskModal({
                                        open: true,
                                        mode: 'edit',
                                        mainTaskId: mainTask.id,
                                        subTask: sub,
                                      });
                                    }}
                                    className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
                                    title="Edit Sub Task"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeleteTaskModal({
                                        open: true,
                                        type: 'sub',
                                        id: sub.id,
                                        name: sub.name,
                                        parentMainId: mainTask.id,
                                      });
                                    }}
                                    className="p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50"
                                    title="Delete Sub Task"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : null}

        {/* Modal: Create Template */}
        {showCreateTemplateModal && (
          <Modal
            title="Create New Project Template"
            onClose={() => setShowCreateTemplateModal(false)}
            size="md"
          >
            <form onSubmit={handleCreateTemplate} className="space-y-4">
              <div>
                <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                  Template Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={templateForm.name}
                  onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })}
                  placeholder="e.g. Master Konstruksi Sipil & Gedung"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-600/15"
                />
              </div>

              <div>
                <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={templateForm.description}
                  onChange={e => setTemplateForm({ ...templateForm, description: e.target.value })}
                  placeholder="Explain the purpose and scope of this template..."
                  className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-600/15"
                />
              </div>

              <label className="flex items-center gap-2 p-3 rounded-lg border border-neutral-200 cursor-pointer hover:bg-neutral-50">
                <input
                  type="checkbox"
                  checked={templateForm.is_default}
                  onChange={e => setTemplateForm({ ...templateForm, is_default: e.target.checked })}
                  className="rounded text-violet-600 focus:ring-violet-600"
                />
                <span className="text-[13px] font-semibold text-neutral-800">
                  Set as Default Master Template for newly created projects
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreateTemplateModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={submitting}
                  className="bg-violet-600 hover:bg-violet-500"
                >
                  Create Template
                </Button>
              </div>
            </form>
          </Modal>
        )}

        {/* Modal: Edit Template */}
        {showEditTemplateModal && selectedTemplate && (
          <Modal
            title="Edit Template Information"
            onClose={() => setShowEditTemplateModal(false)}
            size="md"
          >
            <form onSubmit={handleUpdateTemplate} className="space-y-4">
              <div>
                <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                  Template Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={templateForm.name}
                  onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-600/15"
                />
              </div>

              <div>
                <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={templateForm.description}
                  onChange={e => setTemplateForm({ ...templateForm, description: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-600/15"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEditTemplateModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={submitting}
                  className="bg-violet-600 hover:bg-violet-500"
                >
                  Save Changes
                </Button>
              </div>
            </form>
          </Modal>
        )}

        {/* Modal: Delete Template */}
        {showDeleteTemplateModal && selectedTemplate && (
          <Modal
            title="Confirm Template Deletion"
            onClose={() => setShowDeleteTemplateModal(false)}
            size="sm"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-red-50 text-red-700 rounded-xl text-[13px]">
                <AlertCircle size={20} className="flex-shrink-0 text-red-600" />
                <span>
                  Are you sure you want to delete template <strong>{selectedTemplate.name}</strong>? This action cannot be undone.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteTemplateModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={submitting}
                  onClick={handleDeleteTemplate}
                >
                  Delete Template
                </Button>
              </div>
            </div>
          </Modal>
        )}

        {/* Modal: Add / Edit Main Task */}
        {mainTaskModal.open && (
          <Modal
            title={mainTaskModal.mode === 'create' ? 'Add Main Task (Level 1)' : 'Edit Main Task'}
            onClose={() => setMainTaskModal({ open: false, mode: 'create' })}
            size="md"
          >
            <form onSubmit={handleSaveMainTask} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                    Code / Index
                  </label>
                  <input
                    type="text"
                    value={mainForm.code}
                    onChange={e => setMainForm({ ...mainForm, code: e.target.value })}
                    placeholder="e.g. 1"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-violet-600 font-mono font-bold"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                    Task Weight (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={mainForm.weight}
                    onChange={e => setMainForm({ ...mainForm, weight: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-violet-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                  Main Task Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={mainForm.name}
                  onChange={e => setMainForm({ ...mainForm, name: e.target.value })}
                  placeholder="e.g. PERIZINAN & DOKUMEN"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-violet-600 font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMainTaskModal({ open: false, mode: 'create' })}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={submitting}
                  className="bg-violet-600 hover:bg-violet-500"
                >
                  {mainTaskModal.mode === 'create' ? 'Add Task' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </Modal>
        )}

        {/* Modal: Add / Edit Sub Task */}
        {subTaskModal.open && (
          <Modal
            title={subTaskModal.mode === 'create' ? 'Add Sub Task (Level 2)' : 'Edit Sub Task'}
            onClose={() => setSubTaskModal({ open: false, mode: 'create' })}
            size="md"
          >
            <form onSubmit={handleSaveSubTask} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                    Code
                  </label>
                  <input
                    type="text"
                    value={subForm.code}
                    onChange={e => setSubForm({ ...subForm, code: e.target.value })}
                    placeholder="e.g. 1.1"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-violet-600 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                    Weight (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={subForm.weight}
                    onChange={e => setSubForm({ ...subForm, weight: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-violet-600"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                    Duration (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={subForm.default_duration}
                    onChange={e => setSubForm({ ...subForm, default_duration: parseInt(e.target.value) || 14 })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-violet-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                  Sub Task Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={subForm.name}
                  onChange={e => setSubForm({ ...subForm, name: e.target.value })}
                  placeholder="e.g. PENGURUSAN IMB & AMDAL"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-violet-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                  Default PIC Division
                </label>
                <div className="space-y-2">
                  <select
                    value={subForm.default_pic_division}
                    onChange={e => setSubForm({ ...subForm, default_pic_division: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-violet-600 bg-white"
                  >
                    <option value="General">General / All Divisions</option>
                    {divisions.map(d => (
                      <option key={d.id} value={d.divisi}>
                        {d.divisi}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={subForm.default_pic_division}
                    onChange={e => setSubForm({ ...subForm, default_pic_division: e.target.value })}
                    placeholder="Or type custom division name..."
                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-[12.5px] outline-none focus:border-violet-600"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSubTaskModal({ open: false, mode: 'create' })}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={submitting}
                  className="bg-violet-600 hover:bg-violet-500"
                >
                  {subTaskModal.mode === 'create' ? 'Add Sub Task' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </Modal>
        )}

        {/* Modal: Confirm Delete Task */}
        {deleteTaskModal.open && (
          <Modal
            title={`Delete ${deleteTaskModal.type === 'main' ? 'Main Task' : 'Sub Task'}`}
            onClose={() => setDeleteTaskModal({ open: false, type: 'main', id: 0, name: '' })}
            size="sm"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-red-50 text-red-700 rounded-xl text-[13px]">
                <AlertCircle size={20} className="flex-shrink-0 text-red-600" />
                <span>
                  Are you sure you want to delete <strong>{deleteTaskModal.name}</strong>?
                  {deleteTaskModal.type === 'main' && ' All nested subtasks will also be deleted.'}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteTaskModal({ open: false, type: 'main', id: 0, name: '' })}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={submitting}
                  onClick={handleConfirmDeleteTask}
                >
                  Delete Task
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </SuperAdminLayout>
  );
}
