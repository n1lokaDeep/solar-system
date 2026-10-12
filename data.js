/* ============================================================
   ДАННЫЕ О ПЛАНЕТАХ
   Радиусы — в км, расстояния — в млн км (большая полуось),
   периоды — в земных сутках. Значения реальные (NASA/JPL).
   ============================================================ */

export const SUN = {
  id:'sun', name:'Солнце', tagline:'Жёлтый карлик G2V',
  color:'#ffb545', emissive:'#ff7a1a',
  radiusKm: 696340,
  facts:[
    'Содержит 99,86 % всей массы Солнечной системы.',
    'В ядре ~15,7 млн °C — там идёт термоядерный синтез водорода в гелий.',
    'Каждую секунду 4,3 млн тонн массы превращается в энергию.',
    'Свет от Солнца до Земли идёт 8 минут 20 секунд.',
  ],
};

export const PLANETS = [
  {
    id:'mercury', name:'Меркурий', tagline:'Самая быстрая планета',
    color:'#a9a29b', color2:'#6d6760', atmo:'#c9c2b8',
    radiusKm: 2439.7,          // средний радиус
    auMkm: 57.9,               // млн км от Солнца
    periodDays: 87.97,         // сидерический период обращения
    dayHours: 1407.6,          // солнечные сутки
    axialTilt: 0.03,
    massEarth: 0.055,
    tempC: 'от −173 до +427',
    moons: 0,
    rings: false,
    roughness:.95,
    facts:[
      'Год длится всего 88 земных суток, а сутки — 59 земных.',
      'Перепады температур — самые большие в Солнечной системе: около 600 °C.',
      'Поверхность изрыта кратерами и похожа на лунную.',
      'Спутников нет, атмосферы практически нет.',
    ],
  },
  {
    id:'venus', name:'Венера', tagline:'Самая горячая планета',
    color:'#e8c88a', color2:'#b98f47', atmo:'#ffe6ad',
    radiusKm: 6051.8,
    auMkm: 108.2,
    periodDays: 224.7,
    dayHours: 5832.5,
    axialTilt: 177.4,
    massEarth: 0.815,
    tempC: '+464',
    moons: 0,
    rings: false,
    roughness:.72,
    facts:[
      'Горячее Меркурия из-за парникового эффекта: +464 °C у поверхности.',
      'Вращается в обратную сторону — Солнце встаёт на западе.',
      'Сутки (243 земных дня) длиннее года (225 дней).',
      'Давление у поверхности в 92 раза выше земного.',
    ],
  },
  {
    id:'earth', name:'Земля', tagline:'Голубая планета',
    color:'#2f6fd0', color2:'#1d4a92', atmo:'#8fc9ff',
    radiusKm: 6371.0,
    auMkm: 149.6,
    periodDays: 365.256,
    dayHours: 24,
    axialTilt: 23.44,
    massEarth: 1,
    tempC: 'в среднем +15',
    moons: 1,
    rings: false,
    roughness:.62,
    hero:true,
    facts:[
      'Единственная известная планета с жидкой водой на поверхности.',
      'Наклон оси 23,44° даёт смену времён года.',
      'Магнитное поле отклоняет солнечный ветер и защищает атмосферу.',
      'Атмосфера на 78 % состоит из азота и на 21 % из кислорода.',
    ],
  },
  {
    id:'mars', name:'Марс', tagline:'Красная планета',
    color:'#c1512c', color2:'#7d2f16', atmo:'#e08b62',
    radiusKm: 3389.5,
    auMkm: 227.9,
    periodDays: 686.98,
    dayHours: 24.66,
    axialTilt: 25.19,
    massEarth: 0.107,
    tempC: 'в среднем −63',
    moons: 2,
    rings: false,
    roughness:.9,
    facts:[
      'Здесь находится Олимп — вулкан высотой 21,9 км, самый высокий в системе.',
      'Долина Маринер тянется на 4000 км — это гигантский каньон.',
      'Есть два спутника: Фобос и Деймос, оба неправильной формы.',
      'Пылевые бури могут накрывать всю планету целиком.',
    ],
  },
  {
    id:'jupiter', name:'Юпитер', tagline:'Газовый гигант',
    color:'#d8a577', color2:'#8a5a34', atmo:'#ffd9a8',
    radiusKm: 69911,
    auMkm: 778.5,
    periodDays: 4332.59,
    dayHours: 9.93,
    axialTilt: 3.13,
    massEarth: 317.8,
    tempC: 'около −108',
    moons: 95,
    rings: true,
    bands:true,
    roughness:.5,
    facts:[
      'Масса в 2,5 раза больше, чем у всех остальных планет вместе взятых.',
      'Большое Красное Пятно — шторм шире Земли, бушует минимум 190 лет.',
      'Сутки короче 10 часов — самая быстро вращающаяся планета.',
      'Известно 95 подтверждённых спутников.',
    ],
  },
  {
    id:'saturn', name:'Сатурн', tagline:'Властелин колец',
    color:'#e3c88f', color2:'#a98a4d', atmo:'#fff0c4',
    radiusKm: 58232,
    auMkm: 1434,
    periodDays: 10759.22,
    dayHours: 10.7,
    axialTilt: 26.73,
    massEarth: 95.2,
    tempC: 'около −139',
    moons: 146,
    rings:true,
    ringStyle:{ inner:1.24, outer:2.28, opacity:.92, color:'#efe0bb' },
    bands:true,
    roughness:.55,
    facts:[
      'Средняя плотность меньше плотности воды — Сатурн «плавал» бы.',
      'Кольца состоят из миллиардов кусков льда и камня, толщиной всего ~10 м.',
      'Известно 146 спутников — больше, чем у любой другой планеты.',
      'На северном полюсе — шестиугольный вихрь шириной 30 000 км.',
    ],
  },
  {
    id:'uranus', name:'Уран', tagline:'Ледяной гигант на боку',
    color:'#8fdcea', color2:'#4a97ab', atmo:'#c9f4ff',
    radiusKm: 25362,
    auMkm: 2871,
    periodDays: 30688.5,
    dayHours: 17.24,
    axialTilt: 97.77,
    massEarth: 14.5,
    tempC: 'около −197',
    moons: 28,
    rings:true,
    ringStyle:{ inner:1.6, outer:2.0, opacity:.4, color:'#a9e6f0' },
    roughness:.45,
    facts:[
      'Ось наклонена на 98° — планета буквально катится по орбите.',
      'Самый холодный мир в системе: минимум −224 °C.',
      'Метан в атмосфере даёт характерный бирюзовый цвет.',
      'Год длится 84 земных года.',
    ],
  },
  {
    id:'neptune', name:'Нептун', tagline:'Самый ветреный мир',
    color:'#4166d8', color2:'#22357e', atmo:'#7d9bff',
    radiusKm: 24622,
    auMkm: 4495,
    periodDays: 60182,
    dayHours: 16.11,
    axialTilt: 28.32,
    massEarth: 17.1,
    tempC: 'около −201',
    moons: 16,
    rings:true,
    ringStyle:{ inner:1.7, outer:2.1, opacity:.28, color:'#8fa8ff' },
    roughness:.45,
    facts:[
      'Ветры достигают 2100 км/ч — самые сильные в Солнечной системе.',
      'Найден «на кончике пера»: сначала вычислили орбиту, потом увидели.',
      'Год длится почти 165 земных лет — с 1846 года завершил лишь один оборот.',
      'Крупнейший спутник Тритон движется в обратную сторону.',
    ],
  },
];

