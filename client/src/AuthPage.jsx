import { useState } from 'react'
import { browserLocalPersistence, createUserWithEmailAndPassword, setPersistence, signInWithEmailAndPassword } from 'firebase/auth'
import { ArrowRight, ListChecks, LoaderCircle, Moon, Sun } from 'lucide-react'
import { auth } from './firebase'

export default function AuthPage({ initialIsSignup = false, onClose, theme, onToggleTheme }) {
  const [isSignup, setIsSignup] = useState(initialIsSignup)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (!auth) throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to client/.env.local.')
      await setPersistence(auth, browserLocalPersistence)
      if (isSignup) await createUserWithEmailAndPassword(auth, email.trim(), password)
      else await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (authError) {
      const messages = {
        'auth/email-already-in-use': 'An account already uses this email. Try signing in instead.',
        'auth/invalid-credential': 'Email or password is incorrect.',
        'auth/invalid-email': 'Enter a valid email address.',
        'auth/operation-not-allowed': 'Email/password sign-in is disabled for this Firebase project. In Firebase Console, open Authentication → Sign-in method (or Providers), enable Email/Password, save, then try again.',
        'auth/weak-password': 'Use a password with at least 6 characters.',
        'auth/network-request-failed': 'Could not connect. Check your internet connection and try again.',
      }
      setError(messages[authError.code] || authError.message || 'Could not authenticate. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="auth-theme-toggle icon-button" aria-label={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'} onClick={onToggleTheme}>
        {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
      </button>
      <section className="auth-card">
        <span className="auth-brand"><ListChecks size={22} /></span>
        <p className="eyebrow mt-6">MCQ PRACTICE</p>
        <h1 id="auth-title" className="mt-2 text-2xl font-bold tracking-tight">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{isSignup ? 'Create an account to keep your practice progress synced.' : 'Sign in to keep your practice progress synced.'} Account is optional.</p>
        {!auth && <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">Configure Firebase Authentication and Firestore to enable student accounts.</p>}
        {error && <p role="alert" className="mt-5 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="form-label">Email address
            <input className="form-input mt-2" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="form-label">Password
            <input className="form-input mt-2" type="password" minLength={6} autoComplete={isSignup ? 'new-password' : 'current-password'} required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button className="button-primary w-full" type="submit" disabled={busy || !auth}>
            {busy ? <LoaderCircle className="animate-spin" size={17} /> : null}
            {isSignup ? 'Create account' : 'Sign in'} {!busy && <ArrowRight size={16} />}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-muted">
          {isSignup ? 'Already registered?' : 'New here?'}{' '}
          <button className="font-semibold text-accent hover:underline" type="button" onClick={() => { setError(''); setIsSignup((value) => !value) }}>
            {isSignup ? 'Sign in' : 'Create an account'}
          </button>
        </p>
        <button className="mt-5 w-full text-center text-sm font-semibold text-accent hover:underline" type="button" onClick={onClose}>
          Continue as a guest
        </button>
      </section>
    </main>
  )
}
