require('dotenv').config()

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const pdfParse = require('pdf-parse')
const { parseMcqs } = require('./parser')
const { verifyAdminToken, writeQuestionsToFirestore, writeTranslationsToFirestore } = require('./firebase-admin')

const app = express()
const port = Number(process.env.PORT) || 4000
const dataDirectory = path.join(__dirname, '..', 'data')
const questionsFile = path.join(dataDirectory, 'mcqs.json')
const translationsFile = path.join(dataDirectory, 'translations.json')
const categories = new Set(['subjects', 'end-sem', 'practicals'])
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(_request, file, callback) {
    if (file.mimetype !== 'application/pdf' && path.extname(file.originalname).toLowerCase() !== '.pdf') {
      return callback(new Error('Only PDF files can be imported.'))
    }
    callback(null, true)
  },
})

fs.mkdirSync(dataDirectory, { recursive: true })

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

function writeJson(file, value) {
  const temporaryFile = `${file}.tmp`
  fs.writeFileSync(temporaryFile, JSON.stringify(value, null, 2), 'utf8')
  fs.renameSync(temporaryFile, file)
}

app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_request, response) => response.json({ status: 'ok' }))

app.get('/api/mcqs', (_request, response, next) => {
  try {
    response.json(readJson(questionsFile, []))
  } catch (error) {
    next(error)
  }
})

async function requireAdmin(request, response, next) {
  const authorization = request.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return response.status(401).json({ error: 'Sign in with an authorized admin account to import a PDF.' })
  try {
    request.firebaseUser = await verifyAdminToken(token)
    next()
  } catch (error) {
    const status = error.status || 401
    response.status(status).json({ error: error.message || 'The admin session could not be verified.' })
  }
}

app.post('/api/import', requireAdmin, (request, response, next) => {
  upload.single('pdf')(request, response, async (uploadError) => {
    if (uploadError) return next(uploadError)
    try {
      if (!request.file) return response.status(400).json({ error: 'Choose a PDF file to import.' })
      const subject = String(request.body.subject || '').trim()
      const category = String(request.body.category || '')
      const defaultMarks = Number(request.body.defaultMarks)
      if (!subject || subject.length > 100) return response.status(400).json({ error: 'Enter a subject name of 1 to 100 characters.' })
      if (!categories.has(category)) return response.status(400).json({ error: 'Choose a valid section for these questions.' })
      if (![1, 2].includes(defaultMarks)) return response.status(400).json({ error: 'Default marks must be 1 or 2.' })

      let extracted
      try {
        extracted = await pdfParse(request.file.buffer)
      } catch (error) {
        return response.status(422).json({ error: `Could not read this PDF: ${error.message}` })
      }
      const parsed = parseMcqs(extracted.text || '', { subject, category, defaultMarks })
      if (!parsed.length) {
        return response.status(422).json({
          error: 'No multiple-choice questions with at least two options were found. This importer needs selectable PDF text and question/options on separate lines.',
        })
      }

      const existing = readJson(questionsFile, [])
      const timestamp = new Date().toISOString()
      const imported = parsed.map((item) => ({
        id: crypto.randomUUID(),
        ...item,
        createdAt: timestamp,
      }))
      const cloudPersisted = await writeQuestionsToFirestore(imported)
      writeJson(questionsFile, [...existing, ...imported])
      response.status(201).json({ imported: imported.length, cloudPersisted, questions: imported })
    } catch (error) {
      next(error)
    }
  })
})

app.post('/api/translations', async (request, response, next) => {
  try {
    const ids = request.body?.ids
    if (!Array.isArray(ids) || ids.length > 250 || ids.some((id) => typeof id !== 'string')) {
      return response.status(400).json({ error: 'Provide an array of up to 250 question IDs.' })
    }
    const language = request.body?.language || 'mr'
    if (!['mr', 'hi'].includes(language)) {
      return response.status(400).json({ error: 'Translation language must be Marathi (mr) or Hindi (hi).' })
    }
    const questions = readJson(questionsFile, []).filter((item) => ids.includes(item.id))
    const translations = readJson(translationsFile, {})
    const languageCache = translations[language]
      || (language === 'mr' ? Object.fromEntries(
        Object.entries(translations).filter(([, value]) => value && typeof value.question === 'string'),
      ) : {})
    const missing = questions.filter((item) => !hasCompleteTranslation(languageCache[item.id], item))
    if (missing.length && !process.env.GEMINI_API_KEY) {
      const languageName = language === 'hi' ? 'Hindi' : 'Marathi'
      return response.status(503).json({ error: `${languageName} translation is not configured. Add GEMINI_API_KEY to server/.env and restart the backend.` })
    }
    for (let offset = 0; offset < missing.length; offset += 10) {
      const batch = missing.slice(offset, offset + 10)
      let translated
      try {
        translated = await translateBatch(batch, language)
      } catch (error) {
        if (!error.message?.startsWith('Gemini returned English text')) throw error
        translated = await translateBatch(batch, language, true)
      }
      for (const item of batch) languageCache[item.id] = translated[item.id]
      translations[language] = languageCache
      writeJson(translationsFile, translations)
    }
    const result = {}
    for (const item of questions) result[item.id] = languageCache[item.id]
    await writeTranslationsToFirestore(result, language)
    response.json({ translations: result })
  } catch (error) {
    next(error)
  }
})

