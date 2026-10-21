import { collection, getDocs } from 'firebase/firestore'
import { db } from './firebase'

async function request(path, options = {}) {
  const response = await fetch(path, options)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`)
  }
  return payload
}

function withTimeout(promise, timeoutMs) {
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Firebase question request timed out.')), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

export async function getQuestions() {
  let firestoreError
  if (db) {
    try {
      const snapshot = await withTimeout(getDocs(collection(db, 'questions')), 8000)
      if (snapshot.size) {
        return snapshot.docs
          .map((document) => ({ id: document.id, ...document.data() }))
          .sort((first, second) => (first.sourceNumber || 0) - (second.sourceNumber || 0))
      }
    } catch (error) {
      firestoreError = error
    }
  }
  try {
    return await request('/api/mcqs')
  } catch (error) {
    if (firestoreError) {
      throw new Error(`Could not load questions from Firebase (${firestoreError.message}) or the local server (${error.message}).`)
    }
    throw error
  }
}

export async function getTranslations(ids, language = 'mr') {
  try {
    return await request('/api/translations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, language }),
    })
  } catch (error) {
    if (!db) throw error
    const snapshot = await getDocs(collection(db, 'questions'))
    const translations = Object.fromEntries(snapshot.docs
      .filter((document) => ids.includes(document.id) && document.data().translations?.[language]?.question)
      .map((document) => [document.id, document.data().translations[language]]))
    if (Object.keys(translations).length === ids.length) return { translations }
    throw error
  }
}

export async function getSpeech(text, language) {
  const response = await fetch('/api/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || `Speech request failed (${response.status})`)
  }
  return response.blob()
}
