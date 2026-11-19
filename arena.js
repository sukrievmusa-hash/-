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
    4: { key: 'serpent', name: 'Змей Бесконечности', color: '#b46bff', glow: 'rgba(170,90,255,.6)', front: 0.05, rate: 0.03, w: 0.42,
      start: 'Я бесконечен. А твоё терпение?', rage: 'Частные производные меня не остановят!',
      win: 'Бесконечность всегда побеждает.', die: 'Экстремум… найден…' }
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
      <div class="aside me"><div class="aname">МЕХ-БЫК</div><div class="hp"><i class="lag" id="aPLag"></i><i class="fill" id="aPHp"></i></div></div>
      <div class="avs">VS</div>
      <div class="aside bs"><div class="aname" id="aBName"></div><div class="hp boss"><i class="lag" id="aBLag"></i><i class="fill" id="aBHp"></i></div></div>
    </div>
    <div class="stage" id="aStage">
      <div class="beam b1"></div><div class="beam b2"></div>
      <div class="truss t1"></div><div class="truss t2"></div>
      <div class="crowd"></div><div class="floor"></div>
      <div class="wall l" id="aWallL"></div><div class="wall r" id="aWallR"></div>
      <div class="fighter me" id="aMe"><div class="shadow"></div><img src="arena/bull.webp" alt=""><div class="dome"></div></div>
      <div class="fighter boss" id="aBoss"><div class="shadow"></div><img id="aBossImg" alt=""></div>
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
  const game = $('#game'), stage = $('#aStage'), me = $('#aMe'), bossEl = $('#aBoss');

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
  function fitCanvas() { const r = stage.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); SW = r.width; SH = r.height; cv.width = SW * d; cv.height = SH * d; cx.setTransform(d, 0, 0, d, 0, 0); }
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
    const c = cls.split(' '), key = '_t' + c[0];
    n.classList.remove(...c, ...(c[0] === 'shake' || c[0] === 'shove' ? ['big', 'turbo'] : [])); void n.offsetWidth; n.classList.add(...c);
    clearTimeout(n[key]); n[key] = setTimeout(() => n.classList.remove(...c), ms);
  };
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
  const contactX = () => SW * (0.5 + F.p * RANGE);
  const contactY = () => SH * 0.63;
  const meX = () => contactX() - SW * ME_W * (1 - ME_HEAD);
  const bossX = () => contactX() - SW * F.B.w * F.B.front;
  function place() {
    me.style.left = meX() + 'px';
    bossEl.style.left = bossX() + 'px';
    $('#aKnob').style.left = (50 + clamp(F.p, -1, 1) * 50) + '%';
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
    if (!F.ko && F.pt <= -1) wallHit();
    if (!F.ko && F.pt >= 1) bossWall();
    place();
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
    const mx = meX() + SW * ME_W * 0.45, my = SH * 0.5;
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
    const sec = g.arena.sec, B = bossOf(sec);
    F = { sec, B, hpMax: g.q.length, hpLeft: g.q.length, dmg: 0, boost: 0, shield: false, ko: false, raged: false, clawUsed: false,
      p: 0, pt: 0, hold: Date.now() + 2600, scars: 0, koDir: 0 };
    game.classList.add('arena'); stageWrap.hidden = false;
    $('#aBName').textContent = B.name.toUpperCase();
    $('#aBossImg').src = `arena/${B.key}.webp`;
    bossEl.style.setProperty('--glow', B.glow); bossEl.style.width = B.w * 100 + '%'; me.style.width = ME_W * 100 + '%';
    bossEl.className = 'fighter boss ' + B.key; me.className = 'fighter me';
    $('#aBLag').style.width = '100%'; $('#aPLag').style.width = '100%';
    stage.querySelectorAll('.ftxt').forEach((n) => n.remove());
    parts = []; acc = {};
    renderSound(); fitCanvas(); place(); setHp(); renderMods();
    anim(me, 'enter', 700); anim(bossEl, 'enterB', 700);
    setTimeout(() => { // столкновение лоб в лоб
      if (!F) return;
      anim(stage, 'shake big', 600); anim($('#aVign'), 'white', 300);
      burst(contactX(), contactY(), { n: 70, speed: 12, size: 4 }); gears(contactX(), contactY(), 3); bolts(contactX(), contactY(), 4);
      SFX.clash(); vib([50, 30, 80]);
      banner(g.practice ? 'ТРЕНИРОВКА' : 'СХВАТКА!', 'go');
      grindOn();
    }, 640);
    setTimeout(() => { if (F) { say(B.start); SFX.roar(); } }, 1500);
    last = 0; if (!raf) raf = requestAnimationFrame(loop);
  }
  function stop() { F = null; grindOff(); game.classList.remove('arena'); stageWrap.hidden = true; parts = []; }

  /* верный вариант — бык толкает сразу; неверный — рывок босса */
  function onPick(right) {
    if (!F || F.ko) return;
    const c = G.q[G.i];
    if (right) {
      F.crit = Date.now() - G.t0 < 6000 + 35 * c.q.length || (G.combo > 0 && (G.combo + 1) % 3 === 0);
      shove(F.crit);
    } else { bossSlam(); F.hurtShown = true; }
    renderMods();
  }
  function shove(crit) {
    const turbo = F.boost > 0, push = (crit ? 0.5 : 0.36) * (turbo ? 1.5 : 1);
    anim(me, turbo ? 'shove turbo' : 'shove', 520); anim(bossEl, 'pushed', 520);
    F.pt = Math.min(1.05, F.pt + push); F.hold = Date.now() + 1100;
    setTimeout(() => {
      if (!F) return;
      const x = contactX(), y = contactY();
      anim(stage, crit ? 'shake big' : 'shake', crit ? 600 : 380);
      if (crit) { anim($('#aVign'), 'white', 300); SFX.crit(); vib([30, 20, 50]); } else { SFX.shove(); vib(30); }
      burst(x, y, { n: crit ? 60 : 36, speed: crit ? 12 : 8, size: crit ? 4 : 3 });
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
    const go = () => { if (G === g && !g.done) finish(); };
    if (won) {
      setTimeout(() => {
        if (!F) return;
        say(F.B.die, 1500); anim(me, 'shove', 520); F.koDir = 1;
        let k = 0; const t = setInterval(() => {
          if (!F) return clearInterval(t);
          const x = bossX() + SW * F.B.w * 0.4, y = SH * 0.5;
          burst(x + (Math.random() - 0.5) * 100, y + (Math.random() - 0.5) * 80, { n: 30, speed: 9, colors: ['#fff6c2', '#ffd24a', '#ff8a1e', F.B.color] });
          gears(x, y, 3, -Math.PI / 2 + 0.3, [F.B.color, '#9aa6bd', '#6f7a90', '#d9a441']); bolts(x, y, 3);
          SFX.shove(); anim(stage, 'shake', 300);
          if (++k >= 5) { clearInterval(t); bossEl.classList.add('ko'); burst(x, y, { n: 18, colors: ['rgba(120,120,130,.5)'], kind: 'smoke', speed: 2, life: 70, grav: -0.05, size: 6 }); banner('ПОБЕДА!', 'win', 1600); SFX.win(); vib([40, 30, 40, 30, 120]); }
        }, 240);
      }, 400);
      setTimeout(go, 3000);
    } else {
      F.koDir = -1;
      setTimeout(() => { if (!F) return; me.classList.add('ko'); gears(SW * 0.2, SH * 0.5, 8); bolts(SW * 0.2, SH * 0.5, 6); banner('ПОРАЖЕНИЕ', 'lose', 1500); SFX.lose(); say(F.B.win, 1800); }, 700);
      setTimeout(go, 2800);
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
    const B = F ? F.B : bossOf(g.arena.sec), sec = g.arena.sec, won = g.hearts > 0;
    const dmg = F ? F.dmg : 0;
    grindOff();
    r.classList.add('aresult', won ? 'won' : 'lost'); stageWrap.hidden = true;
    const art = el('div', 'rart'); const im = el('img'); im.src = `arena/${won ? B.key : 'bull'}.webp`; art.append(im);
    const h = el('h2', 'rtitle', won ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ');
    const sub = el('div', 'rsub', won ? `${B.name} повержен` : `${B.name} дожал. Ничего не потеряно: карточки, где вы ошиблись, вернутся раньше`);
    r.append(art, h, sub);
    const stats = el('div', 'rstats');
    [[dmg, 'урон'], ['+' + g.xp, 'XP' + (up ? ` · ур. ${lvl}` : '')], ['×' + g.bestCombo, 'комбо'], [g.right + '/' + (g.right + g.wrong), 'верно']]
      .forEach(([v, l]) => { const s = el('div', 'rs'); s.append(el('b', '', String(v)), el('span', '', l)); stats.append(s); });
    r.append(stats);
    if (won) {
      A.wins[sec] = (A.wins[sec] || 0) + 1; A.beat[sec] = today();
      const got = loot(g.wrong === 0 && !(F && F.scars));
      const lb = el('div', 'rloot');
      lb.append(el('div', 'muted small', got.length > 1 ? 'Без единой ошибки: двойная награда' : 'Награда'));
      const row = el('div', 'lrow');
      got.forEach((k, i) => { const it = el('div', 'litem'); it.style.animationDelay = (0.3 + i * 0.25) + 's'; const ii = el('img'); ii.src = `arena/${k}.webp`; it.append(ii, el('span', '', MODS[k].name)); row.append(it); });
      lb.append(row); r.append(lb);
      save();
    }
    const next = nextBoss(sec);
    if (!won) { const b = el('button', 'primary', 'Реванш'); b.onclick = () => { closeGame(); fight(sec); }; r.append(b); }
    else if (next) { const b = el('button', 'primary', 'Следующий босс: ' + bossOf(next).name); b.onclick = () => { closeGame(); fight(next); }; r.append(b); }
    const hub = el('button', 'ghost', 'Все боссы'); hub.onclick = () => { closeGame(); openHub(); };
    const home = el('button', 'ghost', 'На главную'); home.onclick = closeGame;
    r.append(hub, home);
  }

  /* ---------- выбор босса ---------- */
  const secs = () => Object.keys(window.BUILTIN_SECTIONS || {}).map(Number).filter((k) => BOSSES[k]);
  function bossInfo(sec) {
    const sc = { t: 'sec', id: sec }, due = dueCards(sc).length, fresh = extraNewCards(sc).length, st = scopeStats(sc);
    return { sec, B: bossOf(sec), due, fresh, st, beaten: A.beat[sec] === today(), mode: due ? 'rev' : fresh ? 'new' : 'prac' };
  }
  function nextBoss(except) { return secs().map(bossInfo).filter((x) => x.sec !== except && x.due).sort((a, b) => b.due - a.due).map((x) => x.sec)[0] || 0; }
  function bossOfDay() {
    const all = secs().map(bossInfo);
    return all.filter((x) => x.due && !x.beaten).sort((a, b) => b.due - a.due || a.st.sure - b.st.sure)[0]
      || all.filter((x) => x.fresh && !x.beaten)[0] || all.filter((x) => !x.beaten)[0] || all[0];
  }
  const statusText = (x) => x.mode === 'rev' ? `${Math.min(FIGHT, x.due)} карточек к бою` : x.mode === 'new' ? 'новые карточки' : 'тренировочный бой';
  function fight(sec) {
    const sc = { t: 'sec', id: sec };
    let q = dueCards(sc), mode = 'rev';
    if (!q.length) { q = extraNewCards(sc); mode = 'new'; }
    if (!q.length) { q = practiceCards(sc); mode = 'prac'; }
    q = q.slice(0, FIGHT);
    if (!q.length) return;
    hideHub();
    launch(q, { practice: mode === 'prac', extra: mode === 'new', scope: sc, size: FIGHT, arena: { sec } });
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
      const im = el('img'); im.src = `arena/${x.B.key}.webp`; im.alt = '';
      b.append(im, el('b', '', x.B.name), el('span', 'bs', `Раздел ${x.sec}. ${SEC_NAMES[x.sec]}`), el('span', 'bst' + (x.mode === 'rev' ? ' due' : ''), x.beaten ? 'Повержен сегодня ✓' : statusText(x)));
      if (A.wins[x.sec]) b.append(el('span', 'bw', `побед: ${A.wins[x.sec]}`));
      b.onclick = () => fight(x.sec);
      grid.append(b);
    });
    const mb = $('#hubMods'); mb.innerHTML = '';
    Object.entries(MODS).forEach(([k, m]) => {
      const r = el('div', 'hmod'); const im = el('img'); im.src = `arena/${k}.webp`;
      const t = el('div'); t.append(el('b', '', `${m.name} ×${A.items[k] || 0}`), el('span', 'muted small', m.what));
      r.append(im, t); mb.append(r);
    });
    hubEl.hidden = false;
  }

  /* ---------- блок на главной ---------- */
  const home = el('div', 'panel arenacall'); home.id = 'arenaHome';
  const tp = $('#taskPanel'); tp.parentNode.insertBefore(home, tp);
  function renderHome() {
    if (!S.cards.length) { home.hidden = true; return; }
    home.hidden = false;
    const x = bossOfDay(); if (!x) return;
    home.style.setProperty('--glow', x.B.glow);
    home.innerHTML = '';
    const im = el('img', 'hboss'); im.src = `arena/${x.B.key}.webp`; im.alt = '';
    const t = el('div', 'ht');
    t.append(el('div', 'hk', x.beaten ? 'Все боссы на сегодня повержены' : 'БОСС ДНЯ'), el('b', '', x.B.name), el('span', '', `${SEC_NAMES[x.sec]} · ${statusText(x)}`));
    const go = el('button', 'primary fightbtn', x.beaten ? 'Ещё бой' : 'В бой');
    go.onclick = () => fight(x.sec);
    const all = el('button', 'linkbtn', 'Все боссы →'); all.onclick = openHub;
    t.append(go, all);
    home.append(im, t);
  }
  window.addEventListener('resize', () => { if (F) { fitCanvas(); place(); } });

  /* 4 варианта ответа: готовые из checks.js, недостающие — ответы похожих карточек той же лекции/раздела */
  const norm = (t) => String(t).replace(/\s+/g, ' ').trim().toLowerCase();
  function options(c) {
    const ch = checkOf(c), right = ch ? ch[0] : c.a, out = ch ? ch.slice(0, 4) : [right];
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

  window.Arena = { options, start, stop, onPick, onGrade, useShield, boost, beforeFinish, result, renderHome, openHub, fight, renderMods: () => F && renderMods(), _f: () => F };
  renderHome();
})();
