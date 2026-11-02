/**
 * El texto que el usuario lee en un globo de micro ya renderizado, una línea por cosa y con las marcas que son dibujo (①, ✓, ✕, —, ▼, ▽)
 * escritas como carácter: `textContent` a secas pega el número de una razón con la cifra de su celda («1» + «17» = «117») y pierde
 * cuál regla es ✕ y cuál «no se evalúa». Los espacios duros (U+00A0) salen como espacio normal.
 */
const CIRCULOS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨']
const limpio = (t: string | null | undefined) => (t ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
const unico = (raiz: ParentNode, sel: string) => raiz.querySelector(sel)
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

export function lineasDelGlobo(globo: Element): string[] {
  const out: string[] = []
  const tit = unico(globo, '.gm-tit')
  if (tit) out.push(limpio(tit.textContent))
  const sub = unico(globo, '.gm-sub')
  if (sub) out.push(limpio(sub.textContent))
  const rot = unico(globo, '.gm-rot')
  if (rot) out.push(limpio(rot.textContent))
  const causa = unico(globo, '.gm-causa')
  if (causa) out.push(limpio(causa.textContent))
  globo.querySelectorAll('.gm-nota').forEach((n) => out.push(limpio(n.textContent)))
  globo.querySelectorAll('li.gm-ev').forEach((li) => {
    const lead = li.querySelector('.ref') ? numero(li.querySelector('.ref')!) : glifo(li.querySelector('.okc'))
    const de = li.querySelector('.de')
    const cuerpo = li.querySelector('.gm-txt')!
    const texto = limpio(Array.from(cuerpo.childNodes).filter((n) => n !== de).map((n) => n.textContent).join(''))
    out.push([lead, limpio(li.querySelector('.cifra')!.textContent), texto, de ? limpio(de.textContent) : ''].filter(Boolean).join(' · ').replace(`${lead} · `, `${lead} `))
  })
  globo.querySelectorAll('thead tr').forEach((tr) => out.push(Array.from(tr.querySelectorAll('th')).map((t) => limpio(t.textContent)).join(' | ')))
  globo.querySelectorAll('tbody tr').forEach((tr) => out.push(Array.from(tr.querySelectorAll('th,td')).map((c) => (c.tagName === 'TH' ? limpio(c.textContent) : celda(c))).join(' | ')))
  const ley = unico(globo, '.gm-ley-tri')
  if (ley) out.push(`${glifo(ley)} ${limpio(ley.querySelector('span')!.textContent)}`)
  globo.querySelectorAll('.gm-desc li').forEach((li) => {
    const regla = limpio(li.querySelector('b')!.textContent)
    const resto = limpio(li.querySelector('span:not([data-glifo])')!.textContent).replace(`${regla} · `, '')
    out.push(`${glifo(li.querySelector('[data-glifo]'))} ${regla} · ${resto}`)
  })
  const pie = unico(globo, '.gm-pie')
  if (pie) out.push(limpio(pie.textContent))
  return out
}
