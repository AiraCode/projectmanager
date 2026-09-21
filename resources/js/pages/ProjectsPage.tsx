import { useState } from 'react';
import { usePage, Link, router } from '@inertiajs/react';
import { Building2, User, Calendar, TrendingUp, ChevronRight, FolderOpen, Plus, ShieldAlert, Sparkles } from 'lucide-react';
import { PageHeader, Card, ProgressBar, StatusBadge, Button, Modal } from '@/components/ui';

interface Project {
  id: number;
  name: string;
  company: string;
  manager: string;
  status: string;
  progress: number;
  start_date: string | null;
  end_date: string | null;
}

interface CompanyItem {
  id: number;
  name: string;
}

export default function ProjectsPage() {
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

    router.post('/projects', {
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
    <div className="p-5 sm:p-6 lg:p-8 max-w-screen-2xl space-y-6">
      <PageHeader
        title={isPIC && canCreate ? "Project Saya" : "All Projects"}
        subtitle={
          isAdminProgres
            ? "Monitoring S-Curve — Akses khusus grafik kemajuan kumulatif proyek"
            : isAdminUtama
            ? "Semua Proyek (Mode Read-Only) — Pilih proyek untuk membuka dashboard & detail WBS"
            : isPIC
            ? "Manajemen Proyek — Anda berwenang mengelola tugas dan sub-tugas proyek Anda"
            : "Daftar proyek dalam sistem"
        }
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
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-brand-light text-brand border border-brand-border">
              <FolderOpen size={14} />
              {projects?.length ?? 0} Projects
            </span>
          </div>
        }
      />

      {/* Role info alert */}
      {isAdminProgres && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3 text-[12.5px] text-amber-800">
          <ShieldAlert size={16} className="text-amber-600 flex-shrink-0" />
          <span>
            <strong>Role Admin Progres:</strong> Anda hanya memiliki otorisasi untuk memantau grafik <strong>S-Curve</strong>. Mengklik proyek di bawah akan langsung mengarahkan Anda ke grafik S-Curve.
          </span>
        </div>
      )}

      {isAdminUtama && (
        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3 text-[12.5px] text-blue-800">
          <Building2 size={16} className="text-blue-600 flex-shrink-0" />
          <span>
            <strong>Role Admin Utama:</strong> Anda dapat melihat seluruh proyek dari semua PIC (Read-Only). Anda <strong>tidak memiliki akses membuat proyek</strong> atau mengedit tugas.
          </span>
        </div>
      )}

      {(!projects || projects.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-2xl border border-neutral-200/80 p-8 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-4 text-brand">
            <FolderOpen size={28} />
          </div>
          <h3 className="text-[16px] font-bold text-neutral-800 mb-1">
            {canCreate && isPIC ? "Anda Belum Memiliki Project" : "Belum Ada Project"}
          </h3>
          <p className="text-[13px] text-neutral-500 max-w-md mb-5">
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {projects.map((project: Project) => (
            <Link
              key={project.id}
              href={isAdminProgres ? `/scurve?project_id=${project.id}` : `/projects/${project.id}`}
              className="group block"
            >
              <Card className="p-5 h-full flex flex-col gap-4 hover:shadow-md hover:border-brand/30 transition-all duration-200 cursor-pointer group-hover:-translate-y-0.5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
                        <FolderOpen size={14} className="text-brand" />
                      </div>
                      <span className="text-[11px] font-semibold text-brand uppercase tracking-wider">Project #{project.id}</span>
                    </div>
                    <h3 className="text-[14px] font-bold text-neutral-900 leading-snug line-clamp-2">
                      {project.name}
                    </h3>
                  </div>
                  <div className="flex-shrink-0">
                    <StatusBadge status={project.status as any} size="xs" />
                  </div>
                </div>

                {/* Meta info */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[12px] text-neutral-500">
                    <Building2 size={13} className="text-neutral-400 flex-shrink-0" />
                    <span className="truncate font-medium">{project.company}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-neutral-500">
                    <User size={13} className="text-neutral-400 flex-shrink-0" />
                    <span className="truncate">PIC: <span className="font-semibold text-neutral-700">{project.manager}</span></span>
                  </div>
                  {(project.start_date || project.end_date) && (
                    <div className="flex items-center gap-2 text-[12px] text-neutral-500">
                      <Calendar size={13} className="text-neutral-400 flex-shrink-0" />
                      <span>{project.start_date ?? '—'} → {project.end_date ?? '—'}</span>
                    </div>
                  )}
                </div>

                {/* Progress */}
                <div className="mt-auto pt-3 border-t border-neutral-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp size={12} className="text-brand" />
                      <span className="text-[11px] font-semibold text-neutral-600">Overall Progress</span>
                    </div>
                    <span className="text-[12px] font-bold text-brand">{project.progress}%</span>
                  </div>
                  <ProgressBar value={project.progress} size="sm" showLabel={false} />
                </div>

                {/* Open button */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-neutral-400 font-medium">
                    {isAdminProgres ? 'Buka S-Curve →' : 'Buka Dashboard →'}
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-neutral-100 group-hover:bg-brand group-hover:text-white flex items-center justify-center transition-colors">
                    <ChevronRight size={14} className="text-neutral-500 group-hover:text-white transition-colors" />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
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
                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-200 text-[13px] outline-none focus:border-brand"
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
