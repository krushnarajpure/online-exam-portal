const QUESTION_START = /^(?:(?:question|que|q)\.?\s*)?(\d{1,4})\s*[.)]?\s*(.*)$/i
const ANSWER_START = /^\s*(?:answer|ans|correct answer)\s*:\s*\(?([A-E])\)?(?:\s+(.*))?$/i
const ANSWER_KEY = /^\s*(?:unit\s+[ivx]+\s+)?answer\s*key\b\s*:?\s*(.*)$/i
const OPTION_MARKER = /(?:^|\s)(?:\(([A-E])\)|([A-E])[.)])\s*/gi
const QUESTION_FOOTER = /^\s*([12])\s+CO\s*(\d+)\s*$/i

function normalizePdfText(value) {
  return value
    .replace(/Ō/g, 'ft')
    .replace(/Ɵ/g, 'ti')
    .replace(/Ʃ/g, 'tt')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function parseAnswerPairs(value) {
  const answers = new Map()
  for (const match of value.matchAll(/(?:^|[\s,;])(\d{1,4})\s*[-.):]?\s*\(?([A-E])\)?(?=$|[\s,;])/gi)) {
    answers.set(Number(match[1]), match[2].toUpperCase())
  }
  return answers
}

function getSectionMarks(line, current) {
  const normalized = line.toLowerCase()
  if (/\b(?:2|two)\s*[- ]?marks?\b/.test(normalized) || /\bmarks?\s*[:=-]\s*2\b/.test(normalized)) return 2
  if (/\b(?:1|one)\s*[- ]?marks?\b/.test(normalized) || /\bmarks?\s*[:=-]\s*1\b/.test(normalized)) return 1
  return current
}

export function parseMcqs(text, { subject, category, defaultMarks = 1 }) {
  const lines = text
    .replace(/Que\.[ \t]*\r?\n[ \t]*(\d{1,4})/gi, 'Que. $1')
    .split(/\r?\n/)
    .map(normalizePdfText)
    .filter(Boolean)
  const questions = []
  let current = null
  let activeMarks = Number(defaultMarks) === 2 ? 2 : 1
  let sourceSection = ''
  let currentBatchStart = 0
  let ignoreAnswerContinuation = false
  let awaitingAnswerKey = false

  function saveCurrent() {
    if (!current) return
    current.question = current.question.replace(/\s+/g, ' ').trim()
    current.options = current.options
      .map((option) => ({ ...option, text: option.text.replace(/\s+/g, ' ').trim() }))
      .filter((option) => option.text)
    if (current.question && current.options.length >= 2) {
      const labels = new Set(current.options.map((option) => option.label))
      questions.push({
        subject,
        category,
        marks: current.marks,
        question: current.question,
        options: current.options,
        correctAnswer: current.inlineAnswer && labels.has(current.inlineAnswer) ? current.inlineAnswer : null,
        explanation: '',
        sourceNumber: current.number,
        sourceSection: current.sourceSection,
        ...(current.co ? { co: current.co } : {}),
      })
    }
    current = null
  }

  function appendOption(label, value) {
    const cleanLabel = label.toUpperCase()
    const existing = current.options.find((option) => option.label === cleanLabel)
    if (existing) existing.text += ` ${value}`
    else current.options.push({ label: cleanLabel, text: value })
  }

  for (const line of lines) {
    if (/^department of information technology$/i.test(line) || /^_+$/.test(line) || /^session\s*:/i.test(line)) continue
    if (/^que\s+group\s+[ab]\s+co\s+marks$/i.test(line)) continue

    const group = line.match(/^group\s*[- ]\s*([ab])\b/i)
    if (group) {
      saveCurrent()
      sourceSection = `Group ${group[1].toUpperCase()}`
      activeMarks = group[1].toLowerCase() === 'b' ? 2 : 1
      currentBatchStart = questions.length
      ignoreAnswerContinuation = false
      continue
    }

    const unit = line.match(/^unit\s+([ivx]+)\s*:/i)
    if (unit) {
      saveCurrent()
      sourceSection = `Unit ${unit[1].toUpperCase()}`
      activeMarks = 1
      currentBatchStart = questions.length
      ignoreAnswerContinuation = false
      continue
    }

    const answerKey = line.match(ANSWER_KEY)
    if (answerKey) {
      saveCurrent()
      const pairs = parseAnswerPairs(answerKey[1])
      for (const question of questions.slice(currentBatchStart)) {
        if (!question.correctAnswer) {
          const answer = pairs.get(question.sourceNumber)
          if (answer && question.options.some((option) => option.label === answer)) question.correctAnswer = answer
        }
      }
      awaitingAnswerKey = pairs.size === 0
      continue
    }

    if (awaitingAnswerKey) {
      const pairs = parseAnswerPairs(line)
      if (pairs.size) {
        for (const question of questions.slice(currentBatchStart)) {
          if (!question.correctAnswer) {
            const answer = pairs.get(question.sourceNumber)
            if (answer && question.options.some((option) => option.label === answer)) question.correctAnswer = answer
          }
        }
        continue
      }
      awaitingAnswerKey = false
    }

    if (/^(?:section\s+[\w-]+\s*[-:]\s*)?(?:1|2|one|two)\s*[- ]?marks?\s*(?:questions?)?$/i.test(line)
      || /^marks?\s*[:=-]\s*[12]\s*$/i.test(line)) {
      activeMarks = getSectionMarks(line, activeMarks)
      continue
    }

    const footer = line.match(QUESTION_FOOTER)
    if (footer && current) {
      current.marks = Number(footer[1])
      current.co = `CO${footer[2]}`
      ignoreAnswerContinuation = false
      continue
    }

    const answer = line.match(ANSWER_START)
    if (answer && current) {
      current.inlineAnswer = answer[1].toUpperCase()
      ignoreAnswerContinuation = true
      continue
    }

    const questionStart = line.match(QUESTION_START)
    if (questionStart) {
      saveCurrent()
      ignoreAnswerContinuation = false
      current = {
        number: Number(questionStart[1]),
        question: questionStart[2],
        options: [],
        marks: activeMarks,
        inlineAnswer: null,
        sourceSection,
      }
      continue
    }

    if (ignoreAnswerContinuation) continue
    if (!current) continue
    const markers = [...line.matchAll(OPTION_MARKER)]
    if (markers.length) {
      const first = markers[0]
      if (first.index > 0) {
        const prefix = line.slice(0, first.index).trim()
        const lastOption = current.options[current.options.length - 1]
        if (prefix && lastOption) lastOption.text += ` ${prefix}`
        else if (prefix) current.question += ` ${prefix}`
      }
      for (let index = 0; index < markers.length; index += 1) {
        const marker = markers[index]
        const start = marker.index + marker[0].length
        const end = markers[index + 1]?.index ?? line.length
        appendOption(marker[1] || marker[2], line.slice(start, end).trim())
      }
      continue
    }

    const lastOption = current.options[current.options.length - 1]
    if (lastOption) lastOption.text += ` ${line}`
    else current.question += ` ${line}`
  }
  saveCurrent()

  return questions
}
