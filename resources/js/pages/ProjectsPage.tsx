import { usePage } from '@inertiajs/react';
import { Link } from '@inertiajs/react';
import { Building2, User, Calendar, TrendingUp, ChevronRight, FolderOpen, Plus } from 'lucide-react';
import { PageHeader, Card, ProgressBar, StatusBadge } from '@/components/ui';

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

export default function ProjectsPage() {
  const { projects, auth } = usePage().props as any;
  const role = auth?.user?.role ?? '';
  const isAdminProgres = role === 'admin_progres';

  return (
    <div className="p-5 sm:p-6 lg:p-8 max-w-screen-2xl space-y-6">
      <PageHeader
        title="All Projects"
        subtitle={isAdminProgres ? "View project progress — read only access" : "Select a project to open its full dashboard"}
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-brand-light text-brand border border-brand-border">
              <FolderOpen size={14} />
              {projects?.length ?? 0} Projects
            </span>
          </div>
        }
      />

      {(!projects || projects.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mb-4">
            <FolderOpen size={28} className="text-neutral-400" />
          </div>
          <h3 className="text-[15px] font-bold text-neutral-700 mb-1">No Projects Yet</h3>
          <p className="text-[13px] text-neutral-400">There are no projects created in the system.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {projects.map((project: Project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
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
                    {isAdminProgres ? 'View S-Curve →' : 'Open Dashboard →'}
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
    </div>
  );
}
