/**
 * El texto que el usuario lee en un globo de micro ya renderizado, una línea por cosa y con las marcas que son dibujo (①, ✕, ▼, ▽, la píldora «en observación»)
 * escritas como carácter: `textContent` a secas pega el número de una razón con la cifra de su celda («1» + «17» = «117») y pierde cuál marca es cuál.
 * Los espacios duros (U+00A0) salen como espacio normal. Por defecto el globo trae tres piezas (encabezado, línea de causa, tabla) y el botón «Ver detalle»;
 * abierto, trae además el detalle (forma, observación, leyenda de ▽, reglas que no aplicaron y pie).
 */
const CIRCULOS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨']
const limpio = (t: string | null | undefined) => (t ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
const numero = (n: Element) => CIRCULOS[Number(n.textContent) - 1] ?? `(${n.textContent})`
const glifo = (el: Element | null) => el?.closest('[data-glifo]')?.getAttribute('data-glifo') ?? el?.querySelector('[data-glifo]')?.getAttribute('data-glifo') ?? ''

/** Una celda de la tabla: sus números de razón, la marca ▼/▽ y la cifra, separados por espacio. */
function celda(c: Element): string {
  const partes: string[] = []
  c.querySelectorAll('.ref').forEach((r) => partes.push(numero(r)))
  c.querySelectorAll('[data-glifo]').forEach((g) => partes.push(g.getAttribute('data-glifo')!))
  const v = c.querySelector('.v')
  partes.push(limpio(v ? v.textContent : c.textContent))
  return partes.join(' ')
}

/** La línea de causa: el texto con el ① donde va y la píldora entre corchetes. */
function lineaDeCausa(causa: Element): string {
  const partes: string[] = []
  const recorre = (n: Node) => {
    if (n.nodeType === 3) { partes.push(n.textContent ?? ''); return }
    const el = n as Element
    if (el.classList?.contains('ref')) partes.push(numero(el))
    else if (el.classList?.contains('pill')) partes.push(`[${limpio(el.textContent)}]`)
    else if (el.tagName === 'I') return
    else n.childNodes.forEach(recorre)
  }
  causa.childNodes.forEach(recorre)
  return limpio(partes.join(''))
}

export function lineasDelGlobo(globo: Element): string[] {
  const out: string[] = []
  const tit = globo.querySelector('.gm-tit')
  if (tit) out.push(limpio(tit.textContent))
  const causa = globo.querySelector('.gm-causa4')
  if (causa) out.push(lineaDeCausa(causa))
  globo.querySelectorAll('thead tr').forEach((tr) => out.push(Array.from(tr.querySelectorAll('th')).map((t) => limpio(t.textContent)).join(' | ')))
  globo.querySelectorAll('tbody tr').forEach((tr) => out.push(Array.from(tr.querySelectorAll('th,td')).map((c) => (c.tagName === 'TH' ? limpio(c.textContent) : celda(c))).join(' | ')))
  const ver = globo.querySelector('.gm-ver')
  if (ver) out.push(`${limpio(ver.textContent)} (${ver.getAttribute('aria-expanded') === 'true' ? 'abierto' : 'cerrado'})`)
  /* El detalle, en el orden en que se lee: forma, observación, leyenda de ▽, cada regla que no aplicó con su ✕ y el pie. */
  globo.querySelectorAll('.gm-dc > *').forEach((el) => {
    if (el.classList.contains('gm-ley-tri')) out.push(`${glifo(el.querySelector('[data-glifo]'))} ${limpio(el.querySelector('span')!.textContent)}`)
    else if (el.classList.contains('gm-desc')) el.querySelectorAll('li').forEach((li) => out.push(`${glifo(li.querySelector('[data-glifo]'))} ${limpio(li.querySelector('span:not([data-glifo])')!.textContent)}`))
    else out.push(limpio(el.textContent))
  })
  return out
}
