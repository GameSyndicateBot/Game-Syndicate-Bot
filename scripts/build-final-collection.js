const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const INPUT = path.join(ROOT, 'input');
const REFERENCE = path.join(ROOT, 'reference');
const OUTPUT = path.join(ROOT, 'output-final');
const W = 1054;
const H = 1492;

const RARITIES = {
  common: { color: '#B9BDC5' },
  rare: { color: '#006BFF' },
  epic: { color: '#A855F7' },
  legendary: { color: '#F5B800' },
  mythic: { color: '#EF2B2B' },
};

function idFromName(name) {
  const m = path.parse(name).name.match(/\d{1,6}/);
  return m ? m[0].padStart(6, '0') : null;
}

function chooseInputs() {
  const map = new Map();
  for (const name of fs.readdirSync(INPUT)) {
    if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
    const id = idFromName(name);
    if (!id) continue;
    const score = (name.includes('#U') ? 0 : 10) + (/[А-Яа-яЁё]/.test(name) ? 3 : 0);
    const old = map.get(id);
    if (!old || score > old.score) map.set(id, { id, name, score, file: path.join(INPUT, name) });
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function hexRgb(hex) {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0,2),16), parseInt(v.slice(2,4),16), parseInt(v.slice(4,6),16)];
}

function rgbToHsv(r,g,b) {
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
  let h=0;
  if (d) {
    if (max===r) h=((g-b)/d)%6;
    else if (max===g) h=(b-r)/d+2;
    else h=(r-g)/d+4;
    h*=60; if (h<0) h+=360;
  }
  return [h, max===0?0:d/max, max];
}

function hsvToRgb(h,s,v) {
  const c=v*s, hp=h/60, x=c*(1-Math.abs((hp%2)-1));
  let a=[0,0,0];
  if (hp<1) a=[c,x,0]; else if (hp<2) a=[x,c,0]; else if (hp<3) a=[0,c,x];
  else if (hp<4) a=[0,x,c]; else if (hp<5) a=[x,0,c]; else a=[c,0,x];
  const m=v-c; return a.map(n=>Math.round((n+m)*255));
}

function inUi(x,y) {
  return y < 175 || x < 55 || x >= 999 || (y >= 850 && y < 1055) || y >= 1360;
}

async function recolor(input, rarity) {
  const { data, info } = await sharp(input).resize(W,H,{fit:'fill'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const [tr,tg,tb] = hexRgb(RARITIES[rarity].color);
  const [th,ts] = rgbToHsv(tr,tg,tb);
  for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
    if (!inUi(x,y)) continue;
    const i=(y*W+x)*info.channels, r=data[i], g=data[i+1], b=data[i+2];
    const [h,s,v]=rgbToHsv(r,g,b);
    if (v <= .10 || !((s>.20) || (s<.22 && v>.18))) continue;
    let rgb;
    if (rarity === 'common') {
      const q=Math.max(.08,Math.min(1,v*1.03)); rgb=[q*.98*255,q*.99*255,Math.min(1,q*1.03)*255].map(Math.round);
    } else rgb=hsvToRgb(th,Math.max(ts,.65),Math.max(.08,Math.min(1,v*1.03)));
    data[i]=rgb[0]; data[i+1]=rgb[1]; data[i+2]=rgb[2];
  }
  return sharp(data,{raw:{width:W,height:H,channels:info.channels}}).png().toBuffer();
}

function maskSvg() {
  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="transparent"/>
    <rect x="0" y="0" width="${W}" height="160" fill="white"/>
    <rect x="0" y="0" width="40" height="${H}" fill="white"/>
    <rect x="${W-40}" y="0" width="40" height="${H}" fill="white"/>
    <rect x="0" y="${H-40}" width="${W}" height="40" fill="white"/>
  </svg>`);
}

function textSvg(id, rarity) {
  const c=RARITIES[rarity].color;
  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="790" y="65" width="195" height="80" fill="#030308"/>
    <text x="970" y="112" text-anchor="end" font-family="DejaVu Sans" font-size="42" font-weight="700" fill="${c}">№${Number(id).toString().padStart(3,'0')}</text>
    <rect x="755" y="1390" width="230" height="98" fill="#030308"/>
    <text x="870" y="1422" text-anchor="middle" font-family="DejaVu Sans" font-size="20" font-weight="700" fill="${c}">ЭКЗЕМПЛЯР</text>
    <text x="870" y="1464" text-anchor="middle" font-family="DejaVu Sans" font-size="31" font-weight="700" fill="${c}">#${id}</text>
  </svg>`);
}

async function referenceOverlay(rarity) {
  const ref=path.join(REFERENCE,`000001_${rarity}.png`);
  return sharp(ref).resize(W,H).ensureAlpha().composite([{input:maskSvg(),blend:'dest-in'}]).png().toBuffer();
}

async function build(file, id, rarity, overlay) {
  const base=await recolor(file,rarity);
  const outDir=path.join(OUTPUT,id); fs.mkdirSync(outDir,{recursive:true});
  await sharp(base).composite([{input:overlay},{input:textSvg(id,rarity)}]).png({compressionLevel:6}).toFile(path.join(outDir,`${id}_${rarity}.png`));
}

(async()=>{
  fs.rmSync(OUTPUT,{recursive:true,force:true}); fs.mkdirSync(OUTPUT,{recursive:true});
  const overlays={}; for (const r of Object.keys(RARITIES)) overlays[r]=await referenceOverlay(r);
  const files=chooseInputs();
  for (const item of files) for (const r of Object.keys(RARITIES)) await build(item.file,item.id,r,overlays[r]);
  console.log(`Готово: ${files.length*5} карточек в output-final`);
})().catch(e=>{console.error(e);process.exit(1)});
