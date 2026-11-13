// Equivalentes en TypeScript de normalizar_codigo() y normalizar_texto() del SQL.
// Deben dar el mismo resultado: el importador empareja aquí y la base de datos indexa allá.

/** Código del sistema administrativo: sin espacios, en mayúsculas, conserva ceros a la izquierda, quita el ".0" que agrega Excel. */
export function normalizarCodigo(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null
  const t = String(valor).replace(/\s+/g, '').toUpperCase().replace(/\.0+$/, '')
  return t === '' ? null : t
}

/** Texto: minúsculas, sin acentos, espacios simples. */
export function normalizarTexto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null
  const t = String(valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  return t === '' ? null : t
}

/** Convierte "1.234,56", "1,234.56", "$ 45", 45 en número. Devuelve null si no se puede. */
export function parsearNumero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  if (valor === null || valor === undefined) return null
  let t = String(valor).replace(/[^\d,.-]/g, '')
  if (t === '' || t === '-') return null
  const ultimaComa = t.lastIndexOf(',')
  const ultimoPunto = t.lastIndexOf('.')
  if (ultimaComa > ultimoPunto) {
    // Formato venezolano: 1.234,56
    t = t.replace(/\./g, '').replace(',', '.')
  } else {
    t = t.replace(/,/g, '')
  }
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Similitud por trigramas (misma idea que pg_trgm), de 0 a 1. */
export function similitud(a: string, b: string): number {
  const ta = trigramas(a)
  const tb = trigramas(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let comunes = 0
  for (const t of ta) if (tb.has(t)) comunes++
  return comunes / (ta.size + tb.size - comunes)
}

function trigramas(s: string): Set<string> {
  const res = new Set<string>()
  for (const palabra of (normalizarTexto(s) ?? '').split(/[^a-z0-9]+/).filter(Boolean)) {
    const p = `  ${palabra} `
    for (let i = 0; i < p.length - 2; i++) res.add(p.slice(i, i + 3))
  }
  return res
}
