const test = require('node:test')
const assert = require('node:assert/strict')
const { parseMcqs } = require('./parser')

test('parses questions, options, inline answers, answer keys, and mark sections', () => {
  const text = [
    'Section A - 1 mark questions',
    '1. Which value is first?',
    'A) One',
    'B) Two',
    'Answer: A',
    'Section B - 2 marks questions',
    '2. Which value is second?',
    'A) One',
    'B) Two',
    'Answer Key',
    '2. B',
  ].join('\n')

  const result = parseMcqs(text, { subject: 'Basics', category: 'subjects', defaultMarks: 1 })

  assert.equal(result.length, 2)
  assert.deepEqual(result.map((item) => item.marks), [1, 2])
  assert.deepEqual(result.map((item) => item.correctAnswer), ['A', 'B'])
  assert.deepEqual(result[0].options, [{ label: 'A', text: 'One' }, { label: 'B', text: 'Two' }])
})

test('does not invent a correct answer when no answer key is present', () => {
  const text = [
    '1. Select an option.',
    'A) First',
    'B) Second',
    'C) Third',
  ].join('\n')

  const result = parseMcqs(text, { subject: 'Basics', category: 'practicals', defaultMarks: 2 })

  assert.equal(result.length, 1)
  assert.equal(result[0].correctAnswer, null)
  assert.equal(result[0].marks, 2)
  assert.equal(result[0].subject, 'Basics')
  assert.equal(result[0].category, 'practicals')
})

test('reads answer-key entries placed on the same line as the heading', () => {
  const text = [
    '1. First question?',
    'A) First',
    'B) Second',
    '2. Second question?',
    'A) First',
    'B) Second',
    'Answer Key: 1. B, 2. A',
  ].join('\n')

  const result = parseMcqs(text, { subject: 'Basics', category: 'subjects', defaultMarks: 1 })

  assert.deepEqual(result.map((item) => item.correctAnswer), ['B', 'A'])
})

test('ignores malformed questions without at least two options', () => {
  const result = parseMcqs('1. Incomplete question\nA) Only one', {
    subject: 'Basics',
    category: 'end-sem',
    defaultMarks: 1,
  })

  assert.deepEqual(result, [])
})

test('supports question papers with more than 100 questions', () => {
  const paper = Array.from({ length: 120 }, (_, index) => [
    `${index + 1}. Question ${index + 1}?`,
    'A) First',
    'B) Second',
  ].join('\n')).join('\n')

  const result = parseMcqs(paper, { subject: 'Large paper', category: 'end-sem', defaultMarks: 1 })

  assert.equal(result.length, 120)
  assert.equal(result[119].question, 'Question 120?')
  assert.equal(result[119].correctAnswer, null)
})

test('parses the supplied question-bank layout with inline and unit answer keys', () => {
  const paper = [
    'Group-A Marks CO',
    'Que.1',
    'First question?',
    '(a) First (b) Second',
    'Answer: (b) Second',
    '1 CO1',
    'Que GROUP A CO Marks',
    'Unit I: Fundamentals',
    'Q.1',
    'Which choice?',
    'a) One  b) Two  c) Three  d) Four',
    '1 1',
    'Q.2',
    'Which other choice?',
    'a) One',
    'b) Two',
    'c) Three',
    'd) Four',
    '1 1',
    'Unit I Answer Key: 1-a, 2-d',
    'Group-B Marks CO',
    'Que.',
    '51',
    'Two-mark question?',
    '(a) First',
    '(b) Second',
    'Answer: (a) First',
    '2 CO1',
  ].join('\n')

  const result = parseMcqs(paper, { subject: 'SEPM', category: 'end-sem' })

  assert.equal(result.length, 4)
  assert.deepEqual(result.map((item) => item.marks), [1, 1, 1, 2])
  assert.deepEqual(result.map((item) => item.correctAnswer), ['B', 'A', 'D', 'A'])
  assert.equal(result[0].options[0].text, 'First')
  assert.equal(result[1].options.length, 4)
  assert.equal(result[3].sourceNumber, 51)
  assert.equal(result[3].sourceSection, 'Group B')
})

test('restores letter pairs mangled by the PDF embedded font encoding', () => {
  const result = parseMcqs([
    'Q.1',
    'What does SoŌware TesƟng mean?',
    '(a) BoƩom up',
    '(b) Top down',
  ].join('\n'), { subject: 'SEPM', category: 'end-sem' })

  assert.equal(result[0].question, 'What does Software Testing mean?')
  assert.equal(result[0].options[0].text, 'Bottom up')
})
