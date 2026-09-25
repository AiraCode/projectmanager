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

export interface SubSubtask {
  id: string;
  code: string;
  name: string;
  startDate: string;
  finishDate: string;
  duration: number;
  daysLeft: number;
  progress: number;
  status: Status;
  division?: string;
  predecessor?: string;
  depType?: DependencyType;
  lag?: number;
  lead?: number;
  evidences?: EvidenceItem[];
  evidences?: EvidenceItem[];
  prevProgress?: number;
  weight: number;
  checked: boolean;
  requiresEvidence?: boolean;
}

export interface SubMainJob {
  id: string;
  code: string;
  name: string;
  pic: string;
  startDate: string;
  finishDate: string;
  progress: number;
  status: Status;
  weight: number;
  subtasks: SubSubtask[];
}

export interface MainJob {
  id: string;
  code: string;
  name: string;
  weight: number;
  startDate: string;
  finishDate: string;
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
  status: Status;
  overallProgress: number;
  hariKe: number;
  sisaHari: number;
  totalBudget: number;
  usedBudget: number;
  mainJobs: MainJob[];
  weeklyData: WeekData[];
  budgetEntries: BudgetEntry[];
}

export const PROJECT: Project = {
  id: 'proj-001',
  name: 'Pembangunan Pabrik Baru Tahap II',
  company: 'PT Indoprima Gemilang',
  projectManager: 'Budi Santoso',
  startDate: '2024-01-15',
  endDate: '2026-12-31',
  status: 'On Track',
  overallProgress: 78,
  hariKe: 975,
  sisaHari: 105,
  totalBudget: 45_000_000_000,
  usedBudget: 34_560_000_000,
  weeklyData: generateWeeklyData(),
  budgetEntries: generateBudgetEntries(),
  mainJobs: [
    {
      id: 'mj-01',
      code: '1',
      name: 'BUSINESS DEVELOPMENT (PROJECT DOCUMENT PREPARATION)',
      weight: 3,
      startDate: '2024-01-15',
      finishDate: '2024-06-30',
      progress: 100,
      status: 'Completed',
      subMainJobs: [
        { id: 'smj-1-1', code: '1.1', name: 'BUSINESS DEVELOPMENT PROPOSAL', pic: 'BUSDEV', startDate: '2024-01-15', finishDate: '2024-02-15', progress: 100, status: 'Completed', weight: 0.3,
          subtasks: [
            { id: 'st-1-1-1', code: '1.1.1', name: 'Prepare proposal document', startDate: '2024-01-15', finishDate: '2024-01-31', duration: 16, daysLeft: 0, progress: 100, status: 'Completed', weight: 0.1, checked: true },
            { id: 'st-1-1-2', code: '1.1.2', name: 'Internal review & approval', startDate: '2024-02-01', finishDate: '2024-02-10', duration: 9, daysLeft: 0, progress: 100, status: 'Completed', predecessor: '1.1.1', depType: 'FS', lag: 0, weight: 0.1, checked: true },
            { id: 'st-1-1-3', code: '1.1.3', name: 'Final submission to partner', startDate: '2024-02-11', finishDate: '2024-02-15', duration: 4, daysLeft: 0, progress: 100, status: 'Completed', predecessor: '1.1.2', depType: 'FS', lag: 0, weight: 0.1, checked: true },
          ]
        },
        { id: 'smj-1-2', code: '1.2', name: 'MOU SIGNING', pic: 'BUSDEV', startDate: '2024-02-16', finishDate: '2024-03-15', progress: 100, status: 'Completed', weight: 0.25, subtasks: [] },
        { id: 'smj-1-3', code: '1.3', name: 'JOIN VENTURE AGREEMENT', pic: 'Legal', startDate: '2024-03-16', finishDate: '2024-04-30', progress: 100, status: 'Completed', weight: 0.3, subtasks: [] },
        { id: 'smj-1-4', code: '1.4', name: 'KYBP', pic: 'BUSDEV', startDate: '2024-04-01', finishDate: '2024-04-30', progress: 100, status: 'Completed', weight: 0.2, subtasks: [] },
        { id: 'smj-1-5', code: '1.5', name: 'PROJECT MASTER SCHEDULE', pic: 'PM', startDate: '2024-04-15', finishDate: '2024-05-15', progress: 100, status: 'Completed', weight: 0.2, subtasks: [] },
        { id: 'smj-1-6', code: '1.6', name: 'OPEX & BUDGET', pic: 'Finance', startDate: '2024-04-15', finishDate: '2024-05-31', progress: 100, status: 'Completed', weight: 0.3, subtasks: [] },
        { id: 'smj-1-7', code: '1.7', name: 'FEASIBILITY STUDY', pic: 'BUSDEV', startDate: '2024-03-01', finishDate: '2024-05-31', progress: 100, status: 'Completed', weight: 0.4,
          subtasks: [
            {
              id: 'st-1-7-1',
              code: '1.7.1',
              name: 'Environmental & Safety Feasibility Audit',
              startDate: '2024-03-18',
              finishDate: '2024-03-22',
              duration: 5,
              daysLeft: 0,
              progress: 100,
              status: 'Completed',
              division: 'SHE',
              weight: 0.2,
              checked: true,
              evidence: {
                name: 'safety-inspection-1.jpg',
                size: '2.1 MB',
                type: 'image/jpeg',
                previewUrl: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80',
              },
              evidences: [
                {
                  id: 'ev-10-1',
                  name: 'safety-inspection-1.jpg',
                  size: '2.1 MB',
                  type: 'image/jpeg',
                  previewUrl: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80',
                },
                {
                  id: 'ev-10-2',
                  name: 'safety-inspection-2.jpg',
                  size: '1.9 MB',
                  type: 'image/jpeg',
                  previewUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80',
                },
                {
                  id: 'ev-10-3',
                  name: 'environmental-clearance.pdf',
                  size: '1.2 MB',
                  type: 'application/pdf',
                }
              ]
            }
          ]
        },
        { id: 'smj-1-8', code: '1.8', name: 'MMNR EXECUTIVE APPROVAL', pic: 'PM', startDate: '2024-05-15', finishDate: '2024-06-15', progress: 100, status: 'Completed', weight: 0.2, subtasks: [] },
        { id: 'smj-1-9', code: '1.9', name: 'MACOM APPROVAL', pic: 'PM', startDate: '2024-06-01', finishDate: '2024-06-20', progress: 100, status: 'Completed', weight: 0.2, subtasks: [] },
        { id: 'smj-1-10', code: '1.10', name: 'SIGNING WITH PARTNER', pic: 'Legal', startDate: '2024-06-15', finishDate: '2024-06-30', progress: 100, status: 'Completed', weight: 0.2, subtasks: [] },
        { id: 'smj-1-11', code: '1.11', name: 'LOA OF BUSDEV PROJECT', pic: 'BUSDEV', startDate: '2024-06-20', finishDate: '2024-06-30', progress: 100, status: 'Completed', weight: 0.15, subtasks: [] },
        { id: 'smj-1-12', code: '1.12', name: 'CAPITAL INJECTION', pic: 'Finance', startDate: '2024-06-15', finishDate: '2024-06-30', progress: 100, status: 'Completed', weight: 0.2, subtasks: [] },
      ],
    },
    {
      id: 'mj-02',
      code: '2',
      name: 'FACTORY LAYOUT & PROCESS DESIGN',
      weight: 5,
      startDate: '2024-02-01',
      finishDate: '2024-08-31',
      progress: 100,
      status: 'Completed',
      subMainJobs: [
        { id: 'smj-2-1', code: '2.1', name: 'FACTORY & LAND LAYOUT', pic: 'Engineering', startDate: '2024-02-01', finishDate: '2024-04-30', progress: 100, status: 'Completed', weight: 1.5, subtasks: [] },
        { id: 'smj-2-2', code: '2.2', name: 'PROCESS DESIGN', pic: 'Engineering', startDate: '2024-03-01', finishDate: '2024-06-30', progress: 100, status: 'Completed', weight: 1.5, subtasks: [] },
        { id: 'smj-2-3', code: '2.3', name: 'FACTORY BUILDING DESIGN', pic: 'Engineering', startDate: '2024-04-01', finishDate: '2024-07-31', progress: 100, status: 'Completed', weight: 1.5, subtasks: [] },
        { id: 'smj-2-4', code: '2.4', name: 'FACTORY PROJECT RAB & SCHEDULE', pic: 'PM', startDate: '2024-07-01', finishDate: '2024-08-31', progress: 100, status: 'Completed', weight: 0.5, subtasks: [] },
      ],
    },
    {
      id: 'mj-03',
      code: '3',
      name: 'CIVIL WORKS',
      weight: 18,
      startDate: '2024-06-01',
      finishDate: '2025-12-31',
      progress: 100,
      status: 'Completed',
      subMainJobs: [
        {
          id: 'smj-3-1',
          code: '3.1',
          name: 'CIVIL WORKS DESIGN, SPEC & RAB',
          pic: 'Civil',
          startDate: '2024-06-01',
          finishDate: '2024-08-31',
          progress: 100,
          status: 'Completed',
          weight: 2,
          subtasks: [
            {
              id: 'st-3-1-1',
              code: '3.1.1',
              name: 'Site Soil Investigation & Topography Survey',
              startDate: '2024-03-04',
              finishDate: '2024-03-08',
              duration: 5,
              daysLeft: 0,
              progress: 100,
              status: 'Completed',
              division: 'Civil',
              weight: 0.5,
              checked: true,
              evidence: {
                id: 'ev-w8-1',
                name: 'IMG_001.jpg',
                size: '2.4 MB',
                type: 'image/jpeg',
                previewUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb18f15f7?auto=format&fit=crop&w=600&q=80',
              },
            },
          ]
        },
        { id: 'smj-3-2', code: '3.2', name: 'CIVIL PROJECT SCHEDULE', pic: 'PM', startDate: '2024-07-01', finishDate: '2024-08-31', progress: 100, status: 'Completed', weight: 1, subtasks: [] },
        { id: 'smj-3-3', code: '3.3', name: 'FOUNDATION CONSTRUCTION', pic: 'Engineering', startDate: '2024-08-01', finishDate: '2025-03-31', progress: 100, status: 'Completed', weight: 6, subtasks: [] },
        { id: 'smj-3-4', code: '3.4', name: 'STEEL STRUCTURE CONSTRUCTION', pic: 'Engineering', startDate: '2024-12-01', finishDate: '2025-09-30', progress: 100, status: 'Completed', weight: 7, subtasks: [] },
        { id: 'smj-3-5', code: '3.5', name: 'FINISHING WORKS', pic: 'Civil', startDate: '2025-08-01', finishDate: '2026-10-31', progress: 45, status: 'On Track', weight: 2,
          subtasks: [
            { id: 'st-3-5-1', code: '3.5.1', name: 'Site perimeter asphalt & drainage paving', startDate: '2026-09-15', finishDate: '2026-09-28', duration: 13, daysLeft: 4, progress: 65, status: 'On Track', division: 'Civil Works', weight: 0.6, checked: false },
            { id: 'st-3-5-2', code: '3.5.2', name: 'Main building facade weatherproofing', startDate: '2026-09-20', finishDate: '2026-09-27', duration: 7, daysLeft: 3, progress: 40, status: 'On Track', division: 'Civil Works', weight: 0.6, checked: false },
            { id: 'st-3-5-3', code: '3.5.3', name: 'Heavy machinery floor epoxy finishing', startDate: '2026-09-22', finishDate: '2026-09-29', duration: 7, daysLeft: 5, progress: 30, status: 'On Track', division: 'Civil Works', weight: 0.8, checked: false },
          ]
        },
      ],
    },
    {
      id: 'mj-04',
      code: '4',
      name: 'PRODUCTION MACHINE & INSTALLATION',
      weight: 20,
      startDate: '2024-09-01',
      finishDate: '2026-09-30',
      progress: 85,
      status: 'On Track',
      subMainJobs: [
        { id: 'smj-4-1', code: '4.1', name: 'PRODUCTION MACHINE PROCUREMENT', pic: 'Production', startDate: '2024-09-01', finishDate: '2025-03-31', progress: 100, status: 'Completed', weight: 4,
          subtasks: [
            {
              id: 'st-4-1-0',
              code: '4.1.0',
              name: 'Production Machinery Technical Inspection',
              startDate: '2024-03-11',
              finishDate: '2024-03-15',
              duration: 5,
              daysLeft: 0,
              progress: 100,
              status: 'Completed',
              division: 'Production',
              weight: 0.5,
              checked: true,
              evidence: {
                id: 'ev-w9-1',
                name: 'inspection-report.pdf',
                size: '1.8 MB',
                type: 'application/pdf',
              },
            },
            { id: 'st-4-1-1', code: '4.1.1', name: 'Vendor selection & evaluation', startDate: '2024-09-01', finishDate: '2024-10-31', duration: 60, daysLeft: 0, progress: 100, status: 'Completed', weight: 1, checked: true },
            { id: 'st-4-1-2', code: '4.1.2', name: 'Purchase order finalization', startDate: '2024-11-01', finishDate: '2024-12-31', duration: 60, daysLeft: 0, progress: 100, status: 'Completed', predecessor: '4.1.1', depType: 'FS', lag: 0, weight: 1.5, checked: true },
            { id: 'st-4-1-3', code: '4.1.3', name: 'Advance payment processing', startDate: '2024-12-15', finishDate: '2025-01-31', duration: 47, daysLeft: 0, progress: 100, status: 'Completed', predecessor: '4.1.2', depType: 'SS', lag: 14, weight: 1.5, checked: true },
          ]
        },
        { id: 'smj-4-2', code: '4.2', name: 'PRODUCTION MACHINE MANUFACTURING', pic: 'Engineering', startDate: '2025-01-01', finishDate: '2025-12-31', progress: 100, status: 'Completed', weight: 5, subtasks: [] },
        { id: 'smj-4-3', code: '4.3', name: 'PRODUCTION MACHINE SHIPPING', pic: 'Procurement', startDate: '2026-01-01', finishDate: '2026-04-30', progress: 100, status: 'Completed', weight: 4, subtasks: [] },
        { id: 'smj-4-4', code: '4.4', name: 'ETA & FACTORY ARRIVAL', pic: 'Procurement', startDate: '2026-04-15', finishDate: '2026-06-30', progress: 100, status: 'Completed', weight: 2, subtasks: [] },
        { id: 'smj-4-5', code: '4.5', name: 'INSTALLATION & COMMISSIONING', pic: 'Production', startDate: '2026-06-01', finishDate: '2026-09-30', progress: 55, status: 'On Track', weight: 5,
          subtasks: [
            {
              id: 'st-4-5-1',
              code: '4.5.1',
              name: 'Unboxing & positioning',
              startDate: '2026-06-01',
              finishDate: '2026-06-20',
              duration: 19,
              daysLeft: 0,
              progress: 100,
              status: 'Completed',
              division: 'Production',
              weight: 1,
              checked: true,
              evidence: {
                id: 'ev-w26-1',
                name: 'machine-arrival-batch1.jpg',
                size: '3.4 MB',
                type: 'image/jpeg',
                previewUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80',
              },
            },
            { id: 'st-4-5-2', code: '4.5.2', name: 'Mechanical assembly', startDate: '2026-06-21', finishDate: '2026-07-31', duration: 40, daysLeft: 0, progress: 100, status: 'Completed', predecessor: '4.5.1', depType: 'FS', lag: 0, weight: 1.5, checked: true },
            { id: 'st-4-5-3', code: '4.5.3', name: 'Electrical connection', startDate: '2026-07-15', finishDate: '2026-08-31', duration: 47, daysLeft: 0, progress: 90, status: 'On Track', predecessor: '4.5.2', depType: 'SS', lag: 24, division: 'Production', weight: 1, checked: false },
            { id: 'st-4-5-4', code: '4.5.4', name: 'Initial machine testing', startDate: '2026-09-01', finishDate: '2026-09-30', duration: 29, daysLeft: 6, progress: 40, status: 'On Track', predecessor: '4.5.3', depType: 'FS', lag: 0, division: 'Production', weight: 1.5, checked: false },
          ]
        },
      ],
    },
    {
      id: 'mj-05',
      code: '5',
      name: 'UTILITY & FACILITY',
      weight: 12,
      startDate: '2024-10-01',
      finishDate: '2026-10-31',
      progress: 72,
      status: 'On Track',
      subMainJobs: [
        { id: 'smj-5-1', code: '5.1', name: 'PROCUREMENT', pic: 'Procurement', startDate: '2024-10-01', finishDate: '2026-10-31', progress: 80, status: 'On Track', weight: 3,
          subtasks: [
            { id: 'st-5-1-1', code: '5.1.1', name: 'Heavy utility valve & piping delivery inspection', startDate: '2026-09-20', finishDate: '2026-09-26', duration: 6, daysLeft: 2, progress: 50, status: 'On Track', division: 'Procurement', weight: 1, checked: false },
          ]
        },
        { id: 'smj-5-2', code: '5.2', name: 'MANUFACTURING', pic: 'Engineering', startDate: '2025-04-01', finishDate: '2026-03-31', progress: 100, status: 'Completed', weight: 4, subtasks: [] },
        { id: 'smj-5-3', code: '5.3', name: 'SHIPPING', pic: 'Procurement', startDate: '2026-03-01', finishDate: '2026-06-30', progress: 100, status: 'Completed', weight: 2, subtasks: [] },
        { id: 'smj-5-4', code: '5.4', name: 'ETA', pic: 'Procurement', startDate: '2026-06-01', finishDate: '2026-07-31', progress: 100, status: 'Completed', weight: 1, subtasks: [] },
        { id: 'smj-5-5', code: '5.5', name: 'INSTALLATION & FACTORY', pic: 'Engineering', startDate: '2026-07-01', finishDate: '2026-10-31', progress: 35, status: 'On Track', weight: 2, subtasks: [] },
      ],
    },
    {
      id: 'mj-06',
      code: '6',
      name: 'PURCHASING JOBS',
      weight: 8,
      startDate: '2024-08-01',
      finishDate: '2026-09-30',
      progress: 88,
      status: 'On Track',
      subMainJobs: [
        { id: 'smj-6-1', code: '6.1', name: 'PURCHASING RELATED TO CIVIL WORKS', pic: 'Purchasing', startDate: '2024-08-01', finishDate: '2025-11-30', progress: 100, status: 'Completed', weight: 2.5, subtasks: [] },
        { id: 'smj-6-2', code: '6.2', name: 'PURCHASING RELATED TO MACHINE INSTALLATION', pic: 'Purchasing', startDate: '2025-06-01', finishDate: '2026-09-30', progress: 80, status: 'On Track', weight: 3.5, subtasks: [] },
        { id: 'smj-6-3', code: '6.3', name: 'PURCHASING RELATED TO UTILITY & FACILITY', pic: 'Purchasing', startDate: '2025-01-01', finishDate: '2026-08-31', progress: 90, status: 'On Track', weight: 2, subtasks: [] },
      ],
    },
    {
      id: 'mj-07',
      code: '7',
      name: 'PROCUREMENT (RAW & SUB MATERIAL)',
      weight: 6,
      startDate: '2025-06-01',
      finishDate: '2026-12-31',
      progress: 60,
      status: 'On Track',
      subMainJobs: [
        { id: 'smj-7-1', code: '7.1', name: 'SUPPLIER SOURCING & VOLUME', pic: 'Procurement', startDate: '2025-06-01', finishDate: '2025-12-31', progress: 100, status: 'Completed', weight: 1.5, subtasks: [] },
        { id: 'smj-7-2', code: '7.2', name: 'PROCUREMENT RAW MATERIAL', pic: 'Procurement', startDate: '2026-01-01', finishDate: '2026-12-31', progress: 55, status: 'On Track', weight: 3, subtasks: [] },
        { id: 'smj-7-3', code: '7.3', name: 'PRODUCTION OF SUB MATERIAL', pic: 'Production', startDate: '2026-06-01', finishDate: '2026-12-31', progress: 20, status: 'Open', weight: 1.5, subtasks: [] },
      ],
    },
    {
      id: 'mj-08',
      code: '8',
      name: 'MECHANICAL WORKS',
      weight: 6,
      startDate: '2025-10-01',
      finishDate: '2026-10-31',
      progress: 70,
      status: 'On Track',
      subMainJobs: [
        { id: 'smj-8-1', code: '8.1', name: 'PIPING', pic: 'Engineering', startDate: '2025-10-01', finishDate: '2026-10-31', progress: 70, status: 'On Track', weight: 6, subtasks: [] },
      ],
    },
    {
      id: 'mj-09',
      code: '9',
      name: 'ELECTRICAL WORKS',
      weight: 5,
      startDate: '2025-11-01',
      finishDate: '2026-10-31',
      progress: 65,
      status: 'On Track',
      subMainJobs: [
        { id: 'smj-9-1', code: '9.1', name: 'PLN', pic: 'Engineering', startDate: '2025-11-01', finishDate: '2026-04-30', progress: 100, status: 'Completed', weight: 2, subtasks: [] },
        { id: 'smj-9-2', code: '9.2', name: 'MDP', pic: 'Engineering', startDate: '2026-03-01', finishDate: '2026-08-31', progress: 85, status: 'On Track', weight: 1.5, subtasks: [] },
        { id: 'smj-9-3', code: '9.3', name: 'SDP', pic: 'Engineering', startDate: '2026-06-01', finishDate: '2026-10-31', progress: 30, status: 'On Track', weight: 1.5, subtasks: [] },
      ],
    },
    {
      id: 'mj-10',
      code: '10',
      name: 'ENVIRONMENT FACILITY WORKS',
      weight: 4,
      startDate: '2026-01-01',
      finishDate: '2026-11-30',
      progress: 55,
      status: 'At Risk',
      subMainJobs: [
        { id: 'smj-10-1', code: '10.1', name: 'APC', pic: 'SHE', startDate: '2026-01-01', finishDate: '2026-08-31', progress: 80, status: 'On Track', weight: 1.5, subtasks: [] },
        { id: 'smj-10-2', code: '10.2', name: 'WWTP', pic: 'SHE', startDate: '2026-04-01', finishDate: '2026-11-30', progress: 40, status: 'At Risk', weight: 1.5, subtasks: [] },
        { id: 'smj-10-3', code: '10.3', name: 'TPS', pic: 'SHE', startDate: '2026-06-01', finishDate: '2026-11-30', progress: 20, status: 'At Risk', weight: 1, subtasks: [] },
      ],
    },
    {
      id: 'mj-11',
      code: '11',
      name: 'LEGAL',
      weight: 2,
      startDate: '2024-03-01',
      finishDate: '2026-06-30',
      progress: 90,
      status: 'On Track',
      subMainJobs: [
        { id: 'smj-11-1', code: '11.1', name: 'NIB', pic: 'Legal', startDate: '2024-03-01', finishDate: '2026-06-30', progress: 90, status: 'On Track', weight: 2, subtasks: [] },
      ],
    },
    {
      id: 'mj-12',
      code: '12',
      name: 'PEOPLE & ORGANIZATION',
      weight: 3,
      startDate: '2025-07-01',
      finishDate: '2026-12-31',
      progress: 45,
      status: 'On Track',
      subMainJobs: [
        { id: 'smj-12-1', code: '12.1', name: 'ORGANIZATION STRUCTURE', pic: 'HRGA', startDate: '2025-07-01', finishDate: '2025-12-31', progress: 100, status: 'Completed', weight: 0.5, subtasks: [] },
        { id: 'smj-12-2', code: '12.2', name: 'PEOPLE', pic: 'HRGA', startDate: '2026-01-01', finishDate: '2026-12-31', progress: 60, status: 'On Track', weight: 1.5, subtasks: [] },
        { id: 'smj-12-3', code: '12.3', name: 'TRAINING', pic: 'HRGA', startDate: '2026-07-01', finishDate: '2026-12-31', progress: 10, status: 'Open', weight: 1, subtasks: [] },
      ],
    },
    {
      id: 'mj-13',
      code: '13',
      name: 'TRIAL',
      weight: 3,
      startDate: '2026-10-01',
      finishDate: '2026-12-31',
      progress: 0,
      status: 'Open',
      subMainJobs: [
        { id: 'smj-13-1', code: '13.1', name: 'COLD TRIAL', pic: 'Production', startDate: '2026-10-01', finishDate: '2026-11-15', progress: 0, status: 'Open', weight: 1, subtasks: [] },
        { id: 'smj-13-2', code: '13.2', name: 'HOT TRIAL', pic: 'Production', startDate: '2026-11-01', finishDate: '2026-12-15', progress: 0, status: 'Open', weight: 1, subtasks: [] },
        { id: 'smj-13-3', code: '13.3', name: 'TRAINING ALL MACHINE & FACILITY FACTORY', pic: 'HRGA', startDate: '2026-11-15', finishDate: '2026-12-31', progress: 0, status: 'Open', weight: 1, subtasks: [] },
      ],
    },
    {
      id: 'mj-14',
      code: '14',
      name: 'COMMISSIONING',
      weight: 2,
      startDate: '2026-11-01',
      finishDate: '2026-12-31',
      progress: 0,
      status: 'Open',
      subMainJobs: [
        { id: 'smj-14-1', code: '14.1', name: 'TAHAP 1', pic: 'Engineering', startDate: '2026-11-01', finishDate: '2026-11-30', progress: 0, status: 'Open', weight: 0.7, subtasks: [] },
        { id: 'smj-14-2', code: '14.2', name: 'TAHAP 2', pic: 'Engineering', startDate: '2026-12-01', finishDate: '2026-12-20', progress: 0, status: 'Open', weight: 0.7, subtasks: [] },
        { id: 'smj-14-3', code: '14.3', name: 'MASS PRODUCTION', pic: 'Production', startDate: '2026-12-21', finishDate: '2026-12-31', progress: 0, status: 'Open', weight: 0.6, subtasks: [] },
      ],
    },
    {
      id: 'mj-15',
      code: '15',
      name: 'SALES & MARKETING',
      weight: 2,
      startDate: '2026-09-01',
      finishDate: '2026-12-31',
      progress: 10,
      status: 'Open',
      subMainJobs: [
        { id: 'smj-15-1', code: '15.1', name: 'SALES PLANNING', pic: 'Sales', startDate: '2026-09-01', finishDate: '2026-10-31', progress: 30, status: 'On Track', weight: 0.7, subtasks: [] },
        { id: 'smj-15-2', code: '15.2', name: 'CUSTOMER SURVEYING', pic: 'Sales', startDate: '2026-10-01', finishDate: '2026-11-30', progress: 5, status: 'Open', weight: 0.7, subtasks: [] },
        { id: 'smj-15-3', code: '15.3', name: 'FIRST SALES DELIVERY', pic: 'Sales', startDate: '2026-12-15', finishDate: '2026-12-31', progress: 0, status: 'Open', weight: 0.6, subtasks: [] },
      ],
    },
    {
      id: 'mj-16',
      code: '16',
      name: 'SYSTEM DEVELOPMENT',
      weight: 4,
      startDate: '2026-07-01',
      finishDate: '2026-12-31',
      progress: 20,
      status: 'On Track',
      subMainJobs: [
        { id: 'smj-16-1', code: '16.1', name: 'PRODUCTION PROCESS', pic: 'Production', startDate: '2026-07-01', finishDate: '2026-12-31', progress: 25, status: 'On Track', weight: 0.4, subtasks: [] },
        { id: 'smj-16-2', code: '16.2', name: 'PRODUCTION PLANNING & INVENTORY CONTROL', pic: 'PPIC', startDate: '2026-08-01', finishDate: '2026-12-31', progress: 20, status: 'On Track', weight: 0.4, subtasks: [] },
        { id: 'smj-16-3', code: '16.3', name: 'QUALITY', pic: 'QC', startDate: '2026-08-01', finishDate: '2026-12-31', progress: 20, status: 'On Track', weight: 0.35, subtasks: [] },
        { id: 'smj-16-4', code: '16.4', name: 'MAINTENANCE', pic: 'Engineering', startDate: '2026-09-01', finishDate: '2026-12-31', progress: 10, status: 'Open', weight: 0.35, subtasks: [] },
        { id: 'smj-16-5', code: '16.5', name: 'ENGINEERING', pic: 'Engineering', startDate: '2026-09-01', finishDate: '2026-12-31', progress: 10, status: 'Open', weight: 0.35, subtasks: [] },
        { id: 'smj-16-6', code: '16.6', name: 'SHE', pic: 'SHE', startDate: '2026-09-01', finishDate: '2026-12-31', progress: 10, status: 'Open', weight: 0.3, subtasks: [] },
        { id: 'smj-16-7', code: '16.7', name: 'IT', pic: 'IT', startDate: '2026-07-01', finishDate: '2026-12-31', progress: 30, status: 'On Track', weight: 0.3, subtasks: [] },
        { id: 'smj-16-8', code: '16.8', name: 'HRGA', pic: 'HRGA', startDate: '2026-08-01', finishDate: '2026-12-31', progress: 20, status: 'On Track', weight: 0.3, subtasks: [] },
        { id: 'smj-16-9', code: '16.9', name: 'PROCUREMENT', pic: 'Procurement', startDate: '2026-09-01', finishDate: '2026-12-31', progress: 10, status: 'Open', weight: 0.2, subtasks: [] },
        { id: 'smj-16-10', code: '16.10', name: 'PURCHASING', pic: 'Purchasing', startDate: '2026-09-01', finishDate: '2026-12-31', progress: 10, status: 'Open', weight: 0.2, subtasks: [] },
        { id: 'smj-16-11', code: '16.11', name: 'SALES & MARKETING', pic: 'Sales', startDate: '2026-10-01', finishDate: '2026-12-31', progress: 5, status: 'Open', weight: 0.2, subtasks: [] },
        { id: 'smj-16-12', code: '16.12', name: 'FINANCE & ACCOUNTING', pic: 'Finance', startDate: '2026-09-01', finishDate: '2026-12-31', progress: 15, status: 'Open', weight: 0.2, subtasks: [] },
      ],
    },
    {
      id: 'mj-17',
      code: '17',
      name: 'CERTIFICATION',
      weight: 1,
      startDate: '2026-10-01',
      finishDate: '2026-12-31',
      progress: 0,
      status: 'Open',
      subMainJobs: [
        { id: 'smj-17-1', code: '17.1', name: 'ISO 9001', pic: 'QC', startDate: '2026-10-01', finishDate: '2026-12-31', progress: 0, status: 'Open', weight: 0.4, subtasks: [] },
        { id: 'smj-17-2', code: '17.2', name: 'ISO 14001', pic: 'SHE', startDate: '2026-10-01', finishDate: '2026-12-31', progress: 0, status: 'Open', weight: 0.4, subtasks: [] },
        { id: 'smj-17-3', code: '17.3', name: 'OTHER', pic: 'QC', startDate: '2026-11-01', finishDate: '2026-12-31', progress: 0, status: 'Open', weight: 0.2, subtasks: [] },
      ],
    },
  ],
};

