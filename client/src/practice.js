const romanUnits = ['I', 'II', 'III', 'IV', 'V']

export function getQuestionUnit(question) {
  const source = question.unit ?? question.unitNumber ?? question.sourceSection ?? ''
  if (typeof source === 'number' && Number.isInteger(source) && source > 0) return `Unit ${source}`
  const match = String(source).match(/\b(?:unit|chapter|module)\s*([ivxlcdm]+|\d+)\b/i)
  if (match) return `Unit ${match[1].toUpperCase()}`

  const courseOutcome = String(question.co || '').match(/^CO([1-5])$/i)
  if (courseOutcome) return `Unit ${romanUnits[Number(courseOutcome[1]) - 1]}`

  return null
}

export function filterPracticeQuestions(questions, selectedUnits, selectedMarks) {
  return questions.filter((question) => (
    selectedUnits.includes(getQuestionUnit(question) || 'Unit not specified')
    && selectedMarks.includes(question.marks)
  ))
}
