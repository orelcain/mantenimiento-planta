import { readFileSync } from 'node:fs'
const RE=/[\u{1F300}-\u{1FAFF}\u{2B00}-\u{2BFF}]|[\u{2600}-\u{26FF}]/gu
const f=process.argv[2]
readFileSync(f,'utf8').split('\n').forEach((l,i)=>{
 if(/^\s*(\/\/|\*|\/\*)/.test(l))return
 if(RE.test(l)) console.log(String(i+1).padStart(4)+': '+l.trim().slice(0,110))})
