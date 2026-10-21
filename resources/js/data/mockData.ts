export type Status = 'Open' | 'On Track' | 'At Risk' | 'Delayed' | 'Cancelled' | 'Completed';
export type Role = 'Admin' | 'PIC';
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export interface EvidenceItem {
  id?: string;
  name: string;
  size?: string;
  type?: string;
  previewUrl?: string;
  url?: string;
}

export interface DependencyItem {
  id: number;
  dependency_group_id?: number | null;
  predecessor_wbs_id: string;
  predecessor_name: string;
  dependency_type: 'FS' | 'SS' | 'FF' | 'SF';
  lag_days: number;
}

export interface SubSubtask {
  id: string;
  dbId?: number;
  code: string;
  name: string;
  startDate: string;
  finishDate: string;
  start?: string;
  end?: string;
  duration: number;
  daysLeft: number;
  progress: number;
  status: Status;
  division?: string;
  divisionId?: number;
  predecessor?: string;
  predecessors?: any[];
  depType?: DependencyType;
  lag?: number;
  lead?: number;
  dependencies?: DependencyItem[];
  evidences?: EvidenceItem[];
  evidence?: any;
  prevProgress?: number;
  weight: number;
  checked: boolean;
  requiresEvidence?: boolean;
  requires_evidence?: boolean;
  completedByName?: string | null;
  completedAt?: string | null;
}

export interface SubMainJob {
  id: string;
  dbId?: number;
  code: string;
  name: string;
  pic: string;
  startDate: string;
  finishDate: string;
  endDate?: string;
  start?: string;
  end?: string;
  progress: number;
  status: Status;
  weight: number;
  subtasks: SubSubtask[];
}

export interface MainJob {
  id: string;
  dbId?: number;
  code: string;
  name: string;
  weight: number;
  startDate: string;
  finishDate: string;
  start?: string;
  end?: string;
  progress: number;
  status: Status;
  subMainJobs: SubMainJob[];
}

export interface WeekData {
  week: number;
  startDate: string;
  endDate: string;
  planned: number;
  actual: number;
  plannedCumulative: number;
  actualCumulative: number;
}

export interface BudgetEntry {
  id: string;
  tanggal: string;
  codeSubWbs: string;
  subTaskWbs: string;
  kategori: string;
  lokasi: string;
  namaItem: string;
  spesifikasi: string;
  qty: number;
  satuan: string;
  hargaSatuan: number;
  hargaTotal: number;
  referensi: string;
  keterangan: string;
}

export interface Project {
  id: string;
  name: string;
  company: string;
  projectManager: string;
  startDate: string;
  endDate: string;
  start?: string;
  end?: string;
  status: Status;
  overallProgress: number;
  hariKe: number;
  sisaHari: number;
  totalBudget: number;
  usedBudget: number;
  mainJobs: MainJob[];
  weeklyData: WeekData[];
  budgetEntries: BudgetEntry[];
  activityLogs?: any[];
}

/**
 * Default empty project object to prevent mock data injection.
 * Persisted server/database data is the sole source of truth.
 */
export const PROJECT: Project = {
  id: '',
  name: '',
  company: '',
  projectManager: '',
  startDate: '',
  endDate: '',
  status: 'Open',
  overallProgress: 0,
  hariKe: 0,
  sisaHari: 0,
  totalBudget: 0,
  usedBudget: 0,
  mainJobs: [],
  weeklyData: [],
  budgetEntries: [],
};

/**
 * Scales all tasks, sub-tasks, and main jobs in a project template so that
 * they strictly follow the given project start and end dates.
 */
export function scaleProjectTemplateDates(project: Project, targetStartDate?: string, targetEndDate?: string): Project {
  if (!targetStartDate || !targetEndDate) return project;
  const clone: Project = JSON.parse(JSON.stringify(project));
  clone.startDate = targetStartDate;
  clone.endDate = targetEndDate;

  const tStart = new Date(targetStartDate).getTime();
  const tEnd = new Date(targetEndDate).getTime();
  if (isNaN(tStart) || isNaN(tEnd) || tEnd <= tStart) return project;

  const origStart = new Date(project.startDate || '2024-01-15').getTime();
  const origEnd = new Date(project.endDate || '2026-12-31').getTime();
  const origSpan = Math.max(1, origEnd - origStart);
  const targetSpan = tEnd - tStart;

  const scaleDateStr = (dateStr?: string): string => {
    if (!dateStr) return '';
    const dMs = new Date(dateStr).getTime();
    if (isNaN(dMs)) return dateStr;
    const ratio = Math.max(0, Math.min(1, (dMs - origStart) / origSpan));
    const newMs = tStart + ratio * targetSpan;
    return new Date(newMs).toISOString().slice(0, 10);
  };

  clone.mainJobs?.forEach(mj => {
    mj.startDate = scaleDateStr(mj.startDate);
    mj.finishDate = scaleDateStr(mj.finishDate);
    mj.subMainJobs?.forEach(smj => {
      smj.startDate = scaleDateStr(smj.startDate);
      smj.finishDate = scaleDateStr(smj.finishDate);
      smj.subtasks?.forEach(st => {
        st.startDate = scaleDateStr(st.startDate);
        st.finishDate = scaleDateStr(st.finishDate);
        if (st.startDate && st.finishDate) {
          const s = new Date(st.startDate).getTime();
          const f = new Date(st.finishDate).getTime();
          st.duration = Math.max(1, Math.round((f - s) / (1000 * 60 * 60 * 24)) + 1);
        }
      });
    });
  });

  return clone;
}
