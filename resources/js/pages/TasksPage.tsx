import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { usePage, router, Link } from "@inertiajs/react";
import {
    Plus,
    Search,
    ChevronDown,
    ChevronRight,
    Lock,
    CheckSquare,
    Square,
    Shield,
    Calendar,
    Layers,
    Info,
    Trash2,
    Edit2,
    ListTodo,
    TableProperties,
    Download,
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    Clock,
    UploadCloud,
    FileText,
    X,
    Eye,
    CalendarDays,
    Sliders,
    Paperclip,
    Link2,
    Check,
    GripVertical,
    History,
    Scale,
    Users,
} from "lucide-react";
import {
    Project,
    MainJob,
    SubMainJob,
    SubSubtask,
    Status,
    DependencyType,
    EvidenceItem,
} from "@/data/mockData";
import { recalculateSchedule } from "@/utils/scheduleEngine";
import { canStartTask } from "@/utils/taskDependencies";
import { recalculateProgress } from "@/utils/progressEngine";
import { exportToCSV } from "@/utils/exportEngine";
import {
    StatusBadge,
    ProgressBar,
    PageHeader,
    Card,
    Button,
    Modal,
    Toast,
    EmptyState,
    formatDateDisplay,
    formatDivisionName,
} from "@/components/ui";
import { useAuth } from "@/context/AuthContext";

const STATUSES: Status[] = [
    "Open",
    "On Track",
    "At Risk",
    "Delayed",
    "Cancelled",
    "Completed",
];