function generateWeeklyData(): WeekData[] {
  const weeks: WeekData[] = [];
  // 52 weeks of project data
  const plannedValues = [
    0.5, 0.7, 0.8, 1.0, 1.2, 1.3, 1.5, 1.8, 2.0, 2.1,
    2.3, 2.5, 2.6, 2.8, 3.0, 3.1, 3.0, 2.8, 2.5, 2.3,
    2.1, 2.0, 1.8, 1.7, 1.6, 1.5, 1.4, 1.3, 1.2, 1.1,
    1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.4, 0.3, 0.3,
  ];
  const actualValues = [
    0.4, 0.6, 0.9, 1.1, 1.0, 1.4, 1.6, 1.7, 2.1, 2.0,
    2.4, 2.3, 2.7, 2.9, 2.8, 3.2, 3.1, 2.9, 2.6, 2.4,
    2.2, 2.1, 1.9, 1.8, 1.7, 1.6, 1.5, 1.4, 1.3, 1.2,
    1.1, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, null, null, null,
  ] as (number | null)[];

  let plannedCum = 0;
  let actualCum = 0;

  const startMs = new Date('2024-01-15').getTime();
  for (let i = 0; i < plannedValues.length; i++) {
    const weekStart = new Date(startMs + i * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(startMs + (i + 1) * 7 * 24 * 60 * 60 * 1000 - 1);
    plannedCum += plannedValues[i];
    const actual = actualValues[i];
    if (actual !== null) actualCum += actual;
    weeks.push({
      week: i + 1,
      startDate: weekStart.toISOString().slice(0, 10),
      endDate: weekEnd.toISOString().slice(0, 10),
      planned: plannedValues[i],
      actual: actual ?? 0,
      plannedCumulative: parseFloat(plannedCum.toFixed(2)),
      actualCumulative: actual !== null ? parseFloat(actualCum.toFixed(2)) : 0,
    });
  }
  return weeks;
}

function generateBudgetEntries(): BudgetEntry[] {
  return [
    { id: 'b-01', tanggal: '2024-08-05', codeSubWbs: '3.3', subTaskWbs: 'Foundation Construction', kategori: 'Material', lokasi: 'Gudang A', namaItem: 'Besi Beton D16', spesifikasi: 'SNI, Grade 40', qty: 5000, satuan: 'kg', hargaSatuan: 12500, hargaTotal: 62500000, referensi: 'PO-2024-0801', keterangan: 'Untuk pondasi gedung utama' },
    { id: 'b-02', tanggal: '2024-08-10', codeSubWbs: '3.3', subTaskWbs: 'Foundation Construction', kategori: 'Material', lokasi: 'Gudang A', namaItem: 'Semen Portland', spesifikasi: 'Tipe I, 50kg/sak', qty: 2000, satuan: 'sak', hargaSatuan: 65000, hargaTotal: 130000000, referensi: 'PO-2024-0802', keterangan: '' },
    { id: 'b-03', tanggal: '2024-09-15', codeSubWbs: '3.4', subTaskWbs: 'Steel Structure Construction', kategori: 'Material', lokasi: 'Lapangan', namaItem: 'WF Beam 200x100', spesifikasi: 'A36, 6m/batang', qty: 300, satuan: 'batang', hargaSatuan: 850000, hargaTotal: 255000000, referensi: 'PO-2024-0915', keterangan: 'Rangka atap pabrik' },
    { id: 'b-04', tanggal: '2024-10-01', codeSubWbs: '3.4', subTaskWbs: 'Steel Structure Construction', kategori: 'Jasa', lokasi: 'Lapangan', namaItem: 'Jasa Erection Baja', spesifikasi: 'Termasuk scaffolding', qty: 1, satuan: 'LS', hargaSatuan: 450000000, hargaTotal: 450000000, referensi: 'SPK-2024-1001', keterangan: '' },
    { id: 'b-05', tanggal: '2025-02-20', codeSubWbs: '4.1', subTaskWbs: 'Production Machine Procurement', kategori: 'Mesin', lokasi: 'Gudang B', namaItem: 'Injection Molding Machine 500T', spesifikasi: 'Imported, 500 Ton clamp force', qty: 4, satuan: 'unit', hargaSatuan: 3200000000, hargaTotal: 12800000000, referensi: 'PO-2025-0201', keterangan: 'Main production machine' },
    { id: 'b-06', tanggal: '2025-06-10', codeSubWbs: '5.1', subTaskWbs: 'Utility Procurement', kategori: 'Peralatan', lokasi: 'Gudang C', namaItem: 'Air Compressor 15 Bar', spesifikasi: '500L, 15bar, 30kW', qty: 2, satuan: 'unit', hargaSatuan: 380000000, hargaTotal: 760000000, referensi: 'PO-2025-0610', keterangan: '' },
    { id: 'b-07', tanggal: '2025-08-25', codeSubWbs: '9.1', subTaskWbs: 'PLN', kategori: 'Jasa', lokasi: 'Lapangan', namaItem: 'Biaya Sambungan Listrik PLN 630 kVA', spesifikasi: 'Termasuk trafo dan panel', qty: 1, satuan: 'LS', hargaSatuan: 1200000000, hargaTotal: 1200000000, referensi: 'INV-PLN-0825', keterangan: '' },
    { id: 'b-08', tanggal: '2026-03-14', codeSubWbs: '4.3', subTaskWbs: 'Machine Shipping', kategori: 'Logistik', lokasi: 'Pelabuhan Tg Priok', namaItem: 'Production Machine Freight Cost', spesifikasi: 'FCL, Sea Freight', qty: 1, satuan: 'LS', hargaSatuan: 850000000, hargaTotal: 850000000, referensi: 'INV-FWD-0314', keterangan: 'From China port' },
    { id: 'b-09', tanggal: '2026-05-30', codeSubWbs: '6.2', subTaskWbs: 'Purchasing Machine Installation', kategori: 'Material', lokasi: 'Gudang B', namaItem: 'Anchor Bolt M24', spesifikasi: 'Grade 8.8, Hot Dip Galvanized', qty: 800, satuan: 'pcs', hargaSatuan: 45000, hargaTotal: 36000000, referensi: 'PO-2026-0530', keterangan: '' },
    { id: 'b-10', tanggal: '2026-07-18', codeSubWbs: '8.1', subTaskWbs: 'Piping', kategori: 'Material', lokasi: 'Gudang A', namaItem: 'Pipa Stainless SS316L 2"', spesifikasi: 'Sch 40, 6m/batang', qty: 500, satuan: 'batang', hargaSatuan: 425000, hargaTotal: 212500000, referensi: 'PO-2026-0718', keterangan: 'Pipa distribusi air proses' },
  ];
}

export const CURRENT_USER = {
  name: 'Budi Santoso',
  email: 'budi.santoso@indoprima.co.id',
  role: 'Admin' as Role,
  pic: 'PM',
};

export const PIC_USER = {
  name: 'Andi Prasetyo',
  email: 'andi.prasetyo@indoprima.co.id',
  role: 'PIC' as Role,
  pic: 'Engineering',
};
