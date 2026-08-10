import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
const RE=/[\u{1F300}-\u{1FAFF}\u{2B00}-\u{2BFF}\u{FE0F}]|[\u{2600}-\u{26FF}]/gu
const SKIP=/[\/]hmi[\/]|Hmi\w*\.tsx$|Visor3D|simulador|[\/]components[\/]map[\/]|[\/]pages[\/](Map\w*|Mapa\w*)\.tsx$|[\/]components[\/]piel[\/]|[\/]pages[\/]dev[\/]/i
function* walk(d){for(const n of readdirSync(d)){const p=join(d,n);if(statSync(p).isDirectory())yield*walk(p);else if(/\.tsx$/.test(n))yield p}}
const byFile={}, ctx={comentario:0,jsx:0,string:0}
const samples=[]
for(const f of walk('apps/pwa/src')){const rel=relative('.',f); if(SKIP.test(rel))continue
 const lines=readFileSync(f,'utf8').split('\n')
 lines.forEach((l,i)=>{const m=l.match(RE); if(!m)return
  const t=l.trim()
  const kind = /^(\/\/|\*|\/\*)/.test(t) ? 'comentario' : /<[A-Za-z]/.test(l)||/>\s*[^<]*$/.test(l) ? 'jsx' : 'string'
  ctx[kind]+=m.length; byFile[rel]=(byFile[rel]??0)+m.length
  if(kind!=='comentario'&&samples.length<14)samples.push(`${rel}:${i+1} ${t.slice(0,90)}`)})}
console.log('Por contexto:',ctx)
console.log('\nTop archivos:')
Object.entries(byFile).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([f,n])=>console.log(`  ${String(n).padStart(4)} ${f}`))
console.log('\nMuestras (no-comentario):'); samples.forEach(s=>console.log('  '+s))
