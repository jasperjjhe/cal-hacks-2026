// Comparative labels derived from catalog attributes and offer prices. They only state facts the
// compared offers share a field for, and are skipped when offers tie or fewer than two can be compared.
export interface HighlightInput {
  variantId: string
  totalCents: number
  attributes: Record<string, { value: unknown }>
}

const ancRank: Record<string, number> = { good: 1, excellent: 2, best_in_class: 3 }

function winners(inputs: HighlightInput[], score: (input: HighlightInput) => number | null, better: 'max' | 'min') {
  const scored = inputs.flatMap((input) => {
    const value = score(input)
    return value === null ? [] : [{ input, value }]
  })
  if (scored.length < 2) return null
  const best = better === 'max' ? Math.max(...scored.map((row) => row.value)) : Math.min(...scored.map((row) => row.value))
  const top = scored.filter((row) => row.value === best)
  return top.length === 1 ? top[0] : null
}

const number = (input: HighlightInput, field: string) => {
  const value = input.attributes[field]?.value
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function computeHighlights(inputs: HighlightInput[]): Map<string, string[]> {
  const labels = new Map<string, string[]>(inputs.map((input) => [input.variantId, []]))
  const add = (row: { input: HighlightInput } | null, text: string) => row && labels.get(row.input.variantId)!.push(text)
  const battery = winners(inputs, (input) => number(input, 'batteryHours'), 'max')
  add(battery, `Longest battery life (${battery?.value} h rated)`)
  const anc = winners(inputs, (input) => {
    const tier = input.attributes.ancTier?.value
    return typeof tier === 'string' ? (ancRank[tier] ?? null) : null
  }, 'max')
  add(anc, 'Strongest noise cancelling (reviewer consensus)')
  const weight = winners(inputs, (input) => number(input, 'weightG'), 'min')
  add(weight, `Lightest (${weight?.value} g)`)
  add(winners(inputs, (input) => input.totalCents, 'min'), 'Lowest delivered price')
  return labels
}
