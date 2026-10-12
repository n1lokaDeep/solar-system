/* ============================================================
   КАРТОЧКА ОБЪЕКТА
   Работает и для планет, и для Солнца, и для спутников.
   Мини-шар рисуется на отдельном WebGL-контексте.
   ============================================================ */
import * as THREE from 'three';
import { PLANETS, SUN, SIZE_LADDER, fmt, periodLabel, dayLabel } from './data.js';
import { MOONS } from './bodies.js';
import { moonSurface, ringTexture } from './textures.js';

export class PlanetCard {
  constructor(els, texLib){
    this.el = els.card;
    this.els = els;
    this.tex = texLib;
    this.visible = false;
    this.currentId = null;

    this._initHero();
    this._buildChips();
    this._bind();
  }

  /* ============================================================
     поиск объекта по id
     ============================================================ */
  _findBody(id){
    if (id === 'sun') return { kind:'sun', data: SUN };
    const p = PLANETS.find(x => x.id === id);
    if (p) return { kind:'planet', data: p };

    for (const [planetId, list] of Object.entries(MOONS)){
      const m = list.find(x => x.id === id);
      if (m) return {
        kind:'moon', data: m,
        parent: PLANETS.find(x => x.id === planetId),
      };
    }
    return null;
  }

  /* ============================================================
     мини-рендер шара
     ============================================================ */
  _initHero(){
    const canvas = this.els.heroBall;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(320, 320, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    cam.position.set(0, 0, 5.2);

    scene.add(new THREE.AmbientLight(0x5566aa, 1.9));
    const key = new THREE.DirectionalLight(0xfff4e2, 3.6); key.position.set(2.2, 1.4, 2.8); scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fb4ff, 1.6); rim.position.set(-2.6, -0.8, -1.4); scene.add(rim);

    const holder = new THREE.Group();
    scene.add(holder);

    this.hero = { renderer, scene, cam, holder, mesh:null, ring:null, cache:new Map(), t:0 };
  }

