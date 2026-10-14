'use client';

import { useState } from 'react';
import { useAuth, type AuthUser } from '@/src/lib/auth';
import { useI18n } from '@/src/lib/i18n';

const roleIcons: Record<string, string> = {
  owner: '👑',
  buyer: '🛒',
  supervisor: '📦',
  delivery: '📸',
  seller: '💰',
};

export function UserSwitcher() {
  const { currentUser, users, loginWithPin, logout, switchRoleDirect } = useAuth();
  const { locale } = useI18n();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const handleOpen = () => {
    setIsOpen(true);
    setError(null);
    setPin('');
    if (currentUser) {
      setSelectedUserId(currentUser.id);
    } else if (users.length > 0) {
      setSelectedUserId(users[0].id);
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !pin.trim()) return;
    setVerifying(true);
    setError(null);

    const res = await loginWithPin(selectedUserId, pin.trim());
    setVerifying(false);

    if (res.success) {
      setIsOpen(false);
      setPin('');
    } else {
      setError(res.error || 'Invalid PIN');
    }
  };

  const handleDirectSwitch = (role: AuthUser['role']) => {
    switchRoleDirect(role);
    setIsOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/90 px-2.5 py-1 text-xs font-semibold text-slate-200 transition-all hover:border-emerald-500/50 hover:text-white active:scale-95"
      >
        <span>{currentUser ? roleIcons[currentUser.role] || '👤' : '🌐'}</span>
        <span className="capitalize">{currentUser ? currentUser.name : 'All Roles'}</span>
        <span className="text-[10px] text-slate-400">▾</span>
      </button>

      {/* Modal Dialog */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>🔐</span> {locale === 'hi' ? 'प्रोफ़ाइल व पिन लॉगिन' : 'Switch User & PIN'}
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white text-base px-1"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-800/60 bg-rose-950/40 p-2.5 text-xs text-rose-300">
                {error}
              </div>
            )}

            {/* Quick Profile Tap Selector */}
            <div>
              <label className="mb-2 block text-xs font-medium text-slate-400">
                {locale === 'hi' ? 'त्वरित प्रोफ़ाइल चुनें:' : 'Select Profile:'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {users.map((u) => {
                  const isSelected = selectedUserId === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setSelectedUserId(u.id);
                        setError(null);
                      }}
                      className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 ring-1 ring-emerald-500'
                          : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-base">{roleIcons[u.role] || '👤'}</span>
                      <div>
                        <div className="font-bold">{u.name}</div>
                        <div className="text-[10px] text-slate-500 uppercase">{u.role}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4-Digit PIN Form */}
            <form onSubmit={handleVerifyPin} className="space-y-3 pt-2 border-t border-slate-800/60">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  {locale === 'hi' ? '4-अंकीय पिन दर्ज करें (डिफ़ॉल्ट: 1234):' : 'Enter 4-Digit PIN (Default: 1234):'}
                </label>
                <input
                  type="password"
                  maxLength={4}
                  pattern="[0-9]*"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-center text-lg font-mono tracking-widest text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={verifying || pin.length < 4}
                  className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
                >
                  {verifying ? 'Verifying...' : 'Login with PIN'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const found = users.find((u) => u.id === selectedUserId);
                    if (found) handleDirectSwitch(found.role);
                  }}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-semibold text-slate-300 hover:text-white"
                >
                  Quick Switch
                </button>
              </div>

              {currentUser && (
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    setIsOpen(false);
                  }}
                  className="w-full text-center text-xs text-rose-400 hover:underline pt-1"
                >
                  {locale === 'hi' ? 'लॉगआउट (सभी भूमिकाएँ दिखाएँ)' : 'Logout (Show All Roles)'}
                </button>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
