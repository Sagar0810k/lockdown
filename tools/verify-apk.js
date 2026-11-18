// Verify the CI-built APK contains the native module by scanning classes.dex string table
const fs = require('fs');
const zlib = require('zlib');

const apk = process.argv[2];
if (!apk) { console.error('usage: node verify-apk.js <apk>'); process.exit(1); }
const buf = fs.readFileSync(apk);

// ---- minimal zip parser ----
let eocd = -1;
for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
  if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
if (eocd === -1) throw new Error('not a zip');
const cdCount = buf.readUInt16LE(eocd + 10);
const cdOff = buf.readUInt32LE(eocd + 16);
let p = cdOff;
const entries = [];
for (let i = 0; i < cdCount; i++) {
  if (buf.readUInt32LE(p) !== 0x02014b50) break;
  const method = buf.readUInt16LE(p + 10);
  const csize = buf.readUInt32LE(p + 20);
  const nameLen = buf.readUInt16LE(p + 28);
  const extraLen = buf.readUInt16LE(p + 30);
  const commentLen = buf.readUInt16LE(p + 32);
  const lho = buf.readUInt32LE(p + 42);
  const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
  entries.push({ name, method, csize, lho });
  p += 46 + nameLen + extraLen + commentLen;
}
const dexEntry = entries.find(e => e.name === 'classes.dex');
if (!dexEntry) { console.log('FAIL: classes.dex missing'); process.exit(1); }
const lho = dexEntry.lho;
if (buf.readUInt32LE(lho) !== 0x04034b50) throw new Error('bad local header');
const nameLen = buf.readUInt16LE(lho + 26);
const extraLen = buf.readUInt16LE(lho + 28);
const dataOff = lho + 30 + nameLen + extraLen;
const raw = buf.slice(dataOff, dataOff + dexEntry.csize);
const dex = dexEntry.method === 0 ? raw : zlib.inflateRawSync(raw);
console.log('classes.dex bytes:', dex.length);

// ---- dex string table ----
function du32(o){ return dex.readUInt32LE(o); }
function readUleb128(off){ let v=0,s=0,c=0; for(;;){ const b=dex[off+c]; c++; v|=(b&0x7f)<<s; if((b&0x80)===0) break; s+=7; } return { value:v, bytesRead:c }; }
const stringIdsSize = du32(0x38);
const stringIdsOff = du32(0x3c);
const hits = new Set();
for (let i = 0; i < stringIdsSize; i++) {
  const strOff = du32(stringIdsOff + i * 4);
  const { value: len, bytesRead } = readUleb128(strOff);
  let end = strOff + bytesRead;
  while (end < dex.length && dex[end] !== 0) end++;
  const str = dex.slice(strOff + bytesRead, end).toString('utf8');
  if (/lockdown|ExpoModulesPackageList|ExpoInlineModulesList/i.test(str)) hits.add(str);
}
const all = [...hits].sort();
console.log('matches (' + all.length + '):');
for (const h of all) console.log('  ' + h);

const required = [
  'expo/modules/lockdown/LockdownModule',
  'expo/modules/lockdown/SessionStore',
  'expo/modules/lockdown/UsageMonitorService',
  'expo/modules/lockdown/SessionEndReceiver',
  'expo/modules/ExpoModulesPackageList'
];
let ok = true;
for (const r of required) {
  const present = all.some(h => h.includes(r));
  console.log((present ? 'PASS' : 'FAIL') + '  ' + r);
  if (!present) ok = false;
}
process.exit(ok ? 0 : 1);
