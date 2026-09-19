// The 1-2 letter initials shown on a person's avatar, derived from their `name` field. Names are
// free text - Settings' Add Person form accepts anything - so this cannot assume "First Last":
// a single-word name degrades to just its first letter rather than crashing or rendering
// "undefined", and a middle name is dropped (first word + last word only), matching the common
// monogram convention rather than trying to initial every word.
export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0]!.charAt(0).toUpperCase()
  return (words[0]!.charAt(0) + words[words.length - 1]!.charAt(0)).toUpperCase()
}
