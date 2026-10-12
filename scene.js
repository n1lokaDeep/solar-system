/* ============================================================
   СЦЕНА
   Реальные текстуры NASA + шейдеры атмосфер, облаков,
   ночных огней, короны Солнца, теней на кольцах.
   Плюс спутники планет, пояс астероидов и пояс Койпера.
   ============================================================ */
import * as THREE from 'three';
import { PLANETS, SUN } from './data.js';
import { MOONS, BELTS, moonOrbitUnits } from './bodies.js';
import {
  TextureLibrary, moonSurface, ringTexture, starField, glowSprite, dotSprite,
} from './textures.js';

export const DIST_SCALE = 1;      // 1 юнит = 1 млн км

/* общий вершинный шейдер для слоёв планет */
const SPHERE_VS = `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vViewW;
  void main(){
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vViewW = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/* ============================================================
   ПЛАНЕТАРНАЯ СИСТЕМА
   ============================================================ */
export class SolarSystem {
  constructor(canvasEl, { onProgress = () => {}, textures = null } = {}){
    this.canvas = canvasEl;
    this.onProgress = onProgress;
    this.tex = textures;              // библиотека реальных текстур
    this.planets = [];
    this.pickables = [];
    this.orbitLines = [];
    this.moonMeshes = [];
    this.beltObjects = [];
    this.labelsOn = false;
    this.realScale = true;
    this.beltsOn = true;
    this.time = 0;
    this.running = true;
    this.speed = 7;
    this.selected = null;
    this.hovered = null;
    this.sunDir = new THREE.Vector3(1, 0, 0);

    this._initRenderer();
    this._initScene();
  }

  /* ---------------- рендерер ---------------- */
  _initRenderer(){
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true, alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  /* ---------------- сцена ---------------- */
  _initScene(){
    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.05, 90000);
    camera.position.set(0, 2900, 1750);
    this.camera = camera;

    // Фон — реальная панорама всего неба (Млечный Путь).
    // Если она не загрузилась, рисуем процедурное небо.
    const skyTex = this.tex?.get('stars');
    if (skyTex){
      skyTex.mapping = THREE.EquirectangularReflectionMapping;
      skyTex.colorSpace = THREE.SRGBColorSpace;
      skyTex.minFilter = THREE.LinearFilter;
      skyTex.generateMipmaps = false;
      scene.background = skyTex;
      // текстура уже выровнена по яркости, добавляем совсем немного
      scene.backgroundIntensity = 1.15;
    } else {
      scene.background = starField();
    }

    // заполняющий свет, чтобы тёмная сторона читалась
    this.ambient = new THREE.AmbientLight(0x33405c, 1.05);
    scene.add(this.ambient);

    this.sunLight = new THREE.PointLight(0xfff4e0, 4.6, 0, 0.0);
    scene.add(this.sunLight);

    this._buildSun();
    this._buildPlanets();
    this._buildMoons();
    this._buildOrbits();
    this._buildBelts();
    this._buildStarLayer();
  }

  /* ============================================================
     СЛОЙ РЕЗКИХ ЗВЁЗД
     Панорама даёт глубину и Млечный Путь, но при растягивании
     на сферу точки мылятся. Эти звёзды рисуются шейдером
     с постоянным размером в пикселях — всегда острые.
     ============================================================ */
  _buildStarLayer(){
    const COUNT = 5200;
    const R = 26000;

    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    const siz = new Float32Array(COUNT);

    // спектральные оттенки: голубые → белые → жёлтые → красные
    const tints = [
      [0.62, 0.72, 1.00], [0.78, 0.86, 1.00], [1.00, 1.00, 1.00],
      [1.00, 0.97, 0.90], [1.00, 0.90, 0.72], [1.00, 0.80, 0.60],
      [1.00, 0.69, 0.54],
    ];
    const weights = [0.07, 0.13, 0.30, 0.21, 0.15, 0.10, 0.04];

    for (let i = 0; i < COUNT; i++){
      // равномерно по сфере
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos[i*3]   = Math.cos(th) * s * R;
      pos[i*3+1] = u * R;
      pos[i*3+2] = Math.sin(th) * s * R;

      let r = Math.random(), acc = 0, ti = 0;
      for (let k = 0; k < weights.length; k++){
        acc += weights[k];
        if (r <= acc){ ti = k; break; }
      }
      const t = tints[ti];
      const b = 0.55 + Math.random() * 0.5;
      col[i*3] = t[0] * b; col[i*3+1] = t[1] * b; col[i*3+2] = t[2] * b;

      // много мелких, мало крупных
      siz[i] = 1.1 + Math.pow(Math.random(), 3.1) * 4.8;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms:{ uPixelRatio:{ value: Math.min(devicePixelRatio, 2) } },
      vertexShader:`
        attribute float aSize;
        attribute vec3 aColor;
        uniform float uPixelRatio;
        varying vec3 vColor;
        void main(){
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          // постоянный размер на экране — звёзды остаются точками
          gl_PointSize = aSize * uPixelRatio;
        }`,
      fragmentShader:`
        varying vec3 vColor;
        void main(){
          vec2 d = gl_PointCoord - vec2(0.5);
          float r = length(d) * 2.0;
          if (r > 1.0) discard;
          // острое ядро плюс лёгкий ореол
          float core = smoothstep(1.0, 0.22, r);
          float glow = pow(max(0.0, 1.0 - r), 2.6) * 0.30;
          float a = core + glow;
          gl_FragColor = vec4(vColor * a, a);
        }`,
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    const stars = new THREE.Points(geo, mat);
    stars.frustumCulled = false;
    stars.renderOrder = -1000;      // всегда позади всего
    this.scene.add(stars);
    this.starLayer = stars;
  }

  /* ============================================================
     СОЛНЦЕ
     ============================================================ */
  _buildSun(){
    const R = 22;
    this.sunRadius = R;

    // поверхность: реальная текстура + лёгкая анимация яркости
    const tex = this.tex?.get('sun');
    const mat = new THREE.ShaderMaterial({
      uniforms:{
        uMap:{ value: tex },
        uTime:{ value: 0 },
        uHasMap:{ value: tex ? 1 : 0 },
      },
      vertexShader:`
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vV;
        void main(){
          vUv = uv;
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader:`
        uniform sampler2D uMap;
        uniform float uTime;
        uniform float uHasMap;
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vV;

        float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
        float noise(vec3 p){
          vec3 i = floor(p), f = fract(p);
          f = f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),
                         mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                         mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
        }
        float fbm(vec3 p){
          float s=0.0,a=0.5;
          for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.05; a*=0.5; }
          return s;
        }

        void main(){
          float t = uTime * 0.03;

          // «кипение» фотосферы
          vec2 uv1 = vUv + vec2(t * 0.012, sin(vUv.y * 9.0 + t * 4.0) * 0.0035);
          vec2 uv2 = vUv * 1.9 + vec2(-t * 0.02, t * 0.01);

          vec3 c1 = uHasMap > 0.5 ? texture2D(uMap, uv1).rgb : vec3(1.0, 0.62, 0.16);
          vec3 c2 = uHasMap > 0.5 ? texture2D(uMap, uv2).rgb : vec3(1.0, 0.8, 0.4);

          // смешиваем два слоя → живая грануляция
          vec3 col = mix(c1, c2, 0.34);

          // усиливаем контраст: пятна темнее, ядра ярче
          float g = dot(col, vec3(0.33));
          col = mix(col, col * vec3(1.22, 0.92, 0.62), smoothstep(0.35, 0.62, g));
          col = mix(col, col * 1.30, smoothstep(0.68, 0.95, g));

          // хромосферная кромка и затемнение лимба
          float fres = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          col = mix(col, col * vec3(1.30, 0.58, 0.16), pow(fres, 1.9) * 0.9);
          col += vec3(1.0, 0.48, 0.12) * pow(fres, 3.6) * 1.15;

          gl_FragColor = vec4(col * 1.30, 1.0);
        }`,
    });

    const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 96), mat);
    sunMesh.userData = { id:'sun', isSun:true };
    this.scene.add(sunMesh);
    this.sunMesh = sunMesh;
    this.sunMat = mat;
    this.pickables.push(sunMesh);

    // короны
    const gTex = glowSprite('rgba(255,248,224,.98)', 'rgba(255,168,64,.42)');
    const mk = (size, opacity, color) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: gTex, color, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      }));
      s.scale.set(size, size, 1);
      return s;
    };
    this.corona1 = mk(R * 3.6, 0.92, 0xffc879);
    this.corona2 = mk(R * 8.5, 0.34, 0xffa04a);
    this.corona3 = mk(R * 20, 0.12, 0xff7c22);
    this.scene.add(this.corona1, this.corona2, this.corona3);
  }

  /* ============================================================
     ПЛАНЕТЫ
     ============================================================ */
  _visualRadius(radiusKm){
    return Math.max(0.9, Math.pow(radiusKm / 6371, 0.42) * 2.6);
  }
  _moonRadius(radiusKm){
    return Math.max(0.10, Math.pow(radiusKm / 6371, 0.38) * 1.05);
  }

  _buildPlanets(){
    const step = 1 / PLANETS.length;

    PLANETS.forEach((p, idx) => {
      this.onProgress(0.05 + idx * step * 0.7, `сборка · ${p.name}`);

      const visualR = this.realScale ? this._visualRadius(p.radiusKm) : 3.2;
      const group = new THREE.Group();
      const tiltGroup = new THREE.Group();
      tiltGroup.rotation.z = THREE.MathUtils.degToRad(p.axialTilt);

      const baseMap = this.tex?.get(p.id) || null;

      /* --- основной шар --- */
      const mat = new THREE.MeshStandardMaterial({
        map: baseMap,
        color: baseMap ? 0xffffff : new THREE.Color(p.color),
        roughness: p.roughness,
        metalness: 0.02,
      });
      if (!baseMap){
        // запасной вариант, если текстура не загрузилась
        const fallback = moonSurface({
          type: p.bands ? 'hazy' : 'cratered',
          colorA: p.color, colorB: p.color2, seed: idx + 5, bands: true,
        }, 512, 256);
        mat.map = fallback.map;
        mat.bumpMap = fallback.bump;
        mat.bumpScale = 0.2;
      } else if (!p.bands){
        mat.bumpMap = baseMap;
        mat.bumpScale = 0.06;
      }

      const mesh = new THREE.Mesh(new THREE.SphereGeometry(visualR, 96, 64), mat);
      mesh.userData = { id: p.id, planet: p };
      tiltGroup.add(mesh);

      /* --- Земля: облака, ночные огни, атмосфера --- */
      let clouds = null, night = null;
      if (p.id === 'earth'){
        const cTex = this.tex?.get('earthClouds');
        if (cTex){
          clouds = new THREE.Mesh(
            new THREE.SphereGeometry(visualR * 1.012, 80, 56),
            new THREE.ShaderMaterial({
              uniforms:{
                uMap:{ value: cTex },
                uSun:{ value: new THREE.Vector3(1, 0, 0) },
                uTime:{ value: 0 },
                uOpacity:{ value: 0.92 },
              },
              vertexShader: SPHERE_VS,
              fragmentShader:`
                uniform sampler2D uMap;
                uniform vec3 uSun;
                uniform float uTime;
                uniform float uOpacity;
                varying vec2 vUv;
                varying vec3 vNormalW;
                varying vec3 vPosW;
                varying vec3 vViewW;
                void main(){
                  // облака медленно дрейфуют по долготе
                  vec2 uv = vec2(fract(vUv.x + uTime * 0.0016), vUv.y);
                  vec4 c = texture2D(uMap, uv);
                  float a = c.r;
                  if (a < 0.02) discard;
                  float lit = max(dot(normalize(vNormalW), normalize(uSun)), 0.0);
                  // мягкий переход на терминаторе
                  float shade = 0.10 + pow(lit, 0.75) * 1.05;
                  float edge = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewW))), 2.0);
                  vec3 col = vec3(1.0, 0.99, 0.97) * shade + vec3(0.35,0.5,0.75) * edge * lit * 0.5;
                  gl_FragColor = vec4(col, a * uOpacity);
                }`,
              transparent: true, depthWrite: false,
            })
          );
          tiltGroup.add(clouds);
        }

        const nTex = this.tex?.get('earthNight');
        if (nTex){
          night = new THREE.Mesh(
            new THREE.SphereGeometry(visualR * 1.004, 80, 56),
            new THREE.ShaderMaterial({
              uniforms:{
                uMap:{ value: nTex },
                uSun:{ value: new THREE.Vector3(1, 0, 0) },
                uIntensity:{ value: 1.5 },
              },
              vertexShader: SPHERE_VS,
              fragmentShader:`
                uniform sampler2D uMap;
                uniform vec3 uSun;
                uniform float uIntensity;
                varying vec2 vUv;
                varying vec3 vNormalW;
                varying vec3 vPosW;
                varying vec3 vViewW;
                void main(){
                  vec3 c = texture2D(uMap, vUv).rgb;
                  // огни видны только на ночной стороне
                  float d = dot(normalize(vNormalW), normalize(uSun));
                  float nightAmt = smoothstep(0.12, -0.30, d);
                  if (nightAmt <= 0.001) discard;
                  // тёплый оттенок городских огней
                  c *= vec3(1.30, 1.02, 0.62);
                  gl_FragColor = vec4(c * nightAmt * uIntensity, 1.0);
                }`,
              transparent: true, blending: THREE.AdditiveBlending,
              depthWrite: false,
            })
          );
          tiltGroup.add(night);
        }
      }

      /* --- Венера: облачный слой --- */
      if (p.id === 'venus'){
        const aTex = this.tex?.get('venusAtmo');
        if (aTex){
          clouds = new THREE.Mesh(
            new THREE.SphereGeometry(visualR * 1.014, 64, 48),
            new THREE.ShaderMaterial({
              uniforms:{ uMap:{ value:aTex }, uSun:{ value:new THREE.Vector3(1,0,0) }, uTime:{ value:0 } },
              vertexShader: SPHERE_VS,
              fragmentShader:`
                uniform sampler2D uMap; uniform vec3 uSun; uniform float uTime;
                varying vec2 vUv; varying vec3 vNormalW; varying vec3 vPosW; varying vec3 vViewW;
                void main(){
                  vec2 uv = vec2(fract(vUv.x + uTime * 0.004), vUv.y);
                  vec3 c = texture2D(uMap, uv).rgb;
                  float lit = max(dot(normalize(vNormalW), normalize(uSun)), 0.0);
                  c *= 0.22 + pow(lit, 0.7) * 1.0;
                  gl_FragColor = vec4(c, 0.90);
                }`,
              transparent: true, depthWrite: false,
            })
          );
          tiltGroup.add(clouds);
        }
      }

      /* --- атмосферный ореол --- */
      const atmoUniforms = {
        uColor:{ value: new THREE.Color(p.atmo) },
        uSun:{ value: new THREE.Vector3(1, 0, 0) },
        uPower:{ value: p.bands ? 2.3 : 2.8 },
        uStrength:{ value: p.id === 'earth' ? 1.15 : p.bands ? 0.62 : 0.5 },
        uAtmoRadius:{ value: 1.0 },
      };
      const atmo = new THREE.Mesh(
        new THREE.SphereGeometry(visualR * 1.058, 64, 44),
        new THREE.ShaderMaterial({
          uniforms: atmoUniforms,
          vertexShader: SPHERE_VS,
          fragmentShader:`
            uniform vec3 uColor;
            uniform vec3 uSun;
            uniform float uPower;
            uniform float uStrength;
            varying vec2 vUv;
            varying vec3 vNormalW;
            varying vec3 vPosW;
            varying vec3 vViewW;
            void main(){
              vec3 n = normalize(vNormalW);
              vec3 v = normalize(vViewW);
              float fres = 1.0 - abs(dot(n, v));
              // рассеивание сильнее у освещённого края
              float sun = max(dot(n, normalize(uSun)), 0.0);
              float scatter = pow(sun, 0.55);
              float rim = pow(fres, uPower);
              // мягкое затухание к краю диска
              float a = rim * uStrength * (0.30 + scatter * 0.95);
              // голубоватый оттенок у терминатора
              vec3 col = mix(uColor * 0.55, uColor, scatter);
              gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
            }`,
          transparent: true, blending: THREE.AdditiveBlending,
          side: THREE.BackSide, depthWrite: false,
        })
      );
      tiltGroup.add(atmo);

      /* --- кольца --- */
      let rings = null;
      if (p.rings){
        const rs = p.ringStyle || { inner:1.3, outer:2.1, opacity:.5 };
        const inner = visualR * rs.inner, outer = visualR * rs.outer;
        const rGeo = new THREE.RingGeometry(inner, outer, 256, 4);
        // u = нормализованный радиус
        const pos = rGeo.attributes.position, uv = rGeo.attributes.uv;
        const v3 = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++){
          v3.fromBufferAttribute(pos, i);
          uv.setXY(i, (v3.length() - inner) / (outer - inner), 0.5);
        }
        rings = new THREE.Mesh(rGeo, new THREE.ShaderMaterial({
          uniforms:{
            uMap:{ value: ringTexture(p) },
            uSun:{ value: new THREE.Vector3(1, 0, 0) },
            uPlanetCenter:{ value: new THREE.Vector3() },
            uPlanetR:{ value: visualR },
            uOpacity:{ value: 0.96 },
          },
          vertexShader: SPHERE_VS,
          fragmentShader:`
            uniform sampler2D uMap;
            uniform vec3 uSun;
            uniform vec3 uPlanetCenter;
            uniform float uPlanetR;
            uniform float uOpacity;
            varying vec2 vUv;
            varying vec3 vNormalW;
            varying vec3 vPosW;
            varying vec3 vViewW;
            void main(){
              vec4 t = texture2D(uMap, vec2(vUv.x, 0.5));
              if (t.a < 0.004) discard;

              // --- аналитическая тень планеты на кольцах ---
              // вектор от центра планеты к точке кольца
              vec3 rel = vPosW - uPlanetCenter;
              vec3 sun = normalize(uSun);
              float along = dot(rel, -sun);          // насколько «за» планетой
              float shadow = 1.0;
              if (along > 0.0){
                float perp = length(rel + sun * along);
                // резкая граница, как на снимках «Кассини»
                shadow = smoothstep(uPlanetR * 0.97, uPlanetR * 1.05, perp);
              }

              float lit = max(dot(normalize(vNormalW), sun), 0.0);
              float br = 0.45 + lit * 0.70;
              // в тени планеты кольца гаснут почти полностью
              vec3 col = t.rgb * br * (0.06 + shadow * 0.94);
              gl_FragColor = vec4(col, t.a * uOpacity);
            }`,
          transparent: true, side: THREE.DoubleSide, depthWrite: false,
        }));
        rings.rotation.x = Math.PI / 2;
        tiltGroup.add(rings);
      }

      /* --- подпись --- */
      const label = this._makeLabel(p.name, visualR);
      label.position.y = visualR * (p.rings ? 3.0 : 1.7) + 1.2;
      tiltGroup.add(label);

      group.add(tiltGroup);
      this.scene.add(group);

      const rec = {
        data: p, group, tiltGroup, mesh, atmo, clouds, night, rings, label,
        visualR, baseR: visualR,
        dist: p.auMkm * DIST_SCALE,
        angle: Math.random() * Math.PI * 2,
        orbitSpeed: (Math.PI * 2) / p.periodDays,
        spinSpeed: (Math.PI * 2) / (p.dayHours / 24),
        moons: [],
      };
      this.planets.push(rec);
      this.pickables.push(mesh);
      if (rings){ rings.userData = { id:p.id, planet:p, ring:true }; this.pickables.push(rings); }
    });
  }

  /* ============================================================
     СПУТНИКИ
     ============================================================ */
  _buildMoons(){
    this.onProgress(0.78, 'спутники планет');

    this.planets.forEach(planet => {
      const list = MOONS[planet.data.id];
      if (!list?.length) return;

      list.forEach((m, i) => {
        const r = this._moonRadius(m.radiusKm);
        const dist = moonOrbitUnits(m.distKm, i, list.length, planet.visualR);

        const holder = new THREE.Group();          // позиция на орбите
        const spin = new THREE.Group();

        // текстура: реальная (Луна) или процедурная
        let mat;
        const realTex = m.tex ? this.tex?.get(m.tex) : null;
        if (realTex){
          mat = new THREE.MeshStandardMaterial({
            map: realTex, bumpMap: realTex, bumpScale: 0.04,
            roughness: m.roughness ?? 0.9, metalness: 0,
          });
        } else {
          const surf = moonSurface(m.proc || { type:'cratered', seed:i }, 512, 256);
          mat = new THREE.MeshStandardMaterial({
            map: surf.map, bumpMap: surf.bump, bumpScale: 0.05,
            roughness: m.roughness ?? 0.9, metalness: 0,
          });
        }

        const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), mat);
        mesh.userData = { id: m.id, moon: m, planetId: planet.data.id };
        spin.add(mesh);
        holder.add(spin);
        planet.tiltGroup.add(holder);

        const rec = {
          data: m, holder, spin, mesh, r, dist,
          angle: Math.random() * Math.PI * 2,
          speed: (Math.PI * 2) / m.periodDays,
          spinSpeed: (Math.PI * 2) / m.periodDays,   // приливный захват
          planetId: planet.data.id,
        };
        planet.moons.push(rec);
        this.moonMeshes.push(rec);
        this.pickables.push(mesh);
      });
    });
  }

  _makeLabel(text, r){
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.font = '600 52px Inter, "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.98)'; ctx.shadowBlur = 20;
    ctx.fillStyle = 'rgba(236,244,255,.96)';
    ctx.fillText(text.toUpperCase(), 256, 66);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0,
    }));
    const s = Math.max(3.0, r * 3.2);
    spr.scale.set(s, s / 4, 1);
    return spr;
  }

  /* ============================================================
     ОРБИТЫ ПЛАНЕТ
     ============================================================ */
  _buildOrbits(){
    this.planets.forEach(p => {
      const seg = 512, pts = [];
      for (let i = 0; i <= seg; i++){
        const a = (i / seg) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * p.dist, 0, Math.sin(a) * p.dist));
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: new THREE.Color(p.data.color),
          transparent: true, opacity: 0.18, depthWrite: false,
        })
      );
      this.scene.add(line);
      p.orbitLine = line;
      this.orbitLines.push(line);
    });
  }

  /* ============================================================
     ПОЯСА: АСТЕРОИДЫ и КОЙПЕР
     ============================================================ */
  _buildBelts(){
    this.onProgress(0.88, 'пояс астероидов');

    const dot = dotSprite();

    /* --- пояс астероидов: настоящие каменные глыбы --- */
    const a = BELTS.asteroids;
    const geoA = new THREE.IcosahedronGeometry(1, 0);
    const matA = new THREE.MeshStandardMaterial({
      color: 0x9c8f80, roughness: 0.96, metalness: 0.03, flatShading: true,
    });
    const instA = new THREE.InstancedMesh(geoA, matA, a.count);
    instA.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const dummy = new THREE.Object3D();
    const colA = new THREE.Color();
    for (let i = 0; i < a.count; i++){
      const au = a.innerAu + Math.pow(Math.random(), 0.85) * (a.outerAu - a.innerAu);
      const R = au * 149.6;                      // в юниты (млн км)
      const ang = Math.random() * Math.PI * 2;
      const spread = a.thickness * au * 0.16;
      const y = (Math.random() - 0.5) * 2 * spread;
      dummy.position.set(Math.cos(ang) * R, y, Math.sin(ang) * R);
      dummy.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      const s = 0.035 + Math.pow(Math.random(), 2.6) * 0.42;
      dummy.scale.set(s, s * (0.7 + Math.random() * 0.55), s * (0.7 + Math.random() * 0.55));
      dummy.updateMatrix();
      instA.setMatrixAt(i, dummy.matrix);
      const t = Math.random();
      colA.setRGB(
        (0.62 + t * 0.30), (0.56 + t * 0.28), (0.48 + t * 0.26)
      );
      instA.setColorAt(i, colA);
    }
    instA.instanceMatrix.needsUpdate = true;
    if (instA.instanceColor) instA.instanceColor.needsUpdate = true;
    instA.frustumCulled = false;
    this.scene.add(instA);
    this.asteroidMesh = instA;
    this.beltObjects.push(instA);

    /* --- пояс Койпера: облако ледяных точек --- */
    this.onProgress(0.94, 'пояс Койпера');
    const k = BELTS.kuiper;
    const pos = new Float32Array(k.count * 3);
    const col = new Float32Array(k.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < k.count; i++){
      const au = k.innerAu + Math.pow(Math.random(), 0.9) * (k.outerAu - k.innerAu);
      const R = au * 149.6;
      const ang = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 2 * k.thickness * (au / k.innerAu) * 12;
      pos[i*3]   = Math.cos(ang) * R;
      pos[i*3+1] = y;
      pos[i*3+2] = Math.sin(ang) * R;
      const t = Math.random();
      c.setRGB(0.52 + t * 0.34, 0.60 + t * 0.30, 0.74 + t * 0.26);
      col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
    }
    const gk = new THREE.BufferGeometry();
    gk.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    gk.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mk = new THREE.PointsMaterial({
      map: dot, size: 26, sizeAttenuation: true,
      transparent: true, opacity: 0.85, depthWrite: false,
      vertexColors: true, blending: THREE.AdditiveBlending,
    });
    const kuiper = new THREE.Points(gk, mk);
    kuiper.frustumCulled = false;
    this.scene.add(kuiper);
    this.kuiperMesh = kuiper;
    this.beltObjects.push(kuiper);
  }

  /* ============================================================
     УПРАВЛЕНИЕ
     ============================================================ */
  setRealScale(on){
    this.realScale = on;
    this.planets.forEach(p => {
      const r = on ? this._visualRadius(p.data.radiusKm) : 3.2;
      const k = r / p.visualR;
      p.visualR = r;
      p.mesh.scale.setScalar(k);
      p.atmo.scale.setScalar(k);
      if (p.clouds) p.clouds.scale.setScalar(k);
      if (p.night) p.night.scale.setScalar(k);
      if (p.rings) p.rings.scale.setScalar(k);
      p.label.position.y = r * (p.data.rings ? 3.0 : 1.7) + 1.2;
      // спутники пересчитываем относительно нового радиуса
      const list = MOONS[p.data.id] || [];
      p.moons.forEach((m, i) => {
        m.dist = moonOrbitUnits(m.data.distKm, i, list.length, r);
      });
    });
  }

  setOrbitsVisible(v){ this.orbitLines.forEach(l => l.visible = v); }
  setLabelsVisible(v){ this.labelsOn = v; }
  setBeltsVisible(v){
    this.beltsOn = v;
    this.beltObjects.forEach(o => o.visible = v);
  }

  /* ============================================================
     ШАГ СИМУЛЯЦИИ
     ============================================================ */
  update(dt){
    const dayDelta = this.running ? dt * this.speed : 0;
    this.time += dayDelta;
    this.lastDayDelta = dayDelta;

    const now = performance.now();
    // Солнце
    this.sunMat.uniforms.uTime.value += dt;
    const pulse = 1 + Math.sin(now * 0.00042) * 0.016;
    const R = this.sunRadius;
    this.corona1.scale.setScalar(R * 3.6 * pulse);
    this.corona2.scale.setScalar(R * 8.5 * (2 - pulse));
    this.corona3.scale.setScalar(R * 20 * pulse);

    const focusId = this.selected || this.hovered;

    this.planets.forEach(p => {
      /* --- движение по орбите --- */
      p.angle += p.orbitSpeed * dayDelta;
      if (p.angle > Math.PI * 2) p.angle -= Math.PI * 2;
      p.group.position.set(Math.cos(p.angle) * p.dist, 0, Math.sin(p.angle) * p.dist);
      p.mesh.rotation.y += p.spinSpeed * dayDelta * 0.09;

      // Слои обязаны вращаться вместе с планетой, иначе огни городов
      // и облака «уезжают» относительно континентов.
      if (p.night) p.night.rotation.y = p.mesh.rotation.y;
      if (p.clouds) p.clouds.rotation.y = p.mesh.rotation.y;

      /* --- направление на Солнце для шейдеров --- */
      const toSun = p.group.position.clone().negate().normalize();

      if (p.atmo.material.uniforms.uSun) p.atmo.material.uniforms.uSun.value.copy(toSun);
      if (p.clouds?.material.uniforms?.uSun){
        p.clouds.material.uniforms.uSun.value.copy(toSun);
        if (p.clouds.material.uniforms.uTime) p.clouds.material.uniforms.uTime.value += dt;
      }
      if (p.night?.material.uniforms?.uSun) p.night.material.uniforms.uSun.value.copy(toSun);
      if (p.rings){
        p.rings.material.uniforms.uSun.value.copy(toSun);
        p.rings.material.uniforms.uPlanetCenter.value.copy(p.group.position);
      }

      /* --- подпись --- */
      const isFocus = focusId === p.data.id;
      const target = this.labelsOn || isFocus ? 0.95 : 0;
      p.label.material.opacity += (target - p.label.material.opacity) * Math.min(1, dt * 7);

      /* --- орбита --- */
      const lineOp = isFocus ? 0.62 : 0.18;
      p.orbitLine.material.opacity += (lineOp - p.orbitLine.material.opacity) * Math.min(1, dt * 5);
      p.orbitLine.material.color.set(isFocus ? p.data.atmo : p.data.color);

      /* --- спутники --- */
      p.moons.forEach(m => {
        m.angle += m.speed * dayDelta * (m.data.rev ? -1 : 1);
        if (m.angle > Math.PI * 2) m.angle -= Math.PI * 2;
        if (m.angle < 0) m.angle += Math.PI * 2;
        m.holder.position.set(Math.cos(m.angle) * m.dist, 0, Math.sin(m.angle) * m.dist);
        m.spin.rotation.y += m.spinSpeed * dayDelta;
      });
    });

    /* --- пояс астероидов медленно вращается целиком --- */
    if (this.asteroidMesh && this.beltsOn){
      this.asteroidMesh.rotation.y += dayDelta * 0.00022;
    }
    if (this.kuiperMesh && this.beltsOn){
      this.kuiperMesh.rotation.y += dayDelta * 0.00006;
    }
  }

  resize(){
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
  }

  /* ============================================================
     ПОДБОР
     ============================================================ */
  pick(ndc, raycaster){
    raycaster.setFromCamera(ndc, this.camera);
    const hits = raycaster.intersectObjects(this.pickables, false);
    for (const h of hits){
      if (h.object.userData?.ring) continue;
      const u = h.object.userData;
      if (u?.id) return u.moon ? { moon:u.id, planet:u.planetId } : u.id;
    }
    for (const h of hits){
      const u = h.object.userData;
      if (u?.id) return u.moon ? { moon:u.id, planet:u.planetId } : u.id;
    }
    return null;
  }

  getPlanet(id){
    if (id === 'sun') return { data: SUN, isSun:true, visualR: this.sunRadius, dist:0 };
    return this.planets.find(p => p.data.id === id) || null;
  }

  getMoon(moonId){
    return this.moonMeshes.find(m => m.data.id === moonId) || null;
  }

  worldPos(id){
    if (id === 'sun') return new THREE.Vector3();
    const p = this.getPlanet(id);
    return p ? p.group.position.clone() : new THREE.Vector3();
  }

  /* точка обзора для камеры */
  viewFor(id){
    // спутник?
    const moon = this.getMoon(id);
    if (moon){
      const planet = this.getPlanet(moon.planetId);
      return {
        target: moon.holder.getWorldPosition(new THREE.Vector3()),
        dir: new THREE.Vector3(0.45, 0.30, 1).normalize(),
        dist: Math.max(moon.r * 4.0, 0.6),
        follow: { group: moon.holder, visualR: moon.r },
        small: true,
        parentPlanet: planet,
      };
    }

    const p = this.getPlanet(id);
    if (!p) return null;

    if (id === 'sun'){
      return {
        target: new THREE.Vector3(), dir: new THREE.Vector3(0.65, 0.3, 1).normalize(),
        dist: this.sunRadius * 4.4, follow: null,
      };
    }

    const dist = p.visualR * 2.9 + 1.6;
    const ringOuter = p.rings ? p.visualR * ((p.data.ringStyle?.outer) || 2.1) : 0;
    const distFinal = Math.max(dist, ringOuter * 1.95);

    return {
      target: p.group.position.clone(),
      dir: (() => {
        const v = p.group.position.clone();
        if (v.lengthSq() < 1e-6) return new THREE.Vector3(0.55, 0.28, 1).normalize();
        return v.normalize().multiplyScalar(0.72)
          .add(new THREE.Vector3(0.22, 0.30, 0.35)).normalize();
      })(),
      dist: distFinal,
      follow: p,
    };
  }

  render(){
    this.renderer.render(this.scene, this.camera);
  }
}
