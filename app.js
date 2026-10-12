/* ============================================================
   ТОЧКА ВХОДА
   Загрузка реальных текстур → сцена → интерфейс.
   ============================================================ */
import * as THREE from 'three';
import { TextureLibrary } from './textures.js';
import { SolarSystem } from './scene.js';
import { CameraRig } from './camera.js';
import { PlanetCard } from './card.js';

const $ = id => document.getElementById(id);

const els = {
  loader:      $('loader'),
  loaderFill:  $('loaderFill'),
  loaderStatus:$('loaderStatus'),
  canvas:      $('scene'),
  chipbar:     $('chipbar'),
  card:        $('card'),
  cardClose:   $('cardClose'),
  heroBall:    $('heroBall'),
  heroGlow:    $('heroGlow'),
  cardKicker:  $('cardKicker'),
  cardName:    $('cardName'),
  cardTagline: $('cardTagline'),
  cardStats:   $('cardStats'),
  sizeCompare: $('sizeCompare'),
  periodViz:   $('periodViz'),
  cardFacts:   $('cardFacts'),
  btnFlyTo:    $('btnFlyTo'),
  btnCompare:  $('btnCompare'),
  elapsed:     $('elapsed'),
  speed:       $('speed'),
  speedReadout:$('speedReadout'),
  btnPlay:     $('btnPlay'),
  btnBack:     $('btnBack'),
  btnFwd:      $('btnFwd'),
  tgTrails:    $('tgTrails'),
  tgReal:      $('tgReal'),
  tgBelts:     $('tgBelts'),
  btnLabels:   $('btnLabels'),
  btnOrbits:   $('btnOrbits'),
  btnBelts:    $('btnBelts'),
  btnReset:    $('btnReset'),
  btnFull:     $('btnFull'),
  reticle:     $('reticle'),
  reticleLabel:$('reticleLabel'),
  hoverTip:    $('hoverTip'),
};

/* ---------------- прогресс ---------------- */
let progress = 0;
function setProgress(p, text){
  progress = Math.max(progress, p);
  els.loaderFill.style.width = Math.round(progress * 100) + '%';
  if (text) els.loaderStatus.textContent = text;
}

setProgress(0.03, 'загрузка текстур NASA…');

/* ---------------- текстуры ---------------- */
const texLib = new TextureLibrary();
await texLib.load((p, key) => {
  setProgress(0.03 + p * 0.52, `текстуры · ${key}`);
});
if (texLib.failed.length) console.warn('не загрузились:', texLib.failed);

setProgress(0.58, 'создание сцены…');
await new Promise(r => requestAnimationFrame(r));

/* ---------------- сцена ---------------- */
const system = new SolarSystem(els.canvas, {
  textures: texLib,
  onProgress: (p, t) => setProgress(p, t),
});

setProgress(0.97, 'интерфейс…');
const rig = new CameraRig(system.camera, els.canvas);
const card = new PlanetCard(els);
setProgress(1, 'готово');

/* ---------------- состояние ---------------- */
const state = {
  playing: true,
  speed: 7,
  selected: null,
  labels: false,
  orbits: true,
  belts: true,
};

/* ============================================================
   ВЫБОР ОБЪЕКТА
   id — планета, 'sun' или идентификатор спутника
   ============================================================ */
function select(id, { fly = true } = {}){
  if (!id) return;
  state.selected = id;
  system.selected = id;
  card.show(id);
  card.setActiveChip(system.getMoon(id) ? system.getMoon(id).planetId : id);

  if (fly){
    const view = system.viewFor(id);
    if (view) rig.flyTo(view, view.small ? 1.15 : (id === 'sun' ? 1.4 : 1.6));
  }
}

function deselect(){
  state.selected = null;
  system.selected = null;
  card.hide();
}

card.onSelect = id => select(id);
card.onClose  = () => deselect();
card.onFlyTo  = id => {
  if (!id) return;
  const view = system.viewFor(id);
  if (view) rig.flyTo(view, 1.3);
};

