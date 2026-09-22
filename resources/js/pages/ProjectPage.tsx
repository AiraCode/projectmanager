import { useState, useEffect, FormEvent } from 'react';
import { usePage } from '@inertiajs/react';
import { Building2, User, Calendar, Target, CheckCircle2, Layers, ShieldCheck, Plus, Lock, AlertCircle, Check } from 'lucide-react';
import { PROJECT, MainJob } from '@/data/mockData';
import { StatusBadge, ProgressBar, PageHeader, Card, Button, Modal, Toast } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

interface CompanyOption {
  id: number;
  name: string;
  code: string | null;
}

export default function ProjectPage() {
  const { user, refreshUser } = useAuth();
  const pageProps = usePage().props as any;
  const project = pageProps?.project;
  const userRole = pageProps?.userRole;

  const [projectData, setProjectData] = useState(() => {
    return project && project.mainJobs ? project : PROJECT;
  });

  useEffect(() => {
    if (project && project.mainJobs) {
      setProjectData(project);
    }
  }, [project]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 'mj-1': true, 'mj-2': true, 'mj-3': true });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null);

  // Form states for creating project
  const [companyId, setCompanyId] = useState<number | string>('');
  const [isAddingCompany, setIsAddingCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [pmName, setPmName] = useState(user?.name || 'Budi Santoso');
  const [startDate, setStartDate] = useState('2025-01-15');
  const [endDate, setEndDate] = useState('2026-12-31');
  const [budget, setBudget] = useState('30000000000');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const fetchCompanies = async () => {
    try {
      const res = await fetch('/api/companies', { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies || []);
        if (data.companies?.length > 0 && !companyId) {
          setCompanyId(data.companies[0].id);
        }
      }
    } catch {
      // fallback
      setCompanies([
        { id: 1, name: 'PT Indoprima Gemilang', code: 'IPG' },
        { id: 2, name: 'PT Indoprima Nusantara', code: 'IPN' },
      ]);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleCreateCompany = async () => {
    if (!newCompanyName.trim()) return;
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: newCompanyName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setCompanies(prev => [...prev, data.company]);
        setCompanyId(data.company.id);
        setNewCompanyName('');
        setIsAddingCompany(false);
        setToast({ message: `Company "${data.company.name}" registered successfully.`, type: 'success' });
      }
    } catch {
      // fallback
      const fakeId = Date.now();
      const newComp = { id: fakeId, name: newCompanyName.trim(), code: null };
      setCompanies(prev => [...prev, newComp]);
      setCompanyId(fakeId);
      setIsAddingCompany(false);
      setNewCompanyName('');
    }
  };

  const handleCreateProject = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!projectName.trim() || !companyId || !pmName.trim() || !startDate) {
      setFormError('Please fill in all required project information.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          company_id: companyId,
          name: projectName.trim(),
          project_manager: pmName.trim(),
          start_date: startDate,
          end_date: endDate || null,
          total_budget: Number(budget) || 0,
          description: description.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setToast({
          message: `Project "${projectName}" created! Fixed 17 Main Jobs & Sub Main Jobs template loaded automatically.`,
          type: 'success',
        });
        setShowCreateModal(false);
        await refreshUser();
        // Update active project view to new project
        const comp = companies.find(c => String(c.id) === String(companyId))?.name || 'PT Indoprima Nusantara';
        setProjectData(prev => ({
          ...prev,
          name: projectName,
          company: comp,
          projectManager: pmName,
          startDate: startDate,
          endDate: endDate,
          totalBudget: Number(budget),
          overallProgress: 0,
        }));
      } else {
        setFormError(data.message || data.errors?.admin_id?.[0] || 'Failed to create project.');
      }
    } catch {
      setFormError('Failed to communicate with server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const p = projectData;
  const isPIC = user?.isPIC || user?.role === 'pic';
  const canCreate = isPIC && Boolean(user?.canCreateProject);

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-screen-2xl space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <PageHeader
        title="Project Overview"
        subtitle="Master template structure and Main Job breakdown"
        actions={
          <div className="flex items-center gap-2.5">
            <StatusBadge status={p.status} size="md" />
            {canCreate && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowCreateModal(true)}
                className="text-[12.5px] shadow-xs"
              >
                <Plus size={14} className="mr-1.5" />
                Create Project
              </Button>
            )}
          </div>
        }
      />

      {/* Top summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { icon: Building2, label: 'Company', value: p.company },
          { icon: User, label: 'Project Manager', value: p.projectManager },
          { icon: Calendar, label: 'Start Date', value: p.startDate },
          { icon: Target, label: 'Target Completion', value: p.endDate },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label} className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-light flex items-center justify-center flex-shrink-0">
              <Icon size={16} className="text-brand" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">{label}</div>
              <div className="text-[13px] font-bold text-neutral-800 truncate mt-0.5">{value}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Progress summary */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-brand" />
            <span className="text-[13px] font-bold text-neutral-800 tracking-tight">Total Project Progress</span>
          </div>
          <span className="text-[14px] font-bold text-brand">{p.overallProgress}%</span>
        </div>
        <ProgressBar value={p.overallProgress} size="md" />
        <div className="flex justify-between text-[11.5px] text-neutral-400 mt-2 font-medium">
          <span>Hari ke-{p.hariKe}</span>
          <span>{p.sisaHari} days remaining</span>
        </div>
      </Card>

      {/* Fixed Template Info Banner */}
      <div className="p-4 sm:p-5 rounded-xl bg-brand-light border border-brand-border flex flex-col sm:flex-row items-start gap-3.5">
        <div className="w-8 h-8 rounded-lg bg-brand text-white flex items-center justify-center flex-shrink-0 shadow-xs">
          <ShieldCheck size={18} />
        </div>
        <div className="flex-1 text-[13px] text-neutral-700 space-y-1">
          <div className="font-bold text-brand text-[13.5px]">
            Master Template WBS Project (17 Main Tasks Awal Tersedia Otomatis)
          </div>
          <p className="leading-relaxed text-neutral-600 text-[12.5px]">
            Setiap project baru secara otomatis memuat 17 Main Task (Main Job) standar perusahaan lengkap dengan Sub Task awal.
            Sebagai PIC, Anda memiliki fleksibilitas penuh untuk <strong>menambah Main Task baru</strong>, <strong>menambah Sub Task</strong>, maupun <strong>menambah Task (Sub-Subtask)</strong> serta mengubah dan menyesuaikan rincian pekerjaan proyek.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11.5px] font-semibold text-neutral-500">
            <span>✓ 17 Main Tasks Standar Otomatis</span>
            <span>✓ PIC Bebas Tambah Main Task Baru</span>
            <span>✓ PIC Bebas Tambah & Sesuaikan Sub Task</span>
            <span>✓ Dynamic Task Management</span>
          </div>
        </div>
      </div>

      {/* Main Job tree */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-neutral-500" />
            <span className="text-[14px] font-bold text-neutral-800 tracking-tight">Main Job Breakdown ({p.mainJobs?.length || 17} Main Jobs)</span>
          </div>
          <div className="flex items-center gap-2">
            {isPIC && (
              <a
                href={`/tasks?project_id=${p.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] font-semibold bg-brand text-white hover:bg-brand-dark transition-colors shadow-xs"
              >
                <Plus size={13} /> Kelola & Tambah Task
              </a>
            )}
            <span className="text-[12px] text-neutral-400 hidden sm:inline">Klik Main Job untuk melihat Sub Main Job</span>
          </div>
        </div>

        <div className="space-y-2.5">
          {p.mainJobs.map(mj => (
            <MainJobCard key={mj.id} mj={mj} expanded={!!expanded[mj.id]} onToggle={() => toggle(mj.id)} />
          ))}
        </div>
      </div>

      {/* Project Creation & Ownership Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); setFormError(''); }}
        title="Create New Project"
        subtitle="Session 1 & Session 2 Workflow"
      >
        <div className="space-y-4 text-[13px]">
          {/* Admin Ownership Rule Enforcement View */}
          {user?.role === 'Admin' && !canCreate && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200/80 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                  <Lock size={16} />
                </div>
                <div className="space-y-1 text-[12.5px]">
                  <div className="font-bold text-amber-900">
                    Admin Ownership Limit Reached (1 Admin = 1 Project)
                  </div>
                  <p className="text-amber-800 leading-relaxed">
                    Under JEKER business rules, <strong>one Admin can own exactly one Project in total</strong> across all companies.
                    You are currently the registered owner of:
                  </p>
                  <div className="p-2.5 rounded-lg bg-white border border-amber-200 font-semibold text-neutral-800 mt-2">
                    📁 {user?.ownedProject?.name || p.name}
                  </div>
                  <p className="text-amber-700 text-[11.5px] mt-2">
                    To instantiate another project with the master template, sign in with an unassigned Admin account (such as <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-amber-900">admin2@jeker.id</code>).
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200 text-[12px] text-neutral-600 space-y-1">
                <div className="font-semibold text-neutral-800">Master Template Information:</div>
                <div>When a new project is created by an unassigned Admin:</div>
                <ul className="list-disc list-inside space-y-0.5 text-neutral-500 pl-1">
                  <li>System automatically loads all 17 fixed Main Jobs</li>
                  <li>System assigns all 72 Sub Main Jobs to their predefined PICs</li>
                  <li>Admin is assigned as the single owner of that project</li>
                </ul>
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowCreateModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}

          {/* PIC User Block View */}
          {user?.role === 'PIC' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-neutral-100 border border-neutral-200 flex items-start gap-3">
                <AlertCircle size={18} className="text-neutral-500 flex-shrink-0 mt-0.5" />
                <div className="text-[12.5px] text-neutral-600 space-y-1">
                  <div className="font-bold text-neutral-800">PIC Authorization Notice</div>
                  <p>
                    Only Admin accounts can instantiate and own projects. Your current role is <strong>PIC ({user.pic})</strong>.
                    To test project creation, sign in as an Admin.
                  </p>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowCreateModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}

          {/* Unassigned Admin: Project Creation Form */}
          {user?.role === 'Admin' && canCreate && (
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div className="p-3 rounded-lg bg-blue-50/80 border border-blue-100 text-[12px] text-blue-900 leading-relaxed">
                You are currently an unassigned Admin. Creating a project will assign ownership to your account and <strong>automatically load the 17 fixed Main Jobs and Sub Main Jobs</strong>.
              </div>

              {formError && (
                <div className="p-3 rounded-lg bg-danger-light border border-danger/20 text-danger text-[12.5px] flex items-center gap-2">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  {formError}
                </div>
              )}

              {/* Dynamic Company Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12.5px] font-semibold text-neutral-700">Company *</label>
                  <button
                    type="button"
                    onClick={() => setIsAddingCompany(!isAddingCompany)}
                    className="text-[11.5px] text-brand hover:underline font-medium"
                  >
                    {isAddingCompany ? 'Cancel' : '+ New Company'}
                  </button>
                </div>

                {isAddingCompany ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. PT Indoprima Perdana"
                      value={newCompanyName}
                      onChange={e => setNewCompanyName(e.target.value)}
                      className="flex-1 px-3 py-2 text-[13px] border border-neutral-200 rounded-lg outline-none focus:border-brand"
                    />
                    <Button type="button" size="sm" variant="secondary" onClick={handleCreateCompany}>
                      Save
                    </Button>
                  </div>
                ) : (
                  <select
                    value={companyId}
                    onChange={e => setCompanyId(e.target.value)}
                    className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-lg outline-none focus:border-brand bg-white"
                  >
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.code ? `(${c.code})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Project Name */}
              <div>
                <label className="block text-[12.5px] font-semibold text-neutral-700 mb-1.5">
                  Project Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ekspansi Fasilitas Perakitan Unit IV"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-lg outline-none focus:border-brand"
                />
              </div>

              {/* Project Manager */}
              <div>
                <label className="block text-[12.5px] font-semibold text-neutral-700 mb-1.5">
                  Project Manager *
                </label>
                <input
                  type="text"
                  value={pmName}
                  onChange={e => setPmName(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-lg outline-none focus:border-brand"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12.5px] font-semibold text-neutral-700 mb-1.5">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-lg outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-semibold text-neutral-700 mb-1.5">
                    Target End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-lg outline-none focus:border-brand"
                  />
                </div>
              </div>

              {/* Budget */}
              <div>
                <label className="block text-[12.5px] font-semibold text-neutral-700 mb-1.5">
                  Total Budget (IDR)
                </label>
                <input
                  type="number"
                  placeholder="30000000000"
                  value={budget}
                  onChange={e => setBudget(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-lg outline-none focus:border-brand"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-[12.5px] font-semibold text-neutral-700 mb-1.5">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional project notes or scope description..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-[13px] border border-neutral-200 rounded-lg outline-none focus:border-brand"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting}
                  className="shadow-xs"
                >
                  {isSubmitting ? 'Provisioning...' : 'Create & Load Template'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Modal>
    </div>
  );
}

function MainJobCard({ mj, expanded, onToggle }: { mj: MainJob; expanded: boolean; onToggle: () => void }) {
  return (
    <Card className="overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-neutral-50/60 transition-colors text-left"
      >
        <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center flex-shrink-0 shadow-xs">
          <span className="text-white text-[11px] font-bold">{mj.code}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-neutral-800 truncate">{mj.name}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] font-medium text-neutral-400">{mj.subMainJobs.length} Sub Main Jobs</span>
            <span className="text-[11px] text-neutral-300">·</span>
            <span className="text-[11px] font-medium text-neutral-400">Bobot: {mj.weight}%</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 sm:gap-3 flex-shrink-0">
          <StatusBadge status={mj.status} size="xs" />
          <div className="w-16 sm:w-20 hidden xs:block">
            <ProgressBar value={mj.progress} size="xs" showLabel={false} />
          </div>
          <span className="text-[12px] font-bold text-neutral-800 w-9 text-right">{mj.progress}%</span>
          <svg width="12" height="12" viewBox="0 0 12 12" className={`text-neutral-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
            <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-neutral-100 bg-neutral-50/30">
          {mj.subMainJobs.map((smj, i) => (
            <div
              key={smj.id}
              className={`flex items-center gap-3 px-4 py-2.5 ${i < mj.subMainJobs.length - 1 ? 'border-b border-neutral-100' : ''} hover:bg-neutral-50 transition-colors`}
            >
              <div className="w-4 flex-shrink-0" />
              <div className="w-5 h-5 rounded bg-neutral-200/60 flex items-center justify-center flex-shrink-0">
                <span className="text-neutral-600 text-[9.5px] font-bold">{smj.code}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-semibold text-neutral-700 truncate">{smj.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200">
                    PIC: {smj.pic}
                  </span>
                  <span className="text-[10.5px] text-neutral-400 font-medium">Weight: {smj.weight}%</span>
                </div>
              </div>
              <div className="flex items-center gap-2.5 flex-shrink-0">
                <StatusBadge status={smj.status} size="xs" />
                <div className="w-14 sm:w-16 hidden sm:block">
                  <ProgressBar value={smj.progress} size="xs" showLabel={false} />
                </div>
                <span className="text-[11px] font-bold text-neutral-700 w-8 text-right">{smj.progress}%</span>
              </div>
            </div>
          ))}
          {mj.subMainJobs.length === 0 && (
            <div className="px-10 py-4 text-[12px] text-neutral-400 italic">No Sub Main Jobs defined in template.</div>
          )}
        </div>
      )}
    </Card>
  );
}
