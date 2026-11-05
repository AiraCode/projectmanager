import { useState, useMemo, useEffect } from "react";
import { router, Head } from "@inertiajs/react";
import {
    FolderTree,
    Plus,
    Edit2,
    Trash2,
    GripVertical,
    ArrowUp,
    ArrowDown,
    Check,
    CheckCircle2,
    Star,
    AlertCircle,
    Clock,
    Layers,
    ChevronDown,
    ChevronRight,
    Shield,
    Scale,
    Sparkles,
} from "lucide-react";
import SuperAdminLayout from "@/components/SuperAdminLayout";
import { Button, Modal } from "@/components/ui";

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

export default function TemplateManagementPage({
    templates,
    selectedTemplate,
    divisions = [],
}: Props) {
    // Local list of main tasks with instant optimistic re-ordering & renumbering
    const [mainTasksList, setMainTasksList] = useState<MainTaskItem[]>(
        () => selectedTemplate?.main_tasks || [],
    );

    useEffect(() => {
        setMainTasksList(selectedTemplate?.main_tasks || []);
    }, [selectedTemplate?.main_tasks]);

    // Collapsed / expanded state for main task accordions
    const [expandedMainIds, setExpandedMainIds] = useState<Set<number>>(() => {
        const s = new Set<number>();
        (selectedTemplate?.main_tasks || []).forEach((m) => s.add(m.id));
        return s;
    });

    // Drag and drop tracking
    const [draggedMainIndex, setDraggedMainIndex] = useState<number | null>(
        null,
    );
    const [draggedSubInfo, setDraggedSubInfo] = useState<{
        mainTaskId: number;
        index: number;
    } | null>(null);

    // Modals
    const [showCreateTemplateModal, setShowCreateTemplateModal] =
        useState(false);
    const [showEditTemplateModal, setShowEditTemplateModal] = useState(false);
    const [showDeleteTemplateModal, setShowDeleteTemplateModal] =
        useState(false);

    const [mainTaskModal, setMainTaskModal] = useState<{
        open: boolean;
        mode: "create" | "edit";
        task?: MainTaskItem;
    }>({ open: false, mode: "create" });

    const [subTaskModal, setSubTaskModal] = useState<{
        open: boolean;
        mode: "create" | "edit";
        mainTaskId?: number;
        subTask?: SubTaskItem;
    }>({ open: false, mode: "create" });

    const [deleteTaskModal, setDeleteTaskModal] = useState<{
        open: boolean;
        type: "main" | "sub";
        id: number;
        name: string;
        parentMainId?: number;
    }>({ open: false, type: "main", id: 0, name: "" });

    // Form states
    const [templateForm, setTemplateForm] = useState({
        name: "",
        description: "",
        is_default: false,
    });
    const [mainForm, setMainForm] = useState({ code: "", name: "", weight: 0 });
    const [subForm, setSubForm] = useState({
        code: "",
        name: "",
        default_pic_division: "General",
        weight: 0,
        default_duration: 14,
    });

    const [submitting, setSubmitting] = useState(false);

    const toggleAccordion = (id: number) => {
        setExpandedMainIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSelectTemplate = (id: number) => {
        router.get(
            "/admin/templates",
            { id },
            { preserveState: true, preserveScroll: true },
        );
    };

    const handleSetDefault = (id: number) => {
        setSubmitting(true);
        router.post(
            `/admin/templates/${id}/set-default`,
            {},
            {
                preserveScroll: true,
                onFinish: () => setSubmitting(false),
            },
        );
    };

    const handleCreateTemplate = (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        router.post("/admin/templates", templateForm, {
            preserveScroll: true,
            onSuccess: () => {
                setShowCreateTemplateModal(false);
                setTemplateForm({
                    name: "",
                    description: "",
                    is_default: false,
                });
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

        if (mainTaskModal.mode === "create") {
            router.post(
                `/admin/templates/${selectedTemplate.id}/main-tasks`,
                mainForm,
                {
                    preserveScroll: true,
                    onSuccess: () =>
                        setMainTaskModal({ open: false, mode: "create" }),
                    onFinish: () => setSubmitting(false),
                },
            );
        } else if (mainTaskModal.task) {
            router.put(
                `/admin/templates/${selectedTemplate.id}/main-tasks/${mainTaskModal.task.id}`,
                mainForm,
                {
                    preserveScroll: true,
                    onSuccess: () =>
                        setMainTaskModal({ open: false, mode: "create" }),
                    onFinish: () => setSubmitting(false),
                },
            );
        }
    };

    const handleMoveMainTask = (fromIndex: number, toIndex: number) => {
        if (!selectedTemplate || !mainTasksList.length) return;
        if (toIndex < 0 || toIndex >= mainTasksList.length) return;

        const items = [...mainTasksList];
        const [moved] = items.splice(fromIndex, 1);
        items.splice(toIndex, 0, moved);

        // Optimistically update codes & order immediately
        const updated = items.map((mt, idx) => ({
            ...mt,
            order_index: idx + 1,
            code: String(idx + 1),
            sub_tasks: (mt.sub_tasks || []).map((st, sIdx) => ({
                ...st,
                order_index: sIdx + 1,
                code: `${idx + 1}.${sIdx + 1}`,
            })),
        }));

        setMainTasksList(updated);

        const orderedIds = updated.map((it) => it.id);
        router.post(
            `/admin/templates/${selectedTemplate.id}/main-tasks/reorder`,
            { ordered_ids: orderedIds },
            {
                preserveScroll: true,
            },
        );
    };

    // Sub task handlers
    const handleSaveSubTask = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTemplate) return;
        setSubmitting(true);

        if (subTaskModal.mode === "create" && subTaskModal.mainTaskId) {
            router.post(
                `/admin/templates/${selectedTemplate.id}/main-tasks/${subTaskModal.mainTaskId}/sub-tasks`,
                subForm,
                {
                    preserveScroll: true,
                    onSuccess: () =>
                        setSubTaskModal({ open: false, mode: "create" }),
                    onFinish: () => setSubmitting(false),
                },
            );
        } else if (subTaskModal.subTask) {
            router.put(
                `/admin/templates/${selectedTemplate.id}/sub-tasks/${subTaskModal.subTask.id}`,
                subForm,
                {
                    preserveScroll: true,
                    onSuccess: () =>
                        setSubTaskModal({ open: false, mode: "create" }),
                    onFinish: () => setSubmitting(false),
                },
            );
        }
    };

    const handleMoveSubTask = (
        mainTaskId: number,
        fromIndex: number,
        toIndex: number,
    ) => {
        if (!selectedTemplate || !mainTasksList.length) return;
        const mIdx = mainTasksList.findIndex((m) => m.id === mainTaskId);
        if (mIdx === -1) return;
        const main = mainTasksList[mIdx];
        if (!main || !main.sub_tasks) return;
        if (toIndex < 0 || toIndex >= main.sub_tasks.length) return;

        const subItems = [...main.sub_tasks];
        const [moved] = subItems.splice(fromIndex, 1);
        subItems.splice(toIndex, 0, moved);

        const updatedSub = subItems.map((st, sIdx) => ({
            ...st,
            order_index: sIdx + 1,
            code: `${mIdx + 1}.${sIdx + 1}`,
        }));

        const updatedMainList = [...mainTasksList];
        updatedMainList[mIdx] = {
            ...main,
            sub_tasks: updatedSub,
        };

        setMainTasksList(updatedMainList);

        const orderedIds = updatedSub.map((it) => it.id);
        router.post(
            `/admin/templates/${selectedTemplate.id}/main-tasks/${mainTaskId}/sub-tasks/reorder`,
            { ordered_ids: orderedIds },
            {
                preserveScroll: true,
            },
        );
    };

    const handleConfirmDeleteTask = () => {
        if (!selectedTemplate) return;
        setSubmitting(true);

        if (deleteTaskModal.type === "main") {
            router.delete(
                `/admin/templates/${selectedTemplate.id}/main-tasks/${deleteTaskModal.id}`,
                {
                    preserveScroll: true,
                    onSuccess: () =>
                        setDeleteTaskModal({
                            open: false,
                            type: "main",
                            id: 0,
                            name: "",
                        }),
                    onFinish: () => setSubmitting(false),
                },
            );
        } else {
            router.delete(
                `/admin/templates/${selectedTemplate.id}/sub-tasks/${deleteTaskModal.id}`,
                {
                    preserveScroll: true,
                    onSuccess: () =>
                        setDeleteTaskModal({
                            open: false,
                            type: "main",
                            id: 0,
                            name: "",
                        }),
                    onFinish: () => setSubmitting(false),
                },
            );
        }
    };

    // Calculations
    const stats = useMemo(() => {
        if (!mainTasksList || mainTasksList.length === 0) {
            return { totalMain: 0, totalSub: 0, totalWeight: 0 };
        }
        const totalMain = mainTasksList.length;
        let totalSub = 0;
        let totalWeight = 0;

        mainTasksList.forEach((m) => {
            totalWeight += Number(m.weight) || 0;
            totalSub += (m.sub_tasks || []).length;
        });

        return {
            totalMain,
            totalSub,
            totalWeight: Math.round(totalWeight * 100) / 100,
        };
    }, [mainTasksList]);

    return (
        <SuperAdminLayout>
            <Head title="Master WBS Templates — PROVIS SuperAdmin" />

            <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
                {/* Header Hero Banner */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c091f] via-[#140e34] to-[#1c1248] border border-violet-500/25 shadow-2xl shadow-violet-950/30 text-white p-6 sm:p-8">
                    {/* Subtle Architectural Dot Grid Overlay */}
                    <div
                        className="absolute inset-0 opacity-[0.14] pointer-events-none"
                        style={{
                            backgroundImage:
                                "radial-gradient(circle, #a78bfa 1px, transparent 1px)",
                            backgroundSize: "24px 24px",
                        }}
                    />

                    {/* Ambient Radiant Lighting Orbs */}
                    <div className="absolute -right-16 -top-16 w-80 h-80 bg-violet-600/25 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute right-1/3 -bottom-20 w-64 h-64 bg-fuchsia-600/15 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -left-12 -bottom-12 w-72 h-72 bg-indigo-600/20 rounded-full blur-2xl pointer-events-none" />
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-400/50 to-transparent pointer-events-none" />

                    {/* Hero Content */}
                    <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                        <div className="flex items-start sm:items-center gap-4 sm:gap-5">
                            {/* 3D-effect Glowing Glass Icon Badge */}
                            <div className="relative shrink-0">
                                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-violet-500/30 via-indigo-600/20 to-purple-800/30 border border-violet-400/30 backdrop-blur-md flex items-center justify-center text-violet-200 shadow-xl shadow-violet-950/50 ring-1 ring-white/15">
                                    <FolderTree className="w-7 h-7 sm:w-8 sm:h-8 text-violet-300 drop-shadow-[0_2px_10px_rgba(167,139,250,0.6)]" />
                                </div>
                                {/* <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 border-2 border-[#140e34] flex items-center justify-center shadow-xs">
                  <Sparkles className="w-2.5 h-2.5 text-white" />
                </div> */}
                            </div>

                            {/* Title & Badges */}
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/15 border border-violet-400/25 text-violet-200 text-[11px] font-bold tracking-wider uppercase backdrop-blur-xs shadow-2xs">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-400"></span>
                                        </span>
                                        Dynamic WBS Architecture Engine
                                    </div>
                                    <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-neutral-300 text-[11px] font-medium backdrop-blur-xs">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                        {templates.length} Registered Template
                                        {templates.length !== 1 ? "s" : ""}
                                    </div>
                                </div>

                                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white flex flex-wrap items-center gap-2.5">
                                    <span>Master Project</span>
                                    <span className="bg-gradient-to-r from-violet-300 via-indigo-200 to-white bg-clip-text text-transparent">
                                        Templates
                                    </span>
                                </h1>

                                <p className="text-[13px] sm:text-[14px] text-violet-200/80 max-w-2xl leading-relaxed">
                                    Standardized Work Breakdown Structure
                                    repository. Configure dynamic hierarchies,
                                    calibrated job weights, and operational
                                    division mapping for enterprise projects.
                                </p>
                            </div>
                        </div>

                        {/* Right: CTA Button */}
                        <div className="flex items-center gap-3 shrink-0 self-start lg:self-center">
                            <button
                                type="button"
                                onClick={() => {
                                    setTemplateForm({
                                        name: "",
                                        description: "",
                                        is_default: false,
                                    });
                                    setShowCreateTemplateModal(true);
                                }}
                                className="group relative inline-flex items-center gap-2.5 px-5 py-3 rounded-2xl font-bold text-[13.5px] text-white bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:via-indigo-500 hover:to-purple-500 shadow-xl shadow-violet-600/35 hover:shadow-violet-600/50 border border-violet-300/30 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] cursor-pointer"
                            >
                                <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center group-hover:rotate-90 transition-transform duration-200">
                                    <Plus
                                        size={15}
                                        strokeWidth={3}
                                        className="text-white"
                                    />
                                </div>
                                <span className="tracking-wide">
                                    New Template
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Template Selector Bar */}
                <div className="bg-white rounded-2xl border border-violet-100/90 p-4 sm:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-all">
                    <div className="flex flex-wrap items-center gap-3.5">
                        <div className="flex items-center gap-2 text-violet-950 font-bold text-[12px] tracking-wider uppercase shrink-0">
                            <span className="w-2 h-2 rounded-full bg-violet-600"></span>
                            Active Template:
                        </div>

                        <div className="relative min-w-[280px] sm:min-w-[340px]">
                            <select
                                value={selectedTemplate?.id || ""}
                                onChange={(e) =>
                                    handleSelectTemplate(Number(e.target.value))
                                }
                                className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-neutral-300/80 bg-neutral-50/60 hover:bg-white text-[13.5px] font-bold text-neutral-900 outline-none focus:border-violet-600 focus:bg-white focus:ring-4 focus:ring-violet-600/10 transition-all appearance-none cursor-pointer"
                            >
                                {templates.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}{" "}
                                        {t.is_default ? " - Default" : ""}
                                    </option>
                                ))}
                            </select>
                            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400">
                                <ChevronDown size={16} />
                            </div>
                        </div>

                        {selectedTemplate?.is_default ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-[12px] font-bold shadow-2xs">
                                <Star
                                    size={13}
                                    className="fill-emerald-500 text-emerald-500"
                                />
                                Default Master Template
                            </span>
                        ) : selectedTemplate ? (
                            <button
                                type="button"
                                disabled={submitting}
                                onClick={() =>
                                    handleSetDefault(selectedTemplate.id)
                                }
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100/80 border border-amber-200 text-amber-700 text-[12px] font-bold transition-all disabled:opacity-50 cursor-pointer shadow-2xs"
                            >
                                <Star size={13} />
                                Set as Default
                            </button>
                        ) : null}
                    </div>

                    {selectedTemplate && (
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setTemplateForm({
                                        name: selectedTemplate.name,
                                        description:
                                            selectedTemplate.description || "",
                                        is_default: selectedTemplate.is_default,
                                    });
                                    setShowEditTemplateModal(true);
                                }}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-[13px] font-semibold text-neutral-700 hover:text-neutral-900 shadow-2xs transition-all cursor-pointer"
                            >
                                <Edit2 size={13} className="text-neutral-500" />
                                Edit Info
                            </button>

                            {!selectedTemplate.is_default && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setShowDeleteTemplateModal(true)
                                    }
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 bg-red-50/60 hover:bg-red-50 text-[13px] font-semibold text-red-600 hover:text-red-700 shadow-2xs transition-all cursor-pointer"
                                >
                                    <Trash2
                                        size={13}
                                        className="text-red-500"
                                    />
                                    Delete
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Stats Summary Cards */}
                {selectedTemplate && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {/* Card 1: Main Tasks */}
                        <div className="relative overflow-hidden bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-xs hover:shadow-md hover:border-violet-200 transition-all duration-200 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/10 to-violet-600/20 border border-violet-200/60 flex items-center justify-center text-violet-700 flex-shrink-0 shadow-2xs">
                                    <FolderTree size={22} />
                                </div>
                                <div>
                                    <p className="text-[12px] font-semibold text-neutral-500 tracking-wide uppercase">
                                        Main Tasks (Level 1)
                                    </p>
                                    <div className="flex items-baseline gap-1.5 mt-0.5">
                                        <span className="text-2xl font-black text-neutral-900">
                                            {stats.totalMain}
                                        </span>
                                        <span className="text-[13px] font-medium text-neutral-500">
                                            Categories
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-100/80 shadow-2xs">
                                Root Nodes
                            </div>
                        </div>

                        {/* Card 2: Sub Tasks */}
                        <div className="relative overflow-hidden bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-xs hover:shadow-md hover:border-indigo-200 transition-all duration-200 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-indigo-600/20 border border-indigo-200/60 flex items-center justify-center text-indigo-700 flex-shrink-0 shadow-2xs">
                                    <Layers size={22} />
                                </div>
                                <div>
                                    <p className="text-[12px] font-semibold text-neutral-500 tracking-wide uppercase">
                                        Sub Tasks (Level 2)
                                    </p>
                                    <div className="flex items-baseline gap-1.5 mt-0.5">
                                        <span className="text-2xl font-black text-neutral-900">
                                            {stats.totalSub}
                                        </span>
                                        <span className="text-[13px] font-medium text-neutral-500">
                                            Action Items
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100/80 shadow-2xs">
                                Operational
                            </div>
                        </div>

                        {/* Card 3: Cumulative Weight */}
                        <div className="relative overflow-hidden bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-xs hover:shadow-md hover:border-emerald-200 transition-all duration-200 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div
                                    className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-2xs ${
                                        Math.abs(stats.totalWeight - 100) < 0.01
                                            ? "bg-gradient-to-br from-emerald-500/10 to-emerald-600/20 border border-emerald-200/60 text-emerald-700"
                                            : "bg-gradient-to-br from-amber-500/10 to-amber-600/20 border border-amber-200/60 text-amber-700"
                                    }`}
                                >
                                    <Scale size={22} />
                                </div>
                                <div>
                                    <p className="text-[12px] font-semibold text-neutral-500 tracking-wide uppercase">
                                        Cumulative Weight
                                    </p>
                                    <div className="flex items-baseline gap-1.5 mt-0.5">
                                        <span
                                            className={`text-2xl font-black ${
                                                Math.abs(
                                                    stats.totalWeight - 100,
                                                ) < 0.01
                                                    ? "text-emerald-700"
                                                    : "text-amber-700"
                                            }`}
                                        >
                                            {stats.totalWeight}%
                                        </span>
                                        <span className="text-[13px] font-medium text-neutral-500">
                                            / 100%
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div
                                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 shadow-2xs ${
                                    Math.abs(stats.totalWeight - 100) < 0.01
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                        : "bg-amber-50 text-amber-700 border-amber-200"
                                }`}
                            >
                                {Math.abs(stats.totalWeight - 100) < 0.01 ? (
                                    <>
                                        <CheckCircle2
                                            size={12}
                                            className="text-emerald-600"
                                        />
                                        Calibrated
                                    </>
                                ) : (
                                    <>
                                        <AlertCircle
                                            size={12}
                                            className="text-amber-600"
                                        />
                                        Needs Balance
                                    </>
                                )}
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
                                    Drag handles or use position arrows to
                                    reorder. Click "Add Sub Task" to add tasks
                                    under any main job.
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        const all = new Set<number>();
                                        (
                                            selectedTemplate.main_tasks || []
                                        ).forEach((m) => all.add(m.id));
                                        setExpandedMainIds(all);
                                    }}
                                >
                                    Expand All
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        setExpandedMainIds(new Set())
                                    }
                                >
                                    Collapse All
                                </Button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => {
                                        setMainForm({
                                            code: String(
                                                mainTasksList.length + 1,
                                            ),
                                            name: "",
                                            weight: 0,
                                        });
                                        setMainTaskModal({
                                            open: true,
                                            mode: "create",
                                        });
                                    }}
                                    className="bg-violet-600 hover:bg-violet-500"
                                >
                                    Add Main Task
                                </Button>
                            </div>
                        </div>

                        {/* Main Tasks List */}
                        <div className="divide-y divide-neutral-200">
                            {!mainTasksList || mainTasksList.length === 0 ? (
                                <div className="p-12 text-center text-neutral-500">
                                    <FolderTree
                                        size={36}
                                        className="mx-auto text-neutral-300 mb-2"
                                    />
                                    <p className="text-[14px] font-bold text-neutral-700">
                                        No Main Tasks yet
                                    </p>
                                    <p className="text-[12px] text-neutral-400 mt-1">
                                        Click "Add Main Task" to create the
                                        first step in this template.
                                    </p>
                                </div>
                            ) : (
                                mainTasksList.map((mainTask, mIdx) => {
                                    const isExpanded = expandedMainIds.has(
                                        mainTask.id,
                                    );
                                    const subTasks = mainTask.sub_tasks || [];

                                    return (
                                        <div
                                            key={mainTask.id}
                                            draggable
                                            onDragStart={() =>
                                                setDraggedMainIndex(mIdx)
                                            }
                                            onDragOver={(e) =>
                                                e.preventDefault()
                                            }
                                            onDrop={() => {
                                                if (
                                                    draggedMainIndex !== null &&
                                                    draggedMainIndex !== mIdx
                                                ) {
                                                    handleMoveMainTask(
                                                        draggedMainIndex,
                                                        mIdx,
                                                    );
                                                    setDraggedMainIndex(null);
                                                }
                                            }}
                                            className={`transition-colors ${
                                                draggedMainIndex === mIdx
                                                    ? "bg-violet-50/60 opacity-60"
                                                    : "bg-white hover:bg-neutral-50/40"
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
                                                        <GripVertical
                                                            size={16}
                                                        />
                                                    </div>

                                                    {/* Accordion toggle */}
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            toggleAccordion(
                                                                mainTask.id,
                                                            )
                                                        }
                                                        className="p-1 rounded-md text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100"
                                                    >
                                                        {isExpanded ? (
                                                            <ChevronDown
                                                                size={18}
                                                            />
                                                        ) : (
                                                            <ChevronRight
                                                                size={18}
                                                            />
                                                        )}
                                                    </button>

                                                    {/* Main Task Code Badge */}
                                                    <span className="w-8 h-8 rounded-lg bg-violet-600 text-white font-bold text-[13px] flex items-center justify-center flex-shrink-0 shadow-xs">
                                                        {mIdx + 1}
                                                    </span>

                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <h3 className="text-[14px] font-bold text-neutral-900 tracking-tight truncate">
                                                                {mainTask.name}
                                                            </h3>
                                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                                                                Weight:{" "}
                                                                {
                                                                    mainTask.weight
                                                                }
                                                                %
                                                            </span>
                                                            <span className="text-[11px] font-medium text-neutral-500">
                                                                {
                                                                    subTasks.length
                                                                }{" "}
                                                                Sub Tasks
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
                                                        onClick={() =>
                                                            handleMoveMainTask(
                                                                mIdx,
                                                                mIdx - 1,
                                                            )
                                                        }
                                                        className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 disabled:pointer-events-none"
                                                        title="Move Up"
                                                    >
                                                        <ArrowUp size={15} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={
                                                            mIdx ===
                                                            mainTasksList.length -
                                                                1
                                                        }
                                                        onClick={() =>
                                                            handleMoveMainTask(
                                                                mIdx,
                                                                mIdx + 1,
                                                            )
                                                        }
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
                                                                name: "",
                                                                default_pic_division:
                                                                    "General",
                                                                weight: 0,
                                                                default_duration: 14,
                                                            });
                                                            setSubTaskModal({
                                                                open: true,
                                                                mode: "create",
                                                                mainTaskId:
                                                                    mainTask.id,
                                                            });
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
                                                            setMainTaskModal({
                                                                open: true,
                                                                mode: "edit",
                                                                task: mainTask,
                                                            });
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
                                                                type: "main",
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
                                                            No Sub Tasks in this
                                                            section. Click "Add
                                                            Sub Task" above to
                                                            add one.
                                                        </div>
                                                    ) : (
                                                        subTasks.map(
                                                            (sub, sIdx) => (
                                                                <div
                                                                    key={sub.id}
                                                                    draggable
                                                                    onDragStart={() =>
                                                                        setDraggedSubInfo(
                                                                            {
                                                                                mainTaskId:
                                                                                    mainTask.id,
                                                                                index: sIdx,
                                                                            },
                                                                        )
                                                                    }
                                                                    onDragOver={(
                                                                        e,
                                                                    ) =>
                                                                        e.preventDefault()
                                                                    }
                                                                    onDrop={() => {
                                                                        if (
                                                                            draggedSubInfo &&
                                                                            draggedSubInfo.mainTaskId ===
                                                                                mainTask.id &&
                                                                            draggedSubInfo.index !==
                                                                                sIdx
                                                                        ) {
                                                                            handleMoveSubTask(
                                                                                mainTask.id,
                                                                                draggedSubInfo.index,
                                                                                sIdx,
                                                                            );
                                                                            setDraggedSubInfo(
                                                                                null,
                                                                            );
                                                                        }
                                                                    }}
                                                                    className="p-3 bg-white rounded-xl border border-neutral-200 flex items-center justify-between gap-3 shadow-2xs hover:border-violet-300 transition-colors"
                                                                >
                                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                                        <div
                                                                            className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-700 p-0.5"
                                                                            title="Drag to reorder Sub Task"
                                                                        >
                                                                            <GripVertical
                                                                                size={
                                                                                    14
                                                                                }
                                                                            />
                                                                        </div>

                                                                        <span className="px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-800 font-mono text-[11.5px] font-bold border border-neutral-200 flex-shrink-0">
                                                                            {`${mIdx + 1}.${sIdx + 1}`}
                                                                        </span>

                                                                        <span className="text-[13px] font-semibold text-neutral-800 truncate">
                                                                            {
                                                                                sub.name
                                                                            }
                                                                        </span>

                                                                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex-shrink-0">
                                                                            Division:{" "}
                                                                            {sub.default_pic_division ||
                                                                                "General"}
                                                                        </span>

                                                                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0 flex items-center gap-1">
                                                                            <Clock
                                                                                size={
                                                                                    11
                                                                                }
                                                                            />
                                                                            {sub.default_duration ||
                                                                                14}
                                                                            d
                                                                        </span>

                                                                        {sub.weight >
                                                                            0 && (
                                                                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex-shrink-0">
                                                                                {
                                                                                    sub.weight
                                                                                }

                                                                                %
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    <div className="flex items-center gap-1 flex-shrink-0">
                                                                        <button
                                                                            type="button"
                                                                            disabled={
                                                                                sIdx ===
                                                                                0
                                                                            }
                                                                            onClick={() =>
                                                                                handleMoveSubTask(
                                                                                    mainTask.id,
                                                                                    sIdx,
                                                                                    sIdx -
                                                                                        1,
                                                                                )
                                                                            }
                                                                            className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 disabled:pointer-events-none"
                                                                            title="Move Up"
                                                                        >
                                                                            <ArrowUp
                                                                                size={
                                                                                    13
                                                                                }
                                                                            />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            disabled={
                                                                                sIdx ===
                                                                                subTasks.length -
                                                                                    1
                                                                            }
                                                                            onClick={() =>
                                                                                handleMoveSubTask(
                                                                                    mainTask.id,
                                                                                    sIdx,
                                                                                    sIdx +
                                                                                        1,
                                                                                )
                                                                            }
                                                                            className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 disabled:pointer-events-none"
                                                                            title="Move Down"
                                                                        >
                                                                            <ArrowDown
                                                                                size={
                                                                                    13
                                                                                }
                                                                            />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setSubForm(
                                                                                    {
                                                                                        code: sub.code,
                                                                                        name: sub.name,
                                                                                        default_pic_division:
                                                                                            sub.default_pic_division,
                                                                                        weight: sub.weight,
                                                                                        default_duration:
                                                                                            sub.default_duration,
                                                                                    },
                                                                                );
                                                                                setSubTaskModal(
                                                                                    {
                                                                                        open: true,
                                                                                        mode: "edit",
                                                                                        mainTaskId:
                                                                                            mainTask.id,
                                                                                        subTask:
                                                                                            sub,
                                                                                    },
                                                                                );
                                                                            }}
                                                                            className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
                                                                            title="Edit Sub Task"
                                                                        >
                                                                            <Edit2
                                                                                size={
                                                                                    13
                                                                                }
                                                                            />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setDeleteTaskModal(
                                                                                    {
                                                                                        open: true,
                                                                                        type: "sub",
                                                                                        id: sub.id,
                                                                                        name: sub.name,
                                                                                        parentMainId:
                                                                                            mainTask.id,
                                                                                    },
                                                                                );
                                                                            }}
                                                                            className="p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50"
                                                                            title="Delete Sub Task"
                                                                        >
                                                                            <Trash2
                                                                                size={
                                                                                    13
                                                                                }
                                                                            />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ),
                                                        )
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
                        <form
                            onSubmit={handleCreateTemplate}
                            className="space-y-4"
                        >
                            <div>
                                <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                                    Template Name{" "}
                                    <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={templateForm.name}
                                    onChange={(e) =>
                                        setTemplateForm({
                                            ...templateForm,
                                            name: e.target.value,
                                        })
                                    }
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
                                    onChange={(e) =>
                                        setTemplateForm({
                                            ...templateForm,
                                            description: e.target.value,
                                        })
                                    }
                                    placeholder="Explain the purpose and scope of this template..."
                                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-600/15"
                                />
                            </div>

                            <label className="flex items-center gap-2 p-3 rounded-lg border border-neutral-200 cursor-pointer hover:bg-neutral-50">
                                <input
                                    type="checkbox"
                                    checked={templateForm.is_default}
                                    onChange={(e) =>
                                        setTemplateForm({
                                            ...templateForm,
                                            is_default: e.target.checked,
                                        })
                                    }
                                    className="rounded text-violet-600 focus:ring-violet-600"
                                />
                                <span className="text-[13px] font-semibold text-neutral-800">
                                    Set as Default Master Template for newly
                                    created projects
                                </span>
                            </label>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                        setShowCreateTemplateModal(false)
                                    }
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
                        <form
                            onSubmit={handleUpdateTemplate}
                            className="space-y-4"
                        >
                            <div>
                                <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                                    Template Name{" "}
                                    <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={templateForm.name}
                                    onChange={(e) =>
                                        setTemplateForm({
                                            ...templateForm,
                                            name: e.target.value,
                                        })
                                    }
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
                                    onChange={(e) =>
                                        setTemplateForm({
                                            ...templateForm,
                                            description: e.target.value,
                                        })
                                    }
                                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-600/15"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                        setShowEditTemplateModal(false)
                                    }
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
                                <AlertCircle
                                    size={20}
                                    className="flex-shrink-0 text-red-600"
                                />
                                <span>
                                    Are you sure you want to delete template{" "}
                                    <strong>{selectedTemplate.name}</strong>?
                                    This action cannot be undone.
                                </span>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                        setShowDeleteTemplateModal(false)
                                    }
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
                        title={
                            mainTaskModal.mode === "create"
                                ? "Add Main Task (Level 1)"
                                : "Edit Main Task"
                        }
                        onClose={() =>
                            setMainTaskModal({ open: false, mode: "create" })
                        }
                        size="md"
                    >
                        <form
                            onSubmit={handleSaveMainTask}
                            className="space-y-4"
                        >
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                                        Code / Index
                                    </label>
                                    <input
                                        type="text"
                                        value={mainForm.code}
                                        onChange={(e) =>
                                            setMainForm({
                                                ...mainForm,
                                                code: e.target.value,
                                            })
                                        }
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
                                        onChange={(e) =>
                                            setMainForm({
                                                ...mainForm,
                                                weight:
                                                    parseFloat(
                                                        e.target.value,
                                                    ) || 0,
                                            })
                                        }
                                        className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-violet-600"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                                    Main Task Name{" "}
                                    <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={mainForm.name}
                                    onChange={(e) =>
                                        setMainForm({
                                            ...mainForm,
                                            name: e.target.value,
                                        })
                                    }
                                    placeholder="e.g. PERIZINAN & DOKUMEN"
                                    className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-violet-600 font-bold"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                        setMainTaskModal({
                                            open: false,
                                            mode: "create",
                                        })
                                    }
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
                                    {mainTaskModal.mode === "create"
                                        ? "Add Task"
                                        : "Save Changes"}
                                </Button>
                            </div>
                        </form>
                    </Modal>
                )}

                {/* Modal: Add / Edit Sub Task */}
                {subTaskModal.open && (
                    <Modal
                        title={
                            subTaskModal.mode === "create"
                                ? "Add Sub Task (Level 2)"
                                : "Edit Sub Task"
                        }
                        onClose={() =>
                            setSubTaskModal({ open: false, mode: "create" })
                        }
                        size="md"
                    >
                        <form
                            onSubmit={handleSaveSubTask}
                            className="space-y-4"
                        >
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                                        Code
                                    </label>
                                    <input
                                        type="text"
                                        value={subForm.code}
                                        onChange={(e) =>
                                            setSubForm({
                                                ...subForm,
                                                code: e.target.value,
                                            })
                                        }
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
                                        onChange={(e) =>
                                            setSubForm({
                                                ...subForm,
                                                weight:
                                                    parseFloat(
                                                        e.target.value,
                                                    ) || 0,
                                            })
                                        }
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
                                        onChange={(e) =>
                                            setSubForm({
                                                ...subForm,
                                                default_duration:
                                                    parseInt(e.target.value) ||
                                                    14,
                                            })
                                        }
                                        className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-violet-600"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                                    Sub Task Name{" "}
                                    <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={subForm.name}
                                    onChange={(e) =>
                                        setSubForm({
                                            ...subForm,
                                            name: e.target.value,
                                        })
                                    }
                                    placeholder="e.g. PENGURUSAN IMB & AMDAL"
                                    className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-violet-600 font-medium"
                                />
                            </div>

                            <div>
                                <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                                    Default PIC Division
                                </label>
                                <select
                                    value={subForm.default_pic_division}
                                    onChange={(e) =>
                                        setSubForm({
                                            ...subForm,
                                            default_pic_division:
                                                e.target.value,
                                        })
                                    }
                                    className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-[13px] outline-none focus:border-violet-600 bg-white"
                                >
                                    <option value="General">
                                        General / All Divisions
                                    </option>
                                    {divisions.map((d) => (
                                        <option key={d.id} value={d.divisi}>
                                            {d.divisi}
                                        </option>
                                    ))}
                                    {subForm.default_pic_division &&
                                        subForm.default_pic_division !== "General" &&
                                        !divisions.some(
                                            (d) =>
                                                d.divisi ===
                                                subForm.default_pic_division,
                                        ) && (
                                            <option
                                                value={
                                                    subForm.default_pic_division
                                                }
                                            >
                                                {subForm.default_pic_division}
                                            </option>
                                        )}
                                </select>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                        setSubTaskModal({
                                            open: false,
                                            mode: "create",
                                        })
                                    }
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
                                    {subTaskModal.mode === "create"
                                        ? "Add Sub Task"
                                        : "Save Changes"}
                                </Button>
                            </div>
                        </form>
                    </Modal>
                )}

                {/* Modal: Confirm Delete Task */}
                {deleteTaskModal.open && (
                    <Modal
                        title={`Delete ${deleteTaskModal.type === "main" ? "Main Task" : "Sub Task"}`}
                        onClose={() =>
                            setDeleteTaskModal({
                                open: false,
                                type: "main",
                                id: 0,
                                name: "",
                            })
                        }
                        size="sm"
                    >
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-3 bg-red-50 text-red-700 rounded-xl text-[13px]">
                                <AlertCircle
                                    size={20}
                                    className="flex-shrink-0 text-red-600"
                                />
                                <span>
                                    Are you sure you want to delete{" "}
                                    <strong>{deleteTaskModal.name}</strong>?
                                    {deleteTaskModal.type === "main" &&
                                        " All nested subtasks will also be deleted."}
                                </span>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                        setDeleteTaskModal({
                                            open: false,
                                            type: "main",
                                            id: 0,
                                            name: "",
                                        })
                                    }
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
