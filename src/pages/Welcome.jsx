/**
 * Full-screen welcome / sign-in flow for the online version.
 * Steps follow the cloud account state: sign in · create account · verify email ·
 * claim ownership · waiting for approval. "Continue offline" keeps the app usable.
 */
import React, { useEffect, useState } from 'react';
import { Icon, Field, Segmented, useToast } from '../components/ui.jsx';
import InstallButton from '../components/InstallButton.jsx';
import { useT, LANGUAGES } from '../i18n/index.js';
import { useSettings, updateSettings } from '../lib/settings.js';
import {
  useCloudAccount, signIn, signUp, resetPassword, resendVerification, signOut,
  checkVerified, claim, refreshAccount, authErrorText,
} from '../hooks/useCloudAccount.js';

function AppearanceToggles() {
  const { appearance } = useSettings();
  const setA = (patch) => updateSettings((s) => ({ ...s, appearance: { ...s.appearance, ...patch } }));
  return (
    <div className="flex items-center gap-2">
      <Segmented size="sm" ariaLabel="Language" value={appearance.language}
        options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))} onChange={(language) => setA({ language })} />
      <button type="button" className="btn-icon btn-sm rounded-full text-muted"
        aria-label="Theme"
        onClick={() => setA({ theme: document.documentElement.classList.contains('dark') ? 'light' : 'dark' })}>
        <Icon name={appearance.theme === 'dark' || (appearance.theme === 'auto' && document.documentElement.classList.contains('dark')) ? 'sun' : 'moon'} className="h-4 w-4" />
      </button>
    </div>
  );
}

function BrandPanel() {
  const t = useT();
  const { company } = useSettings();
  const features = [
    ['scan', t('Scan barcodes & medicine packs with your camera')],
    ['wifi', t('Works offline — syncs when you are back online')],
    ['shield', t('Only people you approve can see your data')],
    ['share', t('Share invoices by WhatsApp or PDF in one tap')],
  ];
  return (
    <div className="relative hidden overflow-hidden bg-brand-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="pointer-events-none absolute -end-24 -top-24 h-96 w-96 rounded-full bg-brand-500/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -start-16 h-96 w-96 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="relative flex items-center gap-3">
        <img src={company.logo || './icon-192.png'} alt="" className="h-12 w-12 rounded-2xl bg-white object-contain" />
        <div>
          <div className="text-2xl font-extrabold tracking-tight">{company.name}</div>
          <div className="text-xs uppercase tracking-[0.2em] text-brand-300">{t('Point of Sale')}</div>
        </div>
      </div>
      <div className="relative">
        <h2 className="max-w-md text-4xl font-bold leading-tight">{t('Invoicing & POS built for pharmacy and dermo-cosmetics.')}</h2>
        <ul className="mt-8 space-y-4">
          {features.map(([icon, text]) => (
            <li key={icon} className="flex items-center gap-3 text-brand-100">
              <span className="rounded-xl bg-white/10 p-2"><Icon name={icon} className="h-5 w-5" /></span>{text}
            </li>
          ))}
        </ul>
      </div>
      <p className="relative text-xs text-brand-300">© {new Date().getFullYear()} {company.name}</p>
    </div>
  );
}

function AuthForm() {
  const t = useT();
  const toast = useToast();
  const [mode, setMode] = useState('signin'); // signin | signup | reset
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'signin') await signIn(form.email, form.password);
      if (mode === 'signup') await signUp(form.email, form.password);
      if (mode === 'reset') {
        await resetPassword(form.email);
        toast(t('Password reset email sent'));
        setMode('signin');
      }
    } catch (err) {
      setError(authErrorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  const titles = { signin: t('Welcome back'), signup: t('Create your account'), reset: t('Reset your password') };
  const subs = {
    signin: t('Sign in to sync your sales, stock and customers.'),
    signup: t('Use your work email. We will send a link to verify it.'),
    reset: t('Enter your email and we will send you a reset link.'),
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{titles[mode]}</h1>
        <p className="mt-1 text-sm text-muted">{subs[mode]}</p>
      </div>
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-rose-500/10 px-3 py-2.5 text-sm text-rose-700 dark:text-rose-300">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </div>
      )}
      <Field label={t('Email')}>
        <input className="input" type="email" autoComplete="email" required value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" />
      </Field>
      {mode !== 'reset' && (
        <Field label={t('Password')}>
          <div className="relative">
            <input className="input pe-20" type={showPw ? 'text' : 'password'} required minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button type="button" className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:text-ink"
              onClick={() => setShowPw((v) => !v)}>{showPw ? t('Hide') : t('Show')}</button>
          </div>
        </Field>
      )}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy && <Icon name="refresh" className="h-4 w-4 animate-spin" />}
        {mode === 'signin' ? t('Sign in') : mode === 'signup' ? t('Create account') : t('Send reset link')}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        {mode === 'signin' ? (
          <>
            <button type="button" className="font-semibold text-accent hover:underline" onClick={() => { setMode('signup'); setError(''); }}>{t('Create an account')}</button>
            <button type="button" className="text-muted hover:text-ink" onClick={() => { setMode('reset'); setError(''); }}>{t('Forgot password?')}</button>
          </>
        ) : (
          <button type="button" className="font-semibold text-accent hover:underline" onClick={() => { setMode('signin'); setError(''); }}>
            {t('Already have an account? Sign in')}
          </button>
        )}
      </div>
    </form>
  );
}