function EditableProgress({
    value,
    disabled,
    onSave,
    isChecked,
}: {
    value: number;
    disabled: boolean;
    onSave: (val: number) => void;
    isChecked: boolean;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [val, setVal] = useState(value.toString());

    useEffect(() => {
        setVal(value.toString());
    }, [value]);

    const handleCommit = () => {
        setIsEditing(false);
        const parsed = parseInt(val, 10);
        if (
            !isNaN(parsed) &&
            parsed !== value &&
            parsed >= 0 &&
            parsed <= 100
        ) {
            onSave(parsed);
        } else {
            setVal(value.toString());
        }
    };

    if (isEditing && !disabled) {
        return (
            <div className="inline-flex items-center gap-1 bg-white border border-brand/60 rounded px-1.5 py-0.5 shadow-2xs">
                <input
                    autoFocus
                    type="number"
                    min="0"
                    max="100"
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    onBlur={handleCommit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            handleCommit();
                        } else if (e.key === "Escape") {
                            setIsEditing(false);
                            setVal(value.toString());
                        }
                    }}
                    className="w-9 text-right text-[12.5px] font-black text-neutral-900 outline-none p-0 hide-arrows"
                    style={{ appearance: "textfield" }}
                />
                <span className="text-[11px] font-bold text-neutral-500">%</span>
                <button
                    type="button"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        handleCommit();
                    }}
                    className="p-0.5 text-emerald-700 hover:text-emerald-800 transition-colors"
                    title="Save Progress"
                >
                    <Check size={12} />
                </button>
            </div>
        );
    }

    return (
        <span
            className={`inline-flex items-center justify-end text-[12.5px] font-black w-14 text-right tabular-nums transition-colors ${
                !disabled
                    ? "cursor-text hover:bg-neutral-100 hover:ring-1 hover:ring-neutral-300 rounded px-1.5 py-0.5 -mx-1"
                    : "px-1"
            } ${isChecked ? "text-emerald-700" : "text-neutral-800"}`}
            onClick={() => {
                if (!disabled) setIsEditing(true);
            }}
            title={
                !disabled
                    ? "Click to edit completion percentage (0–100%)"
                    : `Progress: ${value}% (Read-only)`
            }
        >
            {value}%
        </span>
    );
}

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
    const rawRole = (
        pageProps?.userRole ||
        authUser?.role ||
        authUser?.rawRole ||
        ""
    )
        .toString()
        .toLowerCase();
    const isSuperAdmin =
        rawRole === "super_admin" ||
        rawRole === "superadministrator" ||
        rawRole === "superadmin";
    const isPICRole = authUser?.isPIC === true || rawRole === "pic" || isSuperAdmin;
    const canEditProject = isSuperAdmin || (Boolean(authUser?.isPIC === true || rawRole === "pic") && ((project as any)?.can_edit ?? (usePage().props as any)?.canEdit ?? false) !== false);
    const isPIC = canEditProject;
    const isWorker = authUser?.isWorker === true || rawRole === "worker";
    const isAdmin =
        authUser?.isAdminUtama === true ||
        authUser?.isAdminProgres === true ||
        rawRole === "admin_utama" ||
        rawRole === "admin_progres" ||
        rawRole === "admin";

    const [projectData, setProjectData] = useState<Project>(() => {
        if (!project || !project.mainJobs) {
            return {
                id: 0,
                title: "No Project Assigned",
                mainJobs: [],
                weeklyData: [],
                scurveData: [],
            } as any as Project;
        }
        return recalculateSchedule(recalculateProgress(project));
    });

    useEffect(() => {
        if (project && project.mainJobs) {
            setProjectData(recalculateSchedule(recalculateProgress(project)));
        } else {
            setProjectData({
                id: 0,
                title: "No Project Assigned",
                mainJobs: [],
                weeklyData: [],
                scurveData: [],
            } as any as Project);
        }
    }, [project]);

    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState<Status | "">("");
    const [viewMode, setViewMode] = useState<"checklist" | "table">(
        "checklist",
    );
    const [expandedMJ, setExpandedMJ] = useState<Record<string, boolean>>({
        "mj-1": true,
        "mj-01": true,
    });
    const [expandedSMJ, setExpandedSMJ] = useState<Record<string, boolean>>({
        "smj-1": true,
        "smj-1-1": true,
    });

    // Modals & Enhanced Features State
    const [showMainJobModal, setShowMainJobModal] = useState<{
        mode: "create" | "edit";
        id?: string;
        dbId?: number;
        name?: string;
        weight?: number;
        startDate?: string;
        finishDate?: string;
    } | null>(null);
    const [showAddTaskModal, setShowAddTaskModal] = useState<{
        smjId: string;
        smjDbId?: number;
        parentSmj?: SubMainJob;
        task?: SubSubtask;
    } | null>(null);
    const [showAddSubMainJobModal, setShowAddSubMainJobModal] = useState<{
        mjId: string;
        mjDbId?: number;
        mjName: string;
        parentWeight?: number;
        currentSubCount?: number;
    } | null>(null);
    const [showEditSubMainJobModal, setShowEditSubMainJobModal] = useState<{
        smj: SubMainJob;
        parentMj?: MainJob;
    } | null>(null);
    const [draggedMainJobId, setDraggedMainJobId] = useState<string | null>(null);
    const [dropTargetMainJobId, setDropTargetMainJobId] = useState<string | null>(null);
    const [draggedSubJob, setDraggedSubJob] = useState<{
        parentMjId: string;
        parentMjDbId?: number;
        smjId: string;
    } | null>(null);
    const [dropTargetSubJobId, setDropTargetSubJobId] = useState<string | null>(null);
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
    const [evidencePreview, setEvidencePreview] = useState<EvidenceItem | null>(
        null,
    );
    const [uploadEvidenceTask, setUploadEvidenceTask] = useState<{
        task: SubSubtask;
        requireComplete?: boolean;
    } | null>(null);
    const [todaySectionOpen, setTodaySectionOpen] = useState(true);
    const [toastMsg, setToastMsg] = useState<string | null>(null);

    // Progress History Modal State
    const [historyModalTask, setHistoryModalTask] = useState<{
        task: SubSubtask;
        parentSmj?: SubMainJob;
    } | null>(null);

    // Drag-and-Drop Organization State
    const [draggedItem, setDraggedItem] = useState<{
        smjId: string;
        taskId: string;
    } | null>(null);
    const [dropTargetTaskId, setDropTargetTaskId] = useState<string | null>(null);

    // Inline Task Name Edit State
    const [inlineEditingTaskId, setInlineEditingTaskId] = useState<string | null>(null);
    const [inlineEditingTaskName, setInlineEditingTaskName] = useState<string>("");
    const [inlineSavingTaskId, setInlineSavingTaskId] = useState<string | null>(null);

    // Manage Dependencies State
    const [depModal, setDepModal] = useState<{
        isOpen: boolean;
        task?: SubSubtask;
    }>({ isOpen: false });
    const [depForm, setDepForm] = useState({
        predecessor_wbs_ids: [] as string[],
        dependency_type: "FS" as DependencyType,
        lag_days: 0,
    });
    const [actionError, setActionError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // Sync depModal task data when projectData updates via Inertia
    useEffect(() => {
        if (depModal.isOpen && depModal.task) {
            const updatedTask = projectData.mainJobs
                .flatMap((mj) => mj.subMainJobs)
                .flatMap((smj) => smj.subtasks)
                .find((st) => st.id === depModal.task!.id);

            if (
                updatedTask &&
                JSON.stringify(updatedTask.dependencies) !==
                    JSON.stringify(depModal.task.dependencies)
            ) {
                setDepModal((prev) => ({ ...prev, task: updatedTask }));
            }
        }
    }, [projectData, depModal.isOpen, depModal.task?.id]);

    const handleSaveEvidence = (
        taskId: string,
        newEvidences: EvidenceItem[],
        completeTo100: boolean = false,
        rawFiles?: File[],
    ) => {
        if (!projectData.id) return;

        // Find current progress
        let currentProg = 0;
        projectData.mainJobs.forEach((mj) => {
            mj.subMainJobs.forEach((smj) => {
                smj.subtasks.forEach((st) => {
                    if (st.id === taskId) currentProg = st.progress;
                });
            });
        });
        const targetProgress = completeTo100 ? 100 : currentProg;

        // Build the payload — Inertia router.post handles File objects natively
        const payload: Record<string, unknown> = {
            progress: targetProgress,
        };

        if (rawFiles && rawFiles.length > 0) {
            if (rawFiles.length === 1) {
                payload["evidence_file"] = rawFiles[0];
            } else {
                rawFiles.forEach((f, i) => {
                    payload[`evidence_file_${i}`] = f;
                });
                payload["evidence_file_count"] = rawFiles.length;
            }
        }

        router.post(
            `/projects/${projectData.id}/tasks/${taskId}/toggle`,
            payload as any,
            {
                preserveScroll: true,
                preserveState: true,
                forceFormData: true,
                onSuccess: (page) => {
                    // Optimistically merge new evidences into local state so UI updates immediately
                    // without needing a full page reload
                    const serverProject = (page.props as any)?.project;
                    if (serverProject) {
                        setProjectData(
                            recalculateSchedule(
                                recalculateProgress(serverProject),
                            ),
                        );
                    } else {
                        // Fallback: manually merge new evidences into local state
                        setProjectData((prev) => {
                            const updated = { ...prev };
                            updated.mainJobs = updated.mainJobs.map((mj) => ({
                                ...mj,
                                subMainJobs: mj.subMainJobs.map((smj) => ({
                                    ...smj,
                                    subtasks: smj.subtasks.map((st) => {
                                        if (st.id !== taskId) return st;
                                        return {
                                            ...st,
                                            progress: targetProgress,
                                            checked: targetProgress >= 100,
                                            evidences: [
                                                ...(st.evidences || []),
                                                ...newEvidences,
                                            ],
                                        };
                                    }),
                                })),
                            }));
                            return recalculateSchedule(
                                recalculateProgress(updated),
                            );
                        });
                    }
                    setToastMsg(
                        completeTo100
                            ? "Completion evidence uploaded successfully & task marked 100% complete ✓"
                            : "Evidence attached to task successfully ✓",
                    );
                    setUploadEvidenceTask(null);
                },
                onError: (err) => {
                    console.error(err);
                    setToastMsg("Failed to upload evidence.");
                    setUploadEvidenceTask(null);
                },
            },
        );
    };

    // Dynamic Today's Tasks
    const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

    const todayTasks = useMemo(() => {
        const list: Array<{
            st: SubSubtask;
            parentSmj: SubMainJob;
            parentMj: MainJob;
            timingStatus: "active" | "starting" | "due" | "overdue";
        }> = [];

        projectData.mainJobs.forEach((mj) => {
            mj.subMainJobs.forEach((smj) => {
                smj.subtasks.forEach((st) => {
                    if (!st.startDate && !st.finishDate) return;
                    const start = st.startDate || "";
                    const end = st.finishDate || st.startDate || "";
                    const isDone = st.checked || st.progress >= 100;

                    if (end < todayStr && !isDone) {
                        list.push({
                            st,
                            parentSmj: smj,
                            parentMj: mj,
                            timingStatus: "overdue",
                        });
                    } else if (end === todayStr) {
                        list.push({
                            st,
                            parentSmj: smj,
                            parentMj: mj,
                            timingStatus: "due",
                        });
                    } else if (start === todayStr) {
                        list.push({
                            st,
                            parentSmj: smj,
                            parentMj: mj,
                            timingStatus: "starting",
                        });
                    } else if (start <= todayStr && end >= todayStr) {
                        list.push({
                            st,
                            parentSmj: smj,
                            parentMj: mj,
                            timingStatus: "active",
                        });
                    }
                });
            });
        });

        return list;
    }, [projectData, todayStr]);

    const toggleMJ = (id: string) =>
        setExpandedMJ((p) => ({ ...p, [id]: !p[id] }));
    const toggleSMJ = (id: string) =>
        setExpandedSMJ((p) => ({ ...p, [id]: !p[id] }));

    // Add / Edit Main Task (Main Job / Level 1 WBS)
    const handleSaveMainJob = (
        name: string,
        weight: number,
        start?: string,
        end?: string,
        targetId?: string,
        targetDbId?: number,
        onComplete?: (error?: string) => void,
    ) => {
        if (!projectData.id || !name) return;

        if (targetId) {
            const cleanDbId =
                targetDbId ||
                (targetId.startsWith("mj-")
                    ? parseInt(targetId.replace("mj-", ""))
                    : parseInt(targetId));
            router.put(
                `/projects/${projectData.id}/main-wbs/${cleanDbId}`,
                {
                    name,
                    weight,
                    start: start || null,
                    end: end || null,
                },
                {
                    preserveScroll: true,
                    onSuccess: (page: any) => {
                        const flashError = page?.props?.flash?.error;
                        const pageErrors = page?.props?.errors;
                        const err = flashError || (pageErrors && Object.values(pageErrors)[0]);
                        if (err) {
                            const msg = typeof err === "string" ? err : JSON.stringify(err);
                            onComplete?.(msg);
                            setToastMsg(msg);
                            return;
                        }
                        setToastMsg(
                            `Main Task "${name}" updated successfully.`,
                        );
                        setShowMainJobModal(null);
                        onComplete?.();
                    },
                    onError: (errors) => {
                        console.error("Error updating Main Task:", errors);
                        const errText = Object.values(errors).flat().join(", ");
                        const msg = `Failed to update Main Task: ${errText || "Please check your input"}`;
                        onComplete?.(msg);
                        setToastMsg(msg);
                    },
                },
            );
        } else {
            router.post(
                `/projects/${projectData.id}/main-wbs`,
                {
                    name,
                    weight,
                    start: start || null,
                    end: end || null,
                },
                {
                    preserveScroll: true,
                    onSuccess: (page: any) => {
                        const flashError = page?.props?.flash?.error;
                        const pageErrors = page?.props?.errors;
                        const err = flashError || (pageErrors && Object.values(pageErrors)[0]);
                        if (err) {
                            const msg = typeof err === "string" ? err : JSON.stringify(err);
                            onComplete?.(msg);
                            setToastMsg(msg);
                            return;
                        }
                        setToastMsg(`Main Task "${name}" added successfully.`);
                        setShowMainJobModal(null);
                        onComplete?.();
                    },
                    onError: (errors) => {
                        console.error("Error adding Main Task:", errors);
                        const errText = Object.values(errors).flat().join(", ");
                        const msg = `Failed to add Main Task: ${errText || "Please check your input"}`;
                        onComplete?.(msg);
                        setToastMsg(msg);
                    },
                },
            );
        }
    };

    // Delete Main Task (Main Job)
    const handleDeleteMainJob = (
        mjId: string,
        mjDbId: number | undefined,
        mjName: string,
    ) => {
        setDeleteConfirm({
            title: "Delete Main Task",
            message: `Delete Main Task "${mjName}" along with all its Sub Tasks and task items?`,
            onConfirm: () => {
                const targetDbId =
                    mjDbId ||
                    (mjId.startsWith("mj-") ? mjId.replace("mj-", "") : mjId);
                if (projectData.id && targetDbId) {
                    router.delete(
                        `/projects/${projectData.id}/main-wbs/${targetDbId}`,
                        {
                            preserveScroll: true,
                            onSuccess: (page: any) => {
                                const flashError = page?.props?.flash?.error;
                                const pageErrors = page?.props?.errors;
                                const err = flashError || (pageErrors && Object.values(pageErrors)[0]);
                                if (err) {
                                    setToastMsg(typeof err === "string" ? err : JSON.stringify(err));
                                    return;
                                }
                                setToastMsg(
                                    `Main Task "${mjName}" deleted successfully.`,
                                );
                            },
                            onError: () =>
                                setToastMsg(
                                    "Failed to delete Main Task from server.",
                                ),
                        },
                    );
                }
            },
        });
    };

    // Add Sub Task (Sub Main Job under Main Job)
    const handleSaveSubMainJob = (
        mjId: string,
        name: string,
        start?: string,
        end?: string,
        mjDbId?: number,
        onComplete?: (error?: string) => void,
    ) => {
        if (!projectData.id || !name) return;

        const cleanMainId =
            mjDbId ||
            (mjId.startsWith("mj-")
                ? parseInt(mjId.replace("mj-", ""))
                : parseInt(mjId));
        router.post(
            `/projects/${projectData.id}/sub-wbs`,
            {
                main_wbs_id: cleanMainId,
                name: name,
                start: start || null,
                end: end || null,
            },
            {
                preserveScroll: true,
                onSuccess: (page: any) => {
                    const flashError = page?.props?.flash?.error;
                    const pageErrors = page?.props?.errors;
                    const err = flashError || (pageErrors && Object.values(pageErrors)[0]);
                    if (err) {
                        const msg = typeof err === "string" ? err : JSON.stringify(err);
                        onComplete?.(msg);
                        setToastMsg(msg);
                        return;
                    }
                    setToastMsg(`Sub Task "${name}" added successfully.`);
                    setShowAddSubMainJobModal(null);
                    onComplete?.();
                },
                onError: (errors) => {
                    console.error("Error adding Sub Task:", errors);
                    const errText = Object.values(errors).flat().join(", ");
                    const msg = `Failed to add Sub Task: ${errText || "Please check your input"}`;
                    onComplete?.(msg);
                    setToastMsg(msg);
                },
            },
        );
    };

    // Edit Sub Task (Sub Main Job)
    const handleUpdateSubMainJob = (
        smjId: string,
        smjDbId: number | undefined,
        name: string,
        weight?: number,
        start?: string,
        end?: string,
        onComplete?: (error?: string) => void,
    ) => {
        if (!projectData.id || !name) return;

        const cleanDbId =
            smjDbId ||
            (smjId.startsWith("smj-")
                ? parseInt(smjId.replace("smj-", ""))
                : parseInt(smjId));

        if (!cleanDbId) {
            onComplete?.("Invalid Sub Task ID");
            return;
        }

        router.put(
            `/projects/${projectData.id}/sub-wbs/${cleanDbId}`,
            {
                name,
                weight: weight !== undefined ? weight : null,
                start: start || null,
                end: end || null,
            },
            {
                preserveScroll: true,
                onSuccess: (page: any) => {
                    const flashError = page?.props?.flash?.error;
                    const pageErrors = page?.props?.errors;
                    const err =
                        flashError || (pageErrors && Object.values(pageErrors)[0]);
                    if (err) {
                        const msg =
                            typeof err === "string" ? err : JSON.stringify(err);
                        onComplete?.(msg);
                        setToastMsg(msg);
                        return;
                    }
                    setToastMsg(`Sub Task "${name}" updated successfully.`);
                    setShowEditSubMainJobModal(null);
                    onComplete?.();
                },
                onError: (errors) => {
                    console.error("Error updating Sub Task:", errors);
                    const errText = Object.values(errors).flat().join(", ");
                    const msg = `Failed to update Sub Task: ${errText || "Please check your input"}`;
                    onComplete?.(msg);
                    setToastMsg(msg);
                },
            },
        );
    };

    // Delete Sub Task (Sub Main Job)
    const handleDeleteSubMainJob = (
        mjId: string,
        smjId: string,
        smjDbId: number | undefined,
        smjName: string,
    ) => {
        setDeleteConfirm({
            title: "Delete Sub Task",
            message: `Delete Sub Task "${smjName}" along with all tasks inside it?`,
            onConfirm: () => {
                const targetDbId =
                    smjDbId ||
                    (smjId.startsWith("smj-")
                        ? smjId.replace("smj-", "")
                        : smjId);
                if (projectData.id && targetDbId) {
                    router.delete(
                        `/projects/${projectData.id}/sub-wbs/${targetDbId}`,
                        {
                            preserveScroll: true,
                            onSuccess: (page: any) => {
                                const flashError = page?.props?.flash?.error;
                                const pageErrors = page?.props?.errors;
                                const err = flashError || (pageErrors && Object.values(pageErrors)[0]);
                                if (err) {
                                    setToastMsg(typeof err === "string" ? err : JSON.stringify(err));
                                    return;
                                }
                                setToastMsg(
                                    `Sub Task "${smjName}" deleted successfully.`,
                                );
                            },
                            onError: () =>
                                setToastMsg(
                                    "Failed to delete Sub Task from server.",
                                ),
                        },
                    );
                }
            },
        });
    };

    // Add or Edit Sub-Subtask (Task)
    const handleSaveSubtask = (
        smjId: string,
        taskData: Partial<SubSubtask> & {
            smjDbId?: number;
            divisionId?: number;
            division_ids?: number[];
        },
        onComplete?: (error?: string) => void,
    ) => {
        if (!projectData.id || !taskData.name) return;

        const cleanSubWbsId =
            taskData.smjDbId ||
            (smjId.startsWith("smj-")
                ? parseInt(smjId.replace("smj-", ""))
                : parseInt(smjId));
        const divIds = taskData.division_ids && taskData.division_ids.length > 0
            ? taskData.division_ids
            : (taskData.divisionId ? [taskData.divisionId] : []);
        const payload = {
            sub_wbs_id: cleanSubWbsId,
            name: taskData.name,
            divisions_id: divIds[0] || taskData.divisionId || null,
            division_ids: divIds,
            duration: taskData.duration || 1,
            start: taskData.startDate || null,
            end: taskData.finishDate || null,
            predecessor: taskData.predecessor || null,
            dep_type: taskData.depType || "FS",
            lag: taskData.lag || 0,
            lead: taskData.lead || 0,
            predecessors: taskData.predecessors || [],
            requires_evidence: taskData.requiresEvidence || false,
            weight: taskData.weight !== undefined ? taskData.weight : 100,
        };

        if (taskData.id) {
            router.put(
                `/projects/${projectData.id}/tasks/${taskData.id}`,
                payload,
                {
                    preserveScroll: true,
                    onSuccess: (page: any) => {
                        const flashError = page?.props?.flash?.error;
                        const pageErrors = page?.props?.errors;
                        const err = flashError || (pageErrors && Object.values(pageErrors)[0]);
                        if (err) {
                            const msg = typeof err === "string" ? err : JSON.stringify(err);
                            onComplete?.(msg);
                            setToastMsg(msg);
                            return;
                        }
                        setToastMsg(
                            `Task "${taskData.name}" updated successfully.`,
                        );
                        setShowAddTaskModal(null);
                        onComplete?.();
                    },
                    onError: (errors) => {
                        console.error("Error updating task:", errors);
                        const errText = Object.values(errors).flat().join(", ");
                        const msg = `Failed to update task: ${errText || "Please check your input"}`;
                        onComplete?.(msg);
                        setToastMsg(msg);
                    },
                },
            );
        } else {
            router.post(`/projects/${projectData.id}/tasks`, payload, {
                preserveScroll: true,
                onSuccess: (page: any) => {
                    const flashError = page?.props?.flash?.error;
                    const pageErrors = page?.props?.errors;
                    const err = flashError || (pageErrors && Object.values(pageErrors)[0]);
                    if (err) {
                        const msg = typeof err === "string" ? err : JSON.stringify(err);
                        onComplete?.(msg);
                        setToastMsg(msg);
                        return;
                    }
                    setToastMsg(`Task "${taskData.name}" added successfully.`);
                    setShowAddTaskModal(null);
                    onComplete?.();
                },
                onError: (errors) => {
                    console.error("Error adding task:", errors);
                    const errText = Object.values(errors).flat().join(", ");
                    const msg = `Failed to save task: ${errText || "Please check your input"}`;
                    onComplete?.(msg);
                    setToastMsg(msg);
                },
            });
        }
    };

    const handleDeleteSubtask = (
        smjId: string,
        taskId: string,
        taskName: string,
    ) => {
        setDeleteConfirm({
            title: "Delete Task",
            message: `Delete task "${taskName}"?`,
            onConfirm: () => {
                if (projectData.id && taskId) {
                    router.delete(
                        `/projects/${projectData.id}/tasks/${taskId}`,
                        {
                            preserveScroll: true,
                            onSuccess: (page: any) => {
                                const flashError = page?.props?.flash?.error;
                                const pageErrors = page?.props?.errors;
                                const err = flashError || (pageErrors && Object.values(pageErrors)[0]);
                                if (err) {
                                    setToastMsg(typeof err === "string" ? err : JSON.stringify(err));
                                    return;
                                }
                                setToastMsg(
                                    `Task "${taskName}" successfully deleted.`,
                                );
                            },
                            onError: () =>
                                setToastMsg(
                                    "Failed to delete task from server.",
                                ),
                        },
                    );
                }
            },
        });
    };

    // Persistent Task Reordering within same Sub Main Job
    const handleReorderTasks = (
        smjId: string,
        sourceTaskId: string,
        targetTaskId: string,
    ) => {
        if (sourceTaskId === targetTaskId) return;

        let moved = false;
        let newOrderedIds: string[] = [];
        const previousData = projectData;

        setProjectData((prev) => {
            const next = { ...prev };
            next.mainJobs = next.mainJobs.map((mj) => ({
                ...mj,
                subMainJobs: mj.subMainJobs.map((smj) => {
                    if (smj.id !== smjId) return smj;
                    const items = [...smj.subtasks];
                    const sourceIdx = items.findIndex((t) => t.id === sourceTaskId);
                    const targetIdx = items.findIndex((t) => t.id === targetTaskId);
                    if (sourceIdx === -1 || targetIdx === -1) return smj;

                    const [removed] = items.splice(sourceIdx, 1);
                    items.splice(targetIdx, 0, removed);
                    moved = true;
                    newOrderedIds = items.map((t) => String(t.id));
                    return { ...smj, subtasks: items };
                }),
            }));
            return next;
        });

        if (moved && projectData?.id) {
            router.post(
                `/projects/${projectData.id}/reorder-tasks`,
                {
                    sub_wbs_id: smjId,
                    ordered_ids: newOrderedIds,
                },
                {
                    preserveScroll: true,
                    onSuccess: (page: any) => {
                        const flashSuccess = page?.props?.flash?.success;
                        const flashError = page?.props?.flash?.error;
                        const pageErrors = page?.props?.errors;
                        const err = flashError || (pageErrors && Object.values(pageErrors)[0]);
                        if (err) {
                            setProjectData(previousData);
                            setToastMsg(typeof err === "string" ? err : JSON.stringify(err));
                            return;
                        }
                        setToastMsg(flashSuccess || "Task order successfully saved.");
                    },
                    onError: (errors) => {
                        setProjectData(previousData);
                        const err = errors?.message || Object.values(errors)[0] || "Failed to persist task order.";
                        setToastMsg(typeof err === "string" ? err : JSON.stringify(err));
                    },
                }
            );
        }
    };

    // Persistent Main Task (Main Job) Reordering
    const handleReorderMainJobs = (
        sourceMjId: string,
        targetMjId: string,
    ) => {
        if (sourceMjId === targetMjId) return;

        let moved = false;
        let newOrderedDbIds: number[] = [];
        const previousData = projectData;

        setProjectData((prev) => {
            const items = [...prev.mainJobs];
            const sourceIdx = items.findIndex((m) => m.id === sourceMjId);
            const targetIdx = items.findIndex((m) => m.id === targetMjId);
            if (sourceIdx === -1 || targetIdx === -1) return prev;

            const [removed] = items.splice(sourceIdx, 1);
            items.splice(targetIdx, 0, removed);
            moved = true;

            newOrderedDbIds = items
                .map((m, mIdx) => {
                    m.code = String(mIdx + 1);
                    m.subMainJobs = m.subMainJobs.map((s, sIdx) => {
                        s.code = `${mIdx + 1}.${sIdx + 1}`;
                        s.subtasks = s.subtasks.map((t, tIdx) => {
                            t.code = `${mIdx + 1}.${sIdx + 1}.${tIdx + 1}`;
                            return t;
                        });
                        return s;
                    });
                    if (m.dbId) return m.dbId;
                    const clean = String(m.id).replace(/^mj-/, "");
                    const parsed = parseInt(clean, 10);
                    return isNaN(parsed) ? 0 : parsed;
                })
                .filter((id) => id > 0);

            return { ...prev, mainJobs: items };
        });

        if (moved && projectData?.id && newOrderedDbIds.length > 0) {
            router.post(
                `/projects/${projectData.id}/reorder-main-wbs`,
                {
                    ordered_ids: newOrderedDbIds,
                },
                {
                    preserveScroll: true,
                    onSuccess: (page: any) => {
                        const flashError = page?.props?.flash?.error;
                        const pageErrors = page?.props?.errors;
                        const err =
                            flashError || (pageErrors && Object.values(pageErrors)[0]);
                        if (err) {
                            setProjectData(previousData);
                            setToastMsg(
                                typeof err === "string" ? err : JSON.stringify(err),
                            );
                            return;
                        }
                        setToastMsg(
                            page?.props?.flash?.success ||
                                "Main Task order successfully saved.",
                        );
                    },
                    onError: (errors) => {
                        setProjectData(previousData);
                        const err =
                            errors?.message ||
                            Object.values(errors)[0] ||
                            "Failed to persist Main Task order.";
                        setToastMsg(
                            typeof err === "string" ? err : JSON.stringify(err),
                        );
                    },
                },
            );
        }
    };

    // Persistent Sub Task (Sub Main Job) Reordering within same Main Task
    const handleReorderSubMainJobs = (
        parentMjId: string,
        parentMjDbId: number | undefined,
        sourceSmjId: string,
        targetSmjId: string,
    ) => {
        if (sourceSmjId === targetSmjId) return;

        let moved = false;
        let newOrderedDbIds: number[] = [];
        let cleanMainWbsId =
            parentMjDbId ||
            parseInt(String(parentMjId).replace(/^mj-/, ""), 10);
        const previousData = projectData;

        setProjectData((prev) => {
            const next = { ...prev };
            next.mainJobs = next.mainJobs.map((mj) => {
                if (mj.id !== parentMjId && mj.dbId !== parentMjDbId) return mj;
                const items = [...mj.subMainJobs];
                const sourceIdx = items.findIndex((s) => s.id === sourceSmjId);
                const targetIdx = items.findIndex((s) => s.id === targetSmjId);
                if (sourceIdx === -1 || targetIdx === -1) return mj;

                const [removed] = items.splice(sourceIdx, 1);
                items.splice(targetIdx, 0, removed);
                moved = true;

                if (!cleanMainWbsId) {
                    cleanMainWbsId =
                        mj.dbId ||
                        parseInt(String(mj.id).replace(/^mj-/, ""), 10);
                }

                newOrderedDbIds = items
                    .map((s, sIdx) => {
                        const parentCode = mj.code || "1";
                        s.code = `${parentCode}.${sIdx + 1}`;
                        s.subtasks = s.subtasks.map((t, tIdx) => {
                            t.code = `${parentCode}.${sIdx + 1}.${tIdx + 1}`;
                            return t;
                        });
                        if (s.dbId) return s.dbId;
                        const clean = String(s.id).replace(/^smj-/, "");
                        const parsed = parseInt(clean, 10);
                        return isNaN(parsed) ? 0 : parsed;
                    })
                    .filter((id) => id > 0);

                return { ...mj, subMainJobs: items };
            });
            return next;
        });

        if (
            moved &&
            projectData?.id &&
            cleanMainWbsId &&
            newOrderedDbIds.length > 0
        ) {
            router.post(
                `/projects/${projectData.id}/reorder-sub-wbs`,
                {
                    main_wbs_id: cleanMainWbsId,
                    ordered_ids: newOrderedDbIds,
                },
                {
                    preserveScroll: true,
                    onSuccess: (page: any) => {
                        const flashError = page?.props?.flash?.error;
                        const pageErrors = page?.props?.errors;
                        const err =
                            flashError || (pageErrors && Object.values(pageErrors)[0]);
                        if (err) {
                            setProjectData(previousData);
                            setToastMsg(
                                typeof err === "string" ? err : JSON.stringify(err),
                            );
                            return;
                        }
                        setToastMsg(
                            page?.props?.flash?.success ||
                                "Sub Task order successfully saved.",
                        );
                    },
                    onError: (errors) => {
                        setProjectData(previousData);
                        const err =
                            errors?.message ||
                            Object.values(errors)[0] ||
                            "Failed to persist Sub Task order.";
                        setToastMsg(
                            typeof err === "string" ? err : JSON.stringify(err),
                        );
                    },
                },
            );
        }
    };

    // Inline Task Name Editing Handlers
    const handleStartInlineEdit = (task: SubSubtask) => {
        if (!isPIC) return;
        setInlineEditingTaskId(task.id);
        setInlineEditingTaskName(task.name);
    };

    const handleCancelInlineEdit = () => {
        setInlineEditingTaskId(null);
        setInlineEditingTaskName("");
    };

    const handleSaveInlineEdit = (
        smjId: string,
        task: SubSubtask,
        newName: string,
    ) => {
        const trimmed = newName.trim();
        if (!trimmed) {
            setToastMsg("Task name cannot be blank.");
            return;
        }
        if (trimmed === task.name) {
            setInlineEditingTaskId(null);
            setInlineEditingTaskName("");
            return;
        }

        setInlineSavingTaskId(task.id);
        handleSaveSubtask(
            smjId,
            { ...task, name: trimmed },
            (err) => {
                setInlineSavingTaskId(null);
                if (!err) {
                    setInlineEditingTaskId(null);
                    setInlineEditingTaskName("");
                }
            },
        );
    };

    const handleOpenDepModal = (task: SubSubtask) => {
        setActionError("");
        setDepForm({
            predecessor_wbs_ids: [],
            dependency_type: "FS",
            lag_days: 0,
        });
        setDepModal({ isOpen: true, task });
    };

    const handleAddDependency = (e: React.FormEvent) => {
        e.preventDefault();
        if (!depModal.task || depForm.predecessor_wbs_ids.length === 0) return;

        setSubmitting(true);
        setActionError("");
        router.post(
            `/projects/${projectData.id}/tasks/${depModal.task.id}/dependencies`,
            {
                predecessor_wbs_ids: depForm.predecessor_wbs_ids,
                dependency_type: depForm.dependency_type,
                lag_days: depForm.lag_days,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setDepForm({
                        predecessor_wbs_ids: [],
                        dependency_type: "FS",
                        lag_days: 0,
                    });
                    setSubmitting(false);
                    // We let Inertia handle the props update which will flow into projectData
                },
                onError: (errors) => {
                    setActionError(
                        (Object.values(errors)[0] as string) ||
                            "Failed to add dependency",
                    );
                    setSubmitting(false);
                },
            },
        );
    };

    const handleRemoveDependency = (depId: number) => {
        setDeleteConfirm({
            title: "Remove Dependency",
            message:
                "Are you sure you want to remove this dependency?",
            onConfirm: () => {
                router.delete(
                    `/projects/${projectData.id}/tasks/${depModal.task?.id}/dependencies/${depId}`,
                    {
                        preserveScroll: true,
                    },
                );
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
            const workerDiv = (authUser?.division ?? "").trim().toLowerCase();
            if (!workerDiv) return false;
            const targetDivs = (taskDivision ?? "")
                .split(",")
                .map((d) => d.trim().toLowerCase());
            return (
                targetDivs.includes(workerDiv) ||
                targetDivs.includes("general") ||
                targetDivs.includes("internal") ||
                targetDivs.includes("all")
            );
        }
        return false;
    };

    // Continuous Progress Slider Update (0–100%)
    const handleProgressChange = (
        taskId: string,
        newProgress: number,
        authorized: boolean,
        taskName: string,
        commit: boolean = false,
    ) => {
        if (!authorized) {
            if (isAdmin) {
                setToastMsg("Action Restricted: Admin role is Read-Only.");
            } else if (isPIC) {
                setToastMsg(
                    "Action Restricted: Progress slider can only be updated by workers of the assigned division.",
                );
            } else {
                setToastMsg(
                    "You do not have permission to update progress for this task.",
                );
            }
            return;
        }

        const clamped = Math.max(0, Math.min(100, Math.round(newProgress)));
        const isCompleted = clamped === 100;

        // Find current task state to verify evidence
        let currentTask: SubSubtask | undefined;
        for (const mj of projectData.mainJobs) {
            for (const smj of mj.subMainJobs) {
                const found = smj.subtasks.find((st) => st.id === taskId);
                if (found) {
                    currentTask = found;
                    break;
                }
            }
            if (currentTask) break;
        }

        // REQUIREMENT: Evidence attachment is MANDATORY (required) to complete task (100%)
        if (
            isCompleted &&
            currentTask &&
            (!currentTask.evidences || currentTask.evidences.length === 0)
        ) {
            if (currentTask.requiresEvidence) {
                setToastMsg(
                    `Evidence is required before marking task "${taskName}" 100% complete.`,
                );
                if (commit) {
                    setUploadEvidenceTask({
                        task: currentTask,
                        requireComplete: true,
                    });
                }
                return;
            }
        }

        const originalData = projectData;
        setProjectData((prev) => {
            const newData = { ...prev };
            newData.mainJobs = newData.mainJobs.map((mj) => ({
                ...mj,
                subMainJobs: mj.subMainJobs.map((smj) => ({
                    ...smj,
                    subtasks: smj.subtasks.map((st) => {
                        if (st.id === taskId) {
                            const prev =
                                st.progress < 100
                                    ? st.progress
                                    : st.prevProgress || 0;
                            return {
                                ...st,
                                progress: clamped,
                                checked: isCompleted,
                                prevProgress: prev,
                            };
                        }
                        return st;
                    }),
                })),
            }));
            return recalculateSchedule(recalculateProgress(newData));
        });

        if (commit && projectData.id) {
            router.post(
                `/projects/${projectData.id}/tasks/${taskId}/toggle`,
                { progress: clamped },
                {
                    preserveScroll: true,
                    preserveState: true,
                    onSuccess: (page: any) => {
                        const flashError = page?.props?.flash?.error;
                        if (flashError) {
                            setToastMsg(flashError);
                            setProjectData(originalData);
                            return;
                        }
                        if (clamped === 100)
                            setToastMsg(
                                `Task "${taskName}" marked as completed (100%) ✓`,
                            );
                        else
                            setToastMsg(
                                `Task "${taskName}" progress saved (${clamped}%)`,
                            );
                    },
                    onError: (errors) => {
                        const msg = Object.values(errors).flat().join(", ");
                        setToastMsg(msg || "Failed to update progress.");
                        setProjectData(originalData);
                    },
                },
            );
        }
    };

    // Checkbox toggle with Uncheck Confirmation Modal
    const handleCheck = (
        taskId: string,
        authorized: boolean,
        taskName: string,
    ) => {
        if (!authorized) {
            if (isAdmin) {
                setToastMsg(
                    "Action Restricted: Admin role is Read-Only and cannot check off tasks.",
                );
            } else if (isPIC) {
                setToastMsg(
                    "Action Restricted: PICs can only add and schedule tasks. Completing the checklist can only be performed by workers of the assigned division.",
                );
            } else if (isWorker) {
                setToastMsg(
                    `Action Restricted: You are assigned to the "${user?.division || pageProps?.division || "Worker"}" division. You may only check tasks assigned to your division.`,
                );
            } else {
                setToastMsg("You do not have permission to check this task.");
            }
            return;
        }

        // Find current task state
        let currentTask: SubSubtask | undefined;
        for (const mj of projectData.mainJobs) {
            for (const smj of mj.subMainJobs) {
                const found = smj.subtasks.find((st) => st.id === taskId);
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
        handleProgressChange(taskId, 100, true, taskName, true);
    };

    const confirmUncheck = () => {
        if (!uncheckConfirm) return;
        const { taskId, taskName, prevProgress } = uncheckConfirm;
        const revertProgress =
            prevProgress !== undefined && prevProgress < 100 ? prevProgress : 0;

        const originalData = projectData;
        setProjectData((prev) => {
            const newData = { ...prev };
            newData.mainJobs = newData.mainJobs.map((mj) => ({
                ...mj,
                subMainJobs: mj.subMainJobs.map((smj) => ({
                    ...smj,
                    subtasks: smj.subtasks.map((st) => {
                        if (st.id === taskId) {
                            return {
                                ...st,
                                progress: revertProgress,
                                checked: false,
                            };
                        }
                        return st;
                    }),
                })),
            }));
            return recalculateSchedule(recalculateProgress(newData));
        });

        if (projectData.id) {
            router.post(
                `/projects/${projectData.id}/tasks/${taskId}/toggle`,
                { progress: revertProgress },
                {
                    preserveScroll: true,
                    preserveState: true,
                    onSuccess: (page: any) => {
                        const flashError = page?.props?.flash?.error;
                        if (flashError) {
                            setToastMsg(flashError);
                            setProjectData(originalData);
                            return;
                        }
                        setToastMsg(`Task "${taskName}" marked as incomplete.`);
                    },
                    onError: () => {
                        setToastMsg("Failed to update task status.");
                        setProjectData(originalData);
                    },
                },
            );
        }

        setUncheckConfirm(null);
    };

    const filteredMJs = projectData.mainJobs
        .map((mj) => {
            if (!isWorker) return mj;
            const workerDiv = (user?.division ?? pageProps?.division ?? "")
                .trim()
                .toLowerCase();

            // Filter SMJs and STs to only show worker's own tasks
            const filteredSmjs = mj.subMainJobs
                .map((smj) => {
                    const filteredSts = smj.subtasks.filter((st) => {
                        const targetDiv = (st.division || smj.pic || "")
                            .trim()
                            .toLowerCase();
                        return workerDiv !== "" && workerDiv === targetDiv;
                    });
                    return { ...smj, subtasks: filteredSts };
                })
                .filter((smj) => smj.subtasks.length > 0);

            return { ...mj, subMainJobs: filteredSmjs };
        })
        .filter((mj) => {
            if (isWorker && mj.subMainJobs.length === 0) return false;
            if (
                search &&
                !mj.name.toLowerCase().includes(search.toLowerCase()) &&
                !mj.subMainJobs.some(
                    (smj) =>
                        smj.name.toLowerCase().includes(search.toLowerCase()) ||
                        smj.subtasks.some((st) =>
                            st.name
                                .toLowerCase()
                                .includes(search.toLowerCase()),
                        ),
                )
            )
                return false;
            if (
                filterStatus &&
                mj.status !== filterStatus &&
                !mj.subMainJobs.some((smj) => smj.status === filterStatus)
            )
                return false;
            return true;
        });

    const hasFilter = Boolean(search.trim() || filterStatus);
    const hasProjectTasks = (projectData?.mainJobs || []).length > 0;

    const handleExportCSV = () => {
        const headers = [
            "WBS Code",
            "Level",
            "Description",
            "PIC",
            "Status",
            "Progress (%)",
            "Start Date",
            "Finish Date",
            "Duration",
            "Predecessor",
        ];
        const rows: any[][] = [];

        filteredMJs.forEach((mj) => {
            rows.push([
                mj.code,
                "Main Job",
                mj.name,
                "-",
                mj.status,
                mj.progress,
                mj.startDate || "-",
                mj.finishDate || "-",
                "-",
                "-",
            ]);
            mj.subMainJobs.forEach((smj) => {
                rows.push([
                    smj.code,
                    "Sub Main Job",
                    smj.name,
                    smj.pic,
                    smj.status,
                    smj.progress,
                    smj.startDate || "-",
                    smj.finishDate || "-",
                    "-",
                    "-",
                ]);
                smj.subtasks.forEach((st) => {
                    const predStr = st.predecessor
                        ? `${st.predecessor} (${st.depType || "FS"}${st.lag ? "+" + st.lag : ""})`
                        : "-";
                    rows.push([
                        st.code,
                        "Sub-Subtask",
                        st.name,
                        smj.pic,
                        st.checked ? "Completed" : st.status,
                        st.checked ? 100 : st.progress,
                        st.startDate,
                        st.finishDate,
                        st.duration,
                        predStr,
                    ]);
                });
            });
        });

        exportToCSV(
            `Tasks_Export_${new Date().toISOString().slice(0, 10)}`,
            headers,
            rows,
        );
        setToastMsg("Tasks exported to CSV successfully.");
    };

    return (
        <div className="p-5 sm:p-6 lg:p-8 max-w-screen-2xl space-y-5">
            <PageHeader
                title="Task Management"
                subtitle={`3-Tier WBS: Main Job → Sub Task (Sub Main Job) → Task (${projectData.name || "Project"})`}
                actions={
                    <div className="flex items-center flex-wrap gap-2.5 sm:gap-3">
                        <span className="text-[12px] text-neutral-500 hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-100 border border-neutral-200/80">
                            Role:{" "}
                            <strong className="text-neutral-800">
                                {user?.displayRole || user?.role}
                            </strong>
                            {isAdmin && (
                                <span className="ml-1 text-warning font-semibold">
                                    (Read-Only)
                                </span>
                            )}
                            {isPIC && (
                                <span className="ml-1 text-emerald-600 font-semibold">
                                    (PIC - Manage & Add Tasks)
                                </span>
                            )}
                            {isWorker && (
                                <span className="ml-1 text-blue-600 font-semibold">
                                    · Division: {user?.division || "Internal"}
                                </span>
                            )}
                        </span>

                        {isWorker && availableProjects.length > 1 && (
                            <select
                                className="bg-white border border-neutral-200 text-[12px] font-semibold text-neutral-800 rounded-md px-2 py-1 flex-shrink-0"
                                value={projectData.id?.replace("p-", "")}
                                onChange={(e) =>
                                    router.get(
                                        `/tasks?project_id=${e.target.value}`,
                                    )
                                }
                            >
                                {availableProjects.map((p: any) => (
                                    <option key={p.id} value={p.id}>
                                        {p.title}
                                    </option>
                                ))}
                            </select>
                        )}

                        {isPIC && (
                            <>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() =>
                                        setShowMainJobModal({ mode: "create" })
                                    }
                                    icon={Plus}
                                    className="text-[12px] h-[34px] flex-shrink-0"
                                >
                                    Add Main Task
                                </Button>
                                <Link
                                    href={`/projects/${projectData.id}/predecessors`}
                                    className="inline-flex items-center justify-center gap-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 border border-indigo-200 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors h-[34px] flex-shrink-0"
                                >
                                    <Link2 size={14} /> Manage Predecessors
                                </Link>
                                <Link
                                    href={`/working-tree?project_id=${projectData.id}`}
                                    className="inline-flex items-center justify-center gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 border border-blue-200 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors h-[34px] flex-shrink-0"
                                >
                                    <Users size={14} /> Working Tree Structure
                                </Link>
                            </>
                        )}

                        <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg border border-neutral-200 flex-shrink-0">
                            <button
                                onClick={() => setViewMode("checklist")}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-bold transition-all ${
                                    viewMode === "checklist"
                                        ? "bg-brand text-white shadow-xs"
                                        : "text-neutral-600 hover:text-neutral-900"
                                }`}
                            >
                                <ListTodo size={14} />{" "}
                                <span>Checklist View</span>
                            </button>
                            <button
                                onClick={() => setViewMode("table")}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-bold transition-all ${
                                    viewMode === "table"
                                        ? "bg-brand text-white shadow-xs"
                                        : "text-neutral-600 hover:text-neutral-900"
                                }`}
                            >
                                <TableProperties size={14} />{" "}
                                <span>Table View</span>
                            </button>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExportCSV}
                            icon={Download}
                            className="text-[12px] h-[34px] flex-shrink-0"
                        >
                            Export CSV
                        </Button>
                    </div>
                }
            />

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                    <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                    />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search Main Job, Sub Task, or Task…"
                        className="w-full pl-8 pr-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 bg-white shadow-xs"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={filterStatus}
                        onChange={(e) =>
                            setFilterStatus(e.target.value as Status | "")
                        }
                        className="px-3 py-2 rounded-lg border border-neutral-200 text-[13px] text-neutral-700 outline-none focus:border-brand bg-white shadow-xs"
                    >
                        <option value="">All Statuses</option>
                        {STATUSES.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </select>
                    {(search || filterStatus) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSearch("");
                                setFilterStatus("");
                            }}
                            className="text-[12px]"
                        >
                            Reset
                        </Button>
                    )}
                </div>
            </div>

            {/* Content Rendering based on View Mode */}
            {viewMode === "checklist" ? (
                <div className="space-y-3">
                    {filteredMJs.map((mj) => {
                        const isDraggingMj = draggedMainJobId === mj.id;
                        const isDropTargetMj = dropTargetMainJobId === mj.id;
                        return (
                            <Card
                                key={mj.id}
                                className={`overflow-hidden transition-all duration-200 ${
                                    isDraggingMj
                                        ? "opacity-40 border-dashed border-brand bg-brand/5 scale-[0.99]"
                                        : isDropTargetMj
                                        ? "border-2 border-brand ring-2 ring-brand/30 bg-purple-50/30"
                                        : ""
                                }`}
                                onDragOver={(e) => {
                                    if (draggedMainJobId && draggedMainJobId !== mj.id) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setDropTargetMainJobId(mj.id);
                                    }
                                }}
                                onDragLeave={(e) => {
                                    e.stopPropagation();
                                    if (dropTargetMainJobId === mj.id) {
                                        setDropTargetMainJobId(null);
                                    }
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (draggedMainJobId && draggedMainJobId !== mj.id) {
                                        handleReorderMainJobs(draggedMainJobId, mj.id);
                                    }
                                    setDraggedMainJobId(null);
                                    setDropTargetMainJobId(null);
                                }}
                            >
                                {/* Level 1: Main Job Header */}
                                <div
                                    onClick={() => toggleMJ(mj.id)}
                                    className="w-full flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3.5 hover:bg-neutral-50/70 transition-colors text-left cursor-pointer"
                                >
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        {/* Drag Handle (PIC only) */}
                                        {isPIC && (
                                            <div
                                                draggable
                                                onDragStart={(e) => {
                                                    e.stopPropagation();
                                                    setDraggedMainJobId(mj.id);
                                                }}
                                                onDragEnd={() => {
                                                    setDraggedMainJobId(null);
                                                    setDropTargetMainJobId(null);
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                className="cursor-grab active:cursor-grabbing text-neutral-300 hover:text-neutral-600 p-1 -ml-1 rounded transition-colors flex-shrink-0 mt-0.5"
                                                title="Drag to reorder Main Task"
                                            >
                                                <GripVertical size={16} />
                                            </div>
                                        )}
                                        <div className="text-neutral-400 flex-shrink-0 mt-1">
                                            {expandedMJ[mj.id] ? (
                                                <ChevronDown size={16} />
                                            ) : (
                                                <ChevronRight size={16} />
                                            )}
                                        </div>
                                        <div className="w-6 h-6 rounded bg-brand text-white flex items-center justify-center flex-shrink-0 shadow-xs mt-0.5">
                                            <span className="text-[10px] font-bold">
                                                {mj.code}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[15px] sm:text-[16px] font-black text-neutral-900 leading-snug break-words">
                                                {mj.name}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1 text-[12px] text-neutral-600 font-semibold flex-wrap">
                                                <span>
                                                    Main Job Weight:{" "}
                                                    <strong className="text-neutral-800 font-bold">
                                                        {mj.weight}%
                                                    </strong>
                                                </span>
                                                <span className="text-neutral-300">
                                                    •
                                                </span>
                                                <span>
                                                    {mj.subMainJobs.length} Sub
                                                    Tasks
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center flex-wrap gap-2.5 sm:gap-3 flex-shrink-0 self-start md:self-center pl-9 md:pl-0">
                                        <StatusBadge status={mj.status} size="sm" />
                                        <div className="w-16 hidden sm:block">
                                            <ProgressBar
                                                value={mj.progress}
                                                size="xs"
                                                showLabel={false}
                                            />
                                        </div>
                                        <span className="text-[14px] sm:text-[16px] font-black text-neutral-900 w-11 text-right tabular-nums">
                                            {mj.progress}%
                                        </span>

                                        {/* PIC can add Sub Task, edit Main Task & delete Main Task */}
                                        {isPIC && (
                                            <div
                                                className="flex items-center gap-1.5 ml-1 flex-wrap"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        setShowAddSubMainJobModal({
                                                            mjId: mj.id,
                                                            mjDbId: (mj as any)
                                                                .dbId,
                                                            mjName: mj.name,
                                                            parentWeight: mj.weight,
                                                            currentSubCount:
                                                                mj.subMainJobs
                                                                    .length,
                                                        });
                                                    }}
                                                    className="py-1 px-2.5 text-[11px] h-7 bg-white hover:bg-neutral-50 border-neutral-300 flex-shrink-0"
                                                    icon={Plus}
                                                >
                                                    Add Sub Task
                                                </Button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setShowMainJobModal({
                                                            mode: "edit",
                                                            id: mj.id,
                                                            dbId: (mj as any).dbId,
                                                            name: mj.name,
                                                            weight: mj.weight,
                                                            startDate: mj.startDate,
                                                            finishDate:
                                                                mj.finishDate,
                                                        })
                                                    }
                                                    className="p-1.5 text-neutral-400 hover:text-brand bg-white hover:bg-neutral-50 rounded border border-neutral-200 shadow-xs transition-colors flex-shrink-0"
                                                    title="Edit Main Task (Name & Weight)"
                                                >
                                                    <Edit2 size={13} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleDeleteMainJob(
                                                            mj.id,
                                                            (mj as any).dbId,
                                                            mj.name,
                                                        )
                                                    }
                                                    className="p-1.5 text-neutral-400 hover:text-danger bg-white hover:bg-red-50 rounded border border-neutral-200 shadow-xs transition-colors flex-shrink-0"
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
                                        {mj.subMainJobs.map((smj) => (
                                            <SubMainJobSection
                                                key={smj.id}
                                                mainJobs={projectData.mainJobs}
                                                smj={smj}
                                                expanded={!!expandedSMJ[smj.id]}
                                                onToggle={() => toggleSMJ(smj.id)}
                                                isAuthorizedToCheck={
                                                    isAuthorizedToCheck
                                                }
                                                isPIC={isPIC}
                                                isAdmin={isAdmin}
                                                onOpenAddModal={() => {
                                                    setExpandedSMJ((p) => ({
                                                        ...p,
                                                        [smj.id]: true,
                                                    }));
                                                    setShowAddTaskModal({
                                                        smjId: smj.id,
                                                        smjDbId: (smj as any).dbId,
                                                        parentSmj: smj,
                                                    });
                                                }}
                                                onOpenEditSubModal={() =>
                                                    setShowEditSubMainJobModal({
                                                        smj,
                                                        parentMj: mj,
                                                    })
                                                }
                                                draggedSubJob={draggedSubJob}
                                                dropTargetSubJobId={dropTargetSubJobId}
                                                onDragStartSub={(smjId) =>
                                                    setDraggedSubJob({
                                                        parentMjId: mj.id,
                                                        parentMjDbId: (mj as any).dbId,
                                                        smjId,
                                                    })
                                                }
                                                onDragOverSub={(smjId) => {
                                                    if (
                                                        draggedSubJob &&
                                                        draggedSubJob.parentMjId === mj.id &&
                                                        draggedSubJob.smjId !== smjId
                                                    ) {
                                                        setDropTargetSubJobId(smjId);
                                                    }
                                                }}
                                                onDragLeaveSub={() =>
                                                    setDropTargetSubJobId(null)
                                                }
                                                onDropSub={(targetSmjId) => {
                                                    if (
                                                        draggedSubJob &&
                                                        draggedSubJob.parentMjId === mj.id
                                                    ) {
                                                        handleReorderSubMainJobs(
                                                            mj.id,
                                                            (mj as any).dbId,
                                                            draggedSubJob.smjId,
                                                            targetSmjId,
                                                        );
                                                    }
                                                    setDraggedSubJob(null);
                                                    setDropTargetSubJobId(null);
                                                }}
                                                onDragEndSub={() => {
                                                    setDraggedSubJob(null);
                                                    setDropTargetSubJobId(null);
                                                }}
                                                onOpenEditModal={(task) =>
                                                    setShowAddTaskModal({
                                                        smjId: smj.id,
                                                        smjDbId: (smj as any).dbId,
                                                        parentSmj: smj,
                                                        task,
                                                    })
                                                }
                                                onDeleteSubMainJob={() =>
                                                    handleDeleteSubMainJob(
                                                        mj.id,
                                                        smj.id,
                                                        (smj as any).dbId,
                                                        smj.name,
                                                    )
                                                }
                                                onDeleteTask={(taskId, taskName) =>
                                                    handleDeleteSubtask(
                                                        smj.id,
                                                        taskId,
                                                        taskName,
                                                    )
                                                }
                                                onManageDependencies={
                                                    handleOpenDepModal
                                                }
                                                onCheck={handleCheck}
                                                onProgressChange={
                                                    handleProgressChange
                                                }
                                                onOpenEvidence={(ev) =>
                                                    setEvidencePreview(ev)
                                                }
                                                onOpenUploadEvidence={(task) =>
                                                    setUploadEvidenceTask({ task })
                                                }
                                                onOpenHistory={(task) =>
                                                    setHistoryModalTask({
                                                        task,
                                                        parentSmj: smj,
                                                    })
                                                }
                                                inlineEditingTaskId={
                                                    inlineEditingTaskId
                                                }
                                                inlineEditingTaskName={
                                                    inlineEditingTaskName
                                                }
                                                setInlineEditingTaskName={
                                                    setInlineEditingTaskName
                                                }
                                                onStartInlineEdit={
                                                    handleStartInlineEdit
                                                }
                                                onCancelInlineEdit={
                                                    handleCancelInlineEdit
                                                }
                                                onSaveInlineEdit={(task, name) =>
                                                    handleSaveInlineEdit(
                                                        smj.id,
                                                        task,
                                                        name,
                                                    )
                                                }
                                                inlineSavingTaskId={
                                                    inlineSavingTaskId
                                                }
                                                draggedItem={draggedItem}
                                                dropTargetTaskId={dropTargetTaskId}
                                                onDragStartTask={(taskId) =>
                                                    setDraggedItem({
                                                        smjId: smj.id,
                                                        taskId,
                                                    })
                                                }
                                                onDragOverTask={(taskId) => {
                                                    if (
                                                        draggedItem &&
                                                        draggedItem.smjId ===
                                                            smj.id &&
                                                        draggedItem.taskId !==
                                                            taskId
                                                        ) {
                                                        setDropTargetTaskId(taskId);
                                                    }
                                                }}
                                                onDragLeaveTask={() =>
                                                    setDropTargetTaskId(null)
                                                }
                                                onDropTask={(targetTaskId) => {
                                                    if (
                                                        draggedItem &&
                                                        draggedItem.smjId === smj.id
                                                    ) {
                                                        handleReorderTasks(
                                                            smj.id,
                                                            draggedItem.taskId,
                                                            targetTaskId,
                                                        );
                                                    }
                                                    setDraggedItem(null);
                                                    setDropTargetTaskId(null);
                                                }}
                                                onDragEndTask={() => {
                                                    setDraggedItem(null);
                                                    setDropTargetTaskId(null);
                                                }}
                                            />
                                        ))}
                                        {mj.subMainJobs.length === 0 && (
                                            <div className="px-10 py-3 text-[12px] text-neutral-400 italic">
                                                No Sub Tasks yet.{" "}
                                                {isPIC &&
                                                    "Click 'Add Sub Task' to create one."}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <Card className="overflow-hidden">
                    <div className="overflow-x-auto scrollbar-thin max-h-[70vh]">
                        <table className="w-full min-w-[1000px] text-left border-collapse">
                            <thead className="bg-neutral-100/80 border-b border-neutral-200 sticky top-0 z-10">
                                <tr className="text-[12px] font-bold text-neutral-600 uppercase tracking-wider">
                                    <th className="px-4 py-3">WBS Code</th>
                                    <th className="px-4 py-3">Description</th>
                                    <th className="px-4 py-3 text-right" title="Structural weight in WBS hierarchy (distinct from progress %)">
                                        Weight (%)
                                    </th>
                                    <th className="px-4 py-3">Division</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3 text-right" title="Task completion progress percentage">
                                        Progress (%)
                                    </th>
                                    <th className="px-4 py-3">Start Date</th>
                                    <th className="px-4 py-3">Finish Date</th>
                                    <th className="px-4 py-3 text-right">
                                        Dur
                                    </th>
                                    <th className="px-4 py-3">Pred</th>
                                    <th className="px-4 py-3 text-center">
                                        Attachment / Evidence
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100 text-[13px]">
                                {filteredMJs.map((mj) => (
                                    <Fragment key={mj.id}>
                                        {/* Main Job Row */}
                                        <tr className="bg-brand/5 hover:bg-brand/10 transition-colors">
                                            <td className="px-4 py-3 font-bold text-brand">
                                                {mj.code}
                                            </td>
                                            <td className="px-4 py-3 font-bold text-neutral-900 text-[14px]">
                                                {mj.name}
                                            </td>
                                            <td className="px-4 py-3 text-right font-black text-brand text-[13px]">
                                                {mj.weight}%
                                            </td>
                                            <td className="px-4 py-3 text-neutral-500 font-medium">
                                                —
                                            </td>
                                            <td className="px-4 py-3">
                                                <StatusBadge
                                                    status={mj.status}
                                                    size="sm"
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-right font-black text-brand text-[14px]">
                                                {mj.progress}%
                                            </td>
                                            <td className="px-4 py-3 text-neutral-600 font-medium">
                                                {formatDateDisplay(
                                                    mj.startDate,
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-neutral-600 font-medium">
                                                {formatDateDisplay(
                                                    mj.finishDate,
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right text-neutral-400">
                                                —
                                            </td>
                                            <td className="px-4 py-3 text-neutral-400">
                                                —
                                            </td>
                                            <td className="px-4 py-3 text-center text-neutral-400">
                                                —
                                            </td>
                                        </tr>

                                        {/* Sub Main Job Rows */}
                                        {mj.subMainJobs.map((smj) => (
                                            <Fragment key={smj.id}>
                                                <tr className="bg-neutral-50 hover:bg-neutral-100/70 transition-colors">
                                                    <td className="px-4 py-2.5 pl-8 font-bold text-neutral-700">
                                                        {smj.code}
                                                    </td>
                                                    <td className="px-4 py-2.5 font-bold text-neutral-800 text-[13.5px]">
                                                        {smj.name}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right font-bold text-neutral-800 text-[12.5px]">
                                                        {smj.weight}%
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <span className="px-2 py-0.5 bg-white border border-neutral-200 rounded text-[11px] font-bold text-neutral-600">
                                                            {formatDivisionName(
                                                                smj.pic,
                                                            )}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <StatusBadge
                                                            status={smj.status}
                                                            size="xs"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right font-black text-neutral-800 text-[13px]">
                                                        {smj.progress}%
                                                    </td>
                                                    <td className="px-4 py-2.5 text-neutral-600 font-medium">
                                                        {formatDateDisplay(
                                                            smj.startDate,
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-neutral-600 font-medium">
                                                        {formatDateDisplay(
                                                            smj.finishDate,
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right text-neutral-400">
                                                        —
                                                    </td>
                                                    <td className="px-4 py-2.5 text-neutral-400">
                                                        —
                                                    </td>
                                                    <td className="px-4 py-2.5 text-center text-neutral-400">
                                                        —
                                                    </td>
                                                </tr>

                                                {/* Sub-Subtask Rows */}
                                                {smj.subtasks.map((st) => {
                                                    const isDone =
                                                        st.checked ||
                                                        st.progress >= 100;
                                                    const authorized =
                                                        isAuthorizedToCheck(
                                                            st.division ||
                                                                smj.pic,
                                                        );
                                                    return (
                                                        <tr
                                                            key={st.id}
                                                            className={`transition-colors ${
                                                                isDone
                                                                    ? "bg-emerald-50/70 hover:bg-emerald-100/50"
                                                                    : "hover:bg-neutral-50/50"
                                                            }`}
                                                        >
                                                            <td className="px-4 py-2 pl-12 font-mono text-[12px] text-neutral-500 font-semibold">
                                                                {st.code}
                                                            </td>
                                                            <td className="px-4 py-2 text-neutral-800 font-medium">
                                                                {inlineEditingTaskId === st.id ? (
                                                                    <div className="flex items-center gap-1.5 min-w-[220px]">
                                                                        <input
                                                                            autoFocus
                                                                            type="text"
                                                                            value={inlineEditingTaskName}
                                                                            onChange={(e) => setInlineEditingTaskName(e.target.value)}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === "Enter") handleSaveInlineEdit(smj.id, st, inlineEditingTaskName);
                                                                                else if (e.key === "Escape") handleCancelInlineEdit();
                                                                            }}
                                                                            disabled={inlineSavingTaskId === st.id}
                                                                            className="flex-1 px-2.5 py-1 text-[13px] font-semibold border-2 border-brand rounded outline-none bg-white shadow-xs"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleSaveInlineEdit(smj.id, st, inlineEditingTaskName)}
                                                                            disabled={inlineSavingTaskId === st.id || !inlineEditingTaskName.trim()}
                                                                            className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors disabled:opacity-50"
                                                                            title="Save (Enter)"
                                                                        >
                                                                            <Check size={13} />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={handleCancelInlineEdit}
                                                                            disabled={inlineSavingTaskId === st.id}
                                                                            className="p-1 rounded bg-neutral-200 hover:bg-neutral-300 text-neutral-700 transition-colors"
                                                                            title="Cancel (Esc)"
                                                                        >
                                                                            <X size={13} />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center gap-1.5 group/tbl">
                                                                        <span
                                                                            className={`break-words ${
                                                                                isDone
                                                                                    ? "text-neutral-400 font-medium"
                                                                                    : "text-neutral-900 font-medium"
                                                                            } ${isPIC ? "cursor-pointer hover:text-brand" : ""}`}
                                                                            onDoubleClick={() => isPIC && handleStartInlineEdit(st)}
                                                                            title={isPIC ? "Double-click to edit task name inline" : ""}
                                                                        >
                                                                            {st.name}
                                                                        </span>
                                                                        {isPIC && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleStartInlineEdit(st)}
                                                                                className="p-0.5 text-neutral-400 hover:text-brand rounded opacity-0 group-hover/tbl:opacity-100 transition-opacity"
                                                                                title="Edit task name inline"
                                                                            >
                                                                                <Edit2 size={11} />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                {st.completedByName && (
                                                                    <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-medium mt-1">
                                                                        <CheckCircle2
                                                                            size={
                                                                                10
                                                                            }
                                                                        />{" "}
                                                                        Completed
                                                                        by:{" "}
                                                                        {
                                                                            st.completedByName
                                                                        }{" "}
                                                                        on{" "}
                                                                        {
                                                                            st.completedAt
                                                                        }
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-2 text-right font-bold text-slate-700 text-[12px]">
                                                                <span className="inline-flex items-center justify-end gap-1 font-mono">
                                                                    <Scale size={11} className="text-slate-400" />
                                                                    {st.weight ?? 100}%
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-2 text-neutral-600 text-[11.5px]">
                                                                {formatDivisionName(
                                                                    st.division ||
                                                                        smj.pic,
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-2">
                                                                <StatusBadge
                                                                    status={
                                                                        isDone
                                                                            ? "Completed"
                                                                            : st.status
                                                                    }
                                                                    size="xs"
                                                                />
                                                            </td>
                                                            <td className="px-4 py-2 text-right font-bold text-neutral-800 text-[13px]">
                                                                <EditableProgress
                                                                    value={st.progress}
                                                                    disabled={!authorized}
                                                                    onSave={(val) =>
                                                                        handleProgressChange(
                                                                            st.id,
                                                                            val,
                                                                            authorized,
                                                                            st.name,
                                                                            true,
                                                                        )
                                                                    }
                                                                    isChecked={isDone}
                                                                />
                                                            </td>
                                                            <td className="px-4 py-2 text-neutral-600">
                                                                {formatDateDisplay(
                                                                    st.startDate,
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-2 text-neutral-600">
                                                                {formatDateDisplay(
                                                                    st.finishDate,
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-2 text-right text-neutral-600">
                                                                {st.duration}d
                                                            </td>
                                                            <td className="px-4 py-2 font-mono text-[11.5px] text-neutral-500">
                                                                {st.dependencies &&
                                                                st.dependencies
                                                                    .length >
                                                                    0 ? (
                                                                    <div className="flex flex-wrap items-center gap-1">
                                                                        {st.dependencies.map(
                                                                            (
                                                                                dep,
                                                                            ) => (
                                                                                <span
                                                                                    key={
                                                                                        dep.id
                                                                                    }
                                                                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                                                                                    title={`Predecessor: ${dep.predecessor_name} (${dep.dependency_type})`}
                                                                                >
                                                                                    <Link2
                                                                                        size={
                                                                                            9
                                                                                        }
                                                                                    />
                                                                                    <span>
                                                                                        {
                                                                                            dep.dependency_type
                                                                                        }
                                                                                    </span>
                                                                                </span>
                                                                            ),
                                                                        )}
                                                                        {isPIC && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    handleOpenDepModal(
                                                                                        st,
                                                                                    )
                                                                                }
                                                                                className="p-0.5 rounded text-neutral-400 hover:text-brand"
                                                                                title="Manage Dependencies"
                                                                            >
                                                                                <Link2
                                                                                    size={
                                                                                        11
                                                                                    }
                                                                                />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ) : st.predecessor ? (
                                                                    <div className="flex items-center gap-1">
                                                                        <span>
                                                                            {
                                                                                st.predecessor
                                                                            }{" "}
                                                                            (
                                                                            {st.depType ||
                                                                                "FS"}
                                                                            {st.lag
                                                                                ? `+${st.lag}`
                                                                                : ""}
                                                                            )
                                                                        </span>
                                                                        {isPIC && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    handleOpenDepModal(
                                                                                        st,
                                                                                    )
                                                                                }
                                                                                className="p-0.5 rounded text-neutral-400 hover:text-brand"
                                                                                title="Manage Dependencies"
                                                                            >
                                                                                <Link2
                                                                                    size={
                                                                                        11
                                                                                    }
                                                                                />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center gap-1">
                                                                        <span>
                                                                            —
                                                                        </span>
                                                                        {isPIC && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    handleOpenDepModal(
                                                                                        st,
                                                                                    )
                                                                                }
                                                                                className="p-0.5 rounded text-neutral-400 hover:text-brand"
                                                                                title="Manage Dependencies"
                                                                            >
                                                                                <Link2
                                                                                    size={
                                                                                        11
                                                                                    }
                                                                                />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            {/* Attachment / Evidence & History Column */}
                                                            <td className="px-4 py-2 text-center whitespace-nowrap">
                                                                <div className="inline-flex items-center gap-1.5 justify-center flex-wrap max-w-[200px]">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            setHistoryModalTask({
                                                                                task: st,
                                                                                parentSmj: smj,
                                                                            })
                                                                        }
                                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200/80 border border-neutral-200 text-neutral-700 text-[10.5px] font-bold transition-colors"
                                                                        title="View Task Progress & Activity History"
                                                                    >
                                                                        <History
                                                                            size={11}
                                                                            className="text-neutral-500"
                                                                        />
                                                                        History
                                                                    </button>

                                                                    {st.evidences &&
                                                                    st.evidences
                                                                        .length >
                                                                        0
                                                                        ? st.evidences.map(
                                                                              (
                                                                                  ev,
                                                                                  idx,
                                                                              ) => (
                                                                                  <button
                                                                                      key={
                                                                                          idx
                                                                                      }
                                                                                      type="button"
                                                                                      onClick={() =>
                                                                                          setEvidencePreview(
                                                                                              ev,
                                                                                          )
                                                                                      }
                                                                                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 border border-emerald-300 text-emerald-800 text-[10px] font-bold hover:bg-emerald-200 transition-colors"
                                                                                      title={`View evidence: ${ev.name}`}
                                                                                  >
                                                                                      <Paperclip
                                                                                          size={
                                                                                              10
                                                                                          }
                                                                                      />
                                                                                      Ev{" "}
                                                                                      {idx +
                                                                                          1}
                                                                                  </button>
                                                                              ),
                                                                          )
                                                                        : null}

                                                                    {authorized && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                setUploadEvidenceTask(
                                                                                    {
                                                                                        task: st,
                                                                                    },
                                                                                )
                                                                            }
                                                                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-[10.5px] font-bold transition-colors shadow-2xs"
                                                                            title="Upload completion evidence"
                                                                        >
                                                                            <UploadCloud
                                                                                size={
                                                                                    11
                                                                                }
                                                                                className="text-amber-600"
                                                                            />
                                                                            Upload
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </Fragment>
                                        ))}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {filteredMJs.length === 0 &&
                (hasFilter ? (
                    <EmptyState
                        icon={Search}
                        title="No tasks match your filter"
                        description="Try clearing your search keyword or selecting 'All Statuses'."
                        action={
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setSearch("");
                                    setFilterStatus("");
                                }}
                            >
                                Clear Filters
                            </Button>
                        }
                    />
                ) : !hasProjectTasks ? (
                    <EmptyState
                        icon={ListTodo}
                        title="No Tasks in this Project Yet"
                        description={
                            isPIC
                                ? "This project doesn't have any tasks yet. Click 'Add Main Task' to start creating your WBS structure."
                                : "This project does not have any tasks recorded yet."
                        }
                        action={
                            isPIC ? (
                                <Button
                                    variant="primary"
                                    size="sm"
                                    icon={Plus}
                                    onClick={() =>
                                        setShowMainJobModal({ mode: "create" })
                                    }
                                >
                                    Add Main Task
                                </Button>
                            ) : undefined
                        }
                    />
                ) : isWorker ? (
                    <EmptyState
                        icon={Shield}
                        title="No Tasks Assigned to Your Division"
                        description={`There are currently no tasks assigned to the "${user?.division || pageProps?.division || "Worker"}" division in this project.`}
                    />
                ) : (
                    <EmptyState
                        icon={ListTodo}
                        title="No Tasks Available"
                        description="There are currently no tasks to display."
                    />
                ))}

            {/* Modal Add / Edit Main Task (Main Job) */}
            {showMainJobModal && (
                <MainJobModal
                    initialData={
                        showMainJobModal.mode === "edit"
                            ? showMainJobModal
                            : undefined
                    }
                    projectStartDate={projectData.startDate || projectData.start}
                    projectEndDate={projectData.endDate || projectData.end}
                    onClose={() => setShowMainJobModal(null)}
                    onSave={(name, weight, start, end, callback) =>
                        handleSaveMainJob(
                            name,
                            weight,
                            start,
                            end,
                            showMainJobModal.mode === "edit"
                                ? showMainJobModal.id
                                : undefined,
                            showMainJobModal.mode === "edit"
                                ? showMainJobModal.dbId
                                : undefined,
                            callback,
                        )
                    }
                />
            )}

            {/* Modal Add Sub Task (Sub Main Job under Main Job) */}
            {showAddSubMainJobModal && (() => {
                const parentMj = projectData.mainJobs.find(
                    (m) =>
                        String(m.id) === String(showAddSubMainJobModal.mjId) ||
                        m.dbId === showAddSubMainJobModal.mjDbId,
                );
                const parentStart = parentMj?.startDate || projectData.startDate || projectData.start;
                const parentEnd = parentMj?.finishDate || projectData.endDate || projectData.end;

                return (
                    <AddSubMainJobModal
                        mjName={showAddSubMainJobModal.mjName}
                        parentWeight={showAddSubMainJobModal.parentWeight}
                        currentSubCount={showAddSubMainJobModal.currentSubCount}
                        parentStart={parentStart}
                        parentEnd={parentEnd}
                        onClose={() => setShowAddSubMainJobModal(null)}
                        onSave={(name, start, end, callback) =>
                            handleSaveSubMainJob(
                                showAddSubMainJobModal.mjId,
                                name,
                                start,
                                end,
                                showAddSubMainJobModal.mjDbId,
                                callback,
                            )
                        }
                    />
                );
            })()}

            {/* Modal Edit Sub Task (Sub Main Job under Main Job) */}
            {showEditSubMainJobModal && (
                <EditSubMainJobModal
                    smj={showEditSubMainJobModal.smj}
                    parentMj={showEditSubMainJobModal.parentMj}
                    projectStartDate={
                        projectData.startDate || projectData.start
                    }
                    projectEndDate={
                        projectData.endDate || projectData.end
                    }
                    onClose={() => setShowEditSubMainJobModal(null)}
                    onSave={(name, weight, start, end, callback) =>
                        handleUpdateSubMainJob(
                            showEditSubMainJobModal.smj.id,
                            (showEditSubMainJobModal.smj as any).dbId,
                            name,
                            weight,
                            start,
                            end,
                            callback,
                        )
                    }
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
                    projectStart={projectData.startDate || projectData.start}
                    projectEnd={projectData.endDate || projectData.end}
                    onClose={() => setShowAddTaskModal(null)}
                    onSave={(taskData, callback) =>
                        handleSaveSubtask(showAddTaskModal.smjId, taskData, callback)
                    }
                />
            )}

            {/* Action Toast Feedback */}
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

            {/* Task Progress & Activity History Modal */}
            {historyModalTask && (
                <TaskProgressHistoryModal
                    task={historyModalTask.task}
                    parentSmj={historyModalTask.parentSmj}
                    activityLogs={projectData.activityLogs || []}
                    onClose={() => setHistoryModalTask(null)}
                    onOpenEvidence={(ev) => setEvidencePreview(ev)}
                />
            )}

            {/* Upload Evidence Modal */}
            {uploadEvidenceTask && (
                <UploadEvidenceModal
                    task={uploadEvidenceTask.task}
                    requireComplete={uploadEvidenceTask.requireComplete}
                    onClose={() => setUploadEvidenceTask(null)}
                    onSave={handleSaveEvidence}
                />
            )}

            {/* Manage Dependencies Modal */}
            <ManageDependenciesModal
                isOpen={depModal.isOpen}
                task={depModal.task}
                allSubtasks={projectData.mainJobs
                    .flatMap((mj) => mj.subMainJobs)
                    .flatMap((smj) => smj.subtasks)}
                depForm={depForm}
                setDepForm={setDepForm}
                onClose={() => setDepModal({ isOpen: false })}
                onAddDependency={handleAddDependency}
                onRemoveDependency={handleRemoveDependency}
                submitting={submitting}
                actionError={actionError}
            />

            {/* Delete Confirmation Modal (Moved to end for z-index priority) */}
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
                                    This action cannot be undone and will
                                    permanently delete the data.
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
    onProgressChange,
    onOpenEvidence,
    onOpenUploadEvidence,
}: {
    st: SubSubtask;
    parentSmj: SubMainJob;
    timingStatus: "active" | "starting" | "due" | "overdue";
    canCheck: boolean;
    onProgressChange: (val: number, commit?: boolean) => void;
    onOpenEvidence: (evidence: any) => void;
    onOpenUploadEvidence?: (task: SubSubtask) => void;
}) {
    const isChecked = st.checked || st.progress >= 100;

    return (
        <div
            className={`p-3.5 rounded-xl border transition-all ${
                isChecked
                    ? "bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-400/20 shadow-xs"
                    : "bg-white border-neutral-200 hover:border-neutral-300 shadow-xs"
            }`}
        >
            <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    <span className="font-mono text-[11.5px] font-bold text-neutral-500">
                        {st.code}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 text-[10.5px] font-bold">
                        {formatDivisionName(st.division || parentSmj.pic)}
                    </span>
                    {timingStatus === "overdue" && (
                        <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10.5px] font-bold">
                            Overdue
                        </span>
                    )}
                    {timingStatus === "due" && (
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10.5px] font-bold">
                            Due Today
                        </span>
                    )}
                    {timingStatus === "starting" && (
                        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10.5px] font-bold">
                            Starts Today
                        </span>
                    )}
                    <span
                        className="px-1.5 py-0.5 rounded text-[10.5px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 inline-flex items-center gap-1"
                        title="Structural weight in WBS hierarchy"
                    >
                        <Scale size={10} className="text-slate-500" />
                        Weight {st.weight ?? 100}%
                    </span>
                </div>
                <StatusBadge
                    status={isChecked ? "Completed" : st.status}
                    size="xs"
                />
            </div>

            <h4
                className={`text-[13.5px] font-bold mb-2.5 leading-snug break-words ${
                    isChecked ? "text-neutral-500" : "text-neutral-900"
                }`}
            >
                {st.name}
            </h4>

            {/* Progress Slider */}
            <div className="space-y-2 pt-2 border-t border-neutral-100">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 flex-1">
                        <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={st.progress}
                            disabled={!canCheck}
                            onChange={(e) =>
                                onProgressChange(
                                    parseInt(e.target.value),
                                    false,
                                )
                            }
                            onMouseUp={(e) =>
                                onProgressChange(
                                    parseInt(
                                        (e.target as HTMLInputElement).value,
                                    ),
                                    true,
                                )
                            }
                            onTouchEnd={(e) =>
                                onProgressChange(
                                    parseInt(
                                        (e.target as HTMLInputElement).value,
                                    ),
                                    true,
                                )
                            }
                            className={`w-full h-2 rounded-lg cursor-pointer bg-neutral-200 accent-brand ${
                                !canCheck
                                    ? "opacity-40 cursor-not-allowed"
                                    : "hover:accent-blue-700"
                            }`}
                        />
                    </div>
                    <EditableProgress
                        value={st.progress}
                        disabled={!canCheck}
                        onSave={(val) => onProgressChange(val, true)}
                        isChecked={isChecked}
                    />
                </div>

                {/* Evidence badge & details */}
                <div className="flex items-center justify-between text-[11px] pt-1 text-neutral-500">
                    <span>
                        {formatDateDisplay(st.startDate)} –{" "}
                        {formatDateDisplay(st.finishDate)}
                    </span>
                    {st.evidences && st.evidences.length > 0 ? (
                        <div className="flex items-center gap-2">
                            {st.evidences.map((ev, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => onOpenEvidence(ev)}
                                    className="inline-flex items-center gap-1 text-emerald-700 font-bold hover:underline"
                                >
                                    <Paperclip size={12} />
                                    Evidence {idx + 1}
                                </button>
                            ))}
                        </div>
                    ) : (
                        canCheck &&
                        onOpenUploadEvidence && (
                            <button
                                type="button"
                                onClick={() => onOpenUploadEvidence(st)}
                                className="inline-flex items-center gap-1 text-amber-700 font-bold hover:underline"
                            >
                                <UploadCloud size={12} />
                                Upload Evidence
                            </button>
                        )
                    )}
                </div>
                {st.completedByName && (
                    <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-medium pt-1 mt-1 border-t border-emerald-100">
                        <CheckCircle2 size={10} /> Completed by:{" "}
                        {st.completedByName} on {st.completedAt}
                    </div>
                )}
            </div>
        </div>
    );
}

function SubMainJobSection({
    mainJobs,
    smj,
    expanded,
    onToggle,
    isAuthorizedToCheck,
    isPIC,
    isAdmin,
    onOpenAddModal,
    onOpenEditSubModal,
    onOpenEditModal,
    onDeleteSubMainJob,
    onDeleteTask,
    onManageDependencies,
    onCheck,
    onProgressChange,
    onOpenEvidence,
    onOpenUploadEvidence,
    onOpenHistory,
    inlineEditingTaskId,
    inlineEditingTaskName,
    setInlineEditingTaskName,
    onStartInlineEdit,
    onCancelInlineEdit,
    onSaveInlineEdit,
    inlineSavingTaskId,
    draggedSubJob,
    dropTargetSubJobId,
    onDragStartSub,
    onDragOverSub,
    onDragLeaveSub,
    onDropSub,
    onDragEndSub,
    draggedItem,
    dropTargetTaskId,
    onDragStartTask,
    onDragOverTask,
    onDragLeaveTask,
    onDropTask,
    onDragEndTask,
}: {
    mainJobs: MainJob[];
    smj: SubMainJob;
    expanded: boolean;
    onToggle: () => void;
    isAuthorizedToCheck: (taskDivisi: string) => boolean;
    isPIC: boolean;
    isAdmin: boolean;
    onOpenAddModal: () => void;
    onOpenEditSubModal: () => void;
    onOpenEditModal: (task: SubSubtask) => void;
    onDeleteSubMainJob: () => void;
    onDeleteTask: (taskId: string, taskName: string) => void;
    onManageDependencies: (task: SubSubtask) => void;
    onCheck: (id: string, auth: boolean, name: string) => void;
    onProgressChange: (
        id: string,
        progress: number,
        auth: boolean,
        name: string,
        commit?: boolean,
    ) => void;
    onOpenEvidence: (evidence: any) => void;
    onOpenUploadEvidence: (task: SubSubtask) => void;
    onOpenHistory: (task: SubSubtask) => void;
    inlineEditingTaskId: string | null;
    inlineEditingTaskName: string;
    setInlineEditingTaskName: (name: string) => void;
    onStartInlineEdit: (task: SubSubtask) => void;
    onCancelInlineEdit: () => void;
    onSaveInlineEdit: (task: SubSubtask, newName: string) => void;
    inlineSavingTaskId: string | null;
    draggedSubJob: {
        parentMjId: string;
        parentMjDbId?: number;
        smjId: string;
    } | null;
    dropTargetSubJobId: string | null;
    onDragStartSub: (smjId: string) => void;
    onDragOverSub: (smjId: string) => void;
    onDragLeaveSub: () => void;
    onDropSub: (targetSmjId: string) => void;
    onDragEndSub: () => void;
    draggedItem: { smjId: string; taskId: string } | null;
    dropTargetTaskId: string | null;
    onDragStartTask: (taskId: string) => void;
    onDragOverTask: (taskId: string) => void;
    onDragLeaveTask: () => void;
    onDropTask: (targetTaskId: string) => void;
    onDragEndTask: () => void;
}) {
    const isDraggingSub = draggedSubJob?.smjId === smj.id;
    const isDropTargetSub = dropTargetSubJobId === smj.id;

    return (
        <div
            className={`transition-all duration-150 ${
                isDraggingSub
                    ? "opacity-40 border-dashed border-brand bg-brand/5"
                    : isDropTargetSub
                    ? "border-t-2 border-t-brand ring-2 ring-brand/30 bg-purple-50/40"
                    : "transition-colors"
            }`}
            onDragOver={(e) => {
                if (draggedSubJob && draggedSubJob.smjId !== smj.id) {
                    e.preventDefault();
                    e.stopPropagation();
                    onDragOverSub(smj.id);
                }
            }}
            onDragLeave={(e) => {
                e.stopPropagation();
                onDragLeaveSub();
            }}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (draggedSubJob && draggedSubJob.smjId !== smj.id) {
                    onDropSub(smj.id);
                }
            }}
        >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pl-6 sm:pl-9 pr-4 py-3 hover:bg-neutral-50/80 transition-colors">
                <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                    {/* Drag Handle (PIC only) */}
                    {isPIC && (
                        <div
                            draggable
                            onDragStart={(e) => {
                                e.stopPropagation();
                                onDragStartSub(smj.id);
                            }}
                            onDragEnd={(e) => {
                                e.stopPropagation();
                                onDragEndSub();
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="cursor-grab active:cursor-grabbing text-neutral-300 hover:text-neutral-600 p-0.5 -ml-1 rounded transition-colors flex-shrink-0 mt-0.5 sm:mt-0"
                            title="Drag to reorder Sub Task within this Main Task"
                        >
                            <GripVertical size={14} />
                        </div>
                    )}
                    <button
                        onClick={onToggle}
                        className="text-neutral-400 hover:text-neutral-600 flex-shrink-0 mt-0.5 sm:mt-0"
                    >
                        {expanded ? (
                            <ChevronDown size={15} />
                        ) : (
                            <ChevronRight size={15} />
                        )}
                    </button>
                    <div className="w-5 h-5 rounded bg-neutral-200/80 flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0">
                        <span className="text-[10px] font-bold text-neutral-700">
                            {smj.code}
                        </span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[14px] sm:text-[15px] font-bold text-neutral-900 break-words leading-snug">
                                {smj.name}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[12px] text-neutral-600 font-semibold flex-wrap">
                            <span className="inline-flex items-center gap-1">
                                <Scale size={11} className="text-slate-400" />
                                Sub Task (Sub Main Job) · Weight: {smj.weight}%
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center flex-wrap gap-2.5 flex-shrink-0 self-start sm:self-center pl-8 sm:pl-0">
                    <StatusBadge status={smj.status} size="sm" />
                    <span className="text-[13px] sm:text-[14px] font-black text-neutral-800 tabular-nums">
                        {smj.progress}%
                    </span>

                    {/* Only PIC can add tasks / edit / delete sub tasks */}
                    {isPIC && (
                        <div className="flex items-center gap-1.5 ml-1 flex-wrap">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onOpenAddModal}
                                className="py-1 px-2.5 text-[11px] h-7 bg-white hover:bg-neutral-50 border-neutral-300 flex-shrink-0"
                                icon={Plus}
                            >
                                Add Task
                            </Button>
                            <button
                                type="button"
                                onClick={onOpenEditSubModal}
                                className="p-1.5 text-neutral-400 hover:text-brand bg-white hover:bg-neutral-50 rounded border border-neutral-200 shadow-xs transition-colors flex-shrink-0"
                                title="Edit Sub Task (Name & Weight)"
                            >
                                <Edit2 size={13} />
                            </button>
                            <button
                                type="button"
                                onClick={onDeleteSubMainJob}
                                className="p-1.5 text-neutral-400 hover:text-danger bg-white hover:bg-red-50 rounded border border-neutral-200 shadow-xs transition-colors flex-shrink-0"
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
                            No tasks yet.
                            {isPIC && " Click 'Add Task' to add task items."}
                        </div>
                    ) : (
                        smj.subtasks.map((st) => {
                            const authorized = isAuthorizedToCheck(
                                st.division || smj.pic,
                            );

                            const predCompleted = canStartTask(st, mainJobs);

                            const effectivelyAuthorized =
                                authorized && predCompleted;

                            const isDragging =
                                draggedItem?.smjId === smj.id &&
                                draggedItem?.taskId === st.id;
                            const isDropTarget = dropTargetTaskId === st.id;
                            const isInlineEditing = inlineEditingTaskId === st.id;

                            return (
                                <SubtaskRow
                                    key={st.id}
                                    st={st}
                                    divisi={st.division || smj.pic}
                                    isChecked={st.checked || st.progress >= 100}
                                    canCheck={effectivelyAuthorized}
                                    lockedByPred={authorized && !predCompleted}
                                    canEdit={isPIC}
                                    onProgressChange={(val, commit) =>
                                        onProgressChange(
                                            st.id,
                                            val,
                                            authorized,
                                            st.name,
                                            commit,
                                        )
                                    }
                                    onEdit={() => onOpenEditModal(st)}
                                    onManageDependencies={() =>
                                        onManageDependencies(st)
                                    }
                                    onDelete={() =>
                                        onDeleteTask(st.id, st.name)
                                    }
                                    onOpenEvidence={onOpenEvidence}
                                    onOpenUploadEvidence={() =>
                                        onOpenUploadEvidence(st)
                                    }
                                    onOpenHistory={() => onOpenHistory(st)}
                                    isInlineEditing={isInlineEditing}
                                    inlineTaskName={inlineEditingTaskName}
                                    setInlineTaskName={setInlineEditingTaskName}
                                    onStartInlineEdit={() => onStartInlineEdit(st)}
                                    onCancelInlineEdit={onCancelInlineEdit}
                                    onSaveInline={(name) => onSaveInlineEdit(st, name)}
                                    isSavingInline={inlineSavingTaskId === st.id}
                                    isDragging={isDragging}
                                    isDropTarget={isDropTarget}
                                    onDragStart={(e) => {
                                        e.dataTransfer.effectAllowed = "move";
                                        e.dataTransfer.setData("text/plain", st.id);
                                        onDragStartTask(st.id);
                                    }}
                                    onDragOver={(e) => {
                                        if (
                                            draggedItem &&
                                            draggedItem.smjId === smj.id &&
                                            draggedItem.taskId !== st.id
                                        ) {
                                            e.preventDefault();
                                            e.dataTransfer.dropEffect = "move";
                                            onDragOverTask(st.id);
                                        }
                                    }}
                                    onDragLeave={onDragLeaveTask}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        onDropTask(st.id);
                                    }}
                                    onDragEnd={onDragEndTask}
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
    st,
    divisi,
    isChecked,
    canCheck,
    lockedByPred,
    canEdit,
    onProgressChange,
    onEdit,
    onManageDependencies,
    onDelete,
    onOpenEvidence,
    onOpenUploadEvidence,
    onOpenHistory,
    isInlineEditing,
    inlineTaskName,
    setInlineTaskName,
    onStartInlineEdit,
    onCancelInlineEdit,
    onSaveInline,
    isSavingInline,
    isDragging,
    isDropTarget,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
}: {
    st: SubSubtask;
    divisi: string;
    isChecked: boolean;
    canCheck: boolean;
    lockedByPred?: boolean;
    canEdit: boolean;
    onProgressChange: (val: number, commit?: boolean) => void;
    onEdit: () => void;
    onManageDependencies: () => void;
    onDelete: () => void;
    onOpenEvidence: (evidence: any) => void;
    onOpenUploadEvidence: () => void;
    onOpenHistory: () => void;
    isInlineEditing: boolean;
    inlineTaskName: string;
    setInlineTaskName: (name: string) => void;
    onStartInlineEdit: () => void;
    onCancelInlineEdit: () => void;
    onSaveInline: (name: string) => void;
    isSavingInline: boolean;
    isDragging?: boolean;
    isDropTarget?: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
}) {
    return (
        <div
            className={`group flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-3.5 rounded-xl border transition-all ${
                isDragging
                    ? "opacity-40 border-dashed border-brand bg-brand/5 scale-[0.99]"
                    : isDropTarget
                    ? "border-t-2 border-t-brand ring-2 ring-brand/30 bg-blue-50/40"
                    : isChecked
                    ? "bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-400/20 shadow-xs"
                    : "bg-white border-neutral-200/80 hover:border-neutral-300 shadow-xs"
            }`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
        >
            <div className="flex items-start sm:items-center gap-2.5 flex-1 min-w-0">
                {/* Drag Handle (PIC only) */}
                {canEdit && (
                    <div
                        draggable
                        onDragStart={onDragStart}
                        className="cursor-grab active:cursor-grabbing text-neutral-300 hover:text-neutral-600 p-1 -ml-1 rounded transition-colors flex-shrink-0"
                        title="Drag to reorder task within this Sub Task"
                    >
                        <GripVertical size={14} />
                    </div>
                )}

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[12px] font-bold text-neutral-500 font-mono">
                            {st.code}
                        </span>

                        {/* Inline Task Name Editing or Display */}
                        {isInlineEditing ? (
                            <div className="flex items-center gap-1.5 flex-1 min-w-[200px] my-0.5">
                                <input
                                    autoFocus
                                    type="text"
                                    value={inlineTaskName}
                                    onChange={(e) => setInlineTaskName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") onSaveInline(inlineTaskName);
                                        else if (e.key === "Escape") onCancelInlineEdit();
                                    }}
                                    disabled={isSavingInline}
                                    placeholder="Task name cannot be blank..."
                                    className="flex-1 px-2.5 py-1 text-[13.5px] font-semibold border-2 border-brand rounded-lg outline-none bg-white shadow-xs focus:ring-1 focus:ring-brand"
                                />
                                <button
                                    type="button"
                                    onClick={() => onSaveInline(inlineTaskName)}
                                    disabled={isSavingInline || !inlineTaskName.trim()}
                                    className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors disabled:opacity-50 flex-shrink-0"
                                    title="Save Task Name (Enter)"
                                >
                                    <Check size={14} />
                                </button>
                                <button
                                    type="button"
                                    onClick={onCancelInlineEdit}
                                    disabled={isSavingInline}
                                    className="p-1.5 rounded-lg bg-neutral-200 hover:bg-neutral-300 text-neutral-700 transition-colors flex-shrink-0"
                                    title="Cancel (Esc)"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                    className={`text-[13.5px] sm:text-[14.5px] font-semibold break-words ${isChecked ? "text-emerald-950 font-bold" : "text-neutral-900"} ${canEdit ? "cursor-pointer hover:text-brand" : ""}`}
                                    onDoubleClick={() => canEdit && onStartInlineEdit()}
                                    title={canEdit ? "Double-click to edit task name inline" : ""}
                                >
                                    {st.name}
                                </span>
                                {canEdit && (
                                    <button
                                        type="button"
                                        onClick={onStartInlineEdit}
                                        className="p-1 text-neutral-400 hover:text-brand rounded transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                                        title="Edit task name inline"
                                    >
                                        <Edit2 size={12} />
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Distinct Structural Weight Badge */}
                        <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-semibold flex-shrink-0"
                            title="Task structural weight in WBS hierarchy (distinct from completion progress)"
                        >
                            <Scale size={11} className="text-slate-500" />
                            Weight {st.weight ?? 100}%
                        </span>

                        {!canCheck && !lockedByPred && (
                            <span className="relative group cursor-help">
                                <Lock size={12} className="text-neutral-300" />
                                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 opacity-0 group-hover:opacity-100 transition-opacity z-10 p-2 bg-neutral-800 text-white text-[11px] rounded-lg shadow-lg text-center leading-tight">
                                    You do not have permission to update progress for this task.
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-800" />
                                </div>
                            </span>
                        )}
                        {lockedByPred && (
                            <span className="relative group cursor-help">
                                <Lock size={12} className="text-amber-500" />
                                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 opacity-0 group-hover:opacity-100 transition-opacity z-10 p-2 bg-neutral-800 text-white text-[11px] rounded-lg shadow-lg text-center leading-tight">
                                    Locked: Predecessor task is not 100% complete yet.
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-800" />
                                </div>
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1.5 text-[11.5px] text-neutral-500">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-100 border border-neutral-200 text-[11px] font-semibold text-neutral-700">
                            <Shield size={10} />
                            Division: {formatDivisionName(divisi)}
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-neutral-700 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-200">
                            <Calendar size={12} className="text-brand" />
                            Schedule: {formatDateDisplay(st.startDate)} to{" "}
                            {formatDateDisplay(st.finishDate)}
                        </span>
                        <span className="text-neutral-600 font-medium">
                            Duration: {st.duration} days
                        </span>
                        {st.daysLeft !== undefined &&
                            st.daysLeft > 0 &&
                            !isChecked && (
                                <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[11px]">
                                    {st.daysLeft} days left
                                </span>
                            )}
                        {st.dependencies && st.dependencies.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1">
                                {st.dependencies.map((dep) => (
                                    <span
                                        key={dep.id}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                                        title={`Predecessor: ${dep.predecessor_name} (${dep.dependency_type}, Lag: ${dep.lag_days}d)`}
                                    >
                                        <Link2 size={10} />
                                        <span>
                                            {dep.predecessor_name} (
                                            {dep.dependency_type})
                                        </span>
                                    </span>
                                ))}
                            </div>
                        ) : st.predecessor ? (
                            <span className="font-medium text-neutral-600">
                                Pred: {st.predecessor} ({st.depType || "FS"}
                                {st.lag ? ` +${st.lag}d lag` : ""}
                                {st.lead ? ` -${st.lead}d lead` : ""})
                            </span>
                        ) : null}

                        {/* Evidence attachment indicator & upload button */}
                        {st.evidences && st.evidences.length > 0 ? (
                            <div className="inline-flex items-center gap-1 flex-wrap">
                                {st.evidences.map((ev, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => onOpenEvidence(ev)}
                                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-[11px] font-bold hover:bg-emerald-200 transition-colors shadow-2xs"
                                        title={`View evidence: ${ev.name}`}
                                    >
                                        <Paperclip
                                            size={11}
                                            className="text-emerald-700"
                                        />
                                        Evidence {idx + 1}
                                    </button>
                                ))}
                                {canCheck && (
                                    <button
                                        type="button"
                                        onClick={onOpenUploadEvidence}
                                        className="p-1 rounded text-neutral-400 hover:text-brand hover:bg-neutral-100 transition-colors"
                                        title="Add evidence file"
                                    >
                                        <Edit2 size={11} />
                                    </button>
                                )}
                            </div>
                        ) : (
                            canCheck && (
                                <button
                                    type="button"
                                    onClick={onOpenUploadEvidence}
                                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-[11px] font-bold transition-colors shadow-2xs"
                                    title="Upload completion evidence"
                                >
                                    <UploadCloud
                                        size={11}
                                        className="text-amber-600"
                                    />
                                    <span>Upload Evidence</span>
                                </button>
                            )
                        )}

                        {st.completedByName && (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                <CheckCircle2
                                    size={12}
                                    className="text-emerald-500"
                                />
                                Completed by {st.completedByName} on{" "}
                                {st.completedAt}
                            </span>
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
                        step="1"
                        value={st.progress}
                        disabled={!canCheck}
                        onChange={(e) =>
                            onProgressChange(parseInt(e.target.value), false)
                        }
                        onMouseUp={(e) =>
                            onProgressChange(
                                parseInt((e.target as HTMLInputElement).value),
                                true,
                            )
                        }
                        onTouchEnd={(e) =>
                            onProgressChange(
                                parseInt((e.target as HTMLInputElement).value),
                                true,
                            )
                        }
                        className={`w-28 sm:w-32 h-2 rounded-lg cursor-pointer bg-neutral-200 accent-brand ${
                            !canCheck
                                ? "opacity-40 cursor-not-allowed"
                                : "hover:accent-blue-700"
                        }`}
                        title={`Adjust task completion progress (Current: ${st.progress}%)`}
                    />
                    <EditableProgress
                        value={st.progress}
                        disabled={!canCheck}
                        onSave={(val) => onProgressChange(val, true)}
                        isChecked={isChecked}
                    />
                </div>

                <StatusBadge
                    status={isChecked ? "Completed" : st.status}
                    size="sm"
                />

                {/* Actions: History (all) + Edit/Delete (PIC) */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                    <button
                        type="button"
                        onClick={onOpenHistory}
                        className="p-1.5 text-neutral-500 hover:text-brand bg-white hover:bg-neutral-50 rounded border border-neutral-200 shadow-xs transition-colors"
                        title="View Task Progress & Activity History"
                    >
                        <History size={14} />
                    </button>
                    {canEdit && (
                        <>
                            <button
                                onClick={onManageDependencies}
                                className="p-1.5 text-neutral-500 hover:text-brand bg-white hover:bg-neutral-50 rounded border border-neutral-200 shadow-xs"
                                title="Manage Dependencies (Predecessor)"
                            >
                                <Link2 size={14} />
                            </button>
                            <button
                                onClick={onEdit}
                                className="p-1.5 text-neutral-500 hover:text-brand bg-white hover:bg-neutral-50 rounded border border-neutral-200 shadow-xs"
                                title="Edit Task (Modal)"
                            >
                                <Sliders size={14} />
                            </button>
                            <button
                                onClick={onDelete}
                                className="p-1.5 text-neutral-500 hover:text-danger bg-white hover:bg-neutral-50 rounded border border-neutral-200 shadow-xs"
                                title="Delete Task"
                            >
                                <Trash2 size={14} />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function UncheckConfirmModal({
    taskName,
    onClose,
    onConfirm,
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
                            Are you sure you want to mark this task as
                            incomplete?
                        </p>
                        <p className="font-bold text-neutral-900 mt-1">
                            "{taskName}"
                        </p>
                        <p className="text-[11.5px] text-neutral-500 mt-1">
                            This will unmark the task from 100% completion.
                            Progress will be restored to in-progress.
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

function TaskProgressHistoryModal({
    task,
    parentSmj,
    activityLogs = [],
    onClose,
    onOpenEvidence,
}: {
    task: SubSubtask;
    parentSmj?: SubMainJob;
    activityLogs: any[];
    onClose: () => void;
    onOpenEvidence: (evidence: any) => void;
}) {
    // Filter actual logs for this specific task
    const taskLogs = useMemo(() => {
        return activityLogs.filter(
            (log: any) =>
                (log.wbs_name &&
                    log.wbs_name.trim().toLowerCase() ===
                        task.name.trim().toLowerCase()) ||
                (log.wbs_id && String(log.wbs_id) === String(task.id)),
        );
    }, [activityLogs, task.name, task.id]);

    const isComplete = task.progress === 100;

    return (
        <Modal
            title="Task Progress & Activity History"
            subtitle={`${task.code} — ${task.name}`}
            onClose={onClose}
            size="md"
        >
            <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
                {/* Task Metrics & Status Overview */}
                <div className="p-3.5 rounded-xl bg-neutral-50/80 border border-neutral-200/80 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <span className="text-[12px] font-bold text-neutral-500 font-mono">
                                {task.code}
                            </span>
                            <span className="text-[13.5px] font-bold text-neutral-900">
                                {task.name}
                            </span>
                        </div>
                        <StatusBadge
                            status={isComplete ? "Completed" : task.status}
                            size="sm"
                        />
                    </div>

                    {/* Progress Bar & Indicators */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11.5px]">
                            <span className="font-semibold text-neutral-600">
                                Completion Progress
                            </span>
                            <span className="font-bold text-brand font-mono">
                                {task.progress}%
                            </span>
                        </div>
                        <ProgressBar
                            value={task.progress}
                            color={isComplete ? "success" : "brand"}
                            size="sm"
                        />
                    </div>

                    {/* Key Attributes Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-neutral-200/70 text-[11px]">
                        <div className="p-2 rounded-lg bg-white border border-neutral-200 shadow-2xs">
                            <div className="text-neutral-500 font-medium flex items-center gap-1 mb-0.5">
                                <Scale size={11} className="text-slate-500" />
                                <span>Task Weight</span>
                            </div>
                            <div className="font-bold text-slate-800 text-[12px]">
                                {task.weight ?? 100}%
                            </div>
                        </div>

                        <div className="p-2 rounded-lg bg-white border border-neutral-200 shadow-2xs">
                            <div className="text-neutral-500 font-medium flex items-center gap-1 mb-0.5">
                                <Shield size={11} className="text-neutral-500" />
                                <span>Division</span>
                            </div>
                            <div className="font-bold text-neutral-800 text-[12px] truncate">
                                {formatDivisionName(task.division || parentSmj?.pic || "—")}
                            </div>
                        </div>

                        <div className="p-2 rounded-lg bg-white border border-neutral-200 shadow-2xs">
                            <div className="text-neutral-500 font-medium flex items-center gap-1 mb-0.5">
                                <Calendar size={11} className="text-brand" />
                                <span>Duration</span>
                            </div>
                            <div className="font-bold text-neutral-800 text-[12px]">
                                {task.duration} days
                            </div>
                        </div>

                        <div className="p-2 rounded-lg bg-white border border-neutral-200 shadow-2xs">
                            <div className="text-neutral-500 font-medium flex items-center gap-1 mb-0.5">
                                <Clock size={11} className="text-neutral-500" />
                                <span>Target End</span>
                            </div>
                            <div className="font-bold text-neutral-800 text-[12px] truncate">
                                {formatDateDisplay(task.finishDate)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Completion Notice Banner */}
                {task.completedByName && (
                    <div className="p-3 rounded-xl bg-emerald-50/90 border border-emerald-200 text-emerald-900 text-[12px] flex items-start gap-2.5">
                        <CheckCircle2
                            size={16}
                            className="text-emerald-600 flex-shrink-0 mt-0.5"
                        />
                        <div>
                            <span className="font-bold">
                                Marked as Completed:
                            </span>{" "}
                            Verified by{" "}
                            <span className="font-semibold text-emerald-950">
                                {task.completedByName}
                            </span>
                            {task.completedAt && (
                                <>
                                    {" "}
                                    on{" "}
                                    <span className="font-semibold text-emerald-950 font-mono">
                                        {task.completedAt}
                                    </span>
                                </>
                            )}
                            .
                        </div>
                    </div>
                )}

                {/* Attached Evidences List */}
                {task.evidences && task.evidences.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-[12px] font-bold text-neutral-700">
                            <Paperclip size={13} className="text-neutral-500" />
                            <span>Attached Verification Evidences ({task.evidences.length})</span>
                        </div>
                        <div className="space-y-1.5">
                            {task.evidences.map((ev, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-50 border border-neutral-200 text-[12px] hover:bg-neutral-100/70 transition-colors"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <FileText
                                            size={16}
                                            className="text-brand flex-shrink-0"
                                        />
                                        <div className="min-w-0">
                                            <p className="font-semibold text-neutral-800 truncate">
                                                {ev.name}
                                            </p>
                                            <p className="text-[10.5px] text-neutral-400">
                                                {ev.size || "Document"}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onOpenEvidence(ev)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white hover:bg-neutral-50 border border-neutral-200 text-[11px] font-bold text-brand shadow-2xs transition-colors"
                                    >
                                        <Eye size={12} />
                                        <span>View</span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Activity & Progress Log History */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[12px] font-bold text-neutral-700">
                            <History size={13} className="text-brand" />
                            <span>Recorded Progress & Activity Logs</span>
                        </div>
                        <span className="text-[11px] font-mono text-neutral-400 font-semibold">
                            {taskLogs.length} record{taskLogs.length !== 1 ? "s" : ""}
                        </span>
                    </div>

                    {taskLogs.length > 0 ? (
                        <div className="space-y-2 border-l-2 border-neutral-200 ml-2.5 pl-3 py-1">
                            {taskLogs.map((log: any) => (
                                <div
                                    key={log.id}
                                    className="relative p-2.5 rounded-lg bg-neutral-50/80 border border-neutral-200/80 text-[12px] space-y-1"
                                >
                                    {/* Timeline Dot */}
                                    <div className="absolute -left-[19px] top-3.5 w-2.5 h-2.5 rounded-full bg-brand ring-4 ring-white" />

                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-5 h-5 rounded-full bg-brand/10 text-brand font-bold text-[9.5px] flex items-center justify-center uppercase">
                                                {(log.user || "U").slice(0, 2)}
                                            </div>
                                            <span className="font-bold text-neutral-800">
                                                {log.user}
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-neutral-400 font-mono">
                                            {log.created_at}
                                        </span>
                                    </div>

                                    <p className="text-neutral-700 text-[11.5px] leading-relaxed pl-6.5">
                                        {log.description}
                                    </p>

                                    {log.metadata?.evidence_files && Array.isArray(log.metadata.evidence_files) && log.metadata.evidence_files.length > 0 && (
                                        <div className="pl-6.5 pt-0.5 flex flex-wrap gap-1.5">
                                            {log.metadata.evidence_files.map((file: string, idx: number) => (
                                                <span
                                                    key={idx}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-[10.5px] font-medium"
                                                >
                                                    <Paperclip size={10} className="text-blue-500" />
                                                    <span className="truncate max-w-[220px]" title={file}>{file}</span>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-4 rounded-xl border border-dashed border-neutral-200 text-center space-y-1 bg-neutral-50/50">
                            <Clock
                                size={22}
                                className="mx-auto text-neutral-300 mb-1"
                            />
                            <p className="text-[12px] font-semibold text-neutral-700">
                                No activity logs recorded yet
                            </p>
                            <p className="text-[11px] text-neutral-400 max-w-sm mx-auto leading-relaxed">
                                Progress updates and completions made to this task will automatically be logged here.
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex justify-end pt-2 border-t border-neutral-100">
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={onClose}
                    >
                        Close
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function UploadEvidenceModal({
    task,
    requireComplete = false,
    onClose,
    onSave,
}: {
    task: SubSubtask;
    requireComplete?: boolean;
    onClose: () => void;
    onSave: (
        taskId: string,
        evidences: EvidenceItem[],
        completeTo100: boolean,
        rawFiles?: File[],
    ) => void;
}) {
    const [files, setFiles] = useState<File[]>([]);
    const [completeChecked, setCompleteChecked] = useState(
        requireComplete || task.progress === 100,
    );
    const [fileError, setFileError] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFileError(null);
        const selected = Array.from(e.target.files || []);
        const validFiles: File[] = [];

        for (const file of selected) {
            const ext = file.name.split(".").pop()?.toLowerCase();
            if (!ext || !["pdf", "jpg", "jpeg", "png"].includes(ext)) {
                setFileError(
                    `File format "${file.name}" is not supported. Only PDF, JPG, or PNG files are allowed.`,
                );
                return;
            }

            if (ext === "pdf" && file.size > 20 * 1024 * 1024) {
                setFileError(
                    `PDF file size "${file.name}" exceeds the maximum limit of 20 MB.`,
                );
                return;
            }

            if (
                ["jpg", "jpeg", "png"].includes(ext) &&
                file.size > 10 * 1024 * 1024
            ) {
                setFileError(
                    `Image file size "${file.name}" exceeds the maximum limit of 10 MB.`,
                );
                return;
            }

            validFiles.push(file);
        }

        if (validFiles.length > 0) {
            setFiles((prev) => [...prev, ...validFiles]);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const hasExisting = task.evidences && task.evidences.length > 0;
        if (files.length === 0 && !hasExisting) return;

        const newEvidences: EvidenceItem[] = files.map((file) => {
            const isImg = file.type.startsWith("image/");
            return {
                name: file.name,
                size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
                type: file.type,
                previewUrl: isImg ? URL.createObjectURL(file) : undefined,
            };
        });

        onSave(
            task.id,
            newEvidences,
            completeChecked,
            files.length > 0 ? files : undefined,
        );
    };

    return (
        <Modal
            title="Upload Completion Evidence"
            subtitle={`${task.code} — ${task.name}`}
            onClose={onClose}
            size="md"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {fileError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[12px] font-semibold flex items-center gap-2">
                        <AlertCircle
                            size={16}
                            className="text-red-600 flex-shrink-0"
                        />
                        <span>{fileError}</span>
                    </div>
                )}

                {/* Required Notice Alert */}
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[12px] leading-relaxed">
                    <AlertCircle
                        size={18}
                        className="text-amber-600 flex-shrink-0 mt-0.5"
                    />
                    <div>
                        <strong className="font-bold">
                            Evidence File Requirements:
                        </strong>{" "}
                        Only <strong>PDF (max. 20 MB)</strong> or{" "}
                        <strong>JPG/PNG photos (max. 10 MB)</strong> formats are
                        allowed.
                    </div>
                </div>

                {/* Existing / Selected Evidence Display */}
                <div className="space-y-2">
                    {(task.evidences || []).map((ev, i) => (
                        <div
                            key={"ext-" + i}
                            className="p-2 rounded-lg border border-neutral-200 bg-neutral-50 flex items-center gap-3"
                        >
                            <FileText size={20} className="text-neutral-500" />
                            <span className="text-[12px] font-bold text-neutral-800 truncate flex-1">
                                {ev.name} (Saved)
                            </span>
                        </div>
                    ))}
                    {files.map((f, i) => (
                        <div
                            key={"new-" + i}
                            className="p-2 rounded-lg border border-brand/20 bg-brand/5 flex items-center gap-3"
                        >
                            <FileText size={20} className="text-brand" />
                            <span className="text-[12px] font-bold text-brand truncate flex-1">
                                {f.name} (Ready to upload)
                            </span>
                            <button
                                type="button"
                                onClick={() =>
                                    setFiles(
                                        files.filter((_, idx) => idx !== i),
                                    )
                                }
                                className="text-red-500 font-bold px-2 py-1 hover:bg-red-50 rounded"
                            >
                                X
                            </button>
                        </div>
                    ))}
                </div>

                <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-neutral-300 hover:border-brand rounded-xl cursor-pointer bg-neutral-50/50 hover:bg-brand/5 transition-all text-center">
                    <UploadCloud size={32} className="text-brand mb-2" />
                    <span className="text-[13.5px] font-bold text-neutral-800">
                        Select or drag evidence files here
                    </span>
                    <span className="text-[11.5px] text-neutral-400 mt-1">
                        PDF format only (max. 20 MB) or JPG/PNG photos (max. 10
                        MB)
                    </span>
                    <input
                        type="file"
                        multiple
                        required={
                            (!task.evidences || task.evidences.length === 0) &&
                            files.length === 0
                        }
                        accept=".pdf,.jpg,.jpeg,.png,image/jpeg,image/png,application/pdf"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                </label>

                {/* Completion checkbox option */}
                <div className="pt-2 border-t border-neutral-100 flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="markCompleteCheck"
                        checked={completeChecked}
                        onChange={(e) => setCompleteChecked(e.target.checked)}
                        className="w-4 h-4 rounded text-brand focus:ring-brand border-neutral-300 accent-brand cursor-pointer"
                    />
                    <label
                        htmlFor="markCompleteCheck"
                        className="text-[12.5px] font-semibold text-neutral-800 cursor-pointer"
                    >
                        Immediately mark this task 100% complete
                    </label>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                    <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        type="submit"
                        disabled={
                            (!task.evidences || task.evidences.length === 0) &&
                            files.length === 0
                        }
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                    >
                        {completeChecked
                            ? "Upload Evidence & Complete (100%)"
                            : "Save Evidence"}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

function EvidencePreviewModal({
    evidence,
    onClose,
}: {
    evidence: EvidenceItem;
    onClose: () => void;
}) {
    const displayUrl = evidence.previewUrl;
    return (
        <Modal
            title="Task Evidence Preview"
            subtitle={evidence.name}
            onClose={onClose}
            size="md"
        >
            <div className="space-y-4">
                {displayUrl ? (
                    <div className="rounded-xl overflow-hidden border border-neutral-200 bg-neutral-900 flex items-center justify-center max-h-[70vh] w-full relative">
                        {evidence.name.toLowerCase().endsWith(".pdf") ? (
                            <iframe
                                src={displayUrl}
                                className="w-full h-[70vh] bg-white border-0"
                                title={evidence.name}
                            />
                        ) : (
                            <img
                                src={displayUrl}
                                alt={evidence.name}
                                className="max-w-full max-h-[70vh] object-contain"
                            />
                        )}
                    </div>
                ) : (
                    <div className="p-8 rounded-xl border border-neutral-200 bg-neutral-50 text-center">
                        <FileText
                            size={48}
                            className="mx-auto text-brand mb-2"
                        />
                        <h4 className="font-bold text-neutral-800 text-[14px]">
                            {evidence.name}
                        </h4>
                        <p className="text-[12px] text-neutral-500 mt-1">
                            {evidence.size || "Attached file"}
                        </p>
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

const parseYMD = (str: string): [number, number, number] => {
    const parts = str.slice(0, 10).split("-");
    return [
        parseInt(parts[0], 10),
        parseInt(parts[1], 10) - 1,
        parseInt(parts[2], 10),
    ];
};

const toYMD = (year: number, monthIndex: number, day: number): string => {
    const d = new Date(year, monthIndex, day);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dt = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dt}`;
};

const addDaysSafe = (dateStr: string, days: number): string => {
    if (!dateStr) return "";
    const [y, m, d] = parseYMD(dateStr);
    return toYMD(y, m, d + days);
};

const diffDaysSafe = (startStr: string, endStr: string): number => {
    if (!startStr || !endStr) return 0;
    const [y1, m1, d1] = parseYMD(startStr);
    const [y2, m2, d2] = parseYMD(endStr);
    const t1 = Date.UTC(y1, m1, d1);
    const t2 = Date.UTC(y2, m2, d2);
    return Math.floor((t2 - t1) / (1000 * 60 * 60 * 24));
};

const calcEndDate = (start: string, duration: number): string => {
    if (!start) return "";
    return addDaysSafe(start, Math.max(1, duration) - 1);
};

const calcStartFromPredecessor = (
    predTask: { start?: string; end?: string; startDate?: string; finishDate?: string } | undefined,
    depType: "FS" | "SS" | "FF" | "SF",
    lag: number,
    duration: number,
    minBound?: string,
    maxBound?: string,
    currentStart?: string,
): string => {
    const pStart = (predTask?.startDate || predTask?.start || "").slice(0, 10);
    const pEnd = (predTask?.finishDate || predTask?.end || "").slice(0, 10);
    if (!pStart || !pEnd) return currentStart || "";

    const dur = Math.max(1, duration || 1);
    let calculatedStart = currentStart || pEnd;

    // FS: this task starts after predecessor finishes (+ lag)
    if (depType === "FS") calculatedStart = addDaysSafe(pEnd, lag);
    // SS: this task starts when predecessor starts (+ lag)
    else if (depType === "SS") calculatedStart = addDaysSafe(pStart, lag);
    // FF: this task finishes when predecessor finishes -> start = predEnd + lag - (duration - 1)
    else if (depType === "FF") calculatedStart = addDaysSafe(pEnd, lag - (dur - 1));
    // SF: this task finishes when predecessor starts -> start = predStart + lag - (duration - 1)
    else if (depType === "SF") calculatedStart = addDaysSafe(pStart, lag - (dur - 1));

    // Clamping: Tanggal tidak boleh lebih awal dari batas mulai proyek / Main Task
    if (minBound && calculatedStart < minBound) {
        calculatedStart = minBound;
    }

    return calculatedStart;
};

function EditSubMainJobModal({
    smj,
    parentMj,
    projectStartDate,
    projectEndDate,
    onClose,
    onSave,
}: {
    smj: SubMainJob;
    parentMj?: MainJob;
    projectStartDate?: string;
    projectEndDate?: string;
    onClose: () => void;
    onSave: (
        name: string,
        weight: number,
        start?: string,
        end?: string,
        callback?: (err?: string | null) => void,
    ) => void;
}) {
    const [name, setName] = useState(smj.name || "");
    const [weight, setWeight] = useState(
        smj.weight !== undefined ? smj.weight.toString() : "0",
    );
    const [startDate, setStartDate] = useState(
        smj.startDate || smj.start || parentMj?.startDate || projectStartDate || "",
    );
    const [endDate, setEndDate] = useState(
        smj.finishDate || smj.end || smj.endDate || parentMj?.finishDate || projectEndDate || "",
    );
    const [actionError, setActionError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        if (projectStartDate && startDate && startDate < projectStartDate) {
            setActionError(
                `Start date cannot be earlier than project start date (${formatDateDisplay(projectStartDate)}).`,
            );
            return;
        }
        if (projectEndDate && endDate && endDate > projectEndDate) {
            setActionError(
                `Finish date cannot exceed project target finish date (${formatDateDisplay(projectEndDate)}).`,
            );
            return;
        }
        if (startDate && endDate && endDate <= startDate) {
            setActionError(
                "Finish date must be after start date (at least +1 day later).",
            );
            return;
        }

        setSubmitting(true);
        setActionError(null);
        onSave(
            name.trim(),
            parseFloat(weight) || 0,
            startDate || undefined,
            endDate || undefined,
            (err) => {
                setSubmitting(false);
                if (err) {
                    setActionError(err);
                }
            },
        );
    };

    return (
        <Modal
            title="Edit Sub Task"
            subtitle={`Code: ${smj.code}${parentMj?.name ? ` • Under: ${parentMj.name}` : ""}`}
            onClose={onClose}
            size="md"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {actionError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12px] font-semibold flex items-center gap-2">
                        <AlertTriangle size={14} className="flex-shrink-0" />
                        <span>{actionError}</span>
                    </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                            Code
                        </label>
                        <input
                            type="text"
                            value={smj.code}
                            disabled
                            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] font-bold bg-neutral-100 text-neutral-600 cursor-not-allowed"
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                            Weight (%)
                        </label>
                        <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={weight}
                            onChange={(e) => {
                                setWeight(e.target.value);
                                setActionError(null);
                            }}
                            placeholder="0"
                            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white font-medium"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                        Sub Task Name <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            setActionError(null);
                        }}
                        placeholder="Sub Task Name..."
                        className="w-full px-3.5 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 bg-white font-medium"
                        autoFocus
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                            Start Date
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            min={projectStartDate || undefined}
                            max={endDate || projectEndDate || undefined}
                            onChange={(e) => {
                                setStartDate(e.target.value);
                                setActionError(null);
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
                        />
                    </div>
                    <div>
                        <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                            End Date
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            min={startDate || projectStartDate || undefined}
                            max={projectEndDate || undefined}
                            onChange={(e) => {
                                setEndDate(e.target.value);
                                setActionError(null);
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={submitting || !name.trim()}
                    >
                        {submitting ? "Saving..." : "Save Changes"}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

function AddSubMainJobModal({
    mjName,
    parentWeight = 0,
    currentSubCount = 0,
    parentStart,
    parentEnd,
    onClose,
    onSave,
}: {
    mjName: string;
    parentWeight?: number;
    currentSubCount?: number;
    parentStart?: string;
    parentEnd?: string;
    onClose: () => void;
    onSave: (
        name: string,
        start?: string,
        end?: string,
        callback?: (err?: string | null) => void,
    ) => void;
}) {
    const [name, setName] = useState("");
    const [startDate, setStartDate] = useState(parentStart || "");
    const [endDate, setEndDate] = useState(parentEnd || "");
    const [actionError, setActionError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        if (parentStart && startDate && startDate < parentStart) {
            setActionError(
                `Start date cannot be earlier than Main Task start date (${formatDateDisplay(parentStart)}).`,
            );
            return;
        }
        if (parentEnd && endDate && endDate > parentEnd) {
            setActionError(
                `Finish date cannot exceed Main Task finish deadline (${formatDateDisplay(parentEnd)}).`,
            );
            return;
        }
        if (startDate && endDate && endDate <= startDate) {
            setActionError(
                "Finish date must be after start date (at least +1 day later).",
            );
            return;
        }

        setSubmitting(true);
        setActionError(null);
        onSave(name.trim(), startDate, endDate, (err) => {
            setSubmitting(false);
            if (err) {
                setActionError(err);
            }
        });
    };

    return (
        <Modal
            title="Add New Sub Task"
            subtitle={`Under WBS Group: ${mjName}`}
            onClose={onClose}
            size="md"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {actionError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12px] font-semibold flex items-center gap-2">
                        <AlertTriangle size={14} className="flex-shrink-0" />
                        <span>{actionError}</span>
                    </div>
                )}

                <div>
                    <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                        Sub Task Name <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            setActionError(null);
                        }}
                        placeholder="e.g. SUBSTRUCTURE, SUPERSTRUCTURE, PIPING, etc."
                        className="w-full px-3.5 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 bg-white font-medium"
                        autoFocus
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                            Start Date
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            min={parentStart || undefined}
                            max={endDate || parentEnd || undefined}
                            onChange={(e) => {
                                let val = e.target.value;
                                if (parentStart && val && val < parentStart) val = parentStart;
                                if (parentEnd && val && val > parentEnd) val = parentEnd;
                                setStartDate(val);
                                setActionError(null);
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
                        />
                    </div>
                    <div>
                        <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                            End Date
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            min={startDate || parentStart || undefined}
                            max={parentEnd || undefined}
                            onChange={(e) => {
                                let val = e.target.value;
                                if (parentEnd && val && val > parentEnd) val = parentEnd;
                                setEndDate(val);
                                setActionError(null);
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
                        />
                    </div>
                    {parentEnd && (
                        <div className="col-span-2 text-[11px] text-amber-900 bg-amber-50 p-2.5 rounded-lg border border-amber-200 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <Lock size={12} className="text-amber-700 flex-shrink-0" />
                                <span>
                                    <span className="font-semibold text-neutral-800">
                                        Finish Deadline:
                                    </span>{" "}
                                    <span className="font-bold text-amber-900">
                                        {formatDateDisplay(parentEnd)}
                                    </span>
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                    <Button
                        variant="outline"
                        size="md"
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        size="md"
                        type="submit"
                        disabled={submitting || !name.trim()}
                    >
                        {submitting ? "Saving..." : "Save Sub Task"}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

function MainJobModal({
    initialData,
    projectStartDate,
    projectEndDate,
    onClose,
    onSave,
}: {
    initialData?: {
        id?: string;
        dbId?: number;
        name?: string;
        weight?: number;
        startDate?: string;
        finishDate?: string;
    };
    projectStartDate?: string;
    projectEndDate?: string;
    onClose: () => void;
    onSave: (
        name: string,
        weight: number,
        start?: string,
        end?: string,
        callback?: (err?: string | null) => void,
    ) => void;
}) {
    const isEdit = !!initialData?.id;
    const [name, setName] = useState(initialData?.name || "");
    const [weight, setWeight] = useState(
        initialData?.weight !== undefined ? initialData.weight.toString() : "5",
    );
    const [startDate, setStartDate] = useState(
        initialData?.startDate ||
            projectStartDate ||
            new Date().toISOString().slice(0, 10),
    );
    const [endDate, setEndDate] = useState(() => {
        if (initialData?.finishDate) return initialData.finishDate;
        if (projectEndDate) return projectEndDate;
        return new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    });
    const [actionError, setActionError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        if (projectStartDate && startDate && startDate < projectStartDate) {
            setActionError(
                `Start date cannot be earlier than project start date (${formatDateDisplay(projectStartDate)}).`,
            );
            return;
        }
        if (projectEndDate && endDate && endDate > projectEndDate) {
            setActionError(
                `Finish date cannot exceed project target finish date (${formatDateDisplay(projectEndDate)}).`,
            );
            return;
        }
        if (startDate && endDate && endDate <= startDate) {
            setActionError(
                "Finish date must be after start date (at least +1 day later).",
            );
            return;
        }

        setSubmitting(true);
        setActionError(null);
        onSave(name.trim(), parseFloat(weight) || 0, startDate, endDate, (err) => {
            setSubmitting(false);
            if (err) {
                setActionError(err);
            }
        });
    };

    return (
        <Modal
            title={
                isEdit
                    ? "Edit Main Task (Primary WBS Group)"
                    : "Add New Main Task (Primary WBS Group)"
            }
            subtitle={
                isEdit
                    ? `Modify Level 1 primary job group: ${initialData?.name}`
                    : "Add a Level 1 primary job group to the project"
            }
            onClose={onClose}
            size="md"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {actionError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12px] font-semibold flex items-center gap-2">
                        <AlertTriangle size={14} className="flex-shrink-0" />
                        <span>{actionError}</span>
                    </div>
                )}

                <div>
                    <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                        Main Task Name <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            setActionError(null);
                        }}
                        placeholder="e.g. COMMISSIONING & HANDOVER"
                        className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 bg-white font-medium"
                        autoFocus
                    />
                </div>

                <div>
                    <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                        Weight Allocation (%){" "}
                        <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        required
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white font-bold"
                    />
                    <span className="text-[11px] text-neutral-400 mt-1 block">
                        This weight will be automatically divided equally across
                        all Sub Tasks inside it.
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">
                            Start Date
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            min={projectStartDate || undefined}
                            max={endDate || projectEndDate || undefined}
                            onChange={(e) => {
                                let val = e.target.value;
                                if (
                                    projectStartDate &&
                                    val &&
                                    val < projectStartDate
                                )
                                    val = projectStartDate;
                                if (
                                    projectEndDate &&
                                    val &&
                                    val > projectEndDate
                                )
                                    val = projectEndDate;
                                setStartDate(val);
                                setActionError(null);
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
                        />
                    </div>
                    <div>
                        <label className="block text-[11.5px] font-semibold text-neutral-600 mb-1">
                            Finish Date
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            min={startDate || projectStartDate || undefined}
                            max={projectEndDate || undefined}
                            onChange={(e) => {
                                let val = e.target.value;
                                if (
                                    projectEndDate &&
                                    val &&
                                    val > projectEndDate
                                )
                                    val = projectEndDate;
                                setEndDate(val);
                                setActionError(null);
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
                        />
                    </div>
                    {projectEndDate && (
                        <div className="col-span-2 text-[11px] text-amber-900 bg-amber-50 p-2.5 rounded-lg border border-amber-200 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <Lock size={12} className="text-amber-700 flex-shrink-0" />
                                <span>
                                    <span className="font-semibold text-neutral-800">
                                        Project Target Limit:
                                    </span>{" "}
                                    <span className="font-bold text-amber-900">
                                        {formatDateDisplay(projectEndDate)}
                                    </span>
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                    <Button
                        variant="outline"
                        size="md"
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        size="md"
                        type="submit"
                        disabled={submitting || !name.trim()}
                    >
                        {submitting
                            ? "Saving..."
                            : isEdit
                              ? "Update Main Task"
                              : "Save Main Task"}
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
    initialData,
    projectStart,
    projectEnd,
}: {
    smjId: string;
    smjDbId?: number;
    parentSmj?: SubMainJob;
    mainJobs?: MainJob[];
    divisions: { id: number; divisi: string }[];
    onClose: () => void;
    onSave: (
        taskData: Partial<SubSubtask> & {
            smjDbId?: number;
            divisionId?: number;
            division_ids?: number[];
            depType?: "FS" | "SS" | "FF" | "SF";
            lag?: number;
        },
        callback?: (err?: string | null) => void,
    ) => void;
    initialData?: SubSubtask;
    projectStart?: string;
    projectEnd?: string;
}) {
    const isEdit = !!initialData?.id;

    // Resolve parent SubMainJob and MainJob for boundary clamping
    let resolvedSmj = parentSmj;
    let resolvedMj: MainJob | undefined;
    for (const mj of mainJobs) {
        const found = (mj.subMainJobs || []).find(
            (s) =>
                String(s.id) === String(smjId) ||
                (smjDbId && s.dbId === smjDbId) ||
                (resolvedSmj?.id && String(s.id) === String(resolvedSmj.id)),
        );
        if (found) {
            resolvedSmj = found;
            resolvedMj = mj;
            break;
        }
    }

    const minStart = (
        resolvedMj?.startDate ||
        resolvedSmj?.startDate ||
        projectStart ||
        ""
    ).slice(0, 10);

    const maxEnd = (
        resolvedMj?.finishDate ||
        resolvedSmj?.endDate ||
        projectEnd ||
        ""
    ).slice(0, 10);

    // Extract all leaf tasks for predecessor selection
    const allLeafTasks: SubSubtask[] = useMemo(() => {
        const list: SubSubtask[] = [];
        mainJobs.forEach((mj) => {
            (mj.subMainJobs || []).forEach((smj) => {
                (smj.subtasks || []).forEach((st) => {
                    list.push(st);
                });
            });
        });
        return list;
    }, [mainJobs]);

    const isFirstTask = isEdit
        ? allLeafTasks.length > 0 &&
          String(allLeafTasks[0].id) === String(initialData?.id)
        : allLeafTasks.length === 0;

    const lastTask = allLeafTasks.length > 0 ? allLeafTasks[allLeafTasks.length - 1] : null;

    // Initial state setup
    const [name, setName] = useState(initialData?.name || "");
    const [selectedDivisionIds, setSelectedDivisionIds] = useState<number[]>(() => {
        if ((initialData as any)?.division_ids && Array.isArray((initialData as any).division_ids) && (initialData as any).division_ids.length > 0) {
            return (initialData as any).division_ids.map(Number);
        }
        if (initialData?.division) {
            const parts = initialData.division.split(',').map((s) => s.trim().toLowerCase());
            const matched = divisions.filter((d) => parts.includes(d.divisi.toLowerCase())).map((d) => d.id);
            if (matched.length > 0) return matched;
        }
        return divisions[0] ? [divisions[0].id] : [1];
    });

    const toggleDivisionId = (id: number) => {
        setSelectedDivisionIds((prev) => {
            if (prev.includes(id)) {
                if (prev.length === 1) return prev; // Keep at least one division selected
                return prev.filter((x) => x !== id);
            }
            return [...prev, id];
        });
    };

    const [weight, setWeight] = useState<number>(() => {
        if (initialData?.weight !== undefined) return Number(initialData.weight);
        return 100;
    });

    const initialDep = initialData?.dependencies?.[0];
    const [predecessorId, setPredecessorId] = useState<string>(() => {
        if (initialDep?.predecessor_wbs_id) {
            return String(initialDep.predecessor_wbs_id);
        }
        if (initialData?.predecessor) {
            return String(initialData.predecessor);
        }
        // Jika bukan task pertama dan mode tambah baru, otomatis jadikan task sebelumnya sebagai predecessor
        if (!isEdit && !isFirstTask && lastTask) {
            return String(lastTask.id);
        }
        return "";
    });

    const [depType, setDepType] = useState<"FS" | "SS" | "FF" | "SF">(() => {
        return (initialDep?.dependency_type ||
            initialData?.depType ||
            "FS") as "FS" | "SS" | "FF" | "SF";
    });

    const [lag, setLag] = useState<number>(() => {
        if (initialDep?.lag_days !== undefined) return initialDep.lag_days;
        if (initialData?.lag !== undefined) return initialData.lag;
        return 0;
    });

    const [duration, setDuration] = useState<number>(() => {
        return Math.max(1, initialData?.duration || 5);
    });

    const [manualStart, setManualStart] = useState<string>(() => {
        if (initialData?.startDate) return initialData.startDate.slice(0, 10);
        if (!isEdit && !isFirstTask && lastTask) {
            return calcStartFromPredecessor(
                lastTask,
                "FS",
                0,
                5,
                minStart,
                maxEnd,
                minStart,
            );
        }
        if (minStart) return minStart;
        return new Date().toISOString().slice(0, 10);
    });

    const [requiresEvidence, setRequiresEvidence] = useState<boolean>(() => {
        return !!initialData?.requires_evidence;
    });

    const [searchDep, setSearchDep] = useState("");
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [actionError, setActionError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Selected Predecessor object
    const selectedPred = useMemo(() => {
        if (!predecessorId) return null;
        return allLeafTasks.find((t) => String(t.id) === String(predecessorId)) || null;
    }, [predecessorId, allLeafTasks]);

    // Current calculated start date
    const currentStart = useMemo(() => {
        if (selectedPred) {
            return calcStartFromPredecessor(
                selectedPred,
                depType,
                lag,
                duration,
                minStart,
                maxEnd,
                manualStart,
            );
        }
        return manualStart;
    }, [selectedPred, depType, lag, duration, minStart, maxEnd, manualStart]);

    // Calculated finish date for preview
    const previewEnd = useMemo(() => {
        return calcEndDate(currentStart, duration);
    }, [currentStart, duration]);

    // Lead and Lag clamping boundaries based on predecessor and Main Task limits
    let maxAllowedLead: number | undefined;
    let maxAllowedLag: number | undefined;
    if (selectedPred) {
        const pStart = (selectedPred.startDate || selectedPred.start || "").slice(0, 10);
        const pEnd = (selectedPred.finishDate || selectedPred.end || "").slice(0, 10);
        const dur = Math.max(1, duration || 1);

        if (minStart && pStart && pEnd) {
            if (depType === "FS") {
                maxAllowedLead = Math.max(0, diffDaysSafe(minStart, pEnd));
            } else if (depType === "SS") {
                maxAllowedLead = Math.max(0, diffDaysSafe(minStart, pStart));
            } else if (depType === "FF") {
                maxAllowedLead = Math.max(0, diffDaysSafe(minStart, pEnd) - dur);
            } else if (depType === "SF") {
                maxAllowedLead = Math.max(0, diffDaysSafe(minStart, pStart) - dur);
            }
        }

        if (maxEnd && pStart && pEnd) {
            if (depType === "FS") {
                maxAllowedLag = Math.max(0, diffDaysSafe(pEnd, maxEnd));
            } else if (depType === "SS") {
                maxAllowedLag = Math.max(0, diffDaysSafe(pStart, maxEnd));
            } else if (depType === "FF") {
                maxAllowedLag = Math.max(0, diffDaysSafe(pEnd, maxEnd) + dur);
            } else if (depType === "SF") {
                maxAllowedLag = Math.max(0, diffDaysSafe(pStart, maxEnd) + dur);
            }
        }
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        if (!isFirstTask && !predecessorId) {
            setActionError("Predecessor is required for tasks other than the first task.");
            return;
        }

        if (weight < 0 || weight > 100) {
            setActionError("Task weight must be between 0% and 100%.");
            return;
        }

        setSubmitting(true);
        setActionError(null);

        onSave(
            {
                ...(initialData || {}),
                name: name.trim(),
                duration,
                startDate: currentStart,
                finishDate: previewEnd,
                divisionId: selectedDivisionIds[0] || 1,
                division_ids: selectedDivisionIds,
                weight: Number(weight) || 0,
                requires_evidence: requiresEvidence,
                predecessor: predecessorId || undefined,
                depType,
                lag,
                smjDbId: smjDbId || resolvedSmj?.dbId,
            },
            (err) => {
                setSubmitting(false);
                if (err) {
                    setActionError(err);
                } else {
                    onClose();
                }
            },
        );
    };

    return (
        <Modal
            title={
                isEdit
                    ? "Edit Task (Sub-task Item)"
                    : "Add New Task (Sub-task Item)"
            }
            subtitle={
                isEdit
                    ? "Edit project task breakdown item"
                    : "Add specific project task breakdown item"
            }
            onClose={onClose}
            size="md"
        >
            <form
                onSubmit={handleSubmit}
                className="space-y-4 max-h-[75vh] overflow-y-auto pr-1"
            >
                {actionError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12px] font-semibold flex items-center gap-2">
                        <AlertTriangle size={14} className="flex-shrink-0" />
                        <span>{actionError}</span>
                    </div>
                )}

                {/* Task Name */}
                <div>
                    <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                        Task Description <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            setActionError(null);
                        }}
                        placeholder="e.g. Preparation and review of vendor documents..."
                        className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 bg-white font-medium"
                        required
                        autoFocus
                    />
                </div>

                {/* Responsible Divisions (Supports Multiple) */}
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[12px] font-bold text-neutral-700">
                            Responsible Divisions (Can select 1 or more) <span className="text-red-500">*</span>
                        </label>
                        <span className="text-[11px] text-blue-600 font-semibold">
                            {selectedDivisionIds.length} division(s) selected
                        </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto p-1.5 border border-neutral-200 rounded-lg bg-neutral-50/50">
                        {divisions.map((d) => {
                            const isSelected = selectedDivisionIds.includes(d.id);
                            return (
                                <button
                                    key={d.id}
                                    type="button"
                                    onClick={() => toggleDivisionId(d.id)}
                                    className={`px-2.5 py-1.5 rounded-lg border text-left flex items-center justify-between gap-1.5 transition-all text-[12px] ${
                                        isSelected
                                            ? "bg-blue-50 border-blue-400 text-blue-900 font-bold shadow-2xs"
                                            : "bg-white border-neutral-200 text-neutral-700 hover:border-neutral-300 font-medium"
                                    }`}
                                >
                                    <span className="truncate">{d.divisi}</span>
                                    <div
                                        className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 border ${
                                            isSelected
                                                ? "bg-blue-600 border-blue-600 text-white"
                                                : "border-neutral-300 bg-white"
                                        }`}
                                    >
                                        {isSelected && <Check size={10} strokeWidth={3} />}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Structural Task Weight */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <label className="block text-[12px] font-bold text-neutral-700">
                            Task Weight (%)
                        </label>
                        <span className="text-[10px] text-slate-500 font-semibold inline-flex items-center gap-0.5">
                            <Scale size={10} className="text-slate-500" />
                            WBS Weight
                        </span>
                    </div>
                    <div className="relative">
                        <input
                            type="number"
                            min="0"
                            max="100"
                            step="any"
                            value={weight}
                            onChange={(e) => setWeight(parseFloat(e.target.value) || 0)}
                            placeholder="100"
                            className="w-full pl-3 pr-8 py-2 rounded-lg border border-neutral-200 bg-white text-[13px] outline-none focus:border-brand font-semibold"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 font-bold text-[12px] pointer-events-none">
                            %
                        </span>
                    </div>
                    <span className="text-[10px] text-neutral-500 mt-1 block">
                        Structural weight in parent task (distinct from progress %).
                    </span>
                </div>

                {/* Duration and Start Date */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="block text-[12px] font-bold text-neutral-700">
                                Duration (Days) <span className="text-red-500">*</span>
                            </label>
                        </div>
                        <input
                            type="number"
                            min="1"
                            value={duration}
                            onChange={(e) => {
                                const rawVal = parseInt(e.target.value) || 0;
                                setDuration(Math.max(1, rawVal));
                                setActionError(null);
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white text-[13px] outline-none focus:border-brand font-semibold"
                            required
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="block text-[12px] font-bold text-neutral-700">
                                Start Date <span className="text-red-500">*</span>
                            </label>
                            {isFirstTask ? (
                                <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    First Task
                                </span>
                            ) : (
                                <span className="text-[10.5px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                    Locked
                                </span>
                            )}
                        </div>
                        <input
                            type="date"
                            value={currentStart}
                            min={minStart || undefined}
                            readOnly={!isFirstTask}
                            tabIndex={!isFirstTask ? -1 : 0}
                            onChange={(e) => {
                                if (isFirstTask) {
                                    let val = e.target.value;
                                    if (minStart && val < minStart) val = minStart;
                                    setManualStart(val);
                                    setActionError(null);
                                }
                            }}
                            className={`w-full px-3 py-2 rounded-lg border text-[13px] outline-none ${
                                !isFirstTask
                                    ? "bg-neutral-100 text-neutral-600 border-neutral-200 cursor-not-allowed select-none"
                                    : "border-neutral-200 text-neutral-900 focus:border-brand bg-white"
                            }`}
                            required
                        />
                    </div>
                </div>

                {/* Predecessor (Full Width) */}
                <div>
                    <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                        Predecessor (WBS Task / Sub-sub Task)
                    </label>

                    {/* Search Input */}
                    <div className="relative mb-2">
                        <Search
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                            size={14}
                        />
                        <input
                            type="text"
                            placeholder="Search predecessor by task code or name..."
                            value={searchDep}
                            onChange={(e) => setSearchDep(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-white border border-neutral-200 rounded-lg text-[12px] focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand"
                        />
                    </div>

                    <div className="max-h-[170px] overflow-y-auto border border-neutral-200 rounded-lg bg-white p-2 space-y-1 custom-scrollbar">
                        {(() => {
                            const availableTasks = allLeafTasks.filter(
                                (t) => String(t.id) !== String(initialData?.id),
                            );
                            const filteredTasks = availableTasks.filter((t) =>
                                (t.code + " " + t.name)
                                    .toLowerCase()
                                    .includes(searchDep.toLowerCase()),
                            );
                            const groupedTasks = filteredTasks.reduce(
                                (acc, t) => {
                                    const parts = t.code.split(".");
                                    const prefix =
                                        parts.length > 1
                                            ? parts
                                                  .slice(0, parts.length - 1)
                                                  .join(".")
                                            : t.code;
                                    if (!acc[prefix]) acc[prefix] = [];
                                    acc[prefix].push(t);
                                    return acc;
                                },
                                {} as Record<string, SubSubtask[]>,
                            );

                            return (
                                <>
                                    {/* Option None (Hanya untuk Task Pertama) */}
                                    {isFirstTask && (
                                        <label
                                            className={`flex items-start gap-2.5 px-2.5 py-2 hover:bg-neutral-50 rounded-lg cursor-pointer transition-colors border ${
                                                predecessorId === ""
                                                    ? "border-brand/30 bg-brand/5"
                                                    : "border-transparent"
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="task_predecessor"
                                                checked={predecessorId === ""}
                                                onChange={() => {
                                                    setPredecessorId("");
                                                    setLag(0);
                                                    setActionError(null);
                                                }}
                                                className="mt-0.5 text-brand focus:ring-brand rounded-full border-neutral-300 cursor-pointer"
                                            />
                                            <div className="flex flex-col flex-1 min-w-0">
                                                <span className="text-[12px] font-bold text-neutral-800">
                                                    None (No Predecessor)
                                                </span>
                                                <span className="text-[10.5px] text-neutral-400">
                                                    Task can start independently or follow project schedule
                                                </span>
                                            </div>
                                        </label>
                                    )}

                                    {Object.keys(groupedTasks).length === 0 &&
                                        searchDep !== "" && (
                                            <div className="text-[11.5px] text-neutral-500 italic text-center py-4">
                                                No tasks match your search "{searchDep}".
                                            </div>
                                        )}

                                    {Object.entries(groupedTasks).map(
                                        ([prefix, tasks]) => {
                                            const isExpanded =
                                                expandedGroups[prefix] ?? true;
                                            return (
                                                <div
                                                    key={prefix}
                                                    className="mb-2 last:mb-0"
                                                >
                                                    <div
                                                        onClick={() =>
                                                            setExpandedGroups(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    [prefix]:
                                                                        !isExpanded,
                                                                }),
                                                            )
                                                        }
                                                        className="flex items-center gap-2 px-2 py-1.5 bg-neutral-100 rounded-lg cursor-pointer hover:bg-neutral-200/60 transition-colors mb-1"
                                                    >
                                                        <ChevronRight
                                                            size={14}
                                                            className={`text-neutral-500 transition-transform ${
                                                                isExpanded
                                                                    ? "rotate-90"
                                                                    : ""
                                                            }`}
                                                        />
                                                        <span className="text-[11px] font-black text-neutral-700 uppercase tracking-wider">
                                                            WBS Group: {prefix} (
                                                            {tasks.length})
                                                        </span>
                                                    </div>
                                                    {isExpanded && (
                                                        <div className="space-y-1 pl-1 mt-1">
                                                            {tasks.map((t) => (
                                                                <label
                                                                    key={t.id}
                                                                    className={`flex items-start gap-2.5 px-2.5 py-2 hover:bg-neutral-50 rounded-lg cursor-pointer transition-colors border ${
                                                                        predecessorId ===
                                                                        String(t.id)
                                                                            ? "border-brand/30 bg-brand/5"
                                                                            : "border-transparent"
                                                                    }`}
                                                                >
                                                                    <input
                                                                        type="radio"
                                                                        name="task_predecessor"
                                                                        checked={
                                                                            predecessorId ===
                                                                            String(t.id)
                                                                        }
                                                                        onChange={() => {
                                                                            setPredecessorId(
                                                                                String(t.id),
                                                                            );
                                                                            setLag(0);
                                                                            setActionError(null);
                                                                        }}
                                                                        className="mt-0.5 text-brand focus:ring-brand rounded-full border-neutral-300 cursor-pointer"
                                                                    />
                                                                    <div className="flex flex-col flex-1 min-w-0">
                                                                        <span className="text-[12px] font-bold text-neutral-800 line-clamp-1">
                                                                            {t.code} -{" "}
                                                                            {t.name}
                                                                        </span>
                                                                        <span className="text-[10.5px] text-neutral-500">
                                                                            {t.startDate || t.start
                                                                                ? formatDateDisplay(
                                                                                      (t.startDate || t.start)!,
                                                                                  )
                                                                                : "-"}{" "}
                                                                            to{" "}
                                                                            {t.finishDate || t.end
                                                                                ? formatDateDisplay(
                                                                                      (t.finishDate || t.end)!,
                                                                                  )
                                                                                : "-"}
                                                                        </span>
                                                                    </div>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        },
                                    )}
                                </>
                            );
                        })()}
                    </div>
                </div>

                {/* Dependency Type (Full Width) */}
                <div>
                    <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                        Dependency Type
                    </label>
                    <select
                        value={depType}
                        onChange={(e) => {
                            setDepType(
                                e.target.value as "FS" | "SS" | "FF" | "SF",
                            );
                            setActionError(null);
                        }}
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
                        <div className="flex items-center justify-between mb-1">
                            <label className="block text-[12px] font-bold text-neutral-700">
                                Lag (Days)
                            </label>
                            {maxAllowedLag !== undefined && (
                                <span className="text-[10.5px] text-neutral-400 font-medium">
                                    Max: {maxAllowedLag} days
                                </span>
                            )}
                        </div>
                        <input
                            type="number"
                            min="0"
                            max={maxAllowedLag}
                            value={lag > 0 ? lag : ""}
                            onChange={(e) => {
                                const raw = Math.abs(parseInt(e.target.value) || 0);
                                const clamped =
                                    maxAllowedLag !== undefined
                                        ? Math.min(raw, maxAllowedLag)
                                        : raw;
                                setLag(clamped);
                                setActionError(null);
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] font-bold outline-none focus:border-brand bg-white"
                            placeholder="0"
                        />
                        <span className="text-[10px] text-neutral-500 mt-0.5 block">
                            Delay time. {maxAllowedLag !== undefined && maxAllowedLag === 0 ? "Main Task end deadline reached." : ""}
                        </span>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="block text-[12px] font-bold text-neutral-700">
                                Lead (Days)
                            </label>
                            {maxAllowedLead !== undefined && (
                                <span className="text-[10.5px] text-neutral-400 font-medium">
                                    Max: {maxAllowedLead} days
                                </span>
                            )}
                        </div>
                        <input
                            type="number"
                            min="0"
                            max={maxAllowedLead}
                            value={lag < 0 ? Math.abs(lag) : ""}
                            onChange={(e) => {
                                const raw = Math.abs(parseInt(e.target.value) || 0);
                                const clamped =
                                    maxAllowedLead !== undefined
                                        ? Math.min(raw, maxAllowedLead)
                                        : raw;
                                setLag(-clamped);
                                setActionError(null);
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] font-bold outline-none focus:border-brand bg-white"
                            placeholder="0"
                        />
                        <span className="text-[10px] text-neutral-500 mt-0.5 block">
                            Start earlier (lead time). {maxAllowedLead !== undefined && maxAllowedLead === 0 ? "Project/Main Task start bound reached." : ""}
                        </span>
                    </div>
                </div>

                {/* Evidence Requirement */}
                <div className="pt-2 border-t border-neutral-100">
                    <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 transition-colors">
                        <input
                            type="checkbox"
                            checked={requiresEvidence}
                            onChange={(e) => setRequiresEvidence(e.target.checked)}
                            className="w-4 h-4 rounded text-brand border-neutral-300 focus:ring-brand"
                        />
                        <div className="flex flex-col">
                            <span className="text-[13px] font-bold text-neutral-800">
                                Requires Evidence for Completion
                            </span>
                            <span className="text-[11.5px] text-neutral-500">
                                Workers must upload a file/photo to mark this task 100% complete.
                            </span>
                        </div>
                    </label>
                </div>

                {/* Preview Banner */}
                {currentStart && previewEnd && (
                    <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex flex-col gap-1 text-[11.5px]">
                        <div className="flex items-center justify-between text-neutral-700">
                            <span>Calculated Finish Date:</span>
                            <strong className="text-neutral-900 font-bold">
                                {formatDateDisplay(previewEnd)}
                            </strong>
                        </div>
                        {maxEnd && (
                            <div className="flex items-center justify-between text-amber-900 pt-1 border-t border-neutral-200/60">
                                <span className="flex items-center gap-1 font-medium">
                                    <Lock size={11} className="text-amber-700" />
                                    Main Task Deadline:
                                </span>
                                <strong className="font-bold text-amber-900">
                                    {formatDateDisplay(maxEnd)}
                                </strong>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-4 border-t border-neutral-100">
                    <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        type="submit"
                        disabled={submitting || !name.trim()}
                    >
                        {submitting
                            ? "Saving..."
                            : isEdit
                              ? "Update Task"
                              : "Save Task"}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

function ManageDependenciesModal({
    isOpen,
    task,
    allSubtasks,
    depForm,
    setDepForm,
    onClose,
    onAddDependency,
    onRemoveDependency,
    submitting,
    actionError,
}: {
    isOpen: boolean;
    task?: SubSubtask;
    allSubtasks: SubSubtask[];
    depForm: any;
    setDepForm: (val: any) => void;
    onClose: () => void;
    onAddDependency: (e: React.FormEvent) => void;
    onRemoveDependency: (depId: number) => void;
    submitting: boolean;
    actionError: string;
}) {
    const [searchDep, setSearchDep] = useState("");
    const [expandedGroups, setExpandedGroups] = useState<
        Record<string, boolean>
    >({});

    if (!isOpen || !task) return null;

    const dependencyGroups = (task.dependencies ?? []).reduce(
        (groups, dependency) => {
            const key =
                dependency.dependency_group_id ?? `dependency-${dependency.id}`;
            const group = groups.get(key) ?? [];
            group.push(dependency);
            groups.set(key, group);
            return groups;
        },
        new Map<number | string, NonNullable<typeof task.dependencies>>(),
    );

    const availableTasks = allSubtasks
        .filter((t) => t.id !== task.id)
        .filter(
            (t) =>
                !task.dependencies?.some(
                    (dep) => String(dep.predecessor_wbs_id) === String(t.id),
                ),
        );

    const filteredTasks = availableTasks.filter((t) =>
        (t.code + " " + t.name).toLowerCase().includes(searchDep.toLowerCase()),
    );

    const groupedAvailableTasks = filteredTasks.reduce(
        (acc, t) => {
            const parts = t.code.split(".");
            const prefix =
                parts.length > 1
                    ? parts.slice(0, parts.length - 1).join(".")
                    : t.code;
            if (!acc[prefix]) acc[prefix] = [];
            acc[prefix].push(t);
            return acc;
        },
        {} as Record<string, SubSubtask[]>,
    );

    return (
        <Modal
            title={`Manage Dependencies: ${task.name}`}
            onClose={onClose}
            size="lg"
        >
            <div className="space-y-5">
                {/* Task Info Header */}
                <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 text-[12.5px] flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <span className="text-neutral-500 font-medium">
                            Task ID / Code:
                        </span>{" "}
                        <strong className="font-mono text-neutral-900">
                            {task.code}
                        </strong>
                    </div>
                    <div>
                        <span className="text-neutral-500 font-medium">
                            Jadwal:
                        </span>{" "}
                        <strong>
                            {task.startDate
                                ? formatDateDisplay(task.startDate)
                                : "-"}{" "}
                            →{" "}
                            {task.finishDate
                                ? formatDateDisplay(task.finishDate)
                                : "-"}
                        </strong>
                    </div>
                    <div>
                        <span className="text-neutral-500 font-medium">
                            Duration:
                        </span>{" "}
                        <strong>{task.duration} days</strong>
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
                        Connected Predecessors ({task.dependencies?.length || 0})
                    </h4>

                    {!task.dependencies || task.dependencies.length === 0 ? (
                        <div className="p-4 text-center rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-500 text-[12.5px] italic">
                            No predecessors connected to this task yet.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {[...dependencyGroups.entries()].map(
                                ([groupId, dependencies]) => {
                                    const type =
                                        dependencies[0].dependency_type;
                                    const typeDescription = {
                                        FS: "Finish-to-Start (Task starts after predecessor finishes)",
                                        SS: "Start-to-Start (Task starts after predecessor starts)",
                                        FF: "Finish-to-Finish (Task finishes after predecessor finishes)",
                                        SF: "Start-to-Finish (Task finishes after predecessor starts)",
                                    }[type];

                                    return (
                                        <div
                                            key={groupId}
                                            className="p-3 rounded-xl bg-white border border-neutral-200 shadow-2xs"
                                        >
                                            <div className="mb-2 flex items-center gap-2">
                                                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-black bg-indigo-100 text-indigo-800">
                                                    {type}
                                                </span>
                                                <span className="text-[11.5px] text-neutral-500">
                                                    {dependencies.length > 1
                                                        ? `All ${dependencies.length} predecessors must be satisfied`
                                                        : typeDescription}
                                                </span>
                                            </div>
                                            <div className="space-y-1.5">
                                                {dependencies.map((dep) => (
                                                    <div
                                                        key={dep.id}
                                                        className="flex items-center justify-between gap-3"
                                                    >
                                                        <div>
                                                            <strong className="text-[13px] text-neutral-900">
                                                                {
                                                                    dep.predecessor_name
                                                                }
                                                            </strong>
                                                            {dep.lag_days !==
                                                                0 && (
                                                                <span className="ml-2 text-[11px] text-neutral-500">
                                                                    Lag:{" "}
                                                                    {dep.lag_days >
                                                                    0
                                                                        ? `+${dep.lag_days}`
                                                                        : dep.lag_days}{" "}
                                                                    days
                                                                </span>
                                                            )}
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                onRemoveDependency(
                                                                    dep.id,
                                                                )
                                                            }
                                                            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                            title="Remove Dependency"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                },
                            )}
                        </div>
                    )}
                </div>

                {/* Add New Dependency Form */}
                <form
                    onSubmit={onAddDependency}
                    className="p-4 rounded-xl bg-neutral-50/80 border border-neutral-200 space-y-3"
                >
                    <h5 className="text-[12.5px] font-bold text-neutral-900">
                        + Add New Dependency
                    </h5>

                    <div>
                        <label className="block text-[11.5px] font-bold text-neutral-700 mb-1">
                            Select Predecessor Task(s){" "}
                            <span className="text-red-500">*</span>
                        </label>

                        {/* Search Input */}
                        <div className="relative mb-2">
                            <Search
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                                size={14}
                            />
                            <input
                                type="text"
                                placeholder="Search by task code or name..."
                                value={searchDep}
                                onChange={(e) => setSearchDep(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 bg-white border border-neutral-200 rounded-lg text-[12px] focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand"
                            />
                        </div>

                        <div className="max-h-[220px] overflow-y-auto border border-neutral-200 rounded-lg bg-white p-2 space-y-1 custom-scrollbar">
                            {Object.keys(groupedAvailableTasks).length === 0 ? (
                                <div className="text-[11.5px] text-neutral-500 italic text-center py-4">
                                    No tasks available or matching the search.
                                </div>
                            ) : (
                                Object.entries(groupedAvailableTasks).map(
                                    ([prefix, tasks]) => {
                                        const isExpanded =
                                            expandedGroups[prefix] ?? true; // expanded by default

                                        return (
                                            <div
                                                key={prefix}
                                                className="mb-2 last:mb-0"
                                            >
                                                {/* Group Header */}
                                                <div
                                                    onClick={() =>
                                                        setExpandedGroups(
                                                            (prev) => ({
                                                                ...prev,
                                                                [prefix]:
                                                                    !isExpanded,
                                                            }),
                                                        )
                                                    }
                                                    className="flex items-center gap-2 px-2 py-1.5 bg-neutral-100 rounded-lg cursor-pointer hover:bg-neutral-200/60 transition-colors mb-1"
                                                >
                                                    <ChevronRight
                                                        size={14}
                                                        className={`text-neutral-500 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                                    />
                                                    <span className="text-[11px] font-black text-neutral-700 uppercase tracking-wider">
                                                        WBS Group: {prefix} (
                                                        {tasks.length})
                                                    </span>
                                                </div>

                                                {/* Group Items */}
                                                {isExpanded && (
                                                    <div className="space-y-1 pl-1">
                                                        {tasks.map((t) => (
                                                            <label
                                                                key={t.id}
                                                                className={`flex items-start gap-2.5 px-2.5 py-2 hover:bg-neutral-50 rounded-lg cursor-pointer transition-colors border ${depForm.predecessor_wbs_ids.includes(t.id) ? "border-brand/30 bg-brand/5" : "border-transparent"}`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={depForm.predecessor_wbs_ids.includes(
                                                                        t.id,
                                                                    )}
                                                                    onChange={(
                                                                        e,
                                                                    ) => {
                                                                        const newIds =
                                                                            e
                                                                                .target
                                                                                .checked
                                                                                ? [
                                                                                      ...depForm.predecessor_wbs_ids,
                                                                                      t.id,
                                                                                  ]
                                                                                : depForm.predecessor_wbs_ids.filter(
                                                                                      (
                                                                                          id: any,
                                                                                      ) =>
                                                                                          id !==
                                                                                          t.id,
                                                                                  );
                                                                        setDepForm(
                                                                            {
                                                                                ...depForm,
                                                                                predecessor_wbs_ids:
                                                                                    newIds,
                                                                            },
                                                                        );
                                                                    }}
                                                                    className="mt-0.5 text-brand focus:ring-brand rounded border-neutral-300 cursor-pointer"
                                                                />
                                                                <div className="flex flex-col flex-1 min-w-0">
                                                                    <span className="text-[12px] font-bold text-neutral-800 line-clamp-1">
                                                                        {t.code}{" "}
                                                                        -{" "}
                                                                        {t.name}
                                                                    </span>
                                                                    <span className="text-[10.5px] text-neutral-500">
                                                                        {t.startDate
                                                                            ? formatDateDisplay(
                                                                                  t.startDate,
                                                                              )
                                                                            : "-"}{" "}
                                                                        to{" "}
                                                                        {t.finishDate
                                                                            ? formatDateDisplay(
                                                                                  t.finishDate,
                                                                              )
                                                                            : "-"}
                                                                    </span>
                                                                </div>
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    },
                                )
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-[11.5px] font-bold text-neutral-700">
                                    Dependency Type{" "}
                                    <span className="text-red-500">*</span>
                                </label>
                                <div className="relative group">
                                    <Info
                                        size={14}
                                        className="text-brand cursor-help"
                                    />
                                    <div className="pointer-events-none absolute bottom-full right-[-10px] mb-2 w-[280px] opacity-0 group-hover:opacity-100 transition-opacity z-10 p-3 bg-neutral-800 text-white text-[11px] rounded-xl shadow-xl leading-relaxed">
                                        <div className="font-bold text-[12px] mb-2 border-b border-neutral-600 pb-1">
                                            Dependency Guide
                                        </div>
                                        <ul className="space-y-2">
                                            <li>
                                                <strong className="text-emerald-400">
                                                    FS (Finish-to-Start):
                                                </strong>{" "}
                                                Task B starts after Task A
                                                finishes.
                                            </li>
                                            <li>
                                                <strong className="text-blue-400">
                                                    SS (Start-to-Start):
                                                </strong>{" "}
                                                Task B starts along with Task A.
                                            </li>
                                            <li>
                                                <strong className="text-purple-400">
                                                    FF (Finish-to-Finish):
                                                </strong>{" "}
                                                Task B finishes along with Task
                                                A.
                                            </li>
                                            <li>
                                                <strong className="text-orange-400">
                                                    SF (Start-to-Finish):
                                                </strong>{" "}
                                                Task B finishes after Task A
                                                starts.
                                            </li>
                                        </ul>
                                        <div className="mt-2 pt-2 border-t border-neutral-600">
                                            <strong className="text-yellow-400">
                                                Lag / Lead:
                                            </strong>{" "}
                                            Wait time (days).
                                            <br />
                                            <span className="text-neutral-400 text-[10px]">
                                                Positive (+) = delay start,
                                                Negative (-) = start earlier (lead).
                                            </span>
                                        </div>
                                        <div className="absolute top-full right-3 border-4 border-transparent border-t-neutral-800" />
                                    </div>
                                </div>
                            </div>
                            <select
                                value={depForm.dependency_type}
                                onChange={(e) =>
                                    setDepForm({
                                        ...depForm,
                                        dependency_type: e.target.value as any,
                                    })
                                }
                                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white font-semibold"
                            >
                                <option value="FS">
                                    FS: Finish-to-Start (Standard)
                                </option>
                                <option value="SS">SS: Start-to-Start</option>
                                <option value="FF">FF: Finish-to-Finish</option>
                                <option value="SF">SF: Start-to-Finish</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11.5px] font-bold text-neutral-700 mb-1">
                                Lag (Days)
                            </label>
                            <input
                                type="number"
                                value={depForm.lag_days}
                                onChange={(e) =>
                                    setDepForm({
                                        ...depForm,
                                        lag_days: parseInt(e.target.value) || 0,
                                    })
                                }
                                placeholder="0"
                                className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
                            />
                            <span className="text-[10.5px] text-neutral-500 mt-0.5 block">
                                Positive value (+) = lag days, negative (-) =
                                acceleration (lead time).
                            </span>
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button
                            variant="primary"
                            size="sm"
                            type="submit"
                            disabled={
                                submitting ||
                                depForm.predecessor_wbs_ids.length === 0
                            }
                            icon={Link2}
                        >
                            {submitting
                                ? "Connecting..."
                                : "Connect Predecessor"}
                        </Button>
                    </div>
                </form>
            </div>
        </Modal>
    );
}
