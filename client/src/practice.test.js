import test from 'node:test'
import assert from 'node:assert/strict'
import { filterPracticeQuestions, getQuestionUnit } from './practice.js'

test('uses explicit unit sections before inferring a unit from the course outcome', () => {
  assert.equal(getQuestionUnit({ sourceSection: 'Unit IV', co: 'CO2' }), 'Unit IV')
  assert.equal(getQuestionUnit({ sourceSection: 'Group B', co: 'CO2' }), 'Unit II')
})

test('supports numeric unit metadata and leaves untagged questions ungrouped', () => {
  assert.equal(getQuestionUnit({ unitNumber: 3 }), 'Unit 3')
  assert.equal(getQuestionUnit({ sourceSection: 'Group A' }), null)
})

test('filters practice by several units and combines selected mark values', () => {
  const questions = [
    { id: 'one', sourceSection: 'Unit I', marks: 1 },
    { id: 'two', sourceSection: 'Group B', co: 'CO2', marks: 2 },
    { id: 'three', sourceSection: 'Unit III', marks: 1 },
  ]

  assert.deepEqual(
    filterPracticeQuestions(questions, ['Unit I', 'Unit II'], [1, 2]).map(({ id }) => id),
    ['one', 'two'],
  )
})
