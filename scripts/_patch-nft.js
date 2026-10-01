const fs = require('fs');
const path = 'node_modules/next/dist/compiled/@vercel/nft/index.js';
let source = fs.readFileSync(path, 'utf8');
const analyzeFrom = 'async function analyze(e,t,r){const s=new Set';
const analyzeTo = 'async function analyze(e,t,r){global.__nftFile=e;const s=new Set';
const emitFrom = 'const emitAssetDirectory=e=>{if(!r.analysis.emitGlobs)return;';
const emitTo =
  'const emitAssetDirectory=e=>{if(String(e).includes("Users"))console.error("NFT_ASSET", e, "FROM", global.__nftFile);if(!r.analysis.emitGlobs)return;';
if (!source.includes(analyzeFrom) || !source.includes(emitFrom)) {
  console.error('pattern missing', source.includes(analyzeFrom), source.includes(emitFrom));
  process.exit(1);
}
source = source.replace(analyzeFrom, analyzeTo).replace(emitFrom, emitTo);
fs.writeFileSync(path, source);
console.log('patched');