/* ============================================================
   НАВЕДЕНИЕ И КЛИК
   ============================================================ */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let pointerX = 0, pointerY = 0;

/* pick() возвращает строку или {moon, planet} */
const hitId = h => !h ? null : (typeof h === 'string' ? h : h.moon);

els.canvas.addEventListener('pointermove', e => {
  pointerX = e.clientX; pointerY = e.clientY;
  els.hoverTip.style.left = e.clientX + 'px';
  els.hoverTip.style.top  = e.clientY + 'px';
});

function updateHover(){
  if (rig._dragging){ hideHover(); return; }

  ndc.x = (pointerX / innerWidth) * 2 - 1;
  ndc.y = -(pointerY / innerHeight) * 2 + 1;
  const id = hitId(system.pick(ndc, raycaster));

  if (id){
    system.hovered = id;
    const obj = system.getMoon(id);
    const name = obj ? obj.data.name : system.getPlanet(id)?.data.name;
    if (name){
      els.reticle.classList.add('on');
      els.reticle.style.left = pointerX + 'px';
      els.reticle.style.top  = pointerY + 'px';
      els.reticleLabel.textContent = name.toUpperCase();
      document.body.classList.add('pointing');
    }
  } else {
    system.hovered = null;
    hideHover();
  }
}

function hideHover(){
  els.reticle.classList.remove('on');
  els.hoverTip.classList.remove('on');
  document.body.classList.remove('pointing');
}

els.canvas.addEventListener('pointerdown', e => { pointerX = e.clientX; pointerY = e.clientY; });

els.canvas.addEventListener('click', e => {
  if (rig.wasDragged()) return;
  pointerX = e.clientX; pointerY = e.clientY;
  ndc.x = (pointerX / innerWidth) * 2 - 1;
  ndc.y = -(pointerY / innerHeight) * 2 + 1;
  const id = hitId(system.pick(ndc, raycaster));
  if (id) select(id); else deselect();
});

els.canvas.addEventListener('pointerleave', hideHover);

/* ============================================================
   ВРЕМЯ И СКОРОСТЬ
   ============================================================ */
function speedFromSlider(t){
  const min = Math.log(0.04), max = Math.log(365);
  return Math.exp(min + (t + 3) / 6 * (max - min));
}
function sliderFromSpeed(v){
  const min = Math.log(0.04), max = Math.log(365);
  return ((Math.log(v) - min) / (max - min)) * 6 - 3;
}
function formatSpeed(v){
  if (v < 1) return '×' + v.toFixed(2).replace('.', ',');
  if (v < 40) return '×' + Math.round(v);
  if (v < 300) return (v / 30.44).toFixed(1).replace('.', ',') + ' мес/с';
  return (v / 365.256).toFixed(1).replace('.', ',') + ' г/с';
}
function applySpeed(v){
  state.speed = v;
  system.speed = v;
  els.speedReadout.textContent = formatSpeed(v);
  els.speed.value = sliderFromSpeed(v);
}

els.speed.addEventListener('input', () => {
  applySpeed(speedFromSlider(+els.speed.value));
  document.querySelectorAll('.preset').forEach(b => b.classList.remove('active'));
});