app.post('/api/speech', async (request, response, next) => {
  try {
    const text = request.body?.text
    const language = request.body?.language
    if (typeof text !== 'string' || !text.trim() || text.length > 5000) {
      return response.status(400).json({ error: 'Provide text of 1 to 5000 characters to speak.' })
    }
    if (!['mr', 'hi'].includes(language)) {
      return response.status(400).json({ error: 'Speech language must be Marathi (mr) or Hindi (hi).' })
    }
    if (!process.env.GEMINI_API_KEY) {
      return response.status(503).json({ error: 'AI speech is not configured. Add GEMINI_API_KEY to server/.env and restart the backend.' })
    }

    const languageName = language === 'hi' ? 'Hindi' : 'Marathi'
    const speechResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Speak the following text in natural, conversational ${languageName}, in a warm female voice with clear pronunciation and a moderate pace. Read only the supplied text; do not translate it or add an introduction or closing.\n\n${text.trim()}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      }),
    })
    const payload = await speechResponse.json().catch(() => ({}))
    if (!speechResponse.ok) {
      throw new Error(payload.error?.message || `Gemini speech request failed (${speechResponse.status}).`)
    }
    const audio = payload.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData
    if (!audio?.data || !audio.mimeType?.startsWith('audio/wav')) {
      throw new Error('Gemini returned speech in an unexpected audio format.')
    }
    response.set('Cache-Control', 'no-store')
    response.type('audio/wav').send(Buffer.from(audio.data, 'base64'))
  } catch (error) {
    next(error)
  }
})

function hasCompleteTranslation(translation, question) {
  return Boolean(
    translation
    && translation.qualityVersion === 4
    && typeof translation.question === 'string'
    && !/[A-Za-z]/.test(translation.question)
    && typeof translation.example === 'string'
    && translation.example.trim()
    && !/[A-Za-z]/.test(translation.example)
    && translation.options
    && question.options.every((option) => (
      typeof translation.options[option.label] === 'string'
      && !/[A-Za-z]/.test(translation.options[option.label])
    ))
    && !/[A-Za-z]/.test(translation.explanation || ''),
  )
}

async function translateBatch(questions, language, retry = false) {
  const languageName = language === 'hi' ? 'Hindi' : 'Marathi'
  const promptData = questions.map((item) => ({
    id: item.id,
    question: item.question,
    options: item.options,
    correctAnswer: item.correctAnswer,
  }))
  const prompt = [
    `Translate each question and its options into very simple, natural, conversational ${languageName}. Write every translated value only in Devanagari script. Never use Latin/Roman letters, English words, English loanwords written in Devanagari, or English in brackets. Prefer everyday local words; explain technical ideas in plain language and translate technical names by meaning, never by copying their sound. For example, translate Agile as a flexible way of working, Waterfall as step-by-step development, Spiral as circular development, and V-Model as development paired with testing.`,
    'The source text is English, but every returned question, option, explanation, and example must be fully translated into the requested language. Never copy an English sentence or phrase into the output. For Marathi, prefer natural Marathi words such as “संगणक प्रणाली” over English loanwords; for Hindi, prefer natural Hindi words such as “कंप्यूटर प्रणाली”.',
    ...(retry ? ['Your previous translation was rejected because it contained English text. Translate every field completely this time. Check each field before returning it; do not repeat the source sentence.'] : []),
    'Return only a JSON array, one object per input, with exactly these fields: id, question, options (object mapping option labels to translated text), explanation, example.',
    'Keep option labels and IDs unchanged. Do not add facts or change the meaning.',
    `Write the explanation in simple ${languageName} only when a correct answer is supplied; never determine or guess an answer. Give one short, realistic everyday-life example in ${languageName} that helps a student understand the idea; do not invent exam facts. Avoid words such as “app”, “feature”, “customer”, and “software”; use natural local-language equivalents instead.`,
    JSON.stringify(promptData),
  ].join('\n\n')
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const details = payload.error?.message || `Gemini API request failed (${response.status}).`
    throw new Error(details)
  }
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('')
  if (!text) throw new Error('Gemini returned an empty translation response.')
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Gemini returned translations in an unexpected format.')
  }
  if (!Array.isArray(data)) throw new Error('Gemini returned translations in an unexpected format.')
  const byId = new Map(data.filter((item) => item && typeof item.id === 'string').map((item) => [item.id, item]))
  const result = {}
  for (const question of questions) {
    const item = byId.get(question.id)
    if (!item || typeof item.question !== 'string' || !item.options || typeof item.options !== 'object' || typeof item.example !== 'string') {
      throw new Error(`Gemini did not return a complete translation for question ${question.sourceNumber}.`)
    }
    const options = {}
    for (const option of question.options) {
      const translated = item.options[option.label]
      if (typeof translated !== 'string') throw new Error(`Gemini did not translate option ${option.label} for question ${question.sourceNumber}.`)
      if (/[A-Za-z]/.test(translated)) throw new Error(`Gemini returned English text in option ${option.label} for question ${question.sourceNumber}; retry the translation.`)
      options[option.label] = translated
    }
    const latinField = [
      ['question', item.question],
      ['explanation', item.explanation || ''],
      ['example', item.example],
    ].find(([, value]) => /[A-Za-z]/.test(value))
    if (latinField) {
      throw new Error(`Gemini returned English text in the ${languageName} ${latinField[0]} for question ${question.sourceNumber}; retry the translation.`)
    }
    result[question.id] = {
      question: item.question,
      options,
      explanation: question.correctAnswer && typeof item.explanation === 'string' ? item.explanation : '',
      example: item.example,
      qualityVersion: 4,
    }
  }
  return result
}

app.use((error, _request, response, _next) => {
  console.error(error)
  if (response.headersSent) return
  const status = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 500
  const message = status === 413 ? 'PDF must be 20 MB or smaller.' : (error.message || 'An unexpected server error occurred.')
  response.status(status).json({ error: message })
})

app.listen(port, () => {
  console.log(`MCQ backend listening on http://localhost:${port}`)
})
