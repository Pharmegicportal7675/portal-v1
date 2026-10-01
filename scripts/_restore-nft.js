const fs = require('fs');
const path = 'node_modules/next/dist/compiled/@vercel/nft/index.js';
let source = fs.readFileSync(path, 'utf8');
source = source.replace(
  'async function analyze(e,t,r){global.__nftFile=e;const s=new Set',
  'async function analyze(e,t,r){const s=new Set'
);
source = source.replace(
  'const emitAssetDirectory=e=>{if(String(e).includes("Users"))console.error("NFT_ASSET", e, "FROM", global.__nftFile);if(!r.analysis.emitGlobs)return;',
  'const emitAssetDirectory=e=>{if(!r.analysis.emitGlobs)return;'
);
if (source.includes('__nftFile') || source.includes('NFT_ASSET')) {
  console.error('restore failed');
  process.exit(1);
}
fs.writeFileSync(path, source);
console.log('restored');
