import React, { useState } from 'react';
import {
  LogIn,
  Mail,
  User,
  ShieldAlert,
  Copy,
  Check,
  ExternalLink,
  X,
  Loader2,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { firebaseConfig } from '../services/firebase.ts';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const {
    signIn,
    signInGuest,
    signInWithEmail,
    signUpWithEmail,
    authError,
    clearAuthError,
  } = useAuth();

  const [mode, setMode] = useState<'options' | 'email-signin' | 'email-signup'>('options');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentDomain = typeof window !== 'undefined' ? window.location.hostname : '';

  const handleCopyDomain = () => {
    if (currentDomain) {
      navigator.clipboard.writeText(currentDomain);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2000);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setLocalError(null);
      await signIn();
      onClose();
    } catch (err: any) {
      setLocalError(err?.message || 'Google sign-in failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestSignIn = async () => {
    try {
      setIsLoading(true);
      setLocalError(null);
      await signInGuest();
      onClose();
    } catch (err: any) {
      setLocalError(err?.message || 'Guest sign-in failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setLocalError('Please enter both email and password.');
      return;
    }

    try {
      setIsLoading(true);
      setLocalError(null);
      if (mode === 'email-signin') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
      onClose();
    } catch (err: any) {
      setLocalError(err?.message || 'Email authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const isUnauthorizedDomain = authError?.isUnauthorizedDomain || localError?.includes('auth/unauthorized-domain');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-neutral-200 overflow-hidden text-[#37352F]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between bg-[#FAF9F8]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#37352F] text-white flex items-center justify-center font-bold text-xs">
              N
            </div>
            <h3 className="font-semibold text-sm">Sign in to Notion Cloud</h3>
          </div>
          <button
            type="button"
            onClick={() => {
              clearAuthError();
              onClose();
            }}
            className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          {/* Domain Whitelist Notice if unauthorized-domain error occurred on Vercel */}
          {isUnauthorizedDomain && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-2">
              <div className="flex items-start gap-2 font-medium text-amber-900">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>Google OAuth Domain Not Whitelisted Yet</span>
              </div>
              <p className="text-amber-800 leading-relaxed">
                Firebase Authentication restricts Google OAuth to approved domains. To enable Google Sign-In on this Vercel deployment:
              </p>
              <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded border border-amber-200 font-mono text-[11px] text-amber-950">
                <span className="truncate flex-1">{currentDomain}</span>
                <button
                  type="button"
                  onClick={handleCopyDomain}
                  className="flex items-center gap-1 text-[11px] text-amber-700 hover:text-amber-900 font-sans"
                >
                  {copiedDomain ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedDomain ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="text-[11px] text-amber-700 leading-tight">
                Add this domain in <strong>Firebase Console &gt; Authentication &gt; Settings &gt; Authorized domains</strong>.
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleGuestSignIn}
                  disabled={isLoading}
                  className="w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Use Instant Guest Cloud Login Instead (No setup needed)</span>
                </button>
              </div>
            </div>
          )}

          {/* General Error Alert */}
          {(localError || (authError && !isUnauthorizedDomain)) && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">{localError || authError?.message}</div>
            </div>
          )}

          {mode === 'options' ? (
            <div className="space-y-3">
              {/* Google Sign-in */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 bg-[#37352F] text-white hover:bg-black rounded-lg text-xs font-medium transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>Continue with Google</span>
              </button>

              <div className="relative my-3 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-neutral-200" />
                </div>
                <span className="relative bg-white px-2 text-[11px] text-neutral-400">or</span>
              </div>

              {/* Instant Guest / Anonymous Login (Works instantly on ANY deployment) */}
              <button
                type="button"
                onClick={handleGuestSignIn}
                disabled={isLoading}
                className="w-full flex items-center justify-between py-2 px-3.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <div className="text-left">
                    <div className="text-[#37352F] font-medium">Instant Cloud Guest Access</div>
                    <div className="text-[10px] text-neutral-500">1-click real Firebase sync, no password needed</div>
                  </div>
                </div>
                <User className="w-4 h-4 text-neutral-400" />
              </button>

              {/* Email / Password Option */}
              <button
                type="button"
                onClick={() => setMode('email-signin')}
                disabled={isLoading}
                className="w-full flex items-center justify-between py-2 px-3.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4 text-blue-500" />
                  <div className="text-left">
                    <div className="text-[#37352F] font-medium">Sign in with Email</div>
                    <div className="text-[10px] text-neutral-500">Works everywhere without domain whitelist</div>
                  </div>
                </div>
                <LogIn className="w-4 h-4 text-neutral-400" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-neutral-600 mb-1">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:border-neutral-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-600 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full text-xs px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:border-neutral-800"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2 bg-[#37352F] hover:bg-black text-white text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{mode === 'email-signin' ? 'Sign In' : 'Create Account'}</span>
              </button>

              <div className="flex items-center justify-between pt-1 text-[11px] text-neutral-500">
                <button
                  type="button"
                  onClick={() => setMode('options')}
                  className="hover:underline text-neutral-600"
                >
                  &larr; Back to all options
                </button>
                <button
                  type="button"
                  onClick={() => setMode(mode === 'email-signin' ? 'email-signup' : 'email-signin')}
                  className="hover:underline text-blue-600 font-medium"
                >
                  {mode === 'email-signin' ? "Don't have an account? Sign up" : 'Already have account? Sign in'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#FAF9F8] border-t border-neutral-100 text-[11px] text-neutral-500 text-center">
          Workspace data &amp; uploads are stored securely on Firebase Firestore &amp; Storage.
        </div>
      </div>
    </div>
  );
};
