'use strict';
/* Арена боссов: повторение карточек в виде схватки мехов.
   Бык и босс сцепились лоб в лоб. Босс всё время давит (пока вы думаете, точка схватки ползёт к быку),
   верный ответ — мощный толчок назад, ошибка — рывок босса. Дожали быка до стены — минус жизнь.
   Опирается на функции из script.js (dueCards, extraNewCards, practiceCards, launch, finish, closeGame, S, save). */
(() => {
  const FIGHT = 8; // карточек в бою
  // front — какая доля ширины картинки босса заходит «внутрь» схватки; rate — скорость давления (доля пути до стены в секунду)
  const BOSSES = {
    1: { key: 'golem', name: 'Голем Матриц', color: '#ff9a3c', glow: 'rgba(255,150,60,.55)', front: 0.08, rate: 0.022, w: 0.36,
      start: 'Мой определитель не равен нулю. А твои шансы равны.', rage: 'Ранг падает… но я ещё давлю!',
      win: 'Возвращайся, когда выучишь Крамера.', die: 'Матрица… вырождена…' },
    2: { key: 'scorpion', name: 'Скорпион Векторов', color: '#ffb347', glow: 'rgba(255,170,70,.55)', front: 0.07, rate: 0.025, w: 0.42,
      start: 'Все мои векторы направлены в тебя.', rage: 'Угол между нами становится острым!',
      win: 'Твоя прямая не пересекла мою.', die: 'Нормаль… потеряна…' },
    3: { key: 'dragon', name: 'Дракон Пределов', color: '#ff5a2a', glow: 'rgba(255,80,40,.6)', front: 0.07, rate: 0.027, w: 0.42,
      start: 'Предел твоих знаний уже близок!', rage: 'Ты стремишься ко мне, но не достигнешь!',
      win: 'Предела нет. Как и твоей победы.', die: 'Производная… обнулилась…' },
    99: { key: 'session', name: 'Сессия 1. Математика', color: '#ff3a4a', glow: 'rgba(255,60,80,.6)', front: 0.06, rate: 0.032, w: 0.46, cards: 25,
      start: 'Экзамен начинается. Все разделы, без шпаргалок.', rage: 'Это ещё не пересдача!',
      win: 'Встретимся на пересдаче.', die: 'Зачёт… поставлен…' },
    98: { key: 'english', name: 'Экзамен по английскому', color: '#3aa0ff', glow: 'rgba(60,150,255,.6)', front: 0.06, rate: 0.03, w: 0.46, cards: 25,
      start: 'Exam time! No dictionaries.', rage: 'Not bad… but not good enough!',
      win: 'See you at the retake.', die: 'Well done… you passed…' },
    4: { key: 'serpent', name: 'Змей Бесконечности', color: '#b46bff', glow: 'rgba(170,90,255,.6)', front: 0.05, rate: 0.03, w: 0.42,
      start: 'Я бесконечен. А твоё терпение?', rage: 'Частные производные меня не остановят!',
      win: 'Бесконечность всегда побеждает.', die: 'Экстремум… найден…' }
  };
  const FIGHTERS = { golem: 1, scorpion: 2, dragon: 3, serpent: 4 };
  const duelBoss = (D) => {
    const fk = D.foes[0].fk, bb = FIGHTERS[fk] ? BOSSES[FIGHTERS[fk]] : null;
    return Object.assign({ key: 'rival', color: D.rcol, glow: 'rgba(255,200,80,.5)', front: 0.05, w: 0.4 }, bb || {}, { name: D.foes[0].name, rate: 0, start: '', rage: '', win: '', die: '', key: bb ? bb.key : 'rival' });
  };
  const MODS = {
    claw: { name: 'Гидро-руки', what: 'Убирают два неверных варианта ответа' },
    shield: { name: 'Энерго-щит', what: 'Один раз держит удар: ошибку или стену' },
    rocket: { name: 'Турбо-ускоритель', what: 'Мощнее толчок и двойной урон на 3 верных ответа' }
  };
  const ME_W = 0.4, ME_HEAD = 0.05; // ширина быка от сцены; доля картинки быка, которая заходит в схватку (рога)
  const RANGE = 0.27;               // насколько далеко от центра уходит точка схватки
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, txt) => { const d = document.createElement(tag); if (cls) d.className = cls; if (txt != null) d.textContent = txt; return d; };
  const today = () => new Date().toLocaleDateString('sv');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  S.arena = S.arena || {};
  const A = S.arena;
  A.items = A.items || { claw: 1, shield: 1, rocket: 1 };
  A.wins = A.wins || {};
  A.beat = A.beat || {};
  if (A.sound == null) A.sound = true;

  /* ---------- разметка ---------- */
  const box = $('#game .gamebox');
  const stageWrap = el('div'); stageWrap.id = 'arena'; stageWrap.hidden = true;
  stageWrap.innerHTML = `
    <div class="ahud">
      <div class="aside me"><div class="aname" id="aMName">МЕХ-БЫК</div><div class="hp"><i class="lag" id="aPLag"></i><i class="fill" id="aPHp"></i></div></div>
      <div class="avs">VS</div>
      <div class="aside bs"><div class="aname" id="aBName"></div><div class="hp boss"><i class="lag" id="aBLag"></i><i class="fill" id="aBHp"></i></div></div>
    </div>
    <div class="stage" id="aStage">
      <div class="beam b1"></div><div class="beam b2"></div>
      <div class="truss t1"></div><div class="truss t2"></div>
      <div class="crowd"></div><div class="floor"></div>
      <div class="wall l" id="aWallL"></div><div class="wall r" id="aWallR"></div>
      <canvas id="aChars"></canvas>
      <canvas id="aFx"></canvas>
      <div class="tug"><i class="mid"></i><b id="aKnob"></b></div>
      <div class="warn" id="aWarn">ДЕРЖИСЬ! ОТВЕЧАЙ!</div>
      <div class="say" id="aSay"></div>
      <div class="abanner" id="aBanner"></div>
      <div class="acombo" id="aCombo"></div>
      <div class="vign" id="aVign"></div>
      <button class="asound" id="aSound" aria-label="Звук"></button>
    </div>
    <div class="mods" id="aMods"></div>`;
  box.insertBefore(stageWrap, box.querySelector('.gmeta'));
  const game = $('#game'), stage = $('#aStage');
  // бойцы рисуются на холсте (rig.js); me/bossEl — невидимые «пульты»: классы на них переводятся в состояние анимации
  const me = el('div'), bossEl = el('div');
  const chars = $('#aChars'), chx = chars.getContext('2d');
  let SCL = 1, FLR = 0;
  const offC = document.createElement('canvas'), offX = offC.getContext('2d'), tmpC = document.createElement('canvas'), tmpX = tmpC.getContext('2d');

  const modsBox = $('#aMods');
  Object.entries(MODS).forEach(([k, m]) => {
    const b = el('button', 'mod'); b.dataset.k = k;
    b.innerHTML = `<img src="arena/${k}.webp" alt=""><span class="mn"></span><b class="cnt"></b>`;
    b.querySelector('.mn').textContent = m.name;
    b.title = m.what;
    b.onclick = () => useMod(k);
    modsBox.append(b);
  });

  /* ---------- звук (синтез, без файлов) ---------- */
  let ac = null, grind = null;
  const audio = () => { if (!A.sound) return null; try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { return null; } return ac; };
  function tone(type, f1, f2, dur, vol, delay = 0) {
    const c = audio(); if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noiseBuf(c, sec) { const n = Math.floor(c.sampleRate * sec), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; }
  function noise(dur, vol, freq, delay = 0) {
    const c = audio(); if (!c) return;
    const t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf(c, dur); f.type = 'lowpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(c.destination); s.start(t);
  }
  /* скрежет металла, пока мехи давят друг друга: громче, когда быка прижимают */
  function grindOn() {
    const c = audio(); if (!c || grind) return;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), o = c.createOscillator(), og = c.createGain();
    s.buffer = noiseBuf(c, 2); s.loop = true; f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 3; g.gain.value = 0;
    o.type = 'sawtooth'; o.frequency.value = 48; og.gain.value = 0;
    s.connect(f).connect(g).connect(c.destination); o.connect(og).connect(c.destination); s.start(); o.start();
    grind = { s, f, g, o, og };
  }
  function grindSet(level) { if (!grind || !ac) return; const t = ac.currentTime; grind.g.gain.setTargetAtTime(0.012 + 0.07 * level, t, 0.1); grind.og.gain.setTargetAtTime(0.01 + 0.04 * level, t, 0.1); grind.f.frequency.setTargetAtTime(500 + 900 * level, t, 0.2); }
  function grindOff() { if (!grind) return; try { grind.s.stop(); grind.o.stop(); } catch (e) {} grind = null; }
  const SFX = {
    shove: () => { tone('sine', 140, 40, 0.3, 0.8); noise(0.25, 0.55, 2600); },
    crit: () => { tone('sine', 170, 35, 0.4, 0.9); noise(0.35, 0.65, 4200); tone('square', 880, 1760, 0.15, 0.08, 0.05); },
    slam: () => { tone('sawtooth', 200, 60, 0.35, 0.3); noise(0.3, 0.5, 900); },
    burst: () => { tone('sine', 80, 22, .9, 1); noise(.9, .9, 2200); tone('sawtooth', 300, 40, .5, .3); [0, .05, .1, .18, .26].forEach((d) => tone('square', 700 + Math.random() * 1500, 300, .09, .06, d)); },
    creak: () => { tone('sawtooth', 260 + Math.random() * 260, 90, .16, .14); noise(.12, .25, 3000); },
    crash: () => { tone('sine', 90, 30, 0.6, 0.9); noise(0.6, 0.7, 1500); [0, 0.07, 0.15].forEach((d) => tone('square', 1200 + Math.random() * 800, 900, 0.08, 0.05, d + 0.1)); },
    block: () => { tone('triangle', 900, 880, 0.3, 0.25); tone('triangle', 1350, 1300, 0.35, 0.15, 0.02); },
    power: () => { tone('sawtooth', 200, 900, 0.4, 0.12); },
    clash: () => { tone('sine', 110, 30, 0.7, 1); noise(0.5, 0.8, 3000); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.22, 0.12, i * 0.12)),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.98, 0.3, 0.2, i * 0.16)),
    roar: () => { tone('sawtooth', 110, 55, 0.7, 0.2); noise(0.7, 0.25, 600); }
  };
  const vib = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
  function renderSound() { $('#aSound').textContent = A.sound ? '🔊' : '🔇'; }
  $('#aSound').onclick = () => { A.sound = !A.sound; save(); renderSound(); if (A.sound) grindOn(); else grindOff(); };

  /* ---------- частицы: искры, дым, огонь, шестерёнки, болты ---------- */
  const cv = $('#aFx'), cx = cv.getContext('2d');
  let parts = [], SW = 0, SH = 0;
  function fitCanvas() { const r = stage.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); if (r.width < 2 || r.height < 2) return; /* сцена скрыта: размер не трогаем */ SW = r.width; SH = r.height; cv.width = SW * d; cv.height = SH * d; cx.setTransform(d, 0, 0, d, 0, 0); chars.width = offC.width = tmpC.width = SW * d; chars.height = offC.height = tmpC.height = SH * d; SCL = SW / Rig.VW; FLR = SH * .93; }
  function burst(x, y, opt) {
    const o = Object.assign({ n: 26, colors: ['#fff6c2', '#ffd24a', '#ff8a1e'], speed: 7, life: 34, size: 3, grav: 0.25, kind: 'spark', dir: 0, spread: Math.PI * 2 }, opt);
    for (let i = 0; i < o.n && parts.length < 420; i++) {
      const a = o.dir + (Math.random() - 0.5) * o.spread, v = o.speed * (0.35 + Math.random());
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.kind === 'smoke' ? 0.6 : 0), life: o.life * (0.6 + Math.random() * 0.6), max: o.life,
        c: o.colors[i % o.colors.length], s: o.size * (0.6 + Math.random() * 0.8), g: o.grav, kind: o.kind, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.5 });
    }
  }
  const gears = (x, y, n, dir, colors) => burst(x, y, { n, kind: 'gear', colors: colors || ['#9aa6bd', '#c3ccdc', '#6f7a90', '#d9a441'], speed: 6, life: 80, grav: 0.32, size: 4, dir: dir == null ? -Math.PI / 2 : dir, spread: 1.6 });
  const bolts = (x, y, n, dir) => burst(x, y, { n, kind: 'bolt', colors: ['#cfd6e4', '#8892a6'], speed: 7, life: 60, grav: 0.35, size: 3, dir: dir == null ? -Math.PI / 2 : dir, spread: 2 });
  function drawGear(p) {
    const r = p.s * 2.4, teeth = 8;
    cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r);
    cx.fillStyle = p.c; cx.strokeStyle = '#1a1f2b'; cx.lineWidth = 1.2; cx.beginPath();
    for (let i = 0; i < teeth * 2; i++) { const a = i / (teeth * 2) * Math.PI * 2, rr = i % 2 ? r : r * 1.35; cx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    cx.closePath(); cx.fill(); cx.stroke();
    cx.fillStyle = '#1a1f2b'; cx.beginPath(); cx.arc(0, 0, r * 0.4, 0, 7); cx.fill();
    cx.restore();
  }
  function drawParts() {
    cx.clearRect(0, 0, SW, SH);
    const floor = SH * 0.93;
    parts = parts.filter((p) => p.life > 0);
    parts.forEach((p) => {
      p.life--; p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.97; p.r += p.vr;
      if ((p.kind === 'gear' || p.kind === 'bolt') && p.y > floor) { p.y = floor; p.vy *= -0.45; p.vx *= 0.7; p.vr *= 0.7; }
      const k = p.life / p.max;
      cx.globalAlpha = Math.max(0, Math.min(1, k * 1.6));
      if (p.kind === 'smoke') { cx.globalAlpha = Math.max(0, k * 0.8); cx.fillStyle = p.c; cx.beginPath(); cx.arc(p.x, p.y, p.s * (3 - 2 * k) * 3, 0, 7); cx.fill(); }
      else if (p.kind === 'ring') { cx.strokeStyle = p.c; cx.lineWidth = Math.max(.6, p.s * k); cx.beginPath(); cx.ellipse(p.x, p.y, p.rad * (1 - k) + 4, (p.rad * (1 - k) + 4) * .45, 0, 0, 7); cx.stroke(); }
      else if (p.kind === 'gear') drawGear(p);
      else if (p.kind === 'bolt') { cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.s * 1.5, -p.s / 2, p.s * 3, p.s); cx.fillRect(-p.s * 1.5, -p.s, p.s, p.s * 2); cx.restore(); }
      else if (p.kind === 'star') { cx.fillStyle = p.c; cx.font = (p.s * 5) + 'px sans-serif'; cx.fillText('✦', p.x, p.y); }
      else if (p.kind === 'fire') { cx.fillStyle = p.c; cx.beginPath(); cx.arc(p.x, p.y, p.s * (1 + 2 * (1 - k)), 0, 7); cx.fill(); }
      else { cx.strokeStyle = p.c; cx.lineWidth = p.s; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2); cx.stroke(); }
    });
    cx.globalAlpha = 1;
  }

  /* ---------- помощники анимаций ---------- */
  const anim = (n, cls, ms) => {
    if (n === me || n === bossEl) return pulse(n === me, cls);
    const c = cls.split(' '), key = '_t' + c[0];
    n.classList.remove(...c, ...(c[0] === 'shake' || c[0] === 'shove' ? ['big', 'turbo'] : [])); void n.offsetWidth; n.classList.add(...c);
    clearTimeout(n[key]); n[key] = setTimeout(() => n.classList.remove(...c), ms);
  };
  /* удары и реакции бойцов — импульсы, которые плавно затухают в цикле отрисовки */
  function pulse(isMe, cls) {
    if (!F) return;
    const c = cls.split(' ')[0];
    if (isMe) {
      if (c === 'shove') { F.kickM = 1; F.turboT = cls.includes('turbo') ? 1 : 0; }
      if (c === 'hurt') { F.flashM = 1; F.kickB = Math.max(F.kickB, .6); }
      if (c === 'block') F.blockT = 1;
      if (c === 'charge') F.charge = 1;
    } else {
      if (c === 'pushed') { F.flashB = 1; F.kickM = Math.max(F.kickM, .8); }
      if (c === 'slam') F.kickB = 1;
      if (c === 'hit') { F.flashB = 1; F.stunT = 1; }
    }
  }
  function floatText(text, x, y, cls) {
    const d = el('div', 'ftxt ' + (cls || ''), text); d.style.left = x + 'px'; d.style.top = y + 'px';
    stage.append(d); setTimeout(() => d.remove(), 1300);
  }
  let sayT = 0;
  function say(text, ms = 2600) {
    const s = $('#aSay'); s.textContent = text; s.classList.add('on');
    clearTimeout(sayT); sayT = setTimeout(() => s.classList.remove('on'), ms);
  }
  function banner(text, cls, ms = 1300) {
    const b = $('#aBanner'); b.className = 'abanner'; b.textContent = text; void b.offsetWidth; b.className = 'abanner on ' + (cls || '');
    clearTimeout(b._t); b._t = setTimeout(() => { b.className = 'abanner'; }, ms);
  }

  /* ---------- схватка ---------- */
  let F = null;
  const bossOf = (sec) => BOSSES[sec] || BOSSES[1];
  const VX = (x) => x * SCL, VY = (y) => FLR + y * SCL;
  const contactX = () => F.anc ? VX(F.anc.contact[0]) : SW / 2;
  const contactY = () => F.anc ? VY(F.anc.contact[1]) : SH * .55;
  const meX = () => (F.anc ? VX(F.anc.bull[0]) : SW * .3) - SW * ME_W * .45;     // левый край быка (для частиц)
  const bossX = () => (F.anc ? VX(F.anc.boss[0]) : SW * .7) - SW * F.B.w * .5;  // левый край босса
  function place() { $('#aKnob').style.left = (50 + clamp(F.p, -1, 1) * 50) + '%'; }
  const easeBack = (x) => { const c = 1.6; x = clamp(x, 0, 1) - 1; return 1 + (c + 1) * x * x * x + c * x * x; };
  /* лапа ударила в пол: пыль, искры, лёгкий толчок камеры */
  function emitPlants(an) {
    if (!an || !an.plants || !F) return;
    an.plants.forEach((pl) => {
      const x = VX(pl.x), y = FLR + 2;
      if (Math.random() < .6) burst(x, y, { n: 1, kind: 'smoke', colors: ['rgba(200,190,170,.4)', 'rgba(150,150,160,.35)'], speed: 1.2, life: 22, grav: -0.015, size: 1.3, dir: -Math.PI / 2, spread: 2.8 });
      burst(x, y, { n: 3 + Math.round(pl.e * 3), speed: 3 + pl.e * 2.5, life: 13, size: 1.8, grav: .22, dir: -Math.PI / 2, spread: 1.9 });
    });
  }
  /* рывок камеры и стоп-кадр на сильных ударах */
  function punch(k) { [chars, cv].forEach((c) => { c.style.transformOrigin = '50% 88%'; c.style.transition = 'none'; c.style.transform = 'scale(' + k + ')'; void c.offsetWidth; c.style.transition = 'transform .3s cubic-bezier(.2,.9,.3,1)'; c.style.transform = 'scale(1)'; }); }
  const ring = (x, y, c, max, life) => parts.push({ x, y, vx: 0, vy: 0, life: life || 20, max: life || 20, c, s: 4, g: 0, kind: 'ring', rad: max, r: 0, vr: 0 });
  const hype = () => { const c = $('.crowd'); if (c) { c.classList.remove('hype'); void c.offsetWidth; c.classList.add('hype'); } };
  function drawChars(dt) {
    const dec = (k, r) => { F[k] = (F[k] || 0) * Math.exp(-dt * r); };
    dec('kickM', 6); dec('kickB', 6); dec('flashM', 7); dec('flashB', 8); dec('blockT', 3); dec('charge', 3); dec('stunT', 1.4);
    F.intro = Math.min(1, (F.intro || 0) + dt / .65);
    if (me.classList.contains('ko')) F.koM = Math.min(1, (F.koM || 0) + dt * 1.6);
    if (bossEl.classList.contains('ko')) F.koB = Math.min(1, (F.koB || 0) + dt * 1.1);
    const e = easeBack(F.intro), d = Math.min(2, window.devicePixelRatio || 1);
    chx.setTransform(1, 0, 0, 1, 0, 0); chx.clearRect(0, 0, chars.width, chars.height);
    chx.setTransform(d * SCL, 0, 0, d * SCL, 0, d * FLR);
    const base = {
      key: F.B.key, t: performance.now() / 1000, p: clamp(F.p, -1.05, 1.05),
      kickM: F.kickM, kickB: F.kickB, flashM: F.flashM, flashB: F.flashB, koM: 0, koB: 0,
      col: F.duel ? F.duel.me.col : undefined, lkey: F.duel ? (F.duel.me.fk || 'bull') : 'bull', rcol: F.duel ? F.duel.rcol : undefined,
      rscars: F.duel ? (F.p > .6 ? 2 : F.p > .35 ? 1 : 0) : 0,
      scars: F.duel ? (F.p < -.6 ? 2 : F.p < -.35 ? 1 : 0) : F.scars, shield: F.shield ? 1 : 0, blockT: F.blockT, charge: F.charge, turbo: F.boost > 0, raged: F.raged,
      stun: F.stunT, hpFrac: F.hpLeft / F.hpMax, introM: -(1 - e) * 280, introB: (1 - e) * 280
    };
    if (!F.fin) { F.anc = Rig.draw(chx, base); emitPlants(F.anc); return; }
    finaleFrame(base, d);
  }
  /* ---------- финал: победитель давит проигравшего и разламывает на части ---------- */
  const eS = (x) => x * x * (3 - 2 * x);
  function startFinale(loser) {
    const cr = [];
    for (let i = 0; i < 7; i++) { let u = Math.random(), v = .15 + Math.random() * .7; const pts = [[u, v]]; for (let k = 0; k < 5; k++) { u = clamp(u + (Math.random() - .5) * .3, 0, 1); v = clamp(v + (Math.random() - .5) * .4, 0, 1); pts.push([u, v]); } cr.push(pts); }
    F.fin = { loser, t0: performance.now(), pStart: F.p, pEnd: loser === 'boss' ? Math.max(F.p, .22) : Math.min(F.p, -.22), broken: false, tiles: null, cracks: cr, sx: 1, sy: 1, pivot: 0, c0: 0, tb: 0 };
    F.kickM = F.kickB = 0;
  }
  function finaleFrame(base, d) {
    const fin = F.fin, el = (performance.now() - fin.t0) / 1000, dt = 1 / 60;
    const pUse = fin.pStart + (fin.pEnd - fin.pStart) * eS(clamp(el / .45, 0, 1));
    const winnerHide = fin.loser, loserHide = fin.loser === 'boss' ? 'bull' : 'boss';
    const sqPivot = fin.pivot, sx = fin.sx;
    if (!fin.broken) {
      const flick = Math.sin(el * 55) > 0 ? .5 : 0;
      offX.setTransform(1, 0, 0, 1, 0, 0); offX.clearRect(0, 0, offC.width, offC.height); offX.setTransform(d * SCL, 0, 0, d * SCL, 0, d * FLR);
      const lr = Rig.draw(offX, Object.assign({}, base, { p: pUse, hide: loserHide, introM: 0, introB: 0, kickM: 0, kickB: 0, flashM: flick, flashB: flick, stun: 0 }));
      fin.c0 = lr.contact[0]; fin.pivot = fin.loser === 'boss' ? lr.bossRear[0] + 24 : lr.bullRear[0] - 20;
      const e = eS(clamp(el / 1.3, 0, 1)); fin.sx = 1 - .6 * e; fin.sy = 1 + .28 * (1 - fin.sx); fin.e = e;
    }
    const front = fin.pivot + (fin.c0 - fin.pivot) * fin.sx, shift = front - fin.c0;
    F.anc = Rig.draw(chx, Object.assign({}, base, { p: pUse, hide: winnerHide, introM: shift, introB: fin.loser === 'bull' ? shift : 0 }));
    emitPlants(F.anc);
    if (!fin.broken) {
      const jx = Math.sin(el * 70) * 1.6 * fin.e, jy = Math.sin(el * 53) * 1.2 * fin.e;
      chx.save(); chx.translate(fin.pivot + jx, jy); chx.scale(fin.sx, fin.sy); chx.translate(-fin.pivot, 0);
      chx.drawImage(offC, 0, -FLR / SCL, offC.width / (d * SCL), offC.height / (d * SCL)); chx.restore();
      // трещины проступают по мере сжатия
      const x0 = Math.min(fin.pivot, front), x1 = Math.max(fin.pivot, front), w = x1 - x0;
      chx.lineCap = 'round'; chx.lineJoin = 'round';
      fin.cracks.forEach((pts, ci) => {
        const vis = clamp(fin.e * 1.4 - ci * .08, 0, 1), n = Math.ceil(vis * (pts.length - 1)); if (n < 1) return;
        chx.beginPath(); pts.slice(0, n + 1).forEach(([u, v], i) => { const X = x0 + w * u, Y = -20 - 160 * v; i ? chx.lineTo(X, Y) : chx.moveTo(X, Y); });
        chx.strokeStyle = '#0b0e16'; chx.lineWidth = 3.2; chx.stroke(); chx.strokeStyle = 'rgba(255,170,60,.95)'; chx.lineWidth = 1.2; chx.stroke();
      });
      // искры, шестерни, дым и скрип из сжимаемой туши
      const e = fin.e, rx = () => VX(x0 + Math.random() * w), ry = () => VY(-30 - Math.random() * 130);
      for (let i = every('fx', 16 + 70 * e, dt); i--;) burst(rx(), ry(), { n: 2, speed: 6, life: 20, size: 2.2 });
      for (let i = every('fg', 2 + 9 * e, dt); i--;) { if (Math.random() < .6) gears(rx(), ry(), 1, -Math.PI / 2 + (fin.loser === 'boss' ? .5 : -.5)); else bolts(rx(), ry(), 2); }
      for (let i = every('fm', 8 * e, dt); i--;) burst(rx(), ry(), { n: 1, kind: 'smoke', colors: ['rgba(70,70,80,.6)'], speed: 1, life: 55, grav: -.05, size: 4 });
      for (let i = every('fb', 4, dt); i--;) { const gx = rx(), gy = ry(); burst(gx, gy, { n: 8, colors: ['#fff6c2', '#ff8a1e'], speed: 8, life: 14, size: 2.6 }); }
      for (let i = every('sn', 5, dt); i--;) { SFX.creak(); vib(15); }
      for (let i = every('sk', 3.5, dt); i--;) anim(stage, 'shake', 220);
      if (el >= 1.35) doBreak(d);
    } else drawTiles(d, dt);
  }
  function doBreak(d) {
    const fin = F.fin; fin.broken = true; fin.tb = performance.now();
    tmpX.setTransform(1, 0, 0, 1, 0, 0); tmpX.clearRect(0, 0, tmpC.width, tmpC.height); tmpX.setTransform(d * SCL, 0, 0, d * SCL, 0, d * FLR);
    tmpX.save(); tmpX.translate(fin.pivot, 0); tmpX.scale(fin.sx, fin.sy); tmpX.translate(-fin.pivot, 0);
    tmpX.drawImage(offC, 0, -FLR / SCL, offC.width / (d * SCL), offC.height / (d * SCL)); tmpX.restore();
    const front = fin.pivot + (fin.c0 - fin.pivot) * fin.sx, x0 = Math.min(fin.pivot, front) - 90, x1 = Math.max(fin.pivot, front) + 90, y0 = -260, y1 = 6;
    const COLS = 7, ROWS = 5, V = [];
    for (let j = 0; j <= ROWS; j++) { V[j] = []; for (let i = 0; i <= COLS; i++) { const edge = i === 0 || j === 0 || i === COLS || j === ROWS, jt = edge ? 0 : .3; V[j][i] = [x0 + (x1 - x0) * (i + (Math.random() - .5) * jt) / COLS, y0 + (y1 - y0) * (j + (Math.random() - .5) * jt) / ROWS]; } }
    const dir = fin.loser === 'boss' ? 1 : -1, tiles = [], k = d * SCL;
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      const q = [V[j][i], V[j][i + 1], V[j + 1][i + 1], V[j + 1][i]], cxq = q.reduce((a, p) => a + p[0], 0) / 4, cyq = q.reduce((a, p) => a + p[1], 0) / 4;
      const bx0 = Math.max(0, Math.floor(Math.min(...q.map((p) => p[0])) * k)), bx1 = Math.min(tmpC.width, Math.ceil(Math.max(...q.map((p) => p[0])) * k));
      const by0 = Math.max(0, Math.floor(d * FLR + Math.min(...q.map((p) => p[1])) * k)), by1 = Math.min(tmpC.height, Math.ceil(d * FLR + Math.max(...q.map((p) => p[1])) * k));
      if (bx1 - bx0 < 2 || by1 - by0 < 2) continue;
      const im = tmpX.getImageData(bx0, by0, bx1 - bx0, by1 - by0).data; let a = 0; for (let n = 3; n < im.length; n += 16) a += im[n] > 40 ? 1 : 0;
      if (a < im.length / 16 * .08) continue;
      tiles.push({ q, c0x: cxq, c0y: cyq, x: cxq, y: cyq, r: 0, vx: dir * (10 + Math.random() * 110) - dir * 60 * Math.random() + (cxq - (x0 + x1) / 2) * 1.1, vy: -(260 + Math.random() * 520 + (1 - (cyq - y0) / (y1 - y0)) * 120), vr: (Math.random() - .5) * 14, rest: false });
    }
    fin.tiles = tiles;
    const bxp = VX(front), byp = VY(-110);
    anim(stage, 'shake big', 800); anim($('#aVign'), 'white', 350); anim($('#aVign'), 'red', 700); punch(1.1); ring(bxp, byp, 'rgba(255,255,255,.95)', 230, 34); ring(bxp, byp, 'rgba(255,170,60,.8)', 160, 28);
    burst(bxp, byp, { n: 90, speed: 14, size: 4 }); burst(bxp, byp, { n: 40, colors: ['#ffffff', '#ffd24a', '#ff6a1e'], speed: 9, life: 50, size: 5 });
    burst(bxp, byp, { n: 16, kind: 'gear', colors: ['#9aa6bd', '#c3ccdc', '#6f7a90', '#d9a441', F.B.color], speed: 10, life: 95, grav: .32, size: 4, dir: -Math.PI / 2, spread: 3.4 });
    burst(bxp, byp, { n: 16, kind: 'bolt', colors: ['#cfd6e4', '#8892a6'], speed: 10, life: 70, grav: .35, size: 3, dir: -Math.PI / 2, spread: 3.4 });
    burst(bxp, byp, { n: 14, kind: 'smoke', colors: ['rgba(120,120,130,.55)', 'rgba(50,50,60,.5)'], speed: 3, life: 90, grav: -.04, size: 7 });
    SFX.burst(); vib([80, 40, 160]);
  }
  function drawTiles(d, dt) {
    const fin = F.fin, age = (performance.now() - fin.tb) / 1000;
    fin.tiles.forEach((t) => {
      if (!t.rest) {
        t.vy += 1100 * dt; t.x += t.vx * dt; t.y += t.vy * dt; t.r += t.vr * dt;
        if (t.y > -8) { t.y = -8; t.vy *= -.35; t.vx *= .6; t.vr *= .55; if (Math.abs(t.vy) < 35) { t.vy = 0; t.vx *= .5; } }
        if (t.y >= -8 && t.vy === 0 && Math.abs(t.vx) < 6) t.rest = true;
      }
      chx.save(); chx.globalAlpha = clamp(1 - (age - 2) / 1.2, 0, 1);
      chx.translate(t.x, t.y); chx.rotate(t.r); chx.translate(-t.c0x, -t.c0y);
      chx.beginPath(); t.q.forEach((p, i) => i ? chx.lineTo(p[0], p[1]) : chx.moveTo(p[0], p[1])); chx.closePath();
      chx.save(); chx.clip(); chx.drawImage(tmpC, 0, -FLR / SCL, tmpC.width / (d * SCL), tmpC.height / (d * SCL)); chx.restore();
      chx.lineWidth = 1.6; chx.strokeStyle = '#0b0e16'; chx.stroke();
      chx.restore();
      if (!t.rest && Math.random() < .25) burst(VX(t.x), VY(t.y), { n: 1, speed: 2, life: 14, size: 2, grav: .1 });
    });
  }
  function paused(now) {
    return !G || F.ko || now < F.hold || G.i >= G.q.length || !$('#gNext').hidden || !$('#lesson').hidden || document.hidden;
  }
  let raf = 0, last = 0, acc = {};
  const every = (key, perSec, dt) => { acc[key] = (acc[key] || 0) + perSec * dt; const n = Math.floor(acc[key]); acc[key] -= n; return n; };
  function loop(t) {
    if (!F) { raf = 0; return; }
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    const now = Date.now(), prev = F.p;
    if (!paused(now)) F.pt -= F.B.rate * (F.raged ? 1.35 : 1) * (G.practice ? 0.8 : 1) * dt;
    if (F.koDir) F.pt += F.koDir * dt * 1.4;
    F.p += (F.pt - F.p) * Math.min(1, dt * 9);
    if (!F.ko && F.pt <= -1) F.duel ? duelWall(false) : wallHit();
    if (!F.ko && F.pt >= 1) F.duel ? duelWall(true) : bossWall();
    place();
    if (!chars.width || !chars.height || !offC.width || !offC.height) fitCanvas(); // холсты нулевого размера рисовать нельзя
    if (chars.width && chars.height && offC.width && offC.height && performance.now() >= (F.freeze || 0)) drawChars(dt);
    emit(dt, (F.p - prev) / Math.max(dt, 1e-3));
    drawParts();
    raf = requestAnimationFrame(loop);
  }
  /* постоянные эффекты: искры в точке схватки, пыль из-под ног, разваливающийся бык */
  function emit(dt, speed) {
    const x = contactX(), y = contactY();
    const danger = clamp(clamp((-F.p - 0.25) / 0.75, 0, 1) + 0.22 * F.scars, 0, 1.4);
    const bdanger = clamp((F.p - 0.25) / 0.75, 0, 1) + 0.6 * (1 - F.hpLeft / F.hpMax);
    if (!F.ko) {
      for (let i = every('c', 10 + 14 * Math.abs(F.p), dt); i--;) burst(x, y + (Math.random() - 0.5) * SH * 0.12, { n: 2, speed: 4, life: 18, size: 2 });
      if (speed < -0.05) for (let i = every('dm', 14, dt); i--;) burst(meX() + SW * ME_W * 0.2, SH * 0.92, { n: 1, kind: 'smoke', colors: ['rgba(150,150,160,.35)'], speed: 1.2, life: 40, grav: -0.02, size: 3 });
      if (speed > 0.05) for (let i = every('db', 14, dt); i--;) burst(bossX() + SW * F.B.w * 0.75, SH * 0.92, { n: 1, kind: 'smoke', colors: ['rgba(150,150,160,.35)'], speed: 1.2, life: 40, grav: -0.02, size: 3 });
    }
    const mx = F.anc ? VX(F.anc.bull[0]) : SW * .3, my = F.anc ? VY(F.anc.bull[1]) : SH * .5;
    if (!F.ko && F.anc && !paused(Date.now())) {
      const A_ = F.anc, strain = clamp(.5 + Math.abs(speed) * .35 + Math.abs(F.p) * .25, 0, 1.4), fl = FLR;
      // копыта быка скребут пол: искры веером назад
      for (let i = every('fs1', 9 + 26 * strain, dt); i--;) burst(VX(A_.bullFront[0] - Math.random() * 55), fl, { n: 2, speed: 5 + 4 * strain, life: 15, size: 2.2, grav: .3, dir: -Math.PI * .86, spread: .75 });
      for (let i = every('fs2', 6 + 18 * strain, dt); i--;) burst(VX(A_.bullRear[0] + Math.random() * 30), fl, { n: 2, speed: 5 + 3 * strain, life: 14, size: 2, grav: .3, dir: -Math.PI * .84, spread: .75 });
      // лапы босса — искры вперёд-вверх
      for (let i = every('fs3', 7 + 22 * strain, dt); i--;) burst(VX(A_.boss[0] + (Math.random() - .3) * 120), fl, { n: 2, speed: 5 + 3 * strain, life: 15, size: 2.2, grav: .3, dir: -Math.PI * .14, spread: .75, colors: ['#fff6c2', '#ffd24a', F.B.color] });
      // пар из труб от натуги
      for (let i = every('st1', 3 + 11 * strain, dt); i--;) burst(VX(A_.bull[0] - 24 + Math.random() * 14), VY(A_.bull[1] - 42), { n: 1, kind: 'smoke', colors: ['rgba(238,243,250,.6)', 'rgba(206,214,226,.5)'], speed: 1.7, life: 36, grav: -.05, size: 3.2, dir: -Math.PI / 2 - .2, spread: .6 });
      for (let i = every('st2', 2 + 8 * strain, dt); i--;) burst(VX(A_.boss[0] + (Math.random() - .5) * 60), VY(A_.boss[1] - 40), { n: 1, kind: 'smoke', colors: ['rgba(238,243,250,.55)', 'rgba(206,214,226,.45)'], speed: 1.5, life: 34, grav: -.05, size: 3, dir: -Math.PI / 2 + .2, spread: .6 });
    }
    if (danger > 0.05) {
      for (let i = every('ms', 10 * danger, dt); i--;) burst(mx - SW * 0.08, my - SH * 0.12, { n: 1, kind: 'smoke', colors: ['rgba(90,90,100,.55)', 'rgba(60,60,70,.5)'], speed: 1, life: 55, grav: -0.05, size: 4, dir: -Math.PI / 2, spread: 0.8 });
      for (let i = every('mk', 9 * danger, dt); i--;) burst(mx + (Math.random() - 0.5) * SW * 0.18, my + (Math.random() - 0.5) * SH * 0.25, { n: 4, speed: 4, life: 16, size: 2 });
      if (danger > 0.45) for (let i = every('mg', 2.2 * danger, dt); i--;) { if (Math.random() < 0.6) gears(mx, my - 10, 1, -Math.PI / 2 - 0.6); else bolts(mx, my, 2, -Math.PI / 2 - 0.4); }
    }
    me.classList.toggle('danger', danger > 0.6);
    $('#aWarn').classList.toggle('on', !F.ko && F.p < -0.62);
    $('#aWallL').style.setProperty('--hot', clamp((-F.p - 0.5) * 2, 0, 1));
    $('#aWallR').style.setProperty('--hot', clamp((F.p - 0.5) * 2, 0, 1));
    const bx = bossX() + SW * F.B.w * 0.5;
    if (bdanger > 0.3 && !F.ko) {
      for (let i = every('bs', 6 * bdanger, dt); i--;) burst(bx + SW * 0.06, my - SH * 0.12, { n: 1, kind: 'smoke', colors: ['rgba(90,90,100,.5)'], speed: 1, life: 50, grav: -0.05, size: 4, dir: -Math.PI / 2, spread: 0.8 });
      if (bdanger > 0.6) for (let i = every('bg', 1.2 * bdanger, dt); i--;) gears(bx, my, 1, -Math.PI / 2 + 0.6, [F.B.color, '#9aa6bd', '#6f7a90']);
    }
    grindSet(F.ko ? 0 : clamp(0.3 + danger * 0.7, 0, 1));
  }

  function setHp() {
    if (!F) return;
    const b = Math.max(0, F.hpLeft / F.hpMax), p = Math.max(0, G ? G.hearts / 3 : 1);
    $('#aBHp').style.width = b * 100 + '%'; $('#aPHp').style.width = p * 100 + '%';
    setTimeout(() => { if (!F) return; $('#aBLag').style.width = Math.max(0, F.hpLeft / F.hpMax) * 100 + '%'; if (G) $('#aPLag').style.width = Math.max(0, G.hearts / 3) * 100 + '%'; }, 450);
    bossEl.classList.toggle('rage', b > 0 && b <= 0.34);
    if (!F.raged && b > 0 && b <= 0.34) { F.raged = true; setTimeout(() => { if (F && !F.ko) { say(F.B.rage); SFX.roar(); banner('БОСС В ЯРОСТИ', 'lose', 1100); } }, 500); }
  }
  function renderMods() {
    modsBox.querySelectorAll('.mod').forEach((b) => {
      const k = b.dataset.k, n = A.items[k] || 0;
      b.querySelector('.cnt').textContent = '×' + n;
      const active = (k === 'shield' && F && F.shield) || (k === 'rocket' && F && F.boost > 0);
      const cardOk = k !== 'claw' || (G && G.i < G.q.length && !$('#gOpts').hidden && !F.clawUsed && [...$('#gOpts').children].every((o) => !o.disabled));
      b.classList.toggle('on', !!active);
      b.disabled = !F || F.ko || !n || active || !cardOk;
    });
  }

  function start(g) {
    const sec = g.arena.sec, DU = g.arena.duel || null, B = DU ? duelBoss(DU) : bossOf(sec);
    F = {duel: DU, sec, B, hpMax: g.q.length, hpLeft: g.q.length, dmg: 0, boost: 0, shield: false, ko: false, raged: false, clawUsed: false,
      p: 0, pt: 0, hold: Date.now() + 2600, scars: 0, koDir: 0, kickM: 0, kickB: 0, flashM: 0, flashB: 0, blockT: 0, charge: 0, stunT: 0, fin: null, anc: null };
    game.classList.add('arena'); stageWrap.hidden = false;
    game.classList.toggle('duelmode', !!DU); modsBox.hidden = !!DU;
    const chips = (box, list) => { box.textContent = ''; list.forEach((x) => { const c = el('span', 'dchip'); c.style.setProperty('--c', x.col); c.append(el('i', '', x.av), el('b', '', x.name)); box.append(c); }); };
    const CO = g.arena.coop || null; F.coop = CO; F.team = { right: 0, wrong: 0, done: 0 };
    if (DU) { chips($('#aMName'), [DU.me, ...DU.mates]); chips($('#aBName'), DU.foes); } else if (CO) { chips($('#aMName'), [CO.me, ...CO.mates]); $('#aBName').textContent = B.name.toUpperCase(); } else { $('#aMName').textContent = 'МЕХ-БЫК'; $('#aBName').textContent = B.name.toUpperCase(); }
    if (DU) { F.hpMax = F.hpLeft = 1; F.hold = Date.now() + 1800; }
    if (CO) { F.hpMax = F.hpLeft = g.q.length * CO.n; } // общее здоровье босса на весь отряд
    bossEl.className = ''; me.className = '';
    $('#aBLag').style.width = '100%'; $('#aPLag').style.width = '100%';
    stage.querySelectorAll('.ftxt').forEach((n) => n.remove());
    parts = []; acc = {};
    renderSound(); fitCanvas(); place(); setHp(); renderMods();
    anim(me, 'enter', 700); anim(bossEl, 'enterB', 700);
    setTimeout(() => { // столкновение лоб в лоб
      if (!F) return;
      anim(stage, 'shake big', 600); anim($('#aVign'), 'white', 300);
      burst(contactX(), contactY(), { n: 70, speed: 12, size: 4 }); gears(contactX(), contactY(), 3); bolts(contactX(), contactY(), 4);
      ring(contactX(), contactY(), 'rgba(255,235,170,.95)', 200, 30); ring(contactX(), contactY(), 'rgba(255,255,255,.7)', 120, 22); punch(1.07); hype();
      SFX.clash(); vib([50, 30, 80]);
      banner(g.practice ? 'ТРЕНИРОВКА' : 'СХВАТКА!', 'go');
      grindOn();
    }, 640);
    setTimeout(() => { if (F) { say(B.start); SFX.roar(); } }, 1500);
    last = 0; if (!raf) raf = requestAnimationFrame(loop);
  }
  function stop() { if (window.Duel) Duel.onStop(); F = null; game.classList.remove('duelmode'); modsBox.hidden = false; grindOff(); game.classList.remove('arena'); stageWrap.hidden = true; parts = []; }

  /* верный вариант — бык толкает сразу; неверный — рывок босса */
  function onPick(right) {
    if (!F || F.ko) return;
    const c = G.q[G.i];
    if (F.duel) {
      const D = F.duel, crit = right && Date.now() - G.t0 < (6000 + 35 * c.q.length);
      const d = D.calc(right, crit, F.p);
      if (right) shove(crit, d); else duelSlip(d);
      D.send({ t: 'push', d, crit: crit ? 1 : 0 });
      return;
    }
    if (right) {
      F.crit = Date.now() - G.t0 < 6000 + 35 * c.q.length || (G.combo > 0 && (G.combo + 1) % 3 === 0);
      shove(F.crit);
    } else { bossSlam(); F.hurtShown = true; }
    if (F.coop) F.coop.send({ t: right ? 'hit' : 'miss', crit: right && F.crit ? 1 : 0 });
    renderMods();
  }
  function shove(crit, amt) {
    const turbo = F.boost > 0, push = amt != null ? amt : (crit ? 0.5 : 0.36) * (turbo ? 1.5 : 1);
    anim(me, turbo ? 'shove turbo' : 'shove', 520); anim(bossEl, 'pushed', 520);
    F.pt = Math.min(1.05, F.pt + push); F.hold = Date.now() + 1100;
    setTimeout(() => {
      if (!F) return;
      const x = contactX(), y = contactY();
      anim(stage, crit ? 'shake big' : 'shake', crit ? 600 : 380);
      if (crit) { anim($('#aVign'), 'white', 300); SFX.crit(); vib([30, 20, 50]); } else { SFX.shove(); vib(30); }
      burst(x, y, { n: crit ? 60 : 36, speed: crit ? 12 : 8, size: crit ? 4 : 3 });
      ring(x, y, crit ? 'rgba(255,230,150,.9)' : 'rgba(255,255,255,.7)', crit ? 150 : 95, crit ? 26 : 20); punch(crit ? 1.06 : 1.028);
      burst(meX() + SW * .05, SH * .6, { n: crit ? 14 : 8, speed: 15, dir: Math.PI, spread: .18, life: 13, size: 1.5, grav: 0, colors: ['rgba(255,255,255,.75)'] });
      if (crit) { F.freeze = performance.now() + 85; hype(); }
      gears(x + 10, y - 10, crit ? 3 : 1, -Math.PI / 2 + 0.5, [F.B.color, '#9aa6bd', '#6f7a90']);
      if (turbo) burst(meX() + SW * 0.04, SH * 0.55, { n: 30, colors: ['#ffe066', '#ff8a1e', '#ff4d1e'], speed: 6, dir: Math.PI, spread: 0.8, life: 26, grav: 0, kind: 'fire' });
    }, 140);
  }
  function bossSlam() {
    anim(bossEl, 'slam', 520);
    setTimeout(() => {
      if (!F) return;
      const x = contactX(), y = contactY();
      if (F.shield || F.blockNext) {
        F.blockNext = false; me.classList.remove('shielded');
        anim(me, 'block', 700); SFX.block(); vib(25);
        burst(x, y, { n: 34, colors: ['#bfefff', '#5cc8ff', '#ffffff'], speed: 7, life: 30 });
        floatText('БЛОК!', x, y - 60, 'blk');
        return;
      }
      F.pt -= 0.33; F.hold = Date.now() + 500;
      anim(me, 'hurt', 600); anim(stage, 'shake', 450); anim($('#aVign'), 'red', 650);
      SFX.slam(); vib([60, 40, 60]);
      const k = F.B.key;
      burst(x, y, { n: 36, colors: [F.B.color, '#ffd24a', '#fff'], speed: 8, life: 30, kind: k === 'serpent' ? 'star' : 'spark', dir: Math.PI, spread: 2.6 });
      if (k === 'dragon') burst(x + 20, y - SH * 0.14, { n: 26, colors: ['#fff6c2', '#ffb02e', '#ff4d1e'], speed: 7, dir: Math.PI, spread: 0.6, life: 22, grav: -0.02, kind: 'fire', size: 4 });
      gears(x - 20, y, 2, -Math.PI / 2 - 0.6); bolts(x - 20, y, 2, -Math.PI / 2 - 0.5);
      floatText('−1 ❤', x - 30, y - 70, 'hurt');
    }, 200);
  }
  /* ---------- дуэль ---------- */
  function duelSlip(d) { // моя ошибка: бык откатывается
    anim(me, 'hurt', 600); anim(stage, 'shake', 300); SFX.slam(); vib(30);
    F.pt = Math.max(-1.05, F.pt + d);
    const x = contactX(), y = contactY();
    burst(x, y, { n: 18, colors: ['#ffd24a', '#fff'], speed: 6, life: 24, dir: Math.PI, spread: 2.4 });
    floatText('ошибка', x - 40, y - 60, 'hurt');
  }
  function duelMsg(d, crit, av, mate) { // чужой толчок или чужая ошибка
    if (!F || F.ko) return;
    const x = contactX(), y = contactY();
    if (mate) { // свой напарник: тянет в нашу сторону
      F.pt = clamp(F.pt + d, -1.05, 1.05);
      if (d > 0) { anim(me, 'charge', 500); floatText(av + ' ' + (crit ? 'КРИТ!' : '+'), x - SW * .25, y - 80, crit ? 'critw' : ''); }
      return;
    }
    F.pt = clamp(F.pt - d, -1.05, 1.05);
    if (d > 0) {
      anim(bossEl, 'slam', 520); anim(me, 'hurt', 600); anim(stage, crit ? 'shake big' : 'shake', crit ? 500 : 350);
      SFX.slam(); vib(crit ? [50, 30, 60] : 30);
      burst(x, y, { n: crit ? 46 : 28, colors: [F.B.color, '#ffd24a', '#fff'], speed: crit ? 10 : 7, life: 28, dir: Math.PI, spread: 2.6 });
      ring(x, y, 'rgba(255,120,90,.85)', crit ? 140 : 90, crit ? 26 : 20); punch(crit ? 1.05 : 1.025); if (crit) { F.freeze = performance.now() + 80; hype(); }
      gears(x - 20, y, crit ? 3 : 1, -Math.PI / 2 - 0.6);
      floatText(av + (crit ? ' КРИТ!' : ''), x + 30, y - 80, crit ? 'critw' : 'hurt');
    } else { anim(bossEl, 'hit', 500); floatText(av + ' ошибся', x + 30, y - 70, 'turbo'); }
  }
  function duelWall(won) {
    if (F.wallSent) return; F.wallSent = true;
    F.duel.localEnd(won);
  }
  function duelFinish(won, why) {
    if (!F || F.ko) return;
    F.ko = true; F.duelRes = { won, why }; renderMods();
    ['#gGrades', '#gShow', '#gNext', '#gExplain', '#gOpts'].forEach((q) => { $(q).hidden = true; });
    $('.flash').classList.add('kofade'); $('#aWarn').classList.remove('on');
    const g = G, go = () => { if (G === g && !g.done) finish(); };
    if (won === null) { banner('НИЧЬЯ', 'go', 1600); setTimeout(go, 2200); return; }
    if (won) g.xp += 25;
    if (why === 'left') { banner('СОПЕРНИК ВЫШЕЛ', 'win', 1500); setTimeout(go, 2000); return; }
    setTimeout(() => { if (F) { anim(won ? me : bossEl, 'shove', 520); startFinale(won ? 'boss' : 'bull'); SFX.grind && SFX.grind(); } }, 250);
    setTimeout(() => { if (F) { banner(won ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ', won ? 'win' : 'lose', 1600); won ? SFX.win() : SFX.lose(); vib([40, 30, 40, 30, 120]); } }, 1950);
    setTimeout(go, 4300);
  }
  /* ---------- босс вместе ---------- */
  function coopMsg(t, av, crit, won) { // что сделал друг из отряда
    if (!F || !F.coop) return;
    const x = contactX(), y = contactY();
    if (t === 'left') { floatText(av + ' вышел', SW * .3, y - 90, 'turbo'); return; }
    if (t === 'done') { F.team.done++; floatText(av + (won ? ' прошёл свои вопросы ✓' : ' выбыл'), SW * .3, y - 100, won ? 'critw' : 'turbo'); return; }
    if (F.ko) return;
    if (t === 'hit') {
      F.team.right++; F.hpLeft = Math.max(1, F.hpLeft - 1); // добивает каждый сам, своими вопросами
      F.pt = clamp(F.pt + (crit ? .22 : .15), -1.05, 1.05);
      anim(me, 'charge', 500); anim(bossEl, 'pushed', 450); SFX.shove(); vib(15);
      burst(x, y, { n: crit ? 30 : 18, speed: 7, size: 3 });
      floatText(av + (crit ? ' КРИТ!' : ' −10'), x - SW * .18, y - 80, crit ? 'critw' : '');
      setHp();
    } else { F.team.wrong++; floatText(av + ' ошибся', x + 20, y - 70, 'turbo'); }
  }
  function coopQueue(sec, n) { // свои карточки: сначала к повторению, потом новые, потом тренировка
    if (hasLevels(sec)) return levelQueue(sec, n)[0];
    if (sec === SESSION) return sessionQueue(n)[0];
    const sc = scopeOf(sec), seen = new Set(), q = [];
    const add = (list) => list.forEach((c) => { if (q.length < n && !seen.has(c.id)) { seen.add(c.id); q.push(c); } });
    add(dueCards(sc)); add(S.cards.filter((c) => sectionOf(c) === sec && !c.seen)); add(shuffle(practiceCards(sc))); add(shuffle(S.cards.filter((c) => sectionOf(c) === sec)));
    return q;
  }
  function coopFight(sec, q, C) {
    hideHub();
    launch(q, { practice: false, extra: false, scope: scopeOf(sec), size: q.length, arena: { sec, coop: C } });
  }
  /* быка дожали до стены */
  function wallHit() {
    const x = SW * 0.04, y = SH * 0.55;
    if (F.shield) {
      F.shield = false; me.classList.remove('shielded'); F.pt = -0.55; F.hold = Date.now() + 1200;
      anim(me, 'block', 700); SFX.block(); burst(x + 30, y, { n: 40, colors: ['#bfefff', '#5cc8ff', '#fff'], speed: 8 });
      floatText('ЩИТ ВЫДЕРЖАЛ', SW * 0.3, y - 70, 'blk'); renderMods();
      return;
    }
    G.hearts--; F.scars++; F.pt = -0.45; F.hold = Date.now() + 1500;
    me.classList.add('d' + Math.min(2, F.scars));
    anim(me, 'hurt', 700); anim(stage, 'shake big', 700); anim($('#aVign'), 'red', 800); anim($('#aWallL'), 'smash', 600);
    SFX.crash(); vib([90, 40, 120]);
    burst(x, y, { n: 70, speed: 11, size: 4, dir: 0, spread: 2.4 });
    gears(SW * 0.15, y - 20, 6, -Math.PI / 2 + 0.4); bolts(SW * 0.15, y, 6, -Math.PI / 2 + 0.3);
    burst(SW * 0.15, y, { n: 10, kind: 'smoke', colors: ['rgba(90,90,100,.6)'], speed: 2, life: 70, grav: -0.04, size: 6 });
    banner('В СТЕНУ!', 'lose', 1100); floatText('−1 ❤', SW * 0.28, y - 80, 'hurt');
    setHp();
    if (G.hearts <= 0) beforeFinish(G);
  }
  /* босса впечатали в стену: оглушён, бонус */
  function bossWall() {
    F.pt = 0.55; F.hold = Date.now() + 2800;
    anim(bossEl, 'hit', 600); anim(stage, 'shake big', 700); anim($('#aWallR'), 'smash', 600);
    SFX.crash(); vib([60, 30, 90]);
    const x = SW * 0.96, y = SH * 0.55;
    burst(x, y, { n: 70, speed: 11, size: 4, dir: Math.PI, spread: 2.4 });
    gears(SW * 0.85, y - 20, 6, -Math.PI / 2 - 0.4, [F.B.color, '#9aa6bd', '#6f7a90']); bolts(SW * 0.85, y, 5, -Math.PI / 2 - 0.3);
    G.xp += 10;
    banner('В СТЕНУ!', 'win', 1100); floatText('ОГЛУШЁН · +10 XP', SW * 0.62, y - 85, 'turbo');
  }

  /* оценка карточки (после выбора варианта): урон, полоска, комбо */
  function onGrade(g, gain) {
    if (!F) return;
    const c = $('#aCombo');
    if (F.duel) {
      if (g && G.combo >= 3) { c.textContent = 'КОМБО ×' + G.combo; c.className = 'acombo'; void c.offsetWidth; c.className = 'acombo on' + (G.combo >= 6 ? ' hot' : ''); } else c.className = 'acombo';
      return;
    }
    if (g === 0) {
      if (!F.hurtShown) bossSlam();
      F.hurtShown = false; c.className = 'acombo';
      setTimeout(setHp, 60);
    } else {
      F.hpLeft = Math.max(0, F.hpLeft - 1);
      const dmg = gain * 10; F.dmg += dmg;
      const x = contactX() + SW * 0.08, y = contactY();
      floatText('−' + dmg, x + (Math.random() * 30 - 15), y - 70, F.crit ? 'crit' : F.boost > 0 ? 'turbo' : '');
      if (F.crit) floatText('КРИТ!', x, y - 110, 'critw');
      if (F.boost > 0) F.boost--;
      F.crit = false;
      setHp();
      if (G.combo >= 2) { c.textContent = 'КОМБО ×' + G.combo; c.className = 'acombo'; void c.offsetWidth; c.className = 'acombo on' + (G.combo >= 5 ? ' hot' : ''); }
    }
    F.clawUsed = false;
    setTimeout(renderMods, 50);
  }
  function useShield() { // ошибка при включённом щите: сердце не теряется
    if (F && F.duel) return true; // в дуэли сердец нет
    if (!F || !F.shield) return false;
    F.shield = false;
    if (F.hurtShown) me.classList.remove('shielded'); else F.blockNext = true;
    return true;
  }
  function boost(gain) { return F && F.boost > 0 ? gain * 2 : gain; }
  function useMod(k) {
    if (!F || !(A.items[k] > 0)) return;
    if (k === 'claw') {
      const wrong = [...$('#gOpts').children].filter((o) => !o.dataset.right && !o.disabled);
      if (!wrong.length) return;
      shuffle(wrong).slice(0, 2).forEach((o, i) => setTimeout(() => { o.classList.add('grabbed'); o.disabled = true; }, i * 220));
      F.clawUsed = true; anim(me, 'charge', 700); F.hold = Math.max(F.hold, Date.now() + 1500);
    }
    if (k === 'shield') { F.shield = true; me.classList.add('shielded'); }
    if (k === 'rocket') { F.boost = 3; anim(me, 'charge', 700); burst(meX() + SW * 0.05, SH * 0.55, { n: 30, colors: ['#ffe066', '#ff8a1e', '#ff4d1e'], speed: 5, dir: Math.PI, spread: 0.9, life: 30, grav: 0, kind: 'fire' }); }
    A.items[k]--; save();
    SFX.power(); vib(20);
    banner(MODS[k].name.toUpperCase(), 'mod', 900);
    renderMods();
  }

  /* конец боя: босса выталкивают с арены или быка впечатывают в стену */
  function beforeFinish(g) {
    if (!F) return false;
    if (F.ko) return true; // добивание уже идёт
    F.ko = true; renderMods();
    ['#gGrades', '#gShow', '#gNext', '#gExplain', '#gOpts'].forEach((q) => { $(q).hidden = true; });
    $('.flash').classList.add('kofade');
    $('#aWarn').classList.remove('on');
    const won = g.hearts > 0;
    if (F.coop && window.Duel) Duel.coopDone(won);
    const go = () => { if (G === g && !g.done) finish(); };
    if (won) {
      setTimeout(() => {
        if (!F) return;
        say(F.B.die, 1700); anim(me, 'shove', 520); startFinale('boss'); SFX.grind && SFX.grind();
      }, 350);
      setTimeout(() => { if (F) { banner('ПОБЕДА!', 'win', 1600); SFX.win(); vib([40, 30, 40, 30, 120]); } }, 2000);
      setTimeout(go, 4300);
    } else {
      setTimeout(() => { if (!F) return; startFinale('bull'); say(F.B.win, 1800); }, 500);
      setTimeout(() => { if (F) { banner('ПОРАЖЕНИЕ', 'lose', 1500); SFX.lose(); } }, 2150);
      setTimeout(go, 4300);
    }
    return true;
  }

  /* лут после победы */
  function loot(flawless) {
    const keys = Object.keys(MODS), got = [];
    for (let i = 0; i < (flawless ? 2 : 1); i++) { const k = keys[Math.floor(Math.random() * keys.length)]; A.items[k] = (A.items[k] || 0) + 1; got.push(k); }
    return got;
  }
  function result(r, g, up, lvl) {
    if (g.arena.duel) return duelResult(r, g, up, lvl);
    const B = F ? F.B : bossOf(g.arena.sec), sec = g.arena.sec, won = g.hearts > 0;
    const dmg = F ? F.dmg : 0;
    grindOff();
    r.classList.add('aresult', won ? 'won' : 'lost'); stageWrap.hidden = true;
    const art = el('div', 'rart'); const im = el('img'); im.src = `arena/${won ? B.key : 'bull'}.webp?v=2`; art.append(im);
    const h = el('h2', 'rtitle', won ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ');
    const sub = el('div', 'rsub', won ? `${B.name} повержен` : `${B.name} дожал. Ничего не потеряно: карточки, где вы ошиблись, вернутся раньше`);
    r.append(art, h, sub);
    const stats = el('div', 'rstats');
    [[dmg, 'урон'], ['+' + g.xp, 'XP' + (up ? ` · ур. ${lvl}` : '')], ['×' + g.bestCombo, 'комбо'], [g.right + '/' + (g.right + g.wrong), 'верно']]
      .forEach(([v, l]) => { const s = el('div', 'rs'); s.append(el('b', '', String(v)), el('span', '', l)); stats.append(s); });
    r.append(stats);
    if (F && F.coop) {
      const C = F.coop, tm = el('div', 'rsub', `Отряд: ${[C.me, ...C.mates].map((x) => x.av + ' ' + x.name).join(', ')} · друзья ответили верно ${F.team.right} раз`);
      r.append(tm);
    }
    if (won) {
      A.wins[sec] = (A.wins[sec] || 0) + 1; A.beat[sec] = today();
      const got = loot(g.wrong === 0 && !(F && F.scars));
      const lb = el('div', 'rloot');
      lb.append(el('div', 'muted small', got.length > 1 ? 'Без единой ошибки: двойная награда' : 'Награда'));
      const row = el('div', 'lrow');
      got.forEach((k, i) => { const it = el('div', 'litem'); it.style.animationDelay = (0.3 + i * 0.25) + 's'; const ii = el('img'); ii.src = `arena/${k}.webp?v=2`; it.append(ii, el('span', '', MODS[k].name)); row.append(it); });
      lb.append(row); r.append(lb);
      save();
    }
    const next = nextBoss(sec);
    if (g.arena.coop) { const b = el('button', 'primary', 'Ещё раз вместе'); b.onclick = () => { closeGame(); Duel.rematch(); }; r.append(b); }
    else if (!won) { const b = el('button', 'primary', 'Реванш'); b.onclick = () => { closeGame(); fight(sec); }; r.append(b); }
    else if (next) { const b = el('button', 'primary', 'Следующий босс: ' + bossOf(next).name); b.onclick = () => { closeGame(); fight(next); }; r.append(b); }
    const hub = el('button', 'ghost', 'Все боссы'); hub.onclick = () => { closeGame(); openHub(); };
    const home = el('button', 'ghost', 'На главную'); home.onclick = closeGame;
    r.append(hub, home);
  }

  function duelResult(r, g, up, lvl) {
    const D = g.arena.duel, res = (F && F.duelRes) || { won: false }, won = res.won;
    grindOff(); stageWrap.hidden = true;
    r.classList.add('aresult', won ? 'won' : 'lost');
    if (won) { A.duelWins = (A.duelWins || 0) + 1; save(); }
    const vs = el('div', 'dvs');
    const side = (list, cls) => { const d = el('div', 'dside ' + cls); list.forEach((x) => { const a = el('div', 'dav'); a.style.setProperty('--c', x.col); a.append(el('i', '', x.av), el('b', '', x.name)); d.append(a); }); return d; };
    vs.append(side([D.me, ...D.mates], won ? 'w' : 'l'), el('span', 'dvsx', 'VS'), side(D.foes, won ? 'l' : 'w'));
    const h = el('h2', 'rtitle', res.won === null ? 'НИЧЬЯ' : won ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ');
    const sub = el('div', 'rsub', res.why === 'left' ? 'Соперник вышел из боя' : res.won === null ? 'Время вышло, силы равны' : won ? 'Ты вдавил соперника в стену. +25 XP за победу' : 'Соперник оказался быстрее. Карточки, где ошибся, вернутся раньше');
    r.append(vs, h, sub);
    const stats = el('div', 'rstats');
    [['+' + g.xp, 'XP' + (up ? ` · ур. ${lvl}` : '')], ['×' + g.bestCombo, 'комбо'], [g.right + '/' + (g.right + g.wrong), 'верно']]
      .forEach(([v, l]) => { const s = el('div', 'rs'); s.append(el('b', '', String(v)), el('span', '', l)); stats.append(s); });
    r.append(stats);
    const b = el('button', 'primary', 'Реванш'); b.onclick = () => { closeGame(); Duel.rematch(); };
    const q = el('button', 'ghost', 'Выйти из комнаты'); q.onclick = () => { closeGame(); Duel.leave(); };
    r.append(b, q);
  }

  /* ---------- выбор босса ---------- */
  const SESSION = 99;
  const secs = () => Object.keys(window.BUILTIN_SECTIONS || {}).map(Number).filter((k) => BOSSES[k] && k !== SESSION).concat(S.cards.some((c) => sectionOf(c) === SESSION) ? [SESSION] : []);
  const scopeOf = (sec) => ({ t: 'sec', id: sec });
  const secLabel = (sec) => sec === SESSION ? '300 вопросов сессии, все разделы' : sec === 98 ? '300 вопросов: грамматика и слова' : `Раздел ${sec}. ${SEC_NAMES[sec]}`;
  function bossInfo(sec) {
    const sc = scopeOf(sec), due = dueCards(sc).length, fresh = extraNewCards(sc).length, st = scopeStats(sc);
    return { sec, B: bossOf(sec), due, fresh, st, beaten: A.beat[sec] === today(), mode: due ? 'rev' : fresh ? 'new' : 'prac' };
  }
  function nextBoss(except) { return secs().filter((k) => k !== SESSION).map(bossInfo).filter((x) => x.sec !== except && x.due).sort((a, b) => b.due - a.due).map((x) => x.sec)[0] || 0; }
  function bossOfDay() {
    const all = secs().filter((k) => k !== SESSION).map(bossInfo);
    return all.filter((x) => x.due && !x.beaten).sort((a, b) => b.due - a.due || a.st.sure - b.st.sure)[0]
      || all.filter((x) => x.fresh && !x.beaten)[0] || all.filter((x) => !x.beaten)[0] || all[0];
  }
  const sizeOf = (sec) => (BOSSES[sec] && BOSSES[sec].cards) || FIGHT;
  const statusText = (x) => x.sec >= 90 ? `${sizeOf(x.sec)} вопросов · ${x.mode === 'rev' ? 'повторение' : x.mode === 'new' ? 'новые' : 'тренировка'}` : x.mode === 'rev' ? `${Math.min(sizeOf(x.sec), x.due)} карточек к бою` : x.mode === 'new' ? 'новые карточки' : 'тренировочный бой';
  /* сессия: карточки из всех лекций вперемешку — сначала просроченные, потом новые, иначе тренировка */
  /* Билет по уровням: ~48% лёгких, ~32% средних, ~20% сложных (25 → 12/8/5), от лёгких к сложным.
     В каждом уровне сначала те, что пора повторить, потом новые, потом остальные. */
  const hasLevels = (sec) => !!(window.SECTION_LEVELS || {})[sec];
  function levelQueue(sec, n) {
    const now = Date.now(), mine = S.cards.filter((c) => sectionOf(c) === sec), used = new Set();
    const want = [0, Math.round(n * .48), Math.round(n * .32)]; want[3] = n - want[1] - want[2];
    const rank = (c) => (c.seen && c.due <= now ? 0 : !c.seen ? 1 : 2);
    const order = (list) => shuffle(list).sort((a, b) => rank(a) - rank(b) || (rank(a) !== 1 ? a.due - b.due : 0));
    const blocks = [1, 2, 3].map((lv) => { const b = order(mine.filter((c) => levelOf(c) === lv)).slice(0, want[lv]); b.forEach((c) => used.add(c.id)); return b; });
    let short = n - blocks.reduce((k, b) => k + b.length, 0); // если какого-то уровня не хватило — добираем соседним
    [2, 1, 3].forEach((lv) => { if (short <= 0) return; const add = order(mine.filter((c) => levelOf(c) === lv && !used.has(c.id))).slice(0, short); add.forEach((c) => used.add(c.id)); blocks[lv - 1].push(...add); short -= add.length; });
    const q = blocks.map((b) => shuffle(b)).flat();
    const mode = q.some((c) => rank(c) === 0) ? 'rev' : q.some((c) => rank(c) === 1) ? 'new' : 'prac';
    return [q, mode];
  }
  function sessionQueue(n) {
    if (hasLevels(SESSION)) return levelQueue(SESSION, n);
    const now = Date.now();
    const mix = (arr) => { const g = {}; arr.forEach((c) => (g[c.lecture] = g[c.lecture] || []).push(c)); const L = shuffle(Object.values(g)), out = []; for (let i = 0; out.length < arr.length; i++) L.forEach((l) => { if (l[i]) out.push(l[i]); }); return out; };
    const mine = S.cards.filter((c) => sectionOf(c) === SESSION);
    const rev = mix(mine.filter((c) => c.seen && c.due <= now).sort((a, b) => a.due - b.due));
    const fresh = mix(mine.filter((c) => !c.seen));
    if (rev.length || fresh.length) return [rev.concat(fresh).slice(0, n), rev.length ? 'rev' : 'new'];
    return [mix(shuffle(mine)).slice(0, n), 'prac'];
  }
  function fight(sec) {
    const sc = scopeOf(sec);
    let q = dueCards(sc), mode = 'rev';
    if (!q.length) { q = extraNewCards(sc); mode = 'new'; }
    if (!q.length) { q = practiceCards(sc); mode = 'prac'; }
    const n = sizeOf(sec);
    if (sec === SESSION) [q, mode] = sessionQueue(n);
    else if (sec >= 90 && q.length < n) q = coopQueue(sec, n); // сессии: всегда полный билет
    q = q.slice(0, n);
    if (!q.length) return;
    hideHub();
    launch(q, { practice: mode === 'prac', extra: mode === 'new', scope: sc, size: n, arena: { sec } });
  }

  const hubEl = el('div', 'overlay ahub'); hubEl.id = 'arenaHub'; hubEl.hidden = true;
  hubEl.innerHTML = `<div class="hubbox"><div class="gtop"><button class="x" id="hubClose" aria-label="Закрыть">✕</button><h2>АРЕНА БОССОВ</h2></div>
    <div class="muted small hubnote">Мехи сцепились лоб в лоб, и босс давит, пока вы думаете. Верный ответ — мощный толчок назад, ошибка — рывок босса. Дожмут до стены — минус жизнь. Три жизни потеряны — поражение, но прогресс повторения сохраняется.</div>
    <div class="bgrid" id="hubGrid"></div>
    <h3>Модули</h3><div class="hubmods" id="hubMods"></div></div>`;
  document.body.append(hubEl);
  $('#hubClose').onclick = hideHub;
  function hideHub() { hubEl.hidden = true; }
  function openHub() {
    const grid = $('#hubGrid'); grid.innerHTML = '';
    secs().map(bossInfo).forEach((x) => {
      const b = el('button', 'bcard ' + x.B.key + (x.beaten ? ' beaten' : '')); b.style.setProperty('--glow', x.B.glow);
      const im = el('img'); im.src = `arena/${x.B.key}.webp?v=2`; im.alt = '';
      b.append(im, el('b', '', x.B.name), el('span', 'bs', secLabel(x.sec)), el('span', 'bst' + (x.mode === 'rev' ? ' due' : ''), x.beaten ? 'Повержен сегодня ✓' : statusText(x)));
      if (A.wins[x.sec]) b.append(el('span', 'bw', `побед: ${A.wins[x.sec]}`));
      b.onclick = () => fight(x.sec);
      grid.append(b);
    });
    const mb = $('#hubMods'); mb.innerHTML = '';
    Object.entries(MODS).forEach(([k, m]) => {
      const r = el('div', 'hmod'); const im = el('img'); im.src = `arena/${k}.webp?v=2`;
      const t = el('div'); t.append(el('b', '', `${m.name} ×${A.items[k] || 0}`), el('span', 'muted small', m.what));
      r.append(im, t); mb.append(r);
    });
    hubEl.hidden = false;
  }

  /* ---------- блок на главной ---------- */
  const home = el('div', 'panel arenacall'); home.id = 'arenaHome';
  const tp = $('#taskPanel'); tp.parentNode.insertBefore(home, tp);
  function renderHome() {
    if (!S.cards.length) { home.hidden = true; if (typeof sessEl !== 'undefined') sessEl.hidden = true; return; }
    home.hidden = false;
    const x = bossOfDay(); if (!x) return;
    home.style.setProperty('--glow', x.B.glow);
    home.innerHTML = '';
    const im = el('img', 'hboss'); im.src = `arena/${x.B.key}.webp?v=2`; im.alt = '';
    const t = el('div', 'ht');
    t.append(el('div', 'hk', x.beaten ? 'Все боссы на сегодня повержены' : 'БОСС ДНЯ'), el('b', '', x.B.name), el('span', '', `${x.sec === SESSION ? 'Все разделы' : SEC_NAMES[x.sec]} · ${statusText(x)}`));
    const go = el('button', 'primary fightbtn', x.beaten ? 'Ещё бой' : 'В бой');
    go.onclick = () => fight(x.sec);
    const all = el('button', 'linkbtn', 'Все боссы →'); all.onclick = openHub;
    const tg = el('button', 'linkbtn', 'Пройти босса вместе 👥'); tg.onclick = () => window.Duel && Duel.openCoop(x.sec);
    const dl = el('button', 'linkbtn', 'Дуэль с другом ⚔'); dl.onclick = () => window.Duel && Duel.open();
    t.append(go, tg, all, dl);
    home.append(im, t);
    renderSess();
  }
  /* боссы сессий на главной: каждому по 25 вопросов, можно позвать друзей */
  const sessEl = el('div', 'panel sesscall'); sessEl.id = 'sessHome';
  home.after(sessEl);
  function renderSess() {
    const list = [SESSION, 98].filter((k) => BOSSES[k] && S.cards.some((c) => sectionOf(c) === k));
    sessEl.hidden = !list.length; sessEl.innerHTML = ''; if (!list.length) return;
    sessEl.append(el('div', 'hk', 'БОССЫ СЕССИЙ'), el('div', 'muted small', `По ${sizeOf(SESSION)} вопросов на человека. Позови друзей: у каждого свои ${sizeOf(SESSION)} вопросов, бьёте одного босса вместе.`));
    const row = el('div', 'srow');
    list.map(bossInfo).forEach((x) => {
      const c = el('div', 'scard'); c.style.setProperty('--glow', x.B.glow);
      const im = el('img'); im.src = `arena/${x.B.key}.webp?v=2`; im.alt = '';
      const go = el('button', 'primary fightbtn', x.beaten ? 'Ещё бой' : 'В бой'); go.onclick = () => fight(x.sec);
      const sh = el('button', 'ghost sharebtn', 'Поделиться 👥'); sh.onclick = () => window.Duel && Duel.openCoop(x.sec);
      c.append(im, el('b', '', x.B.name), el('span', '', x.beaten ? 'Повержен сегодня ✓' : statusText(x)), go, sh);
      row.append(c);
    });
    sessEl.append(row);
  }
  window.addEventListener('resize', () => { if (F) { fitCanvas(); place(); } });

  /* 4 варианта ответа: готовые из checks.js, недостающие — ответы похожих карточек той же лекции/раздела */
  const norm = (t) => String(t).replace(/\s+/g, ' ').trim().toLowerCase();
  function options(c) {
    const ch = checkOf(c), right = ch ? ch[0] : c.a;
    if (ch && sectionOf(c) >= 90) return ch.slice(); // вопросы сессии и английского: все 5 вариантов, как в билете
    const out = ch ? ch.slice(0, 4) : [right];
    if (out.length >= 4) return out;
    const used = new Set(out.map(norm)), L = right.length, math = /\$/.test(right);
    const take = (list) => list
      .filter((x) => !used.has(norm(x.a)))
      .map((x) => [x.a, Math.abs(Math.log((x.a.length + 8) / (L + 8))) + (/\$/.test(x.a) !== math ? 0.6 : 0) + Math.random() * 0.45])
      .sort((a, b) => a[1] - b[1])
      .forEach(([a]) => { if (out.length < 4 && !used.has(norm(a))) { used.add(norm(a)); out.push(a); } });
    take(S.cards.filter((x) => x.lecture === c.lecture && x.id !== c.id));
    if (out.length < 4) take(S.cards.filter((x) => sectionOf(x) === sectionOf(c) && x.id !== c.id));
    if (out.length < 4) take(S.cards.filter((x) => x.id !== c.id));
    return out;
  }

  window.Arena = { coopMsg, coopQueue, coopFight, bossOf, duelMsg, duelFinish, options, start, stop, onPick, onGrade, useShield, boost, beforeFinish, result, renderHome, openHub, fight, renderMods: () => F && renderMods(), _f: () => F };
  renderHome();
})();
