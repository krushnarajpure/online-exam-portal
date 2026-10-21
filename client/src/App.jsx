import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, CircleHelp,
  Clock3, Gauge, GraduationCap, Layers3, ListChecks, LoaderCircle, LogOut,
  LogIn, Moon, RotateCcw, Send, Sparkles, Square, Sun, Target, UserPlus,
  Volume2, X,
} from 'lucide-react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import AuthPage from './AuthPage'
import { getQuestions, getSpeech, getTranslations } from './api'
import { auth, trackAnalyticsEvent } from './firebase'
import { recentQuestionIds, loadAttempts, loadLocalAttempts, mergeAttempts, saveCompletedAttempt, saveLocalAttempt } from './progress'
import { selectExamQuestions } from './exam'
import { filterPracticeQuestions, getQuestionUnit } from './practice'

const sections = [
  { id: 'subjects', label: 'Subjects', icon: BookOpen, description: 'Practice by subject' },
  { id: 'end-sem', label: 'End-Sem Exam', icon: GraduationCap, description: 'Exam preparation' },
  { id: 'practicals', label: 'Practicals', icon: Layers3, description: 'Practical questions' },
]

function App() {
  const [user, setUser] = useState(null)
  const [authError, setAuthError] = useState('')
  const [authView, setAuthView] = useState(null)
  const [questions, setQuestions] = useState([])
  const [attempts, setAttempts] = useState([])
  const [view, setView] = useState('home')
  const [section, setSection] = useState('end-sem')
  const [subject, setSubject] = useState('')
  const [mode, setMode] = useState('')
  const [marksFilter, setMarksFilter] = useState(null)
  const [selectedQuestionIds, setSelectedQuestionIds] = useState(null)
  const [questionCount, setQuestionCount] = useState(null)
  const [quizAttempt, setQuizAttempt] = useState(0)
  const [language, setLanguage] = useState(() => localStorage.getItem('mcq-language') || 'en')
  const [theme, setTheme] = useState(() => localStorage.getItem('mcq-theme') || 'light')
  const [busy, setBusy] = useState(true)
  const [attemptsBusy, setAttemptsBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!auth) return undefined
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setAuthError('')
      if (nextUser) {
        setView('home')
        setSubject('')
        setAuthView(null)
      } else {
        setAttempts([])
        setView((current) => current === 'dashboard' ? 'home' : current)
      }
    }, (authListenerError) => {
      setAuthError(authListenerError.message)
    })
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('mcq-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('mcq-language', language)
  }, [language])

  useEffect(() => {
    let active = true
    setBusy(true)
    setError('')
    getQuestions()
      .then((items) => { if (active) setQuestions(items) })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [])

  async function refreshAttempts() {
    const uid = user?.uid || null
    const isCurrentUser = () => (auth?.currentUser?.uid || null) === uid
    setAttemptsBusy(true)
    try {
      const localHistory = loadLocalAttempts(uid)
      if (isCurrentUser()) setAttempts(localHistory)
      if (uid) {
        try {
          const cloudHistory = await loadAttempts(uid)
          if (isCurrentUser()) setAttempts(mergeAttempts(localHistory, cloudHistory))
        } catch (requestError) {
          if (isCurrentUser()) setError(`Could not sync progress from your account. Showing attempts saved on this device: ${requestError.message}`)
        }
      }
    } catch (requestError) {
      if (isCurrentUser()) setError(requestError.message)
    } finally {
      if (isCurrentUser()) setAttemptsBusy(false)
    }
  }

  useEffect(() => {
    refreshAttempts()
  }, [user?.uid])

  const subjects = useMemo(() => [...new Set(
    questions.filter((item) => item.category === section).map((item) => item.subject),
  )].sort((a, b) => a.localeCompare(b)), [questions, section])

  function goHome(nextSection = 'end-sem') {
    trackAnalyticsEvent('study_section_opened', { section: nextSection })
    setSection(nextSection)
    setSubject('')
    setMode('')
    setSelectedQuestionIds(null)
    setView('home')
  }

  function openSubject(name) {
    trackAnalyticsEvent('subject_opened', { section })
    setSubject(name)
    setMode('')
    setSelectedQuestionIds(null)
    setView('subject')
  }

  function startMode(nextMode, marks = null, count = null, questionIds = null) {
    trackAnalyticsEvent('quiz_started', { mode: nextMode, section, marks, question_count: count })
    setMode(nextMode)
    setMarksFilter(marks)
    setSelectedQuestionIds(questionIds)
    setQuestionCount(count)
    setQuizAttempt((current) => current + 1)
    setView('quiz')
  }

  async function logout() {
    try {
      if (auth) await signOut(auth)
    } catch (logoutError) {
      setError(`Could not sign out: ${logoutError.message}`)
    }
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line header-surface backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-7">
          <button className="flex items-center gap-3 text-left" onClick={() => goHome()}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white"><ListChecks size={19} /></span>
            <span className="text-[17px] font-bold tracking-tight">MCQ Practice</span>
          </button>
          <div className="flex items-center gap-2">
            {user ? (
              <span className="hidden max-w-48 truncate rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-muted sm:inline" title={user.email}>{user.email}</span>
            ) : (
              <>
                <button className="button-secondary" onClick={() => setAuthView('signin')}><LogIn size={15} /> Log in</button>
                <button className="button-primary" onClick={() => setAuthView('signup')}><UserPlus size={15} /> Sign up</button>
              </>
            )}
            <button className="icon-button" aria-label={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'} title={theme === 'dark' ? 'Day mode' : 'Night mode'} onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className="icon-button" aria-label="Open progress dashboard" title="Progress dashboard" onClick={() => setView('dashboard')}><Gauge size={17} /></button>
            {user && <button className="icon-button" aria-label="Sign out" title="Sign out" onClick={logout}><LogOut size={17} /></button>}
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px]">
        <aside className="hidden w-[244px] shrink-0 border-r border-line side-surface px-4 py-7 md:block">
          <p className="eyebrow px-3">YOUR WORKSPACE</p>
          <nav className="mt-4 space-y-1">
            {sections.map((item) => {
              const Icon = item.icon
              const count = questions.filter((question) => question.category === item.id).length
              return (
                <button key={item.id} onClick={() => goHome(item.id)} className={`nav-item ${section === item.id && view !== 'dashboard' ? 'nav-item-active' : ''}`}>
                  <Icon size={18} /><span className="flex-1 text-left">{item.label}</span><span className="text-xs opacity-70">{count}</span>
                </button>
              )
            })}
            <button onClick={() => setView('dashboard')} className={`nav-item ${view === 'dashboard' ? 'nav-item-active' : ''}`}><Gauge size={18} /><span className="flex-1 text-left">My progress</span></button>
          </nav>
          <section className="mt-7 rounded-2xl border border-line p-4">
            <p className="text-xs font-semibold text-ink">Language / भाषा / भाषा</p>
            <div className="mt-3 flex items-center gap-1 rounded-lg bg-slate-100 p-1" aria-label="Translation language">
              <button type="button" onClick={() => setLanguage('en')} className={`language-button flex-1 ${language === 'en' ? 'language-button-active' : ''}`}>English</button>
              <button type="button" onClick={() => setLanguage('mr')} className={`language-button flex-1 ${language === 'mr' ? 'language-button-active' : ''}`}>मराठी</button>
              <button type="button" onClick={() => setLanguage('hi')} className={`language-button flex-1 ${language === 'hi' ? 'language-button-active' : ''}`}>हिन्दी</button>
            </div>
          </section>
          <div className="mt-10 rounded-2xl bg-slate-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-indigo-600"><Sparkles size={16} /><span className="text-xs font-semibold">Language support</span></div>
            <p className="text-xs leading-5 text-muted">Use English, Marathi, or Hindi for questions and options.</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-7 sm:px-7 sm:py-9 lg:px-10">
          {authError && <Alert message={`Account sign-in is unavailable: ${authError}`} onClose={() => setAuthError('')} />}
          {error && <Alert message={error} onClose={() => setError('')} />}
          {busy && questions.length === 0 ? (
            <div className="flex min-h-[55vh] items-center justify-center gap-3 text-muted"><LoaderCircle className="animate-spin" size={20} /> Loading your questions…</div>
          ) : view === 'dashboard' ? (
            <ProgressDashboard attempts={attempts} busy={attemptsBusy} onRefresh={refreshAttempts} isSignedIn={Boolean(user)} />
          ) : view === 'subject' ? (
            <SubjectPage key={`${section}-${subject}`} subject={subject} section={section} questions={questions}
              onBack={() => goHome(section)} onStart={startMode} />
          ) : view === 'quiz' ? (
            <QuizPage key={quizAttempt}
              questions={questions.filter((item) => item.category === section && item.subject === subject && (marksFilter === null || item.marks === marksFilter) && (!selectedQuestionIds || selectedQuestionIds.includes(item.id)))}
              subject={subject} section={section} mode={mode} questionCount={questionCount}
              previousIds={recentQuestionIds(attempts, section, subject)} user={user}
              language={language} onLanguageChange={setLanguage} onSaved={refreshAttempts}
              onBack={() => setView('subject')} />
          ) : (
            <HomePage section={section} subjects={subjects} questions={questions} onSelect={openSubject} />
          )}
        </main>
      </div>
      {authView && <AuthPage key={authView} initialIsSignup={authView === 'signup'} onClose={() => setAuthView(null)} theme={theme} onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} />}
    </div>
  )
}