function StepCard({ icon, tone = 'brand', title, children }) {
  const tones = {
    brand: 'from-brand-500 to-brand-700',
    amber: 'from-amber-400 to-amber-600',
    sky: 'from-sky-400 to-sky-600',
  };
  return (
    <div className="space-y-4 text-center animate-fade-in">
      <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${tones[tone]}`}>
        <Icon name={icon} className="h-8 w-8" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
      {children}
    </div>
  );
}

function VerifyStep({ email }) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // Detect verification automatically while the user is in their inbox.
  useEffect(() => {
    const id = setInterval(() => { checkVerified().catch(() => {}); }, 5000);
    return () => clearInterval(id);
  }, []);
  return (
    <StepCard icon="mail" tone="sky" title={t('Check your inbox')}>
      <p className="text-sm text-muted">{t('We sent a verification link to {email}. Open it and this page continues automatically.', { email })}</p>
      <div className="flex items-center justify-center gap-2 text-xs text-faint"><Icon name="refresh" className="h-3.5 w-3.5 animate-spin" />{t('Waiting for verification…')}</div>
      <div className="grid gap-2 pt-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={async () => {
          setBusy(true);
          try { if (!(await checkVerified())) toast(t('Not verified yet — open the link in the email first.'), 'warn'); } finally { setBusy(false); }
        }}>{t("I've verified my email")}</button>
        <button type="button" className="btn-secondary" onClick={async () => {
          try { await resendVerification(); toast(t('Verification email sent again')); } catch (err) { toast(authErrorText(err, t), 'error'); }
        }}>{t('Resend email')}</button>
        <button type="button" className="btn-ghost" onClick={() => signOut()}>{t('Use a different account')}</button>
      </div>
      <p className="text-xs text-faint">{t("Can't find it? Check your spam folder.")}</p>
    </StepCard>
  );
}

function ClaimStep({ email }) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <StepCard icon="shield" title={t('Set up your business')}>
      <p className="text-sm text-muted">{t('You are the first person here. Claim ownership to become the administrator of this PureLab account.')}</p>
      <ul className="space-y-2 rounded-2xl bg-subtle p-4 text-start text-sm text-muted">
        <li className="flex gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{t('You can see and manage all sales, stock and customers.')}</li>
        <li className="flex gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{t('You decide which staff emails may sign in.')}</li>
        <li className="flex gap-2"><Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />{t('Ownership is permanent and belongs to {email}.', { email })}</li>
      </ul>
      <div className="grid gap-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await claim(); toast(t('You are now the owner')); } catch (err) { toast(authErrorText(err, t), 'error'); } finally { setBusy(false); }
        }}>{t('Claim ownership')}</button>
        <button type="button" className="btn-ghost" onClick={() => signOut()}>{t('Sign out')}</button>
      </div>
    </StepCard>
  );
}

function PendingStep({ email, ownerEmail }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const id = setInterval(() => { refreshAccount(); }, 15000);
    return () => clearInterval(id);
  }, []);
  return (
    <StepCard icon="users" tone="amber" title={t('Waiting for approval')}>
      <p className="text-sm text-muted">{t('Your account {email} is ready. Ask the owner to add this email in Settings → Cloud & Team.', { email })}</p>
      {ownerEmail && <p className="text-xs text-faint">{t('Owner: {email}', { email: ownerEmail })}</p>}
      <div className="grid gap-2 pt-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); await refreshAccount(); setBusy(false); }}>
          {busy && <Icon name="refresh" className="h-4 w-4 animate-spin" />}{t('Check again')}
        </button>
        <button type="button" className="btn-ghost" onClick={() => signOut()}>{t('Sign out')}</button>
      </div>
    </StepCard>
  );
}

/** The sign-in / verify / claim / pending step for the current account state. */
export function AccountSteps() {
  const account = useCloudAccount();
  const email = account.user?.email;
  if (account.state === 'unverified') return <VerifyStep email={email} />;
  if (account.state === 'no-owner') return <ClaimStep email={email} />;
  if (account.state === 'pending') return <PendingStep email={email} ownerEmail={account.owner?.email} />;
  return <AuthForm />;
}

export default function Welcome() {
  const t = useT();
  const { company } = useSettings();
  const body = <AccountSteps />;

  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel />
      <div className="flex min-h-full flex-col px-5 pb-6 pt-[max(1rem,env(safe-area-inset-top))] sm:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 lg:invisible">
            <img src={company.logo || './icon-192.png'} alt="" className="h-9 w-9 rounded-xl bg-white object-contain" />
            <span className="font-extrabold tracking-tight text-accent">{company.name}</span>
          </div>
          <AppearanceToggles />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          {body}
        </div>
        <div className="mx-auto w-full max-w-sm space-y-3 text-center">
          <InstallButton variant="link" />
          <button type="button" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
            onClick={() => updateSettings({ offlineMode: true })}>
            {t('Continue offline on this device')}
          </button>
        </div>
      </div>
    </div>
  );
}
