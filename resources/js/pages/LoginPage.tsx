import { useState, FormEvent } from 'react';
import { usePage, router } from '@inertiajs/react';
import { Eye, EyeOff, AlertCircle, Loader2, Mail, Lock, Layers, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const { auth, errors } = usePage().props as any;
  const user = auth?.user;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(errors?.email || '');

  if (user) {
    if (typeof window !== 'undefined') window.location.href = '/projectlistpage';
    return null;
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Email dan password wajib diisi.');
      return;
    }
    setLoading(true);
    
    router.post('/login', { email, password }, {
      onError: (err) => {
        setLoading(false);
        setError(err.email || 'Email atau password tidak sesuai.');
      },
      onFinish: () => setLoading(false)
    });
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F8FAFC] font-sans selection:bg-brand selection:text-white">
      {/* Left decorative & showcase panel */}
      <div className="relative hidden lg:flex flex-col justify-between w-[48%] min-h-screen bg-[#090E1A] p-12 lg:p-16 overflow-hidden">
        {/* Ambient background glows */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-brand/30 rounded-full blur-[100px] pointer-events-none animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute top-1/3 -right-28 w-80 h-80 bg-blue-500/20 rounded-full blur-[90px] pointer-events-none" />
        <div className="absolute -bottom-24 left-1/4 w-80 h-80 bg-indigo-600/20 rounded-full blur-[90px] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none opacity-40" />

        {/* Top Logo Header */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand to-blue-500 flex items-center justify-center shadow-lg shadow-brand/25 transition-all duration-300 hover:scale-105 cursor-pointer">
              <span className="text-white font-black text-lg tracking-tight">J</span>
            </div>
            <div className="font-black text-2xl tracking-tight text-white flex items-center gap-2">
              JEKER
            </div>
          </div>
        </div>

        {/* Middle: Hero text */}
        <div className="relative z-10 my-auto py-6">
          {/* Prominent Header Badge */}
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-400/30 backdrop-blur-md shadow-[0_0_20px_rgba(59,130,246,0.15)] mb-6 transition-all hover:bg-blue-500/15 hover:border-blue-400/50">
            <Layers size={15} className="text-blue-400" />
            <span className="text-[12px] font-extrabold tracking-[0.16em] text-blue-300 uppercase">
              Project Management System
            </span>
          </div>

          <h1 className="text-4xl lg:text-[46px] font-black text-white leading-[1.15] tracking-tight mb-5">
            Manage your factory<br />
            projects with<br />
            <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
              precision.
            </span>
          </h1>

          <p className="text-slate-300/85 text-[15px] lg:text-[15.5px] leading-relaxed max-w-lg font-normal">
            Platform terpadu untuk monitoring proyek industri, evaluasi deviasi kurva S mingguan, pengawasan struktur pekerjaan (WBS), dan pengendalian realisasi anggaran secara real-time.
          </p>
        </div>
      </div>

      {/* Right / form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-16 relative">
        {/* Subtle background glow for right side */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-100/40 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md relative z-10">
          {/* Mobile logo header */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center shadow-md shadow-brand/20">
              <span className="text-white font-black text-lg">J</span>
            </div>
            <div className="font-black text-2xl text-neutral-900 tracking-tight">
              JEKER
            </div>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2">
              Welcome back
            </h2>
            <p className="text-slate-500 text-[14px] leading-normal font-medium">
              Sign in to your account to continue
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4.5">
            {/* Email */}
            <div>
              <label className="block text-[12.5px] font-bold text-slate-700 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Mail size={13} className="text-slate-400" />
                  Email address
                </span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="nama@jeker.id"
                autoComplete="email"
                className={`w-full px-3.5 py-2.5 rounded-xl border text-[14px] outline-none transition-all duration-200
                  ${error ? 'border-danger focus:ring-4 focus:ring-danger/15' : 'border-slate-200 focus:border-brand focus:ring-4 focus:ring-brand/10'}
                  bg-white text-slate-900 placeholder-slate-400 shadow-2xs font-medium`}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[12.5px] font-bold text-slate-700 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Lock size={13} className="text-slate-400" />
                  Password
                </span>
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`w-full px-3.5 py-2.5 pr-10 rounded-xl border text-[14px] outline-none transition-all duration-200
                    ${error ? 'border-danger focus:ring-4 focus:ring-danger/15' : 'border-slate-200 focus:border-brand focus:ring-4 focus:ring-brand/10'}
                    bg-white text-slate-900 placeholder-slate-400 shadow-2xs font-medium`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 transition-colors"
                  title={showPw ? 'Sembunyikan password' : 'Lihat password'}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-danger-light border border-danger/25 text-danger text-[13px] font-medium shadow-xs animate-shake">
                <AlertCircle size={16} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`group w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl
                text-[14px] font-bold text-white transition-all duration-200 mt-2 shadow-md cursor-pointer
                ${loading
                  ? 'bg-brand/60 cursor-not-allowed'
                  : 'bg-brand hover:bg-brand-dark active:scale-[0.99] hover:shadow-lg hover:shadow-brand/25'}`}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Clean Footer without PT Indoprima Gemilang */}
          <div className="mt-12 pt-6 border-t border-slate-200/80">
            <p className="text-center text-[12px] text-slate-400 font-medium">
              JEKER v1.0
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


