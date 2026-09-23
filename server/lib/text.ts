export function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}
