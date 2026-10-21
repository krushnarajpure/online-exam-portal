const { applicationDefault, getApps, initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')

let firebaseApp

function getAdminApp() {
  if (!process.env.FIREBASE_PROJECT_ID && !process.env.GOOGLE_CLOUD_PROJECT) return null
  if (!firebaseApp) {
    firebaseApp = getApps()[0] || initializeApp({
      credential: applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
    })
  }
  return firebaseApp
}

async function verifyAdminToken(token) {
  const app = getAdminApp()
  if (!app) throw new Error('Set FIREBASE_PROJECT_ID and configure Application Default Credentials to enable PDF imports.')
  const decoded = await getAuth(app).verifyIdToken(token)
  if (decoded.admin !== true) {
    const error = new Error('PDF import requires a Firebase user with the admin custom claim.')
    error.status = 403
    throw error
  }
  return decoded
}

async function writeQuestionsToFirestore(questions) {
  const app = getAdminApp()
  if (!app) return false
  const firestore = getFirestore(app)
  for (let offset = 0; offset < questions.length; offset += 450) {
    const batch = firestore.batch()
    for (const question of questions.slice(offset, offset + 450)) {
      batch.set(firestore.collection('questions').doc(question.id), question, { merge: true })
    }
    await batch.commit()
  }
  return true
}

async function writeTranslationsToFirestore(translations, language) {
  const app = getAdminApp()
  if (!app) return false
  const firestore = getFirestore(app)
  const entries = Object.entries(translations)
  for (let offset = 0; offset < entries.length; offset += 450) {
    const batch = firestore.batch()
    for (const [id, translation] of entries.slice(offset, offset + 450)) {
      batch.set(firestore.collection('questions').doc(id), {
        translations: { [language]: translation },
      }, { merge: true })
    }
    await batch.commit()
  }
  return true
}

module.exports = { getAdminApp, verifyAdminToken, writeQuestionsToFirestore, writeTranslationsToFirestore }