/* ---------- Сравнение размеров: Солнце и планеты ---------- */
export const SIZE_LADDER = [
  { id:'mercury', name:'Меркурий', r:2439.7,  color:'#a9a29b' },
  { id:'mars',    name:'Марс',     r:3389.5,  color:'#c1512c' },
  { id:'venus',   name:'Венера',   r:6051.8,  color:'#e8c88a' },
  { id:'earth',   name:'Земля',    r:6371.0,  color:'#2f6fd0' },
  { id:'neptune', name:'Нептун',   r:24622,   color:'#4166d8' },
  { id:'uranus',  name:'Уран',     r:25362,   color:'#8fdcea' },
  { id:'saturn',  name:'Сатурн',   r:58232,   color:'#e3c88f' },
  { id:'jupiter', name:'Юпитер',   r:69911,   color:'#d8a577' },
];

/* ---------- Помощники ---------- */
export const EARTH_R = 6371;

export function fmt(n, digits = 0){
  return n.toLocaleString('ru-RU', { minimumFractionDigits:digits, maximumFractionDigits:digits });
}

export function fmtBig(n){
  if (n >= 1e9) return fmt(n/1e9, 2) + ' млрд';
  if (n >= 1e6) return fmt(n/1e6, 2) + ' млн';
  if (n >= 1e3) return fmt(n/1e3, 1) + ' тыс.';
  return fmt(n);
}

export function periodLabel(days){
  if (days < 400) return fmt(days, 1) + ' сут';
  const years = days / 365.256;
  return fmt(years, years < 10 ? 2 : 1) + ' года';
}

export function dayLabel(hours){
  if (hours < 48) return fmt(hours, hours < 100 ? 2 : 1) + ' ч';
  const d = hours / 24;
  return fmt(d, d < 100 ? 1 : 0) + ' земных сут';
}
