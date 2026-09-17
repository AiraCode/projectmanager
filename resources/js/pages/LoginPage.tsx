import { useState, FormEvent } from 'react';
import { useNavigate, Navigate } from 'react-router';
import { Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@jeker.id');
  const [password, setPassword] = useState('admin123');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    const res = await login(email, password);
    setLoading(false);
    if (res.success) {
      navigate('/dashboard');
    } else {
      setError(res.error || 'Invalid credentials. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-neutral-50">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[46%] min-h-screen bg-sidebar p-12">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-brand flex items-center justify-center shadow-xs">
            <span className="text-white font-black text-base">J</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-white font-bold text-xl tracking-tight">JEKER</span>
            <span className="w-2 h-2 rounded-full bg-accent-red"></span>
          </div>
        </div>

        {/* Hero text */}
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/10 border border-white/15 text-[11px] font-semibold tracking-wider text-blue-200 uppercase mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-red"></span>
            Project Management System
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-5">
            Manage your factory<br />
            projects with<br />
            <span className="text-blue-300">precision.</span>
          </h1>
          <p className="text-white/60 text-[15px] leading-relaxed max-w-sm">
            From scheduling and S-Curve analysis to budget monitoring —
            all your project workflows in one place.
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: '17', label: 'Main Jobs' },
            { value: '78%', label: 'Progress' },
            { value: '105', label: 'Days Left' },
          ].map(({ value, label }) => (
            <div key={label} className="bg-white/5 border border-white/10 rounded-lg p-3.5">
              <div className="text-2xl font-bold text-white mb-1">{value}</div>
              <div className="text-[12px] text-white/50 font-medium">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right / form panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-16">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center shadow-xs">
              <span className="text-white font-bold text-sm">J</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-lg text-neutral-900 tracking-tight">JEKER</span>
              <span className="w-1.5 h-1.5 rounded-full bg-accent-red"></span>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-1.5">Welcome back</h2>
            <p className="text-neutral-500 text-[14px]">Sign in to your account to continue</p>
          </div>

          {/* Demo credentials hint */}
          <div className="mb-6 p-3.5 rounded-lg bg-brand-light border border-brand-border">
            <div className="text-[12px] font-semibold text-brand mb-1.5">Demo accounts (Sessions 1 & 2)</div>
            <div className="text-[11.5px] text-neutral-600 space-y-1">
              <div><span className="font-medium text-neutral-800">Admin 1 (Owner):</span> <code className="bg-white/80 px-1 py-0.5 rounded text-brand font-mono">admin@jeker.id</code> / <span className="text-neutral-500">admin123</span></div>
              <div><span className="font-medium text-neutral-800">Admin 2 (New Project):</span> <code className="bg-white/80 px-1 py-0.5 rounded text-brand font-mono">admin2@jeker.id</code> / <span className="text-neutral-500">admin123</span></div>
              <div><span className="font-medium text-neutral-800">PIC Engineering:</span> <code className="bg-white/80 px-1 py-0.5 rounded text-brand font-mono">engineering@jeker.id</code> / <span className="text-neutral-500">pic123</span></div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[13px] font-medium text-neutral-700 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="your@email.com"
                autoComplete="email"
                className={`w-full px-3.5 py-2.5 rounded-lg border text-[14px] outline-none transition-all
                  ${error ? 'border-danger focus:ring-2 focus:ring-danger/20' : 'border-neutral-200 focus:border-brand focus:ring-2 focus:ring-brand/15'}
                  bg-white text-neutral-900 placeholder-neutral-300`}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[13px] font-medium text-neutral-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`w-full px-3.5 py-2.5 pr-10 rounded-lg border text-[14px] outline-none transition-all
                    ${error ? 'border-danger focus:ring-2 focus:ring-danger/20' : 'border-neutral-200 focus:border-brand focus:ring-2 focus:ring-brand/15'}
                    bg-white text-neutral-900 placeholder-neutral-300`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-light border border-danger/20 text-danger text-[13px]">
                <AlertCircle size={14} className="flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg
                text-[14px] font-semibold text-white transition-all mt-2 shadow-xs
                ${loading
                  ? 'bg-brand/60 cursor-not-allowed'
                  : 'bg-brand hover:bg-brand-dark active:scale-[0.99]'}`}
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> Signing in…</>
              ) : 'Sign In'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-neutral-100">
            <p className="text-center text-[12px] text-neutral-400">
              JEKER v1.0 — PT Indoprima Gemilang
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