function Alert({ message, success = false, onClose }) {
  return (
    <div className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${success ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
      {success ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <CircleHelp size={18} className="mt-0.5 shrink-0" />}
      <p className="flex-1">{message}</p>
      {onClose && <button onClick={onClose} aria-label="Dismiss message"><X size={16} /></button>}
    </div>
  )
}

function HomePage({ section, subjects, questions, onSelect }) {
  const currentSection = sections.find((item) => item.id === section) || sections[0]
  const countForSection = questions.filter((item) => item.category === section).length
  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow mb-2">STUDY LIBRARY</p><h1 className="page-title">{currentSection.label}</h1><p className="mt-2 text-sm text-muted">{currentSection.description} · {countForSection} questions</p></div>
      </div>
      {subjects.length === 0 ? (
        <div className="empty-card"><span className="empty-icon"><BookOpen size={23} /></span><h2 className="mt-4 text-lg font-semibold">{section === 'practicals' ? 'No practical questions added yet' : 'No questions here yet'}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-muted">{section === 'practicals' ? 'Add practical MCQs with the PDF importer. Then open a practical subject and choose Start practice.' : 'Add questions to this section with the PDF importer, then they will appear here.'}</p></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {subjects.map((name) => {
            const rows = questions.filter((item) => item.category === section && item.subject === name)
            return (
              <button key={name} onClick={() => onSelect(name)} className="subject-card text-left">
                <div className="flex items-start justify-between"><span className="subject-icon"><BookOpen size={19} /></span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-muted">{rows.length} questions</span></div>
                <h2 className="mt-5 font-semibold">{name}</h2>
                <div className="mt-2 flex items-center justify-between text-xs text-muted"><span>{rows.filter((row) => row.marks === 1).length} one-mark · {rows.filter((row) => row.marks === 2).length} two-mark</span><ArrowRight size={15} /></div>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

function SubjectPage({ subject, section, questions, onBack, onStart }) {
  const rows = questions.filter((item) => item.category === section && item.subject === subject)
  const unitRows = rows.map((question) => ({ question, unit: getQuestionUnit(question) || 'Unit not specified' }))
  const units = [...new Set(unitRows.map((item) => item.unit))].sort((first, second) => first.localeCompare(second, undefined, { numeric: true }))
  const [selectedUnits, setSelectedUnits] = useState(units)
  const [selectedMarks, setSelectedMarks] = useState([1, 2])
  const [selectedCount, setSelectedCount] = useState(20)
  const [customCount, setCustomCount] = useState('')
  const [customActive, setCustomActive] = useState(false)
  const answerCount = rows.filter((item) => item.correctAnswer).length
  const markSections = [1, 2].map((marks) => ({ marks, questions: rows.filter((item) => item.marks === marks) })).filter((group) => group.questions.length > 0)
  const selectable = section === 'practicals'
  const actualCount = customActive ? Number(customCount) : Math.min(selectedCount, rows.length)
  const validCount = Number.isInteger(actualCount) && actualCount > 0 && actualCount <= rows.length
  const practiceQuestions = filterPracticeQuestions(rows, selectedUnits, selectedMarks)

  function startSelected(nextMode) {
    onStart(nextMode, null, Math.min(actualCount, rows.length))
  }

  function startSelectedPractice() {
    onStart('practice', null, practiceQuestions.length, practiceQuestions.map((question) => question.id))
  }

  return (
    <div className="mx-auto max-w-4xl">
      <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to {sections.find((item) => item.id === section)?.label}</button>
      <p className="eyebrow mt-8">{sections.find((item) => item.id === section)?.label}</p>
      <h1 className="page-title mt-2">{subject}</h1>
      <p className="mt-2 text-sm text-muted">{rows.length} questions · {rows.reduce((sum, item) => sum + item.marks, 0)} total marks</p>
      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total questions" value={rows.length} icon={BookOpen} />
        <StatCard label="Answer key available" value={`${answerCount} / ${rows.length}`} icon={CheckCircle2} />
        <StatCard label="Total marks" value={rows.reduce((sum, item) => sum + item.marks, 0)} icon={Clock3} />
      </div>
      <section className="mark-section-card mt-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Choose your practice questions</h2>
            <p className="mt-1 text-sm text-muted">Select any units and marks. You can mix 1-mark and 2-mark questions.</p>
          </div>
          <button className="button-secondary" disabled={!practiceQuestions.length} onClick={startSelectedPractice}><BookOpen size={16} /> Practice {practiceQuestions.length} selected</button>
        </div>
        {rows.length > 0 && (
          <>
            <fieldset className="mt-5">
              <legend className="form-label mb-2">Units</legend>
              <div className="flex flex-wrap gap-2">
                {units.map((unit) => {
                  const unitCount = unitRows.filter(({ question, unit: questionUnit }) => questionUnit === unit && selectedMarks.includes(question.marks)).length
                  return (
                    <label key={unit} className={`count-option inline-flex cursor-pointer items-center gap-2 ${selectedUnits.includes(unit) ? 'count-option-active' : ''}`}>
                      <input type="checkbox" checked={selectedUnits.includes(unit)} onChange={() => setSelectedUnits((current) => current.includes(unit) ? current.filter((item) => item !== unit) : [...current, unit])} />
                      {unit} <span className="text-xs opacity-70">({unitCount})</span>
                    </label>
                  )
                })}
                {units.length > 1 && <>
                  <button type="button" className="count-option" onClick={() => setSelectedUnits(units)}>Select all</button>
                  <button type="button" className="count-option" onClick={() => setSelectedUnits([])}>Clear</button>
                </>}
              </div>
            </fieldset>
            <fieldset className="mt-5">
              <legend className="form-label mb-2">Marks</legend>
              <div className="flex flex-wrap gap-2">
                {[1, 2].map((marks) => {
                  const markCount = unitRows.filter(({ question, unit }) => selectedUnits.includes(unit) && question.marks === marks).length
                  return (
                    <label key={marks} className={`count-option inline-flex cursor-pointer items-center gap-2 ${selectedMarks.includes(marks) ? 'count-option-active' : ''}`}>
                      <input type="checkbox" checked={selectedMarks.includes(marks)} onChange={() => setSelectedMarks((current) => current.includes(marks) ? current.filter((item) => item !== marks) : [...current, marks].sort())} />
                      {marks} {marks === 1 ? 'mark' : 'marks'} <span className="text-xs opacity-70">({markCount})</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
            <p className="mt-3 text-xs text-muted">Unit labels come from the question paper; questions without a unit use their CO tag to group them.</p>
          </>
        )}
        {!rows.length && <p className="mt-4 text-sm text-muted">No questions are available for practice yet.</p>}
      </section>
      {selectable ? (
        <section className="mark-section-card mt-8">
          <h2 className="text-lg font-semibold">{section === 'practicals' ? 'Choose a practical test length' : 'Choose an exam length'}</h2>
          <p className="mt-1 text-sm text-muted">{rows.length} available questions. Questions and answer options are randomized for each attempt.</p>
          {rows.length > 0 && (
            <>
              <div className="mt-5 flex flex-wrap gap-2">
                {[10, 20, 30, 50].map((count) => <button key={count} className={`count-option ${!customActive && selectedCount === count ? 'count-option-active' : ''}`} onClick={() => { setCustomActive(false); setSelectedCount(count) }}>{count}</button>)}
                <button className={`count-option ${!customActive && selectedCount === rows.length ? 'count-option-active' : ''}`} onClick={() => { setCustomActive(false); setSelectedCount(rows.length) }}>All available</button>
              </div>
              <label className="form-label mt-5 block max-w-xs">Or enter a custom number
                <input className="form-input mt-2" type="number" min="1" max={rows.length} step="1" value={customCount} onFocus={() => setCustomActive(true)} onChange={(event) => { setCustomActive(true); setCustomCount(event.target.value) }} placeholder={`1–${rows.length}`} />
              </label>
              {customActive && !validCount && <p role="alert" className="mt-2 text-xs text-rose-700">Enter a whole number from 1 to {rows.length}.</p>}
              <p className="mt-3 text-xs text-muted">{actualCount > rows.length ? `Only ${rows.length} questions are available; the attempt will use the available questions.` : `This attempt will include ${Math.min(actualCount || 0, rows.length)} questions.`}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button className="button-secondary" disabled={!validCount} onClick={() => startSelected('practice')}><BookOpen size={16} /> Start practice</button>
                <button className="button-primary" disabled={!validCount} onClick={() => startSelected('exam')}><GraduationCap size={16} /> Start exam</button>
              </div>
            </>
          )}
          {!rows.length && <p className="mt-5 text-sm text-muted">No questions are available in this subject yet.</p>}
        </section>
      ) : (
        <div className="mt-8 space-y-5">
          {markSections.map(({ marks, questions: markQuestions }) => (
            <section key={marks} className="mark-section-card">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{marks}-Mark Questions</h2><p className="mt-1 text-sm text-muted">{markQuestions.length} complete questions · {marks} {marks === 1 ? 'mark' : 'marks'} each</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-muted">{marksQuestionsTotal(marks, markQuestions)} total marks</span></div>
              <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => onStart('practice', marks, markQuestions.length)} className="button-secondary"><BookOpen size={16} /> Practice all {markQuestions.length}</button><button onClick={() => onStart('exam', marks, Math.min(20, markQuestions.length))} className="button-primary"><GraduationCap size={16} /> Start {Math.min(20, markQuestions.length)}-question exam</button></div>
              <p className="mt-3 text-xs leading-5 text-muted">A fresh random set for each exam; the set never includes made-up questions.</p>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function marksQuestionsTotal(marks, questions) {
  return marks * questions.length
}

function StatCard({ label, value, icon: Icon }) {
  return <div className="stat-card"><span className="stat-icon"><Icon size={17} /></span><p className="mt-4 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted">{label}</p></div>
}

function ProgressDashboard({ attempts, busy, onRefresh, isSignedIn }) {
  const totalCompletedExams = attempts.filter((attempt) => attempt.mode === 'exam' && attempt.section === 'end-sem').length
  const totalPracticeSets = attempts.filter((attempt) => attempt.mode === 'practice').length
  const totalAttempted = attempts.reduce((sum, attempt) => sum + (attempt.attemptedCount || 0), 0)
  const totalCorrect = attempts.reduce((sum, attempt) => sum + (attempt.correctCount || 0), 0)
  const totalMarks = attempts.reduce((sum, attempt) => sum + (attempt.score || 0), 0)
  const gradedAttempted = attempts.reduce((sum, attempt) => sum + (attempt.gradedAttemptedCount ?? attempt.attemptedCount ?? 0), 0)
  const accuracy = gradedAttempted ? Math.round((totalCorrect / gradedAttempted) * 100) : 0
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow mb-2">YOUR STUDY HISTORY</p><h1 className="page-title">Progress dashboard</h1><p className="mt-2 text-sm text-muted">{isSignedIn ? 'Your completed practice and exam attempts, synced to your account and this device.' : 'Your completed practice and exam attempts, saved on this device. Log in to sync across devices.'}</p></div><button className="button-secondary" disabled={busy} onClick={onRefresh}><RotateCcw size={15} /> Refresh</button></div>
      {busy && attempts.length === 0 ? <div className="flex min-h-48 items-center justify-center gap-3 text-muted"><LoaderCircle className="animate-spin" size={19} /> Loading your progress…</div> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Completed End-Sem exams" value={totalCompletedExams} icon={GraduationCap} />
            <StatCard label="Practice sets completed" value={totalPracticeSets} icon={Layers3} />
            <StatCard label="Questions attempted" value={totalAttempted} icon={BookOpen} />
            <StatCard label="Correct answers" value={totalCorrect} icon={CheckCircle2} />
            <StatCard label="Accuracy" value={`${accuracy}%`} icon={Target} />
            <StatCard label="Marks earned" value={totalMarks} icon={Activity} />
          </div>
          <section className="mt-7 mark-section-card">
            <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Recent attempts</h2><p className="mt-1 text-sm text-muted">Showing your latest activity</p></div><span className="stat-icon"><Clock3 size={17} /></span></div>
            {attempts.length === 0 ? <div className="py-12 text-center"><p className="font-semibold">No completed attempts yet</p><p className="mt-2 text-sm text-muted">Finish a practice set or exam to see your progress here.</p></div> : (
              <div className="mt-5 space-y-3">
                {attempts.slice(0, 10).map((attempt) => (
                  <div className="review-row flex flex-wrap items-center justify-between gap-3" key={attempt.id}>
                    <div><p className="text-sm font-semibold">{attempt.subject}</p><p className="mt-1 text-xs text-muted">{sections.find((item) => item.id === attempt.section)?.label || attempt.section} · {attempt.mode === 'exam' ? 'Exam' : 'Practice'} · {formatTimestamp(attempt.timestamp)}</p></div>
                    <div className="text-right"><p className="text-sm font-semibold">{attempt.score ?? 0} / {attempt.maxScore ?? 0} marks</p><p className="mt-1 text-xs text-muted">{attempt.correctCount ?? 0} correct · {attempt.questionCount} questions</p></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function formatTimestamp(timestamp) {
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp || 0)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function createAttemptId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function QuizPage({ questions: questionPool, subject, section, mode, questionCount, previousIds, user, language, onLanguageChange, onSaved, onBack }) {
  const [answers, setAnswers] = useState({})
  const [index, setIndex] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [practiceSubmitted, setPracticeSubmitted] = useState(false)
  const [translations, setTranslations] = useState({})
  const [translationError, setTranslationError] = useState('')
  const [translationAttempt, setTranslationAttempt] = useState(0)
  const [translating, setTranslating] = useState(false)
  const [speechBusy, setSpeechBusy] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [speechError, setSpeechError] = useState('')
  const audioRef = useRef(null)
  const audioUrlRef = useRef(null)
  const speechRequestRef = useRef(0)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [attemptNumber, setAttemptNumber] = useState(1)
  const [attemptId, setAttemptId] = useState(createAttemptId)
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [examQuestions, setExamQuestions] = useState(() => selectExamQuestions(questionPool, questionCount ?? questionPool.length, previousIds))
  const questions = examQuestions
  const questionId = questions[index]?.id
  const isPractice = mode === 'practice'
  const question = questions[index]
  const translation = language === 'en' ? null : translations[language]?.[questionId]
  const selected = answers[questionId]
  const answeredCount = questions.filter((item) => answers[item.id] !== undefined).length
  const unansweredCount = questions.length - answeredCount
  const progressPercent = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0

  useEffect(() => {
    if (!questionId) return undefined
    if (language === 'en') {
      setTranslating(false)
      setTranslationError('')
      return undefined
    }
    let active = true
    setTranslating(true)
    setTranslationError('')
    getTranslations([questionId], language)
      .then((data) => { if (active) setTranslations((current) => ({ ...current, [language]: { ...current[language], ...(data.translations || {}) } })) })
      .catch((requestError) => { if (active) setTranslationError(requestError.message) })
      .finally(() => { if (active) setTranslating(false) })
    return () => { active = false }
  }, [questionId, language, translationAttempt])

  useEffect(() => () => {
    speechRequestRef.current += 1
    audioRef.current?.pause()
    audioRef.current = null
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    audioUrlRef.current = null
  }, [questionId, language])

  if (!questions.length) return <div className="empty-card"><p>No questions are available for this set.</p><button onClick={onBack} className="button-secondary mt-4">Back</button></div>

  const knownAnswers = questions.filter((item) => item.correctAnswer)
  const correctCount = knownAnswers.filter((item) => answers[item.id] === item.correctAnswer).length
  const gradedAttemptedCount = knownAnswers.filter((item) => answers[item.id] !== undefined).length
  const marksEarned = knownAnswers.reduce((sum, item) => sum + (answers[item.id] === item.correctAnswer ? item.marks : 0), 0)
  const totalKnownMarks = knownAnswers.reduce((sum, item) => sum + item.marks, 0)

  async function listenToQuestion() {
    if (speaking) {
      audioRef.current?.pause()
      audioRef.current = null
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
      setSpeaking(false)
      return
    }
    if (speechBusy || !translation?.question) return

    const requestId = ++speechRequestRef.current
    const optionWord = language === 'hi' ? 'विकल्प' : 'पर्याय'
    const spokenNumbers = language === 'hi' ? ['एक', 'दो', 'तीन', 'चार', 'पाँच'] : ['एक', 'दोन', 'तीन', 'चार', 'पाच']
    const optionText = question.options.map((option, optionIndex) => {
      const translatedOption = translation.options?.[option.sourceLabel || option.label]
      return translatedOption ? `${optionWord} ${spokenNumbers[optionIndex] || optionIndex + 1}: ${translatedOption}` : ''
    })
    const speechText = [
      translation.question,
      ...optionText,
      ...(answerVisible ? [translation.explanation, translation.example] : []),
    ].filter(Boolean).join('\n')

    setSpeechBusy(true)
    setSpeechError('')
    try {
      const audioBlob = await getSpeech(speechText, language)
      if (requestId !== speechRequestRef.current) return
      const audioUrl = URL.createObjectURL(audioBlob)
      audioUrlRef.current = audioUrl
      const audio = new Audio(audioUrl)
      audioRef.current = audio
      audio.onended = () => {
        if (audioRef.current !== audio) return
        audioRef.current = null
        URL.revokeObjectURL(audioUrl)
        audioUrlRef.current = null
        setSpeaking(false)
      }
      audio.onerror = () => {
        if (audioRef.current !== audio) return
        audioRef.current = null
        URL.revokeObjectURL(audioUrl)
        audioUrlRef.current = null
        setSpeaking(false)
        setSpeechError('आवाज वाजवता आला नाही. पुन्हा प्रयत्न करा.')
      }
      await audio.play()
      setSpeaking(true)
    } catch (requestError) {
      setSpeechError(requestError.message)
    } finally {
      setSpeechBusy(false)
    }
  }

  async function completeAttempt() {
    if (saveBusy) return
    const result = getAttemptResult()
    setSaveBusy(true)
    setSaveError('')
    try {
      saveLocalAttempt(user?.uid, attemptId, result)
    } catch (requestError) {
      setSaveError(`Could not save this attempt on your device: ${requestError.message}`)
    }
    if (user) {
      try {
        await saveCompletedAttempt(user.uid, attemptId, result)
      } catch (requestError) {
        setSaveError((current) => current
          ? `${current} Account sync also failed: ${requestError.message}`
          : `This attempt is saved on your device, but account sync failed: ${requestError.message}`)
      }
    }
    onSaved()
    setSubmitted(true)
    setSaveBusy(false)
    setShowSubmitConfirm(false)
  }

  function getAttemptResult() {
    const answered = questions.filter((item) => answers[item.id] !== undefined).length
    return {
      section,
      subject,
      mode,
      score: marksEarned,
      maxScore: totalKnownMarks,
      questionCount: questions.length,
      attemptedCount: answered,
      gradedAttemptedCount,
      correctCount,
      accuracy: gradedAttemptedCount ? Math.round((correctCount / gradedAttemptedCount) * 100) : 0,
      questionIds: questions.map((item) => item.id),
      completedAt: new Date().toISOString(),
    }
  }

  async function retrySave() {
    if (!saveError || saveBusy) return
    setSaveBusy(true)
    const result = getAttemptResult()
    const errors = []
    try {
      saveLocalAttempt(user?.uid, attemptId, result)
    } catch (requestError) {
      errors.push(`device save failed: ${requestError.message}`)
    }
    if (user) {
      try {
        await saveCompletedAttempt(user.uid, attemptId, result)
      } catch (requestError) {
        errors.push(`account sync failed: ${requestError.message}`)
      }
    }
    if (errors.length) {
      setSaveError(errors.join('; '))
    } else {
      setSaveError('')
      onSaved()
    }
    setSaveBusy(false)
  }

  function startAnotherAttempt() {
    setAnswers({})
    setIndex(0)
    setSubmitted(false)
    setPracticeSubmitted(false)
    setShowSubmitConfirm(false)
    setTranslations({})
    setSaveError('')
    setAttemptId(createAttemptId())
    setExamQuestions(selectExamQuestions(questionPool, questionCount ?? questionPool.length, [...previousIds, ...questions.map((item) => item.id)]))
    setAttemptNumber((current) => current + 1)
    trackAnalyticsEvent('exam_restarted', { attempt: attemptNumber + 1 })
  }

  function selectOption(label) {
    if (submitted || (isPractice && practiceSubmitted)) return
    setAnswers((current) => ({ ...current, [question.id]: label }))
  }

  function submitPractice() {
    if (selected === undefined) return
    trackAnalyticsEvent('practice_answer_submitted', { is_correct: selected === question.correctAnswer })
    setPracticeSubmitted(true)
  }

  function next() {
    if (index < questions.length - 1) {
      setIndex((current) => current + 1)
      setPracticeSubmitted(false)
    }
  }

  function previous() {
    if (index > 0) {
      setIndex((current) => current - 1)
      setPracticeSubmitted(false)
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-4xl">
        <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to {subject}</button>
        <div className="result-card mt-8">
          <span className="result-icon"><CheckCircle2 size={25} /></span>
          <p className="eyebrow mt-5">{isPractice ? 'PRACTICE COMPLETE' : 'EXAM COMPLETE'}</p>
          <h1 className="mt-2 text-3xl font-bold">Your results</h1>
          <p className="mt-2 text-sm text-muted">{subject} · {sections.find((item) => item.id === section)?.label} · Attempt {attemptNumber}</p>
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ResultStat label="Marks" value={`${marksEarned} / ${totalKnownMarks}`} />
            <ResultStat label="Accuracy" value={`${gradedAttemptedCount ? Math.round((correctCount / gradedAttemptedCount) * 100) : 0}%`} />
            <ResultStat label="Correct" value={correctCount} />
            <ResultStat label="Attempted" value={`${answeredCount} / ${questions.length}`} />
          </div>
          <p className="mt-4 text-xs leading-5 text-muted">{unansweredCount} unanswered. Questions without an answer key are excluded from marks.</p>
          {saveError && <div className="mt-4"><Alert message={`Progress save issue: ${saveError}`} onClose={() => setSaveError('')} /><button className="button-secondary" disabled={saveBusy} onClick={retrySave}>{saveBusy && <LoaderCircle className="animate-spin" size={15} />} Retry saving progress</button></div>}
          {!saveError && <p className="mt-4 text-xs text-emerald-700">{user ? 'Progress saved to your account and this device.' : 'Progress saved on this device. Log in to sync across devices.'}</p>}
          <div className="mt-7 flex flex-wrap gap-3"><button className="button-primary" onClick={startAnotherAttempt}><RotateCcw size={16} /> Take another {questionCount || questions.length}-question attempt</button><button className="button-secondary" onClick={onBack}>Back to subject</button></div>
        </div>
        <div className="mt-6 space-y-3">{questions.map((item, idx) => <ReviewRow key={item.id} question={item} translation={translations[language]?.[item.id]} language={language} answer={answers[item.id]} number={idx + 1} />)}</div>
      </div>
    )
  }

  const answerVisible = isPractice && practiceSubmitted
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to {subject}</button>
        <div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${isPractice ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'}`}>{isPractice ? 'Practice Mode' : 'Exam Mode'}</span><span className="text-xs text-muted">{answeredCount} of {questions.length} answered · {unansweredCount} left</span>{mode === 'exam' && <span className="hidden text-xs text-muted sm:inline">Attempt {attemptNumber}</span>}</div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line card-surface px-4 py-3">
        <div className="min-w-[180px] flex-1"><div className="mb-2 flex justify-between text-xs text-muted"><span>{isPractice ? 'Practice progress' : 'Exam progress'}</span><span>{answeredCount}/{questions.length} answered · {progressPercent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Attempt progress" aria-valuemin="0" aria-valuemax={questions.length} aria-valuenow={answeredCount}><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progressPercent}%` }} /></div></div>
        <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-1" aria-label="Translation language">
          <button type="button" onClick={() => onLanguageChange('en')} className={`language-button ${language === 'en' ? 'language-button-active' : ''}`}>English</button>
          <button type="button" onClick={() => onLanguageChange('mr')} className={`language-button ${language === 'mr' ? 'language-button-active' : ''}`}>मराठी</button>
          <button type="button" onClick={() => onLanguageChange('hi')} className={`language-button ${language === 'hi' ? 'language-button-active' : ''}`}>हिन्दी</button>
        </div>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_250px]">
        <section className="question-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4"><span className="text-xs font-semibold text-muted">QUESTION {index + 1} <span className="font-normal">of {questions.length}</span>{getQuestionUnit(question) && <span className="font-normal"> · {language === 'hi' ? 'इकाई' : 'घटक'} {getQuestionUnit(question).replace(/^Unit\s+/i, '')}</span>}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-muted">{question.marks} {question.marks === 1 ? 'mark' : 'marks'}</span></div>
          <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
            <h2 className={`${language === 'en' ? '' : 'marathi'} min-w-0 flex-1 text-lg font-semibold leading-7`}>{language === 'en' ? question.question : translation?.question || (language === 'hi' ? 'प्रश्न का अनुवाद तैयार हो रहा है…' : 'प्रश्नाचा मराठी अर्थ तयार होत आहे…')}</h2>
            {language !== 'en' && <button type="button" className="button-secondary shrink-0" title="AI female voice" onClick={listenToQuestion} disabled={translating || !translation?.question || speechBusy}>
              {speechBusy ? <LoaderCircle className="animate-spin" size={16} /> : speaking ? <Square size={15} /> : <Volume2 size={16} />}
              {language === 'hi'
                ? speechBusy ? 'आवाज़ तैयार हो रही है…' : speaking ? 'रोकें' : 'सुनें'
                : speechBusy ? 'आवाज तयार होत आहे…' : speaking ? 'थांबवा' : 'ऐकून घ्या'}
            </button>}
          </div>
          {translationError && language !== 'en' && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800"><p>{language === 'hi' ? 'हिंदी अनुवाद उपलब्ध नहीं है' : 'मराठी भाषांतर उपलब्ध नाही'}: {translationError}</p><button type="button" className="shrink-0 font-semibold underline" onClick={() => setTranslationAttempt((attempt) => attempt + 1)}>Retry translation</button></div>}
          {speechError && <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">{speechError}</p>}
          <div className="mt-6 space-y-3">
            {question.options.map((option) => {
              const correct = answerVisible && question.correctAnswer === option.label
              const wrongSelected = answerVisible && Boolean(question.correctAnswer) && selected === option.label && question.correctAnswer !== option.label
              const chosen = selected === option.label
              return (
                <button key={option.label} disabled={submitted || (isPractice && practiceSubmitted)} onClick={() => selectOption(option.label)} className={`option-row ${chosen ? 'option-selected' : ''} ${correct ? 'option-correct' : ''} ${wrongSelected ? 'option-wrong' : ''}`}>
                  <span className="option-label">{option.label}</span><span className={`${language === 'en' ? '' : 'marathi'} min-w-0 flex-1 whitespace-pre-wrap break-words text-left text-sm leading-6`}>{language === 'en' ? option.text : translation?.options?.[option.sourceLabel || option.label] || (language === 'hi' ? 'अनुवाद तैयार हो रहा है…' : 'भाषांतर तयार होत आहे…')}</span>{correct && <Check size={17} className="shrink-0 text-emerald-600" />}{wrongSelected && <X size={17} className="shrink-0 text-rose-600" />}
                </button>
              )
            })}
          </div>
          {answerVisible && <div className={`mt-5 rounded-xl border p-4 ${question.correctAnswer ? (selected === question.correctAnswer ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50') : 'border-amber-200 bg-amber-50'}`}>{question.correctAnswer ? <><p className={`text-sm font-semibold ${selected === question.correctAnswer ? 'text-emerald-800' : 'text-rose-800'}`}>{selected === question.correctAnswer ? 'Correct!' : `Incorrect. Correct answer: ${question.correctAnswer}`}</p>{translation?.explanation && <p className="marathi mt-2 text-sm leading-6 text-slate-700">{translation.explanation}</p>}{translation?.example && <p className="marathi mt-2 text-sm leading-6 text-slate-700"><span className="font-semibold">उदाहरण: </span>{translation.example}</p>}</> : <p className="text-sm text-amber-800">No answer key was provided for this question, so it is not marked.</p>}</div>}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <button className="button-secondary" onClick={previous} disabled={index === 0}><ArrowLeft size={16} /> Previous</button>
            {isPractice ? answerVisible ? (index === questions.length - 1
              ? <button className="button-primary" disabled={saveBusy} onClick={completeAttempt}>{saveBusy ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />} Finish practice</button>
              : <button className="button-primary" onClick={next}>Next question <ArrowRight size={16} /></button>)
              : <button className="button-primary" disabled={selected === undefined} onClick={submitPractice}><Check size={16} /> Submit answer</button>
              : index === questions.length - 1
                ? <button className="button-primary" onClick={() => setShowSubmitConfirm(true)}><Send size={16} /> Submit exam</button>
                : <button className="button-primary" onClick={next}>Next <ArrowRight size={16} /></button>}
          </div>
        </section>
        <aside className="question-nav-card">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Question map</h3><span className="text-xs text-muted">{answeredCount}/{questions.length}</span></div>
          <div className="mt-4 grid grid-cols-5 gap-2">{questions.map((item, idx) => <button key={item.id} onClick={() => { setIndex(idx); setPracticeSubmitted(false) }} aria-label={`Go to question ${idx + 1}`} className={`map-number ${idx === index ? 'map-active' : ''} ${answers[item.id] !== undefined ? 'map-answered' : ''}`}>{idx + 1}</button>)}</div>
          <div className="mt-5 space-y-2 border-t border-line pt-4 text-xs text-muted"><p className="flex items-center gap-2"><span className="legend-dot bg-indigo-600" /> Current question</p><p className="flex items-center gap-2"><span className="legend-dot bg-emerald-500" /> Answered</p><p className="flex items-center gap-2"><span className="legend-dot border border-slate-300 bg-white" /> Unanswered</p></div>
          {!isPractice && <button className="button-secondary mt-5 w-full justify-center" onClick={() => setShowSubmitConfirm(true)}>Submit exam · {unansweredCount} unanswered</button>}
        </aside>
      </div>
      {showSubmitConfirm && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSubmitConfirm(false) }}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><span className="empty-icon"><Send size={20} /></span><h2 id="confirm-title" className="mt-4 text-lg font-semibold">Submit your exam?</h2><p className="mt-2 text-sm leading-6 text-muted">You answered {answeredCount} of {questions.length} questions. There are {unansweredCount} unanswered. You can still go back before submitting.</p>{saveError && <p role="alert" className="mt-3 text-sm text-rose-700">{saveError}</p>}<div className="mt-6 flex justify-end gap-2"><button className="button-secondary" onClick={() => setShowSubmitConfirm(false)}>Keep reviewing</button><button className="button-primary" disabled={saveBusy} onClick={() => { trackAnalyticsEvent('exam_submitted', { answered_count: answeredCount, question_count: questions.length }); completeAttempt() }}>{saveBusy && <LoaderCircle className="animate-spin" size={15} />} Submit exam</button></div></div></div>}
    </div>
  )
}

function ResultStat({ label, value }) {
  return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></div>
}

function ReviewRow({ question, translation, language, answer, number }) {
  const answerOption = question.options.find((option) => option.label === answer)
  const correctOption = question.options.find((option) => option.label === question.correctAnswer)
  const optionText = (option) => language === 'en'
    ? option.text
    : translation?.options?.[option.sourceLabel || option.label]
      || (language === 'hi' ? 'अनुवाद उपलब्ध नहीं है' : 'भाषांतर उपलब्ध नाही')
  const resultLabel = !question.correctAnswer ? 'Not marked' : !answer ? 'Unanswered' : answer === question.correctAnswer ? 'Correct' : 'Wrong'
  const resultStyle = !question.correctAnswer || !answer ? 'bg-slate-100 text-slate-600' : answer === question.correctAnswer ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
  return <div className="review-row"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-muted">QUESTION {number} · {question.marks} {question.marks === 1 ? 'mark' : 'marks'}</p><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${resultStyle}`}>{resultLabel}</span></div><p className={`${language === 'en' ? '' : 'marathi'} mt-2 whitespace-pre-wrap break-words text-sm font-medium leading-6`}>{language === 'en' ? question.question : translation?.question || (language === 'hi' ? 'प्रश्न का अनुवाद उपलब्ध नहीं है' : 'प्रश्नाचा अनुवाद उपलब्ध नाही')}</p><p className={`${language === 'en' ? '' : 'marathi'} mt-2 break-words text-xs leading-5 text-muted`}>{language === 'hi' ? 'आपका उत्तर' : language === 'mr' ? 'तुमचे उत्तर' : 'Your answer'}: {answerOption ? `${answerOption.label}. ${optionText(answerOption)}` : (language === 'hi' ? 'उत्तर नहीं दिया' : language === 'mr' ? 'उत्तर दिले नाही' : 'Not answered')} · {language === 'hi' ? 'सही उत्तर' : language === 'mr' ? 'योग्य उत्तर' : 'Correct answer'}: {correctOption ? `${correctOption.label}. ${optionText(correctOption)}` : (language === 'hi' ? 'नहीं दिया गया' : language === 'mr' ? 'दिलेले नाही' : 'Not provided')}</p></div>
}

export default App
