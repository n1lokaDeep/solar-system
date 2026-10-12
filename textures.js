/* ============================================================
   ТЕКСТУРЫ
   1) Загрузка реальных карт NASA (папка tex/)
   2) Процедурные текстуры для спутников (их карт нет)
   3) Кольца Сатурна, свечение, звёздное небо
   ============================================================ */
import * as THREE from 'three';

const TEX_BASE = './tex/';

/* какие файлы грузим */
const FILES = {
  earth:       'earth.jpg',
  earthClouds: 'earth_clouds.jpg',
  earthNight:  'earth_night.jpg',
  jupiter:     'jupiter.jpg',
  saturn:      'saturn.jpg',
  mars:        'mars.jpg',
  mercury:     'mercury.jpg',
  venus:       'venus.jpg',
  venusAtmo:   'venus_atmo.jpg',
  uranus:      'uranus.jpg',
  neptune:     'neptune.jpg',
  sun:         'sun.jpg',
  moon:        'moon.jpg',
  stars:       'stars_bright.jpg',
};

/* ============================================================
   БИБЛИОТЕКА РЕАЛЬНЫХ ТЕКСТУР
   ============================================================ */
export class TextureLibrary {
  constructor(){
    this.textures = {};
    this.failed = [];
  }

  get(key){ return this.textures[key] || null; }

  async load(onProgress){
    const loader = new THREE.TextureLoader();
    const entries = Object.entries(FILES);
    let done = 0;

    await Promise.all(entries.map(([key, file]) => new Promise(resolve => {
      loader.load(
        TEX_BASE + file,
        tex => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.needsUpdate = true;
          this.textures[key] = tex;
          done++; onProgress?.(done / entries.length, key);
          resolve();
        },
        undefined,
        () => {
          console.warn('[текстуры] не загрузилась:', file);
          this.failed.push(file);
          done++; onProgress?.(done / entries.length, key);
          resolve();
        }
      );
    })));

    return this;
  }
}

/* ============================================================
   ШУМ для процедурных спутников
   ============================================================ */
function makeNoise(seed = 1){
  const p = new Uint8Array(512);
  let s = (seed * 9301 + 49297) % 233280;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 256; i++){ p[i] = perm[i]; p[i + 256] = perm[i]; }

  const grad = (h, x, y) => {
    const u = (h & 1) ? x : y, v = (h & 2) ? -x : -y;
    return ((h & 4) ? u : -u) + ((h & 8) ? v : -v) * 0.5 + u * v * 0.3;
  };
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;

  return function(x, y){
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const A = p[X] + Y, B = p[X + 1] + Y;
    return lerp(
      lerp(grad(p[A], x, y),     grad(p[B], x - 1, y), u),
      lerp(grad(p[A + 1], x, y - 1), grad(p[B + 1], x - 1, y - 1), u), v) * 0.7;
  };
}

/* сферическая обёртка, чтобы не было швов */
function spherical(nz, repeats){
  return (u, v) => {
    const a = u * Math.PI * 2 * repeats;
    const b = v * Math.PI;
    return nz(
      Math.cos(a) * Math.sin(b) * 3,
      Math.sin(a) * Math.sin(b) * 3 + Math.cos(b) * 1.7
    );
  };
}

function fbm(noise, u, v, oct = 5, lac = 2.1, gain = 0.5){
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++){
    sum += amp * noise(u * freq, v * freq);
    norm += amp; amp *= gain; freq *= lac;
  }
  return sum / norm;
}

