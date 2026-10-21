function shuffled(items, random) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

export function shuffleQuestionOptions(question, random = Math.random) {
  const options = shuffled(question.options, random)
  const answer = options.findIndex((option) => option.label === question.correctAnswer)
  const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return {
    ...question,
    options: options.map((option, index) => ({
      ...option,
      sourceLabel: option.label,
      label: labels[index],
    })),
    correctAnswer: answer < 0 ? question.correctAnswer : labels[answer],
  }
}

export function selectExamQuestions(pool, count = 20, previousIds = [], random = Math.random) {
  const requested = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0
  const size = Math.min(requested, pool.length)
  const previous = new Set(previousIds)
  const unseen = shuffled(pool.filter((question) => !previous.has(question.id)), random)
  const recent = shuffled(pool.filter((question) => previous.has(question.id)), random)
  const selection = [...unseen.slice(0, size)]
  if (selection.length < size) selection.push(...recent.slice(0, size - selection.length))
  return shuffled(selection, random).map((question) => shuffleQuestionOptions(question, random))
}
