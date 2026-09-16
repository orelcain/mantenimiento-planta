# Medidores de pantalla (pegar en la consola del navegador)

Los auditores de `scripts/` leen el CÓDIGO. Estos leen lo que se RENDERIZA, que es
donde aparecen los defectos que el código no delata: alturas reales, saturación
compuesta, overflow. Nacieron el 2026-09-15 midiendo la app contra el criterio iOS 27.

⚠ Correr con la piel puesta: `?skin=apple`, y en móvil (375px) — el escritorio engaña.

## 1 · Targets táctiles bajo 44 px

Distingue los que usan el primitivo `<Button>` de los `<button>` a mano, que es la
diferencia que decide si el arreglo va en un archivo o en cuarenta.

```js
const esPrim = el => typeof el.className === 'string' &&
  el.className.includes('whitespace-nowrap') && el.className.includes('ring-offset-background');
const c = [...document.querySelectorAll('button,input,select,[role="tab"]')]
  .map(e => ({ t: (e.textContent||'').trim().slice(0,22) || e.type, h: Math.round(e.getBoundingClientRect().height), prim: esPrim(e) }))
  .filter(x => x.h > 0);
({ total: c.length, bajo_44: c.filter(x=>x.h<44).length,
   del_primitivo: c.filter(x=>x.prim&&x.h<44).map(x=>x.t+'='+x.h),
   a_mano: c.filter(x=>!x.prim&&x.h<44).map(x=>x.t+'='+x.h) })
```

## 2 · Colores chillones (saturación real, compuesta)

Mide sobre lo pintado, no sobre el token. Un `bg-red-500/15` se ve distinto al
`#FF453A` del que sale.

```js
function rgb(s){const m=s&&s.match(/\d+(\.\d+)?/g);return m&&m.length>=3?[+m[0],+m[1],+m[2],m[3]!==undefined?+m[3]:1]:null}
function sat(c){const[r,g,b]=c.map(v=>v/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;
  if(mx===mn)return 0;const d=mx-mn;return l>.5?d/(2-mx-mn):d/(mx+mn)}
const v={};
for (const el of document.querySelectorAll('*')) {
  const r = el.getBoundingClientRect(); if (r.width*r.height < 900) continue;
  const g = getComputedStyle(el), bg = rgb(g.backgroundColor);
  if (!bg || bg[3] < .5) continue;
  const s = sat(bg); if (s < .8) continue;   // relleno grande + tinte vivo = lo que §3 prohibe
  const k = 'rgb('+bg[0]+','+bg[1]+','+bg[2]+')';
  v[k] = v[k] || { sat:+s.toFixed(2), n:0, area:0, ej:'' };
  v[k].n++; v[k].area += Math.round(r.width*r.height);
  if (!v[k].ej) v[k].ej = (el.textContent||'').trim().slice(0,26) || el.tagName;
}
Object.entries(v).map(([k,x])=>({color:k,...x})).sort((a,b)=>b.area-a.area)
```

## 3 · Overflow horizontal

```js
({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
   scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth })
```
