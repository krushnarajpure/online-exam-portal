require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') })

const { getAuth } = require('firebase-admin/auth')
const { getAdminApp } = require('../src/firebase-admin')

async function grantAdmin(uid) {
  if (!uid) throw new Error('Usage: node server/scripts/set-admin-claim.js <firebase-user-uid>')
  const app = getAdminApp()
  if (!app) throw new Error('Set FIREBASE_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS in server/.env.')
  const auth = getAuth(app)
  const user = await auth.getUser(uid)
  await auth.setCustomUserClaims(uid, { ...user.customClaims, admin: true })
  console.log(`Admin claim granted to ${uid}. Sign out and back in before importing a PDF.`)
}

grantAdmin(process.argv[2]).catch((error) => {
  console.error(`Could not grant admin access: ${error.message}`)
  process.exitCode = 1
})