  /* создаём (или берём из кэша) шар нужного объекта */
  _heroMake(id){
    if (this.hero.cache.has(id)) return this.hero.cache.get(id);

    const body = this._findBody(id);
    if (!body) return null;

    let mat, rings = null, atmo = null, atmoColor = '#8899bb';

    if (body.kind === 'sun'){
      /* --- Солнце: живой шейдер фотосферы --- */
      const sunTex = this.tex?.get('sun');
      mat = new THREE.ShaderMaterial({
        uniforms:{ uMap:{ value: sunTex }, uTime:{ value:0 }, uHasMap:{ value: sunTex ? 1 : 0 } },
        vertexShader:`
          varying vec2 vUv; varying vec3 vN; varying vec3 vP;
          void main(){
            vUv = uv; vP = normalize(position);
            vN = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          }`,
        fragmentShader:`
          uniform sampler2D uMap; uniform float uTime; uniform float uHasMap;
          varying vec2 vUv; varying vec3 vN; varying vec3 vP;
          float h(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
          float n(vec3 p){ vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
            return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                       mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
          float fbm(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*n(p); p*=2.05; a*=0.5; } return s; }
          void main(){
            float t = uTime * 0.03;
            vec2 uv1 = vUv + vec2(t*0.012, sin(vUv.y*9.0 + t*4.0)*0.0035);
            vec2 uv2 = vUv*1.9 + vec2(-t*0.02, t*0.01);
            vec3 c1 = uHasMap>0.5 ? texture2D(uMap,uv1).rgb : vec3(1.0,0.62,0.16);
            vec3 c2 = uHasMap>0.5 ? texture2D(uMap,uv2).rgb : vec3(1.0,0.8,0.4);
            vec3 c = mix(c1,c2,0.34);
            float g = dot(c, vec3(0.33));
            c = mix(c, c*vec3(1.22,0.92,0.62), smoothstep(0.35,0.62,g));
            c = mix(c, c*1.30, smoothstep(0.68,0.95,g));
            float f = 1.0 - abs(vN.z);
            c = mix(c, c*vec3(1.30,0.58,0.16), pow(f,1.9)*0.9);
            c += vec3(1.0,0.48,0.12)*pow(f,3.6)*1.15;
            gl_FragColor = vec4(c*1.30, 1.0);
          }`,
      });
    } else if (body.kind === 'moon'){
      /* --- Спутник: реальная текстура Луны или процедурная --- */
      const m = body.data;
      const real = m.tex ? this.tex?.get(m.tex) : null;
      if (real){
        mat = new THREE.MeshStandardMaterial({
          map: real, bumpMap: real, bumpScale: 0.06,
          roughness: m.roughness ?? 0.9, metalness: 0,
        });
      } else {
        const surf = moonSurface(m.proc || { type:'cratered' }, 512, 256);
        mat = new THREE.MeshStandardMaterial({
          map: surf.map, bumpMap: surf.bump, bumpScale: 0.09,
          roughness: m.roughness ?? 0.9, metalness: 0,
        });
      }
      atmoColor = '#aab4c4';
    } else {
      /* --- Планета: реальная карта NASA --- */
      const p = body.data;
      const real = this.tex?.get(p.id);
      if (real){
        mat = new THREE.MeshStandardMaterial({
          map: real, roughness: p.roughness, metalness: 0.02,
        });
        if (!p.bands){ mat.bumpMap = real; mat.bumpScale = 0.10; }
      } else {
        const surf = moonSurface({
          type: p.bands ? 'hazy' : 'cratered',
          colorA: p.color, colorB: p.color2, seed: 7, bands: true,
        }, 512, 256);
        mat = new THREE.MeshStandardMaterial({
          map: surf.map, bumpMap: surf.bump, bumpScale: 0.2, roughness: p.roughness,
        });
      }
      atmoColor = p.atmo;

      // кольца у газовых гигантов
      if (p.rings){
        const rs = p.ringStyle || { inner:1.3, outer:2.1, opacity:.5 };
        const rg = new THREE.RingGeometry(rs.inner, rs.outer, 128, 2);
        const uv = rg.attributes.uv, pos = rg.attributes.position, v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++){
          v.fromBufferAttribute(pos, i);
          uv.setXY(i, (v.length() - rs.inner) / (rs.outer - rs.inner), 0.5);
        }
        rings = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({
          map: ringTexture(p), transparent:true, side:THREE.DoubleSide,
          opacity:0.95, depthWrite:false,
        }));
        rings.rotation.x = Math.PI / 2;
        rings.rotation.z = 0.22;
      }
    }

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat);

    // атмосферный ореол (не для спутников — там его нет)
    if (body.kind !== 'moon'){
      atmo = new THREE.Mesh(
        new THREE.SphereGeometry(1.13, 48, 36),
        new THREE.ShaderMaterial({
          uniforms:{
            uC:{ value: new THREE.Color(atmoColor) },
            uS:{ value: body.kind === 'sun' ? 0.55 : (id === 'earth' ? 1.1 : 0.62) },
          },
          vertexShader:`varying vec3 vN; varying vec3 vV;
            void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
          fragmentShader:`uniform vec3 uC; uniform float uS; varying vec3 vN; varying vec3 vV;
            void main(){ float f=1.0-abs(dot(normalize(vN),normalize(vV))); gl_FragColor=vec4(uC, pow(f,2.6)*uS); }`,
          transparent:true, blending:THREE.AdditiveBlending, side:THREE.BackSide, depthWrite:false,
        })
      );
    }

    const res = { mesh, ring:rings, halo:atmo };
    this.hero.cache.set(id, res);
    return res;
  }

  _heroShow(id){
    const h = this.hero;
    h.holder.clear();
    const r = this._heroMake(id);
    if (!r) return;
    h.holder.add(r.mesh);
    if (r.halo) h.holder.add(r.halo);
    if (r.ring) h.holder.add(r.ring);
    h.mesh = r.mesh;
    h.ring = r.ring;
    // наклон: Уран «лежит на боку»
    h.holder.rotation.z = id === 'uranus' ? 1.45 : (id === 'saturn' ? 0.34 : 0.14);
    h.holder.rotation.x = 0.12;
    r.mesh.rotation.y = 0.5;
  }

  tickHero(dt){
    const h = this.hero;
    if (!h.mesh || !this.visible) return;
    h.mesh.rotation.y += dt * 0.26;
    if (h.ring) h.ring.rotation.z += dt * 0.05;
    if (h.mesh.material.uniforms?.uTime) h.mesh.material.uniforms.uTime.value += dt * 0.5;
    h.renderer.render(h.scene, h.cam);
  }

  resizeHero(){
    const c = this.els.heroBall;
    const rect = c.getBoundingClientRect();
    if (rect.width < 2) return;
    this.hero.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.hero.renderer.setSize(rect.width, rect.height, false);
    this.hero.cam.aspect = rect.width / rect.height;
    this.hero.cam.updateProjectionMatrix();
  }

  /* ============================================================
     чипсы планет
     ============================================================ */
  _buildChips(){
    const bar = this.els.chipbar;
    bar.innerHTML = '';
    this.chips = new Map();

    const items = [{ id:'sun', name:'Солнце', color:'#ffb545' }]
      .concat(PLANETS.map(p => ({ id:p.id, name:p.name, color:p.color })));

    items.forEach(it => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.style.setProperty('--chip', it.color);
      b.innerHTML = `<span class="dot"></span>${it.name}`;
      b.addEventListener('click', () => this.onSelect?.(it.id));
      bar.appendChild(b);
      this.chips.set(it.id, b);
    });
  }

  _bind(){
    this.els.cardClose.addEventListener('click', () => this.onClose?.());
    this.els.btnFlyTo.addEventListener('click', () => this.onFlyTo?.(this.currentId));
  }

  setActiveChip(id){
    this.chips?.forEach((el, key) => el.classList.toggle('active', key === id));
  }

  /* ============================================================
     ПОКАЗ
     ============================================================ */
  show(id){
    const body = this._findBody(id);
    if (!body) return;
    this.currentId = id;

    this.el.classList.remove('hidden');
    this.el.setAttribute('aria-hidden', 'false');
    this.visible = true;

    const p = body.data;

    /* шапка */
    if (body.kind === 'sun'){
      this.els.cardKicker.textContent = 'ЗВЕЗДА · ЦЕНТР СИСТЕМЫ';
      this.els.cardTagline.textContent = p.tagline;
    } else if (body.kind === 'moon'){
      this.els.cardKicker.textContent = 'СПУТНИК · ' + body.parent.name.toUpperCase();
      this.els.cardTagline.textContent = `Обращается вокруг ${body.parent.name}`;
    } else {
      const idx = PLANETS.findIndex(x => x.id === id);
      const names = ['первая','вторая','третья','четвёртая','пятая','шестая','седьмая','восьмая'];
      this.els.cardKicker.textContent = 'ПЛАНЕТА · ' + names[idx] + ' ОТ СОЛНЦА';
      this.els.cardTagline.textContent = p.tagline;
    }
    this.els.cardName.textContent = p.name || '—';
    this.els.heroGlow.style.setProperty('--hero', p.color || '#8fa8c4');
    this.els.btnCompare.hidden = true;

    this._heroShow(id);
    requestAnimationFrame(() => this.resizeHero());

    this._renderStats(body);
    this._renderSizes(body);
    this._renderPeriods(body);
    this._renderFacts(body);
  }

  /* ---------- характеристики ---------- */
  _renderStats(body){
    const box = this.els.cardStats;
    box.innerHTML = '';
    const p = body.data;
    let rows;

    if (body.kind === 'sun'){
      rows = [
        ['Диаметр', fmt(p.radiusKm * 2 / 1000) + ' <small>тыс. км</small>'],
        ['Масса', '1,989×10<sup>30</sup> <small>кг</small>'],
        ['Ядро', '15,7 <small>млн °C</small>'],
        ['Поверхность', '5500 <small>°C</small>'],
        ['Возраст', '4,6 <small>млрд лет</small>'],
        ['Класс', 'G2V'],
      ];
    } else if (body.kind === 'moon'){
      const d = p.distKm;
      rows = [
        ['Радиус', fmt(p.radiusKm, 1) + ' <small>км</small>'],
        ['Диаметр', fmt(p.radiusKm * 2, p.radiusKm < 100 ? 1 : 0) + ' <small>км</small>'],
        ['От планеты', fmt(d, 0) + ' <small>км</small>'],
        ['Период обращения', periodLabel(p.periodDays)],
        ['Планета', body.parent.name],
        ['Тип', p.proc?.type === 'icy' ? 'ледяной'
              : p.proc?.type === 'volcanic' ? 'вулканический'
              : p.proc?.type === 'hazy' ? 'с атмосферой'
              : p.tex ? 'каменный' : 'каменный'],
      ];
    } else {
      rows = [
        ['Радиус', fmt(p.radiusKm, 1) + ' <small>км</small>'],
        ['Диаметр', fmt(p.radiusKm * 2, 0) + ' <small>км</small>'],
        ['Расстояние от Солнца', fmt(p.auMkm, 1) + ' <small>млн км</small>'],
        ['Орбитальный период', periodLabel(p.periodDays)],
        ['Сутки', dayLabel(p.dayHours)],
        ['Наклон оси', fmt(p.axialTilt, 2) + '°'],
        ['Масса', (p.massEarth < 1 ? fmt(p.massEarth, 3) : fmt(p.massEarth, p.massEarth < 20 ? 2 : 1)) + ' <small>от Земли</small>'],
        ['Спутники', p.moons === 0 ? 'нет' : String(p.moons)],
      ];
    }

    rows.forEach(([k, v], i) => {
      const d = document.createElement('div');
      d.className = 'stat';
      d.style.animationDelay = (i * 0.04) + 's';
      d.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div>`;
      box.appendChild(d);
    });
  }

  /* ---------- сравнение размеров ---------- */
  _renderSizes(body){
    const box = this.els.sizeCompare;
    box.innerHTML = '';
    const id = body.data.id;

    let ladder = [{ id:'sun', name:'Солнце', r:SUN.radiusKm, color:'#ffb545' }].concat(SIZE_LADDER);
    if (body.kind === 'sun') ladder = ladder.slice(0, 6);
    // для спутников добавляем саму цель
    if (body.kind === 'moon'){
      ladder = ladder.concat([{ id, name: body.data.name, r: body.data.radiusKm, color:'#c9c4bc', isTarget:true, me:true }]);
    }

    const vals = ladder.map(x => Math.sqrt(x.r));
    const max = Math.max(...vals);

    ladder.forEach((x, i) => {
      const col = document.createElement('div');
      col.className = 'bar-col' + (x.id === id || x.isTarget ? ' me' : '');
      col.innerHTML = `<div class="bar" style="--c:${x.color}"></div><div class="lab">${x.name}</div>`;
      box.appendChild(col);
      const hPct = Math.max(3, (vals[i] / max) * 100);
      requestAnimationFrame(() => {
        setTimeout(() => { col.querySelector('.bar').style.height = hPct + '%'; }, 40 + i * 50);
      });
    });
  }

  /* ---------- периоды ---------- */
  _renderPeriods(body){
    const box = this.els.periodViz;
    box.innerHTML = '';

    if (body.kind === 'sun'){
      box.innerHTML = `
        <div class="pv-row"><div class="pv-k">Оборот галактики</div>
          <div class="pv-track"><div class="pv-fill" style="--c:#ffb545"></div></div>
          <div class="pv-v">225–250 млн лет</div></div>
        <div class="pv-row"><div class="pv-k">Вращение</div>
          <div class="pv-track"><div class="pv-fill" style="--c:#ffb545"></div></div>
          <div class="pv-v">25,4 земных сут</div></div>`;
      requestAnimationFrame(() => box.querySelectorAll('.pv-fill').forEach(f => f.style.width = '62%'));
      return;
    }

    let rows, longest;
    if (body.kind === 'moon'){
      longest = 30;
      rows = [
        ['Фобос', 0.319, '#8b8177'],
        ['Луна', 27.32, '#c9c4bc'],
        [body.data.name, body.data.periodDays, '#a9c4e0'],
        ['Титан', 15.945, '#e8b45c'],
      ];
    } else {
      longest = 60182;
      rows = [
        ['Меркурий', 87.97, '#a9a29b'],
        ['Земля', 365.256, '#2f6fd0'],
        [body.data.name, body.data.periodDays, body.data.color],
        ['Нептун', 60182, '#4166d8'],
      ];
    }

    const seen = new Set();
    const uniq = rows.filter(r => { if (seen.has(r[0])) return false; seen.add(r[0]); return true; });

    uniq.forEach(([name, days, color]) => {
      const row = document.createElement('div');
      row.className = 'pv-row';
      const pct = Math.max(3, (days / longest) * 100);
      row.innerHTML = `
        <div class="pv-k">${name}</div>
        <div class="pv-track"><div class="pv-fill" style="--c:${color}"></div></div>
        <div class="pv-v">${periodLabel(days)}</div>`;
      box.appendChild(row);
      requestAnimationFrame(() => {
        setTimeout(() => { row.querySelector('.pv-fill').style.width = pct + '%'; }, 60);
      });
    });
  }

  /* ---------- факты ---------- */
  _renderFacts(body){
    const ul = this.els.cardFacts;
    ul.innerHTML = '';
    (body.data.facts || []).forEach((f, i) => {
      const li = document.createElement('li');
      li.textContent = f;
      li.style.animationDelay = (i * 0.06) + 's';
      ul.appendChild(li);
    });
  }

  hide(){
    this.visible = false;
    this.currentId = null;
    this.el.classList.add('hidden');
    this.el.setAttribute('aria-hidden', 'true');
    this.setActiveChip(null);
  }
}
