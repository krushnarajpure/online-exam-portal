const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const questionBankPath = path.join(__dirname, '..', 'data', 'mcqs.json')
const questions = JSON.parse(fs.readFileSync(questionBankPath, 'utf8'))

test('bundled SEPM bank includes every extracted PDF MCQ in its original mark group', () => {
  const marks = questions.reduce((counts, question) => {
    counts[question.marks] = (counts[question.marks] || 0) + 1
    return counts
  }, {})

  assert.equal(questions.length, 160)
  assert.equal(marks[1], 110)
  assert.equal(marks[2], 50)
  assert.ok(questions.every((question) => question.category === 'end-sem'))
  assert.ok(questions.every((question) => question.subject === 'Software Engineering and Project Management'))
  assert.equal(new Set(questions.map((question) => question.id)).size, questions.length)
})

test('question bank contains complete choices and supplied answers for all PDF questions', () => {
  assert.ok(questions.every((question) => question.question.length > 10))
  assert.ok(questions.every((question) => question.options.length >= 2))
  assert.ok(questions.every((question) => question.options.every((option) => option.text.trim().length > 0)))
  assert.ok(questions.every((question) => question.options.some((option) => option.label === question.correctAnswer)))
  assert.ok(questions.every((question) => !/[ƟŌƩ]/.test(question.question + question.options.map((option) => option.text).join(' '))))
})
