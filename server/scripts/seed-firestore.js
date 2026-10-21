require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') })

const fs = require('node:fs')
const path = require('node:path')
const { getFirestore } = require('firebase-admin/firestore')
const { getAdminApp } = require('../src/firebase-admin')

async function seed() {
  const app = getAdminApp()
  if (!app) throw new Error('Set FIREBASE_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS in server/.env.')
  const questionsPath = path.join(__dirname, '..', 'data', 'mcqs.json')
  const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'))
  const db = getFirestore(app)
  for (let offset = 0; offset < questions.length; offset += 450) {
    const batch = db.batch()
    for (const question of questions.slice(offset, offset + 450)) {
      batch.set(db.collection('questions').doc(question.id), question, { merge: true })
    }
    await batch.commit()
  }
  console.log(`Seeded ${questions.length} questions into Firestore.`)
}

seed().catch((error) => {
  console.error(`Firestore seed failed: ${error.message}`)
  process.exitCode = 1
})