function canvas(w, h){
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function hex2rgb(h){
  return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
}
function mixHex(a, b, t){
  const A = hex2rgb(a), B = hex2rgb(b);
  const r = Math.round(A[0] + (B[0]-A[0]) * t);
  const g = Math.round(A[1] + (B[1]-A[1]) * t);
  const bl= Math.round(A[2] + (B[2]-A[2]) * t);
  return [r, g, bl];
}

/* ============================================================
   ПРОЦЕДУРНЫЕ ТЕКСТУРЫ СПУТНИКОВ
   type: cratered | icy | volcanic | hazy | rocky | twotone
   Возвращает {map, bump}
   ============================================================ */
export function moonSurface(opts, W = 512, H = 256){
  const {
    colorA = '#9a9a94', colorB = '#4e4e4a',
    type = 'cratered', seed = 3, spots = 0, spotColor = '#000000',
    bands = 0,
  } = opts;

  const cc = canvas(W, H), ctx = cc.getContext('2d');
  const bc = canvas(W, H), bctx = bc.getContext('2d');
  const img = ctx.createImageData(W, H);
  const bimg = bctx.createImageData(W, H);

  const nz = makeNoise(seed);
  const nA = spherical(nz, 1);
  const nB = spherical(nz, 2.7);
  const nC = spherical(nz, 6.9);
  const nD = spherical(nz, 13.3);

  for (let y = 0; y < H; y++){
    const v = y / H;
    for (let x = 0; x < W; x++){
      const u = x / W;
      const i = (y * W + x) * 4;

      let h, shade = 1;

      if (type === 'volcanic'){
        /* Ио: жёлто-оранжевая с вулканическими пятнами */
        const base = fbm(nA, u, v * 1.6, 5) * 0.5 + 0.5;
        const blobs = fbm(nB, u * 1.4, v * 1.4, 4);
        h = base;
        // тёмные вулканические кальдеры
        const cal = fbm(nD, u * 2.2, v * 2.2, 3);
        if (cal > 0.30) h -= (cal - 0.30) * 1.4;
        // светлые отложения серы
        if (blobs > 0.18) h += (blobs - 0.18) * 0.9;
        shade = 0.86 + base * 0.3;
      } else if (type === 'icy'){
        /* Европа/Энцелад: белый лёд с сетью трещин */
        const base = fbm(nA, u, v * 1.2, 4) * 0.5 + 0.5;
        // трещины — тонкие тёмные линии по «гребням» шума
        const rid = Math.abs(fbm(nB, u * 1.5, v * 1.5, 5));
        const crack = rid < 0.035 ? (0.035 - rid) / 0.035 : 0;
        h = base * 0.75 + 0.2 - crack * 0.55;
        shade = 0.92 + base * 0.2;
      } else if (type === 'hazy'){
        /* Титан: оранжевая дымка, деталей почти нет */
        const base = fbm(nA, u, v * 0.8, 3) * 0.5 + 0.5;
        h = 0.45 + base * 0.18;
        shade = 0.9 + base * 0.25;
      } else if (type === 'twotone'){
        /* Япет: одно полушарие тёмное, другое светлое */
        const base = fbm(nA, u, v * 2, 5) * 0.5 + 0.5;
        const side = u < 0.5 ? 0.15 : 0.85;   // резкий контраст по долготе
        h = side * 0.75 + base * 0.25;
        shade = 0.9 + base * 0.2;
      } else if (type === 'rocky'){
        /* Фобос/Деймос: тёмные неровные глыбы */
        const base = fbm(nA, u * 1.5, v * 1.5, 5) * 0.5 + 0.5;
        const pit = fbm(nD, u * 3, v * 3, 4);
        h = base * 0.8 + (pit > 0.25 ? -(pit - 0.25) * 0.9 : 0);
        shade = 0.82 + base * 0.3;
      } else {
        /* cratered: Луна, Каллисто, Ганимед, Меркурий-подобные */
        const base = fbm(nA, u, v * 1.4, 6, 2.2, 0.55) * 0.5 + 0.5;
        const cr = fbm(nC, u * 2, v * 2, 4);
        const fine = fbm(nD, u * 4, v * 4, 3);
        h = base * 0.62 + cr * 0.26 + fine * 0.12;
        // тёмные «моря» на крупных спутниках
        if (bands) {
          const mare = fbm(nB, u * 0.9, v * 0.9, 3);
          if (mare < -0.05) h -= (-0.05 - mare) * 0.7;
        }
        shade = 0.84 + base * 0.34;
      }

      const t = Math.min(1, Math.max(0, h));
      const rgb = mixHex(colorB, colorA, t);
      img.data[i]   = Math.min(255, rgb[0] * shade);
      img.data[i+1] = Math.min(255, rgb[1] * shade);
      img.data[i+2] = Math.min(255, rgb[2] * shade);
      img.data[i+3] = 255;

      const bv = Math.round(255 * t);
      bimg.data[i] = bimg.data[i+1] = bimg.data[i+2] = bv;
      bimg.data[i+3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  bctx.putImageData(bimg, 0, 0);

  const map = new THREE.CanvasTexture(cc);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;

  const bump = new THREE.CanvasTexture(bc);
  bump.anisotropy = 4;

  return { map, bump };
}

/* ============================================================
   КОЛЬЦА САТУРНА
   Радиальная полосатая текстура: u = нормализованный радиус
   ============================================================ */
export function ringTexture(planet){
  const W = 2048, H = 4;
  const cc = canvas(W, H);
  const ctx = cc.getContext('2d');
  const g = ctx.createImageData(W, H);
  const nz = makeNoise(planet.name.length * 71 + 5);
  const isSaturn = planet.id === 'saturn';

  for (let x = 0; x < W; x++){
    const u = x / W;
    let a, bright;

    if (isSaturn){
      const n = fbm(nz, u * 12, 0.5, 5, 2.3, 0.5) * 0.5 + 0.5;
      a = 0.45 + n * 0.62;
      // мягкие края
      if (u < 0.05) a *= u / 0.05;
      if (u > 0.95) a *= (1 - u) / 0.05;
      // деление Кассини
      a *= 1 - Math.exp(-Math.pow((u - 0.615) / 0.020, 2)) * 0.94;
      // деление Энке
      a *= 1 - Math.exp(-Math.pow((u - 0.885) / 0.0065, 2)) * 0.78;
      // внутренняя слабая зона
      a *= 1 - Math.exp(-Math.pow((u - 0.20) / 0.055, 2)) * 0.5;
      // кольцо C темнее
      if (u > 0.05 && u < 0.30) a *= 0.62;
      // кольцо B ярче всего
      if (u > 0.32 && u < 0.60) a *= 1.18;
      bright = 0.70 + (fbm(nz, u * 30, 3.3, 3) * 0.5 + 0.5) * 0.45;
    } else {
      const n = fbm(nz, u * 16, 0.5, 4, 2.1, 0.5) * 0.5 + 0.5;
      a = (0.06 + n * 0.24) * (u > 0.88 ? (1 - u) / 0.12 : 1);
      bright = 0.72;
    }

    a = Math.min(1, Math.max(0, a)) * (planet.ringStyle?.opacity ?? 1);

    for (let y = 0; y < H; y++){
      const i = (y * W + x) * 4;
      g.data[i]   = Math.min(255, 242 * bright);
      g.data[i+1] = Math.min(255, 229 * bright);
      g.data[i+2] = Math.min(255, 200 * bright);
      g.data[i+3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(g, 0, 0);

  const t = new THREE.CanvasTexture(cc);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/* ============================================================
   ЗВЁЗДНОЕ НЕБО с Млечным Путём
   ============================================================ */
export function starField(){
  const W = 2048, H = 1024;
  const cc = canvas(W, H);
  const ctx = cc.getContext('2d');
  ctx.fillStyle = '#02030a';
  ctx.fillRect(0, 0, W, H);

  const nz = makeNoise(7);
  const g = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++){
    const v = y / H;
    for (let x = 0; x < W; x++){
      const u = x / W;
      const band = Math.exp(-Math.pow((v - 0.5 - Math.sin(u * Math.PI * 2) * 0.06) / 0.10, 2));
      const cl = fbm(nz, u * 6, v * 6, 6, 2.2, 0.55) * 0.5 + 0.5;
      const dust = Math.pow(cl, 1.6);
      const core = Math.exp(-Math.pow((v - 0.5) / 0.028, 2)) * 0.55;
      const i = (y * W + x) * 4;
      const val = (band * dust + core) * 74;
      g.data[i]   = val * 0.66;
      g.data[i+1] = val * 0.70;
      g.data[i+2] = val * 0.92;
      g.data[i+3] = 255;
    }
  }
  ctx.putImageData(g, 0, 0);

  let s = 12345;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  for (let i = 0; i < 6000; i++){
    const x = rnd() * W, y = rnd() * H;
    const r = Math.pow(rnd(), 3.4) * 1.7 + 0.25;
    const a = 0.22 + rnd() * 0.78;
    const t = rnd();
    const col = t > 0.92 ? '185,212,255' : t > 0.74 ? '255,238,208'
              : t > 0.52 ? '255,208,172' : '255,255,255';
    ctx.beginPath();
    ctx.fillStyle = `rgba(${col},${a})`;
    ctx.arc(x, y, r, 0, 6.2832);
    ctx.fill();
  }
  for (let i = 0; i < 90; i++){
    const x = rnd() * W, y = rnd() * H, r = 1.6 + rnd() * 2.4;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 8);
    grd.addColorStop(0,    'rgba(255,255,255,.95)');
    grd.addColorStop(0.20, 'rgba(205,228,255,.45)');
    grd.addColorStop(1,    'rgba(140,180,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, r * 8, 0, 6.2832); ctx.fill();
  }

  const t = new THREE.CanvasTexture(cc);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ============================================================
   СПРАЙТ СВЕЧЕНИЯ
   ============================================================ */
export function glowSprite(inner = 'rgba(255,200,120,1)', mid = 'rgba(255,130,40,.42)'){
  const S = 256;
  const cc = canvas(S, S);
  const ctx = cc.getContext('2d');
  const grd = ctx.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2);
  grd.addColorStop(0,    inner);
  grd.addColorStop(0.22, mid);
  grd.addColorStop(0.52, 'rgba(255,90,20,.13)');
  grd.addColorStop(1,    'rgba(255,60,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cc);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* мягкий круглый спрайт для частиц поясов */
export function dotSprite(){
  const S = 64;
  const cc = canvas(S, S);
  const ctx = cc.getContext('2d');
  const grd = ctx.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2);
  grd.addColorStop(0,   'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(230,225,215,.55)');
  grd.addColorStop(1,   'rgba(200,190,175,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cc);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export { makeNoise, fbm, canvas };
