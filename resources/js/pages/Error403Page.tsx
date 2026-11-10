import React from 'react';
import { router } from '@inertiajs/react';
import { ShieldAlert, ArrowLeft, LogOut, LogIn } from 'lucide-react';

interface Error403Props {
  message?: string;
  user?: {
    username: string;
    email: string;
    role: string;
  } | null;
  dashboardUrl?: string;
}

export default function Error403Page({
  message = 'Access Denied: This area is restricted to SuperAdmin only.',
  user = null,
  dashboardUrl = '/',
}: Error403Props) {
  const handleBackToDashboard = () => {
    if (dashboardUrl) {
      router.visit(dashboardUrl);
    } else {
      window.location.href = '/';
    }
  };

  const handleLogout = () => {
    router.post('/logout', {}, {
      onFinish: () => {
        window.location.href = '/login';
      },
    });
  };

  return (
    <div className="min-h-screen w-full bg-neutral-50 flex flex-col items-center justify-center p-6 selection:bg-violet-200 selection:text-violet-900">
      <div className="max-w-xl w-full flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in duration-300">
        
        {/* Shield Icon */}
        <div className="relative w-40 h-40 mx-auto flex items-center justify-center">
          <div className="absolute inset-0 bg-violet-400/15 rounded-full blur-2xl animate-pulse" />
          <div className="bg-white p-6 rounded-full shadow-xl border-4 border-violet-100 relative">
            <ShieldAlert size={60} className="text-violet-600 stroke-[2]" />
          </div>
        </div>

        {/* Status & Title */}
        <div className="space-y-3">
          <div className="inline-block px-3 py-1 rounded-full text-[12px] font-extrabold tracking-wider uppercase bg-violet-100 text-violet-700 border border-violet-200">
            HTTP ERROR 403
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-neutral-900 tracking-tight">
            Access <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Denied</span>
          </h1>
          <p className="text-neutral-600 max-w-md mx-auto text-[14.5px] leading-relaxed">
            {message}
          </p>
        </div>

        {/* User Info Badge if Logged In */}
        {user ? (
          <>
            <div className="bg-white px-4 py-2.5 rounded-xl border border-neutral-200/80 shadow-2xs text-[12.5px] text-neutral-600 flex flex-wrap items-center justify-center gap-2">
              <span className="text-neutral-400">Currently logged in as:</span>
              <span className="font-bold text-neutral-900">{user.username}</span>
              <span className="text-neutral-300">•</span>
              <span className="text-neutral-500 font-mono text-[11.5px]">{user.email}</span>
              <span className="text-neutral-300">•</span>
              <span className="px-2 py-0.5 rounded-md font-semibold text-[11px] bg-violet-50 text-violet-700 border border-violet-200 uppercase tracking-wide">
                {user.role}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleBackToDashboard}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white text-[13px] font-bold shadow-md shadow-violet-500/20 transition-all hover:-translate-y-0.5 hover:shadow-violet-500/35 active:scale-95 bg-gradient-to-r from-violet-600 to-indigo-600 cursor-pointer"
              >
                <ArrowLeft size={16} className="stroke-[2.5]" />
                Back to Dashboard
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-red-600 hover:text-red-700 bg-white border border-red-200 hover:border-red-300 hover:bg-red-50/80 text-[13px] font-bold shadow-xs transition-all hover:-translate-y-0.5 active:scale-95 cursor-pointer"
              >
                <LogOut size={16} className="stroke-[2]" />
                Log Out
              </button>
            </div>
          </>
        ) : (
          /* Guest Actions */
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => { window.location.href = '/login'; }}
              className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl text-white text-[13.5px] font-bold shadow-md shadow-violet-500/25 transition-all hover:-translate-y-0.5 active:scale-95 bg-gradient-to-r from-violet-600 to-indigo-600 cursor-pointer"
            >
              <LogIn size={16} className="stroke-[2.5]" />
              Go to Login
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

