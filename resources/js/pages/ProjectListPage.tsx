import { useState } from 'react';
import { usePage, Link, router } from '@inertiajs/react';
import { Building2, User, Calendar, TrendingUp, ChevronRight, FolderOpen, Plus, ShieldAlert, Sparkles } from 'lucide-react';
import { PageHeader, Card, ProgressBar, StatusBadge, Button, Modal, formatDateDisplay } from '@/components/ui';

interface Project {
  id: number;
  name: string;
  company: string;
  manager: string;
  status: string;
  progress: number;
  planned_progress?: number;
  start_date: string | null;
  end_date: string | null;
}

interface CompanyItem {
  id: number;
  name: string;
}

export default function ProjectListPage() {
  const { projects = [], canCreate = false, companies = [], auth } = usePage().props as any;
  const role = auth?.user?.role ?? '';
  const isAdminProgres = role === 'admin_progres';
  const isAdminUtama   = role === 'admin_utama';
  const isPIC          = role === 'pic';

  // Modal create project state (PIC only)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [companyId, setCompanyId] = useState<string>('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Nama project wajib diisi.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    router.post('/projectlistpage', {
      title: title.trim(),
      company_id: companyId || null,
      company_name: newCompanyName.trim() || null,
      start: startDate,
      end: endDate,
    }, {
      onError: (errors) => {
        setErrorMsg(Object.values(errors)[0] as string || 'Gagal membuat project.');
        setSubmitting(false);
      },
      onFinish: () => {
        setSubmitting(false);
      },
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-7 max-w-7xl mx-auto space-y-4 sm:space-y-5">
      <PageHeader
        title="Semua Proyek"
        subtitle="Pilih proyek untuk melihat detail dan progresnya."
        actions={
          <div className="flex items-center gap-2">
            {/* PIC without project gets the Create button */}
            {canCreate && isPIC && (
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => setShowCreateModal(true)}
              >
                Buat Project Baru
              </Button>
            )}
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-brand-light text-brand border border-brand-border shadow-2xs">
              <FolderOpen size={14} />
              {projects?.length ?? 0} Projects
            </span>
          </div>
        }
      />

      {/* Role info alert (Admin Progres only) */}
      {isAdminProgres && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3 text-[12.5px] text-amber-800">
          <ShieldAlert size={16} className="text-amber-600 flex-shrink-0" />
          <span>
            <strong>Role Admin Progres:</strong> Pemantauan khusus grafik <strong>S-Curve</strong>. Mengklik proyek di bawah akan langsung membuka grafik S-Curve.
          </span>
        </div>
      )}

      {(!projects || projects.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-neutral-200/80 p-8 shadow-xs">
          <div className="w-14 h-14 rounded-xl bg-brand/10 flex items-center justify-center mb-3 text-brand">
            <FolderOpen size={26} />
          </div>
          <h3 className="text-[15px] font-bold text-neutral-800 mb-1">
            {canCreate && isPIC ? "Anda Belum Memiliki Project" : "Belum Ada Project"}
          </h3>
          <p className="text-[13px] text-neutral-500 max-w-md mb-4">
            {canCreate && isPIC
              ? "Sebagai PIC yang baru terdaftar, Anda dapat membuat project perdana untuk perusahaan Anda. Template WBS 3-tingkat akan otomatis dimuat!"
              : "Saat ini belum ada project yang terdaftar di dalam sistem."}
          </p>
          {canCreate && isPIC && (
            <Button
              variant="primary"
              size="md"
              icon={Plus}
              onClick={() => setShowCreateModal(true)}
            >
              Buat Project Sekarang
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {projects.map((project: Project) => {
            const isLongTitle = (project.name || '').length > 36;
            return (
              <Link
                key={project.id}
                href={isAdminProgres ? `/scurve?project_id=${project.id}` : `/projects/${project.id}`}
                className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-xl"
              >
                <div className="p-4 sm:p-5 h-full flex flex-col justify-between bg-white rounded-xl border-2 border-[#1E293B]/25 hover:border-[#1E3A8A] shadow-xs hover:shadow-md transition-all duration-200 group-hover:-translate-y-0.5">
                  {/* Title & Status */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3
                        className={`font-black text-neutral-900 leading-snug line-clamp-2 group-hover:text-brand transition-colors ${
                          isLongTitle ? 'text-[14px] sm:text-[15px]' : 'text-[16px] sm:text-[17px]'
                        }`}
                        title={project.name}
                      >
                        {project.name}
                      </h3>
                      <div className="flex-shrink-0">
                        <StatusBadge status={project.status as any} size="xs" />
                      </div>
                    </div>

                    {/* Start Date & End Date */}
                    {(project.start_date || project.end_date) && (
                      <div className="flex items-center gap-1.5 text-[12px] text-neutral-500 font-medium mb-3">
                        <Calendar size={13} className="text-brand flex-shrink-0" />
                        <span>
                          {formatDateDisplay(project.start_date)} s/d {formatDateDisplay(project.end_date)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Dual-Indicator Speedometer Gauge */}
                  <div className="pt-2">
                    <SpeedometerGauge
                      plan={project.planned_progress ?? 0}
                      actual={project.progress ?? 0}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Modal Buat Project Baru (Khusus PIC) */}
      {showCreateModal && canCreate && isPIC && (
        <Modal
          title="Buat Project Baru (PIC)"
          onClose={() => setShowCreateModal(false)}
          size="md"
        >
          <form onSubmit={handleCreateProject} className="space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-danger-light text-danger text-[12px] font-semibold">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                Nama / Judul Project <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Contoh: EXPANSION PLANT PHASE 2"
                className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                required
              />
            </div>

            {/* Company selection */}
            <div>
              <label className="block text-[12.5px] font-bold text-neutral-700 mb-1">
                Perusahaan (Company) <span className="text-danger">*</span>
              </label>
              {companies.length > 0 ? (
                <div className="space-y-2">
                  <select
                    value={companyId}
                    onChange={e => {
                      setCompanyId(e.target.value);
                      if (e.target.value) setNewCompanyName('');
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand bg-white"
                  >
                    <option value="">-- Pilih Perusahaan Terdaftar --</option>
                    {companies.map((c: CompanyItem) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>

                  <div className="text-[11px] text-neutral-400 text-center font-medium">atau daftarkan perusahaan baru:</div>
                  <input
                    type="text"
                    value={newCompanyName}
                    onChange={e => {
                      setNewCompanyName(e.target.value);
                      if (e.target.value) setCompanyId('');
                    }}
                    placeholder="Nama perusahaan baru jika belum ada di list"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                  />
                </div>
              ) : (
                <input
                  type="text"
                  value={newCompanyName}
                  onChange={e => setNewCompanyName(e.target.value)}
                  placeholder="Masukkan nama perusahaan Anda"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                  required
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  Tanggal Mulai <span className="text-danger">*</span>
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                  required
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-neutral-700 mb-1">
                  Target Selesai <span className="text-danger">*</span>
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
                  required
                />
              </div>
            </div>

            <div className="p-3 bg-brand/5 border border-brand/20 rounded-lg flex items-start gap-2 text-[11.5px] text-neutral-600">
              <Sparkles size={14} className="text-brand flex-shrink-0 mt-0.5" />
              <span>
                Saat dibuat, sistem akan otomatis menginisialisasi 3 Main Jobs WBS (Business Development, Factory Layout & Process Design, dan Sipil Works) beserta sub-tugasnya.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateModal(false)}
                disabled={submitting}
              >
                Batal
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={submitting}
              >
                Simpan & Buka Project
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function SpeedometerGauge({ plan = 0, actual = 0 }: { plan?: number; actual?: number }) {
  const planVal = Math.max(0, Math.min(100, Math.round(plan)));
  const actualVal = Math.max(0, Math.min(100, Math.round(actual)));

  const cx = 100;
  const cy = 88;
  const r = 65;

  // Calculate needle tips (180deg to 360deg)
  const getTip = (val: number, len: number) => {
    const clamped = Math.max(0, Math.min(100, val));
    const rad = (180 + (clamped / 100) * 180) * (Math.PI / 180);
    return {
      x: cx + len * Math.cos(rad),
      y: cy + len * Math.sin(rad),
    };
  };

  const planTip = getTip(planVal, 50);
  const actualTip = getTip(actualVal, 54);

  return (
    <div className="flex flex-col items-center justify-center w-full pt-1">
      <div className="relative w-full max-w-[210px] aspect-[200/105]">
        <svg viewBox="0 0 200 110" className="w-full h-full overflow-visible">
          {/* Base Gauge Track */}
          <path
            d="M 35 88 A 65 65 0 0 1 165 88"
            fill="none"
            stroke="#F1F5F9"
            strokeWidth="13"
            strokeLinecap="round"
          />

          {/* Zone 1: Red (0% - 70%) */}
          <path
            d="M 35 88 A 65 65 0 0 1 138.2 35.4"
            fill="none"
            stroke="#EF4444"
            strokeWidth="11"
            strokeLinecap="round"
          />

          {/* Zone 2: Yellow / Amber (70% - 90%) */}
          <path
            d="M 138.2 35.4 A 65 65 0 0 1 161.8 67.9"
            fill="none"
            stroke="#F59E0B"
            strokeWidth="11"
          />

          {/* Zone 3: Green (90% - 100%) */}
          <path
            d="M 161.8 67.9 A 65 65 0 0 1 165 88"
            fill="none"
            stroke="#10B981"
            strokeWidth="11"
            strokeLinecap="round"
          />

          {/* Threshold Markings */}
          <text x="32" y="103" textAnchor="middle" className="text-[9px] fill-neutral-400 font-bold">0%</text>
          <text x="138" y="25" textAnchor="middle" className="text-[8.5px] fill-neutral-500 font-bold">70%</text>
          <text x="172" y="62" textAnchor="start" className="text-[8.5px] fill-neutral-500 font-bold">90%</text>
          <text x="168" y="103" textAnchor="middle" className="text-[9px] fill-neutral-400 font-bold">100%</text>

          {/* Plan Pointer (Navy Dashed with Circle) */}
          <line
            x1={cx}
            y1={cy}
            x2={planTip.x}
            y2={planTip.y}
            stroke="#1E3A8A"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="4 2"
          />
          <circle cx={planTip.x} cy={planTip.y} r="3" fill="#1E3A8A" />

          {/* Actual Pointer (Red Solid with Tip Circle) */}
          <line
            x1={cx}
            y1={cy}
            x2={actualTip.x}
            y2={actualTip.y}
            stroke="#DC2626"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx={actualTip.x} cy={actualTip.y} r="3.5" fill="#DC2626" />

          {/* Pivot Center */}
          <circle cx={cx} cy={cy} r="6" fill="#0F172A" />
          <circle cx={cx} cy={cy} r="2" fill="#FFFFFF" />
        </svg>
      </div>

      {/* Plan vs Actual Data Legend */}
      <div className="flex items-center justify-between w-full px-2 mt-2 pt-2 border-t border-neutral-100 text-[12px]">
        <div className="flex items-center gap-1.5 font-bold text-neutral-800">
          <span className="w-2.5 h-2.5 rounded-full bg-[#1E3A8A] inline-block shadow-2xs" />
          <span>Plan: <span className="font-black text-[#1E3A8A]">{planVal}%</span></span>
        </div>
        <div className="h-3.5 w-px bg-neutral-200" />
        <div className="flex items-center gap-1.5 font-bold text-neutral-800">
          <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626] inline-block shadow-2xs" />
          <span>Actual: <span className="font-black text-[#DC2626]">{actualVal}%</span></span>
        </div>
      </div>
    </div>
  );
}