document.querySelectorAll('.preset').forEach(btn => {
  btn.addEventListener('click', () => {
    applySpeed(speedFromSlider(Math.max(-3, Math.min(3, +btn.dataset.speed))));
    document.querySelectorAll('.preset').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

function setPlaying(on){
  state.playing = on;
  system.running = on;
  document.body.classList.toggle('paused', !on);
}

els.btnPlay.addEventListener('click', () => setPlaying(!state.playing));
els.btnBack.addEventListener('click', () => { system.time -= 30; });
els.btnFwd.addEventListener('click',  () => { system.time += 30; });

/* ============================================================
   ПЕРЕКЛЮЧАТЕЛИ
   ============================================================ */
function syncBelts(on){
  state.belts = on;
  els.tgBelts.checked = on;
  els.btnBelts.classList.toggle('off', !on);
  system.setBeltsVisible(on);
}

els.tgTrails.addEventListener('change', () => {
  state.orbits = els.tgTrails.checked;
  system.setOrbitsVisible(state.orbits);
  els.btnOrbits.classList.toggle('off', !state.orbits);
});
els.tgReal.addEventListener('change', () => system.setRealScale(els.tgReal.checked));
els.tgBelts.addEventListener('change', () => syncBelts(els.tgBelts.checked));

els.btnLabels.addEventListener('click', () => {
  state.labels = !state.labels;
  system.setLabelsVisible(state.labels);
  els.btnLabels.classList.toggle('off', !state.labels);
});
els.btnOrbits.addEventListener('click', () => {
  state.orbits = !state.orbits;
  els.tgTrails.checked = state.orbits;
  system.setOrbitsVisible(state.orbits);
  els.btnOrbits.classList.toggle('off', !state.orbits);
});
els.btnBelts.addEventListener('click', () => syncBelts(!state.belts));
els.btnReset.addEventListener('click', () => { deselect(); rig.resetView(); });
els.btnFull.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
});

/* ============================================================
   КЛАВИАТУРА
   ============================================================ */
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const ids = ['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune'];
  switch (e.code){
    case 'Space': e.preventDefault(); setPlaying(!state.playing); break;
    case 'Escape': deselect(); break;
    case 'KeyL': els.btnLabels.click(); break;
    case 'KeyO': els.btnOrbits.click(); break;
    case 'KeyB': els.btnBelts.click(); break;
    case 'KeyR': els.btnReset.click(); break;
    case 'KeyF': els.btnFull.click(); break;
    case 'ArrowLeft':  system.time -= 30; break;
    case 'ArrowRight': system.time += 30; break;
    default: {
      const m = e.code.match(/^Digit([1-8])$/);
      if (m) select(ids[+m[1] - 1]);
      else if (e.code === 'Digit0') select('sun');
      else if (e.code === 'KeyM') select('moon');
    }
  }
});

/* ============================================================
   ВРЕМЯ
   ============================================================ */
function elapsedLabel(days){
  const d = Math.abs(days), sign = days < 0 ? '−' : '';
  if (d < 1) return sign + (d * 24).toFixed(1).replace('.', ',') + ' ч';
  if (d < 60) return sign + d.toFixed(1).replace('.', ',') + ' суток';
  if (d < 730) return sign + (d / 30.44).toFixed(1).replace('.', ',') + ' мес';
  const y = d / 365.256;
  return sign + y.toFixed(y < 20 ? 2 : 1).replace('.', ',') + ' лет';
}

/* ============================================================
   ЦИКЛ
   ============================================================ */
let last = performance.now();
let heroAcc = 0;

function frame(now){
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  system.update(dt);
  rig.update(dt);
  updateHover();
  system.render();

  heroAcc += dt;
  if (heroAcc > 1 / 30){ card.tickHero(heroAcc); heroAcc = 0; }

  els.elapsed.textContent = elapsedLabel(system.time);
  requestAnimationFrame(frame);
}

/* ============================================================
   СТАРТ
   ============================================================ */
addEventListener('resize', () => {
  system.resize();
  card.resizeHero();
});
addEventListener('orientationchange', () => setTimeout(() => { system.resize(); card.resizeHero(); }, 250));

setPlaying(true);
applySpeed(7);
document.querySelector('.preset[data-speed="3"]')?.classList.add('active');

/* вступительный полёт: наклонный обзор, чтобы в кадр попали все орбиты
   и одновременно был виден Млечный Путь на фоне */
rig.theta = Math.PI * 1.18;
rig.phi = Math.PI * 0.40;
rig.radius = 5200;
rig._thetaGoal = Math.PI * 0.32;
rig._phiGoal = Math.PI * 0.345;
rig._radiusGoal = 3450;
rig.camera.position.set(-1400, 620, -900);

setTimeout(() => {
  els.loader.classList.add('done');
  requestAnimationFrame(frame);
}, 260);
