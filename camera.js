/* ============================================================
   КАМЕРА
   Сферический обзор вокруг цели + кинематографичный перелёт
   по кривой Безье с пружинным сглаживанием.
   ============================================================ */
import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// экспоненциальное сглаживание, независимое от FPS
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// временные векторы, чтобы не мусорить в куче каждый кадр
const _wp = new THREE.Vector3();
const _aimFwd = new THREE.Vector3();
const _aimRight = new THREE.Vector3();
const _aimPoint = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class CameraRig {
  constructor(camera, dom){
    this.camera = camera;
    this.dom = dom;

    // цель и сферические координаты вокруг неё
    this.target = new THREE.Vector3(0, 0, 0);
    this.theta = Math.PI * 0.28;
    this.phi = Math.PI * 0.34;
    this.radius = 620;

    this._thetaGoal = this.theta;
    this._phiGoal = this.phi;
    this._radiusGoal = this.radius;

    this.flight = null;         // активный перелёт
    this.follow = null;         // планета, за которой следим
    this.autoRotate = true;
    this.idleTime = 0;
    this._dragging = false;
    this._moved = 0;
    // доля смещения точки взгляда: объект встаёт левее центра,
    // чтобы его не перекрывала карточка справа
    this.aimShift = 0.30;

    this._bindInput();
  }

  /* ============================================================
     ВЗГЛЯД
     Смотрим чуть правее объекта — тогда сам объект оказывается
     левее центра кадра и остаётся открытым.
     ============================================================ */
  _aim(){
    if (!this.follow || !this.aimShift){
      this.camera.lookAt(this.target);
      return;
    }
    const fwd = _aimFwd.copy(this.target).sub(this.camera.position);
    if (fwd.lengthSq() < 1e-8){ this.camera.lookAt(this.target); return; }
    fwd.normalize();
    const right = _aimRight.crossVectors(fwd, UP);
    if (right.lengthSq() < 1e-8){ this.camera.lookAt(this.target); return; }
    right.normalize();
    const off = this.camera.position.distanceTo(this.target) * this.aimShift;
    this.camera.lookAt(_aimPoint.copy(this.target).addScaledVector(right, off));
  }

  /* ============================================================
     ВВОД
     ============================================================ */
  _bindInput(){
    const dom = this.dom;
    let lastX = 0, lastY = 0;
    let pinchDist = 0;

    const down = (x, y) => {
      this._dragging = true; lastX = x; lastY = y; this._moved = 0;
      this.autoRotate = false; this.idleTime = 0;
    };
    const move = (x, y) => {
      if (!this._dragging) return;
      const dx = x - lastX, dy = y - lastY;
      lastX = x; lastY = y;
      this._moved += Math.abs(dx) + Math.abs(dy);
      this._thetaGoal -= dx * 0.0045;
      this._phiGoal = clamp(this._phiGoal - dy * 0.0045, 0.07, Math.PI - 0.07);
      this.flight = null;                 // ручное вращение отменяет перелёт
    };
    const up = () => { this._dragging = false; };

    dom.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      down(e.clientX, e.clientY);
      dom.setPointerCapture?.(e.pointerId);
    });
    dom.addEventListener('pointermove', e => { if (this._dragging) move(e.clientX, e.clientY); });
    dom.addEventListener('pointerup', e => { up(); dom.releasePointerCapture?.(e.pointerId); });
    dom.addEventListener('pointercancel', up);

    dom.addEventListener('wheel', e => {
      e.preventDefault();
      this._radiusGoal = clamp(this._radiusGoal * Math.exp(e.deltaY * 0.0011), 1.2, 20000);
      this.flight = null;
      this.autoRotate = false; this.idleTime = 0;
    }, { passive: false });

    dom.addEventListener('touchmove', e => {
      if (e.touches.length === 2){
        e.preventDefault();
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (pinchDist) this._radiusGoal = clamp(this._radiusGoal * (pinchDist / d), 1.2, 20000);
        pinchDist = d;
      }
    }, { passive: false });
    dom.addEventListener('touchend', () => { pinchDist = 0; });
  }

  wasDragged(){ return this._moved > 6; }

  /* ============================================================
     ПЕРЕЛЁТ К ОБЪЕКТУ
     Камера едет по кривой Безье; цель берётся «живой»,
     поэтому по прилёте планета уже в кадре.
     ============================================================ */
  flyTo(view, dur = 1.5){
    if (!view) return;
    const dist = view.dist;
    const dir = view.dir.clone().normalize();

    // точка старта: текущая позиция камеры
    const from = this.camera.position.clone();
    const fromTarget = this.target.clone();

    // точка финиша: смещение от цели (мировые координаты — годится
    // и для планет, и для спутников, вращающихся внутри своей группы)
    const toTarget = view.follow
      ? view.follow.group.getWorldPosition(new THREE.Vector3())
      : view.target.clone();
    const to = toTarget.clone().add(dir.clone().multiplyScalar(dist));

    // контрольная точка: поднятая середина для красивой дуги
    const mid = from.clone().lerp(to, 0.5);
    mid.y += Math.max(dist * 0.5, Math.abs(from.y - to.y) * 0.25) + 6;

    this.flight = { t: 0, dur, from, mid, dir, dist, fromTarget, tgtFollow: view.follow || null };
    this.follow = view.follow || null;
    this._radiusGoal = dist;
    this.autoRotate = false;
    this.idleTime = 0;
  }

  /* ============================================================
     ОБЗОР ВСЕЙ СИСТЕМЫ
     ============================================================ */
  resetView(){
    const from = this.camera.position.clone();
    const fromTarget = this.target.clone();
    const toTarget = new THREE.Vector3(0, 0, 0);
    // Наклонный обзор: орбиты ложатся эллипсами, а на фоне виден
    // Млечный Путь (он идёт по «экватору» неба, не через полюс).
    const to = new THREE.Vector3(0, 1900, 2500);

    const mid = from.clone().lerp(to, 0.5);
    mid.y += 400;

    this.flight = { t:0, dur:1.8, from, mid, dir:null, dist:null, fromTarget, tgtFollow:null };
    this.follow = null;
    this._radiusGoal = 3450;
    this._phiGoal = Math.PI * 0.345;
    this.autoRotate = false;
    this.idleTime = 0;
  }

  /* ============================================================
     ОБНОВЛЕНИЕ
     ============================================================ */
  update(dt){
    this.idleTime += dt;

    /* ---------- режим перелёта ---------- */
    if (this.flight){
      const f = this.flight;
      f.t += dt / f.dur;
      const t = clamp(f.t, 0, 1);
      // мягкий вход/выход только по краям; в середине — равномерно,
      // иначе путь субъективно «зависает» в конце
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      // цель может двигаться (планета летит по орбите) — берём её сейчас
      const toTarget = f.tgtFollow
        ? f.tgtFollow.group.getWorldPosition(_wp.clone())
        : new THREE.Vector3(0, 0, 0);
      const to = f.dir
        ? toTarget.clone().add(f.dir.clone().multiplyScalar(f.dist))
        : new THREE.Vector3(0, 1900, 2500);

      // квадратичная кривая Безье
      const a = f.from.clone().lerp(f.mid, e);
      const b = f.mid.clone().lerp(to, e);
      this.camera.position.copy(a.lerp(b, e));

      // цель интерполируется от старой к новой
      this.target.copy(f.fromTarget.clone().lerp(toTarget, e));

      this._aim();

      if (t >= 1){
        this.flight = null;
        // переходим в сферический режим вокруг цели
        const off = this.camera.position.clone().sub(this.target);
        this.radius = Math.max(off.length(), 0.5);
        this._radiusGoal = this.radius;
        this.phi = Math.acos(clamp(off.y / this.radius, -1, 1));
        this.theta = Math.atan2(off.x, off.z);
        this._phiGoal = this.phi;
        this._thetaGoal = this.theta;
      }
      return;
    }

    /* ---------- слежение за планетой или спутником ---------- */
    if (this.follow){
      this.target.copy(this.follow.group.getWorldPosition(_wp));
      // не влезаем внутрь объекта
      const minR = this.follow.visualR * 1.35 + 0.25;
      if (this._radiusGoal < minR) this._radiusGoal = minR;
    } else {
      this.target.lerp(new THREE.Vector3(0, 0, 0), 1 - Math.exp(-3 * dt));
    }

    /* ---------- авто-вращение при бездействии ---------- */
    if (this.idleTime > 10) this.autoRotate = true;
    if (this.autoRotate && !this.follow) this._thetaGoal += dt * 0.022;

    /* ---------- пружинное сглаживание ---------- */
    this.theta  = damp(this.theta,  this._thetaGoal,  7,   dt);
    this.phi    = damp(this.phi,    this._phiGoal,    7,   dt);
    this.radius = damp(this.radius, this._radiusGoal, 4.5, dt);

    const sp = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + this.radius * sp * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * sp * Math.cos(this.theta)
    );
    this._aim();
  }
}
