// Despliega firestore.rules vía REST (firebaserules.googleapis.com) con el service account.
// Sin dependencias: firma el JWT con crypto y canjea el token OAuth manualmente.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const SA = require(path.join(ROOT, 'serviceAccountKey.json'));
const PROJECT = SA.project_id;
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: SA.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const sig = b64url(signer.sign(SA.private_key));
  const jwt = `${header}.${claims}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

(async () => {
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const base = `https://firebaserules.googleapis.com/v1/projects/${PROJECT}`;
  const source = { source: { files: [{ name: 'firestore.rules', content: RULES }] } };

  // 1) validar
  const testRes = await fetch(`${base}:test`, { method: 'POST', headers, body: JSON.stringify(source) });
  const testJson = await testRes.json();
  const issues = (testJson.issues || []).filter((i) => i.severity === 'ERROR');
  if (issues.length) {
    console.error('❌ Errores de sintaxis en las reglas:');
    for (const i of issues) console.error(` ${i.sourcePosition?.line}:${i.sourcePosition?.column} ${i.description}`);
    process.exit(1);
  }
  console.log('✓ Reglas válidas (sin errores de sintaxis)');

  // 2) crear ruleset
  const rsRes = await fetch(`${base}/rulesets`, { method: 'POST', headers, body: JSON.stringify(source) });
  if (!rsRes.ok) { console.error('❌ Error creando ruleset:', rsRes.status, await rsRes.text()); process.exit(1); }
  const ruleset = await rsRes.json();
  console.log('✓ Ruleset creado:', ruleset.name);

  // 3) apuntar el release cloud.firestore al ruleset nuevo
  const releaseName = `projects/${PROJECT}/releases/cloud.firestore`;
  const relRes = await fetch(`https://firebaserules.googleapis.com/v1/${releaseName}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ release: { name: releaseName, rulesetName: ruleset.name } }),
  });
  if (!relRes.ok) { console.error('❌ Error publicando release:', relRes.status, await relRes.text()); process.exit(1); }
  const rel = await relRes.json();
  console.log('✓ Release publicado:', rel.name, '→', rel.rulesetName);
  console.log('✓ Reglas de Firestore desplegadas.');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
