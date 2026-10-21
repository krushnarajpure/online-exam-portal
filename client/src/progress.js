import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'

function localAttemptsKey(uid) {
  return `mcq-attempts:${uid || 'guest'}`
}

export function loadLocalAttempts(uid = null) {
  const stored = localStorage.getItem(localAttemptsKey(uid))
  if (!stored) return []
  const attempts = JSON.parse(stored)
  if (!Array.isArray(attempts)) throw new Error('Saved progress on this device is invalid.')
  return attempts
}

export function saveLocalAttempt(uid, attemptId, result) {
  const attempts = loadLocalAttempts(uid).filter((attempt) => attempt.id !== attemptId)
  const savedAttempt = {
    ...result,
    id: attemptId,
    timestamp: result.completedAt,
    localOnly: true,
  }
  localStorage.setItem(localAttemptsKey(uid), JSON.stringify([savedAttempt, ...attempts]))
  return savedAttempt
}

function attemptTime(attempt) {
  const timestamp = attempt.timestamp || attempt.completedAt
  if (typeof timestamp === 'number') return timestamp
  if (typeof timestamp?.toMillis === 'function') return timestamp.toMillis()
  if (typeof timestamp?.toDate === 'function') return timestamp.toDate().getTime()
  if (typeof timestamp?.seconds === 'number') return timestamp.seconds * 1000
  const parsed = new Date(timestamp || 0).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

export function mergeAttempts(...groups) {
  const merged = new Map()
  for (const attempt of groups.flat()) {
    if (attempt?.id) merged.set(attempt.id, attempt)
  }
  return [...merged.values()].sort((first, second) => attemptTime(second) - attemptTime(first))
}

export async function loadAttempts(uid) {
  if (!db) throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to client/.env.local.')
  const attemptsQuery = query(
    collection(db, 'users', uid, 'attempts'),
    orderBy('timestamp', 'desc'),
  )
  const snapshot = await getDocs(attemptsQuery)
  return snapshot.docs.map((attempt) => ({ id: attempt.id, ...attempt.data() }))
}

export async function saveCompletedAttempt(uid, attemptId, result) {
  if (!db) throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to client/.env.local.')
  const attemptRef = doc(db, 'users', uid, 'attempts', attemptId)
  return runTransaction(db, async (transaction) => {
    const existing = await transaction.get(attemptRef)
    if (existing.exists()) return false
    transaction.set(attemptRef, {
      ...result,
      uid,
      timestamp: serverTimestamp(),
    })
    return true
  })
}

export function recentQuestionIds(attempts, section, subject) {
  return [...new Set(attempts
    .filter((attempt) => attempt.section === section && attempt.subject === subject)
    .flatMap((attempt) => attempt.questionIds || []))]
}
