import test from 'node:test'
import assert from 'node:assert/strict'
import { selectExamQuestions, shuffleQuestionOptions } from './exam.js'

const questions = Array.from({ length: 50 }, (_, index) => ({
  id: `question-${index}`,
  marks: index < 35 ? 1 : 2,
  correctAnswer: 'B',
  options: [
    { label: 'A', text: 'Wrong' },
    { label: 'B', text: 'Right' },
    { label: 'C', text: 'Also wrong' },
    { label: 'D', text: 'Still wrong' },
  ],
}))

test('creates a unique 20-question exam from its selected question pool', () => {
  const pool = questions.filter((question) => question.marks === 1)
  const exam = selectExamQuestions(pool)

  assert.equal(exam.length, 20)
  assert.equal(new Set(exam.map((question) => question.id)).size, 20)
  assert.ok(exam.every((question) => pool.some((candidate) => candidate.id === question.id)))
})

test('selects a fresh set for a second exam when the pool allows it', () => {
  const firstExam = selectExamQuestions(questions, 20)
  const secondExam = selectExamQuestions(questions, 20, firstExam.map((question) => question.id))

  assert.equal(secondExam.length, 20)
  assert.ok(secondExam.some((question) => !firstExam.some((previous) => previous.id === question.id)))
})

test('returns every available question when the pool has fewer than 20', () => {
  const pool = questions.slice(0, 8)

  assert.equal(selectExamQuestions(pool).length, 8)
})

test('selects unseen questions before repeating any completed-attempt questions', () => {
  const pool = questions.slice(0, 6)
  const result = selectExamQuestions(pool, 3, ['question-0', 'question-1', 'question-2'])

  assert.equal(result.length, 3)
  assert.ok(result.every((question) => !['question-0', 'question-1', 'question-2'].includes(question.id)))
})

test('allows repeats only when the seen pool is insufficient and never exceeds available questions', () => {
  const pool = questions.slice(0, 4)
  const result = selectExamQuestions(pool, 10, pool.map((question) => question.id))

  assert.equal(result.length, 4)
  assert.equal(new Set(result.map((question) => question.id)).size, 4)
})

test('shuffles options while keeping the correct answer attached to its original choice', () => {
  const question = questions[0]
  const result = shuffleQuestionOptions(question, () => 0.4)
  const correct = result.options.find((option) => option.label === result.correctAnswer)

  assert.equal(result.options.length, 4)
  assert.equal(correct.text, 'Right')
  assert.equal(correct.sourceLabel, 'B')
  assert.deepEqual(question.options.map((option) => option.label), ['A', 'B', 'C', 'D'])
})
