'use strict';
/* Арена боссов: повторение карточек в виде битвы мехов.
   Каждая карточка — удар по боссу, ошибка — удар босса. Опирается на функции из script.js
   (dueCards, extraNewCards, practiceCards, launch, closeGame, S, save, refresh). */
(() => {
  const FIGHT = 8; // карточек в бою
  const BOSSES = {
    1: { key: 'golem', name: 'Голем Матриц', color: '#ff9a3c', glow: 'rgba(255,150,60,.55)', scale: 1, shot: 'rock',
      start: 'Мой определитель не равен нулю. А твои шансы равны.', rage: 'Ранг падает… но я ещё стою!',
      win: 'Возвращайся, когда выучишь Крамера.', die: 'Матрица… вырождена…' },
    2: { key: 'scorpion', name: 'Скорпион Векторов', color: '#ffb347', glow: 'rgba(255,170,70,.55)', scale: 1, shot: 'arrow',
      start: 'Все мои векторы направлены в тебя.', rage: 'Угол между нами становится острым!',
      win: 'Твоя прямая не пересекла мою.', die: 'Нормаль… потеряна…' },
    3: { key: 'dragon', name: 'Дракон Пределов', color: '#ff5a2a', glow: 'rgba(255,80,40,.6)', scale: 1.04, shot: 'fire',
      start: 'Предел твоих знаний уже близок!', rage: 'Ты стремишься ко мне, но не достигнешь!',
      win: 'Предела нет. Как и твоей победы.', die: 'Производная… обнулилась…' },
    4: { key: 'serpent', name: 'Змей Бесконечности', color: '#b46bff', glow: 'rgba(170,90,255,.6)', scale: 1, shot: 'star',
      start: 'Я бесконечен. А твоё терпение?', rage: 'Частные производные меня не остановят!',
      win: 'Бесконечность всегда побеждает.', die: 'Экстремум… найден…' }
  };
  const MODS = {
    claw: { name: 'Гидро-руки', what: 'Убирают два неверных варианта ответа' },
    shield: { name: 'Энерго-щит', what: 'Блокирует следующий удар босса' },
    rocket: { name: 'Турбо-ускоритель', what: 'Двойной урон на 3 верных ответа' }
  };
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, txt) => { const d = document.createElement(tag); if (cls) d.className = cls; if (txt != null) d.textContent = txt; return d; };
  const today = () => new Date().toLocaleDateString('sv');
  S.arena = S.arena || {};
  const A = S.arena;
  A.items = A.items || { claw: 1, shield: 1, rocket: 1 };
  A.wins = A.wins || {};   // побед над каждым боссом
  A.beat = A.beat || {};   // день последней победы
  if (A.sound == null) A.sound = true;

  /* ---------- разметка ---------- */
  const box = $('#game .gamebox');
  const stageWrap = el('div'); stageWrap.id = 'arena'; stageWrap.hidden = true;
  stageWrap.innerHTML = `
    <div class="ahud">
      <div class="aside me"><div class="aname">МЕХ-БЫК</div><div class="hp"><i class="lag"></i><i class="fill" id="aPHp"></i></div></div>
      <div class="avs">VS</div>
      <div class="aside bs"><div class="aname" id="aBName"></div><div class="hp boss"><i class="lag" id="aBLag"></i><i class="fill" id="aBHp"></i></div></div>
    </div>
    <div class="stage" id="aStage">
      <div class="beam b1"></div><div class="beam b2"></div>
      <div class="truss t1"></div><div class="truss t2"></div>
      <div class="crowd"></div><div class="floor"></div>
      <div class="fighter me" id="aMe"><div class="shadow"></div><img src="arena/bull.webp" alt=""><div class="dome"></div></div>
      <div class="fighter boss" id="aBoss"><div class="shadow"></div><img id="aBossImg" alt=""></div>
      <canvas id="aFx"></canvas>
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
  let ac = null;
  const audio = () => { if (!A.sound) return null; try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { return null; } return ac; };
  function tone(type, f1, f2, dur, vol, delay = 0) {
    const c = audio(); if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, delay = 0) {
    const c = audio(); if (!c) return;
    const t = c.currentTime + delay, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
    s.connect(f).connect(g).connect(c.destination); s.start(t);
  }
  const SFX = {
    whoosh: () => { noise(0.25, 0.25, 1800); },
    hit: () => { tone('sine', 160, 45, 0.25, 0.7); noise(0.18, 0.5, 2500); },
    crit: () => { tone('sine', 180, 40, 0.35, 0.8); noise(0.3, 0.6, 4000); tone('square', 880, 1760, 0.15, 0.08, 0.05); },
    hurt: () => { tone('sawtooth', 220, 70, 0.35, 0.25); noise(0.25, 0.4, 900); },
    block: () => { tone('triangle', 900, 880, 0.3, 0.25); tone('triangle', 1350, 1300, 0.35, 0.15, 0.02); },
    power: () => { tone('sawtooth', 200, 900, 0.4, 0.12); },
    start: () => { tone('sawtooth', 90, 300, 0.6, 0.15); noise(0.6, 0.15, 900); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.22, 0.12, i * 0.12)),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.98, 0.3, 0.2, i * 0.16)),
    roar: () => { tone('sawtooth', 110, 55, 0.7, 0.2); noise(0.7, 0.25, 600); }
  };
  const vib = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
  function renderSound() { $('#aSound').textContent = A.sound ? '🔊' : '🔇'; }
  $('#aSound').onclick = () => { A.sound = !A.sound; save(); renderSound(); };

  /* ---------- частицы ---------- */
  const cv = $('#aFx'), cx = cv.getContext('2d');
  let parts = [], raf = 0;
  function fitCanvas() { const r = stage.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); cv.width = r.width * d; cv.height = r.height * d; cx.setTransform(d, 0, 0, d, 0, 0); }
  function burst(x, y, opt) {
    const o = Object.assign({ n: 26, colors: ['#fff6c2', '#ffd24a', '#ff8a1e'], speed: 7, life: 34, size: 3, grav: 0.25, kind: 'spark', dir: 0, spread: Math.PI * 2 }, opt);
    for (let i = 0; i < o.n; i++) {
      const a = o.dir + (Math.random() - 0.5) * o.spread, v = o.speed * (0.35 + Math.random());
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.kind === 'smoke' ? 0.6 : 0), life: o.life * (0.6 + Math.random() * 0.6), max: o.life,
        c: o.colors[i % o.colors.length], s: o.size * (0.6 + Math.random() * 0.8), g: o.grav, kind: o.kind });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    const r = stage.getBoundingClientRect(); cx.clearRect(0, 0, r.width, r.height);
    parts = parts.filter((p) => p.life > 0);
    parts.forEach((p) => {
      p.life--; p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.97;
      const k = p.life / p.max;
      cx.globalAlpha = Math.max(0, k);
      if (p.kind === 'smoke') { cx.fillStyle = p.c; cx.beginPath(); cx.arc(p.x, p.y, p.s * (3 - 2 * k) * 3, 0, 7); cx.fill(); }
      else if (p.kind === 'star') { cx.fillStyle = p.c; cx.font = (p.s * 5) + 'px sans-serif'; cx.fillText('✦', p.x, p.y); }
      else { cx.strokeStyle = p.c; cx.lineWidth = p.s; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2); cx.stroke(); }
    });
    cx.globalAlpha = 1;
    raf = parts.length ? requestAnimationFrame(tick) : 0;
  }
  const center = (n, fx = 0.5, fy = 0.5) => { const s = stage.getBoundingClientRect(), r = n.getBoundingClientRect(); return [r.left - s.left + r.width * fx, r.top - s.top + r.height * fy]; };

  /* ---------- помощники анимаций ---------- */
  const anim = (n, cls, ms) => {
    const c = cls.split(' '), key = '_t' + c[0];
    n.classList.remove(...c, ...(c[0] === 'shake' || c[0] === 'dash' ? ['big', 'turbo'] : [])); void n.offsetWidth; n.classList.add(...c);
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
  function projectile(kind, color, from, to, ms, onHit) {
    const p = el('div', 'shot ' + kind); p.style.setProperty('--c', color);
    p.style.left = from[0] + 'px'; p.style.top = from[1] + 'px';
    stage.append(p);
    const dx = to[0] - from[0], dy = to[1] - from[1];
    const a = p.animate([{ transform: 'translate(-50%,-50%) scale(.6)' }, { transform: `translate(calc(${dx}px - 50%), calc(${dy}px - 50%)) scale(1.2)` }], { duration: ms, easing: 'cubic-bezier(.5,0,.9,.6)' });
    a.onfinish = () => { p.remove(); onHit && onHit(); };
  }

  /* ---------- состояние боя ---------- */
  let F = null; // { sec, boss, hpMax, hpLeft, dmg, boost, shield, ko }
  const bossOf = (sec) => BOSSES[sec] || BOSSES[1];
  function setHp() {
    const b = Math.max(0, F.hpLeft / F.hpMax);
    $('#aBHp').style.width = b * 100 + '%';
    setTimeout(() => { if (F) $('#aBLag').style.width = Math.max(0, F.hpLeft / F.hpMax) * 100 + '%'; }, 450);
    const p = Math.max(0, G ? G.hearts / 3 : 1);
    $('#aPHp').style.width = p * 100 + '%';
    setTimeout(() => { const l = $('#aPHp').previousElementSibling; if (G) l.style.width = Math.max(0, G.hearts / 3) * 100 + '%'; }, 450);
    bossEl.classList.toggle('rage', b > 0 && b <= 0.34);
    me.classList.toggle('low', G && G.hearts === 1);
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
    F = { sec, B, hpMax: g.q.length, hpLeft: g.q.length, dmg: 0, boost: 0, shield: false, ko: false, raged: false, clawUsed: false, got: [] };
    game.classList.add('arena'); stageWrap.hidden = false;
    $('#aBName').textContent = B.name.toUpperCase();
    const img = $('#aBossImg'); img.src = `arena/${B.key}.webp`;
    bossEl.style.setProperty('--glow', B.glow); bossEl.style.setProperty('--sc', B.scale);
    bossEl.className = 'fighter boss ' + B.key; me.className = 'fighter me';
    $('#aBLag').style.width = '100%'; $('#aPHp').previousElementSibling.style.width = '100%';
    stage.querySelectorAll('.ftxt,.shot').forEach((n) => n.remove());
    renderSound(); setHp(); renderMods(); fitCanvas();
    anim(me, 'enter', 900); anim(bossEl, 'enterB', 900);
    setTimeout(() => { banner(g.practice ? 'ТРЕНИРОВОЧНЫЙ БОЙ' : 'В БОЙ!', 'go'); SFX.start(); vib(40); }, 350);
    setTimeout(() => { if (F) { say(B.start); SFX.roar(); } }, 1300);
  }
  function stop() { F = null; game.classList.remove('arena'); stageWrap.hidden = true; parts = []; }

  /* ответ выбран из вариантов: верный — мех заряжается, неверный — сразу удар босса */
  function onPick(right) {
    if (!F) return;
    if (right) { anim(me, 'charge', 700); const [x, y] = center(me, 0.6, 0.45); burst(x, y, { n: 14, colors: ['#9fe2ff', '#4fb4ff', '#fff'], speed: 3, grav: -0.05, life: 26, size: 2 }); SFX.power(); }
    else { bossAttack(); F.hurtShown = true; }
    renderMods();
  }
  function bossAttack(blocked) {
    const B = F.B, from = center(bossEl, 0.25, 0.4), to = center(me, 0.6, 0.45);
    anim(bossEl, 'lunge', 600);
    setTimeout(() => projectile(B.shot, B.color, from, to, 380, () => {
      if (!F) return;
      if (blocked || F.blockNext || F.shield) {
        F.blockNext = false; me.classList.remove('shielded');
        anim(me, 'block', 700); SFX.block(); vib(25);
        burst(to[0], to[1], { n: 30, colors: ['#bfefff', '#5cc8ff', '#ffffff'], speed: 6, life: 30 });
        floatText('БЛОК!', to[0], to[1] - 40, 'blk');
      } else {
        anim(me, 'hurt', 650); anim(stage, 'shake', 450); anim($('#aVign'), 'red', 650);
        SFX.hurt(); vib([60, 40, 60]);
        burst(to[0], to[1], { n: 34, colors: [B.color, '#ffd24a', '#fff'], speed: 8, life: 32, kind: B.shot === 'star' ? 'star' : 'spark' });
        burst(to[0], to[1], { n: 8, colors: ['rgba(120,120,130,.5)'], speed: 1.5, life: 50, kind: 'smoke', grav: -0.03, size: 4 });
        floatText('−1 ❤', to[0], to[1] - 40, 'hurt');
      }
      setHp();
    }), 220);
  }
  function playerAttack(dmg, crit) {
    const to = center(bossEl, 0.42, 0.5);
    anim(me, F.boost > 0 ? 'dash turbo' : 'dash', 600);
    if (F.boost > 0) { const [x, y] = center(me, 0.1, 0.55); burst(x, y, { n: 30, colors: ['#ffe066', '#ff8a1e', '#ff4d1e'], speed: 6, dir: Math.PI, spread: 0.8, life: 26, grav: 0 }); }
    SFX.whoosh();
    setTimeout(() => {
      if (!F) return;
      anim(bossEl, 'hit', 500); anim(stage, crit ? 'shake big' : 'shake', crit ? 600 : 380);
      if (crit) { anim($('#aVign'), 'white', 300); SFX.crit(); vib([30, 20, 50]); } else { SFX.hit(); vib(30); }
      burst(to[0], to[1], { n: crit ? 60 : 34, speed: crit ? 11 : 8, size: crit ? 4 : 3 });
      burst(to[0], to[1], { n: crit ? 10 : 5, colors: ['rgba(140,140,150,.45)'], speed: 1.5, life: 55, kind: 'smoke', grav: -0.04, size: 4 });
      floatText('−' + dmg, to[0] + (Math.random() * 30 - 15), to[1] - 30, crit ? 'crit' : F.boost > 0 ? 'turbo' : '');
      if (crit) floatText('КРИТ!', to[0], to[1] - 75, 'critw');
      setHp();
      const frac = F.hpLeft / F.hpMax;
      if (!F.raged && frac > 0 && frac <= 0.34) { F.raged = true; setTimeout(() => { if (F && !F.ko) { say(F.B.rage); SFX.roar(); } }, 500); }
    }, 230);
  }

  /* оценка карточки: g=0 — ошибка */
  function onGrade(g, gain, blocked) {
    if (!F) return;
    const c = $('#aCombo');
    if (g === 0) {
      if (!F.hurtShown) bossAttack(blocked); else setTimeout(setHp, 60);
      F.hurtShown = false; c.className = 'acombo';
    } else {
      F.hpLeft = Math.max(0, F.hpLeft - 1);
      const dmg = gain * 10; F.dmg += dmg;
      const crit = g === 3 || (G.combo >= 3 && G.combo % 3 === 0);
      playerAttack(dmg, crit);
      if (F.boost > 0) F.boost--;
      if (G.combo >= 2) { c.textContent = 'КОМБО ×' + G.combo; c.className = 'acombo'; void c.offsetWidth; c.className = 'acombo on' + (G.combo >= 5 ? ' hot' : ''); }
    }
    F.clawUsed = false;
    setTimeout(renderMods, 50);
  }
  function useShield() { // вызывается при ошибке: если щит включён, сердце не теряется
    if (!F || !F.shield) return false;
    F.shield = false;
    if (F.hurtShown) me.classList.remove('shielded'); // иначе купол погаснет в момент удара
    if (!F.hurtShown) F.blockNext = true; // иначе блок уже показан, когда босс бил по неверному варианту
    return true;
  }
  function boost(gain) { return F && F.boost > 0 ? gain * 2 : gain; }
  function useMod(k) {
    if (!F || !(A.items[k] > 0)) return;
    if (k === 'claw') {
      const wrong = [...$('#gOpts').children].filter((o) => !o.dataset.right && !o.disabled);
      if (!wrong.length) return;
      shuffle(wrong).slice(0, 2).forEach((o, i) => setTimeout(() => {
        const s = stage.getBoundingClientRect(), r = o.getBoundingClientRect();
        o.classList.add('grabbed'); o.disabled = true;
        burst(r.left - s.left + r.width / 2, Math.min(s.height - 10, r.top - s.top), { n: 10, speed: 4 });
      }, i * 220));
      F.clawUsed = true; anim(me, 'charge', 700);
    }
    if (k === 'shield') { F.shield = true; me.classList.add('shielded'); }
    if (k === 'rocket') { F.boost = 3; anim(me, 'charge', 700); }
    A.items[k]--; save();
    SFX.power(); vib(20);
    banner(MODS[k].name.toUpperCase(), 'mod', 900);
    renderMods();
  }

  /* конец боя: сначала добивание или падение меха, потом экран итогов */
  function beforeFinish(g) {
    if (!F || F.ko) return false;
    F.ko = true; renderMods();
    ['#gGrades', '#gShow', '#gNext', '#gExplain', '#gOpts'].forEach((q) => { $(q).hidden = true; });
    $('.flash').classList.add('kofade');
    const won = g.hearts > 0;
    const go = () => { if (G === g) finish(); };
    if (won) {
      setTimeout(() => {
        if (!F) return;
        say(F.B.die, 1500);
        const [x, y] = center(bossEl, 0.5, 0.5);
        let k = 0; const t = setInterval(() => {
          if (!F) return clearInterval(t);
          burst(x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 90, { n: 30, speed: 9, colors: ['#fff6c2', '#ffd24a', '#ff8a1e', F.B.color] });
          SFX.hit(); anim(stage, 'shake', 300);
          if (++k >= 4) { clearInterval(t); bossEl.classList.add('ko'); burst(x, y, { n: 18, colors: ['rgba(120,120,130,.5)'], kind: 'smoke', speed: 2, life: 70, grav: -0.05, size: 6 }); banner('ПОБЕДА!', 'win', 1600); SFX.win(); vib([40, 30, 40, 30, 120]); }
        }, 260);
      }, 450);
      setTimeout(go, 2900);
    } else {
      setTimeout(() => { if (!F) return; me.classList.add('ko'); banner('ПОРАЖЕНИЕ', 'lose', 1500); SFX.lose(); say(F.B.win, 1800); }, 900);
      setTimeout(go, 2700);
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
    r.classList.add('aresult', won ? 'won' : 'lost'); stageWrap.hidden = true;
    const art = el('div', 'rart'); const im = el('img'); im.src = `arena/${won ? B.key : 'bull'}.webp`; art.append(im);
    const h = el('h2', 'rtitle', won ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ');
    const sub = el('div', 'rsub', won ? `${B.name} повержен` : `${B.name} отбился. Ничего не потеряно: карточки, где вы ошиблись, вернутся раньше`);
    r.append(art, h, sub);
    const stats = el('div', 'rstats');
    [[dmg, 'урон'], ['+' + g.xp, 'XP' + (up ? ` · ур. ${lvl}` : '')], ['×' + g.bestCombo, 'комбо'], [g.right + '/' + (g.right + g.wrong), 'верно']]
      .forEach(([v, l]) => { const s = el('div', 'rs'); s.append(el('b', '', String(v)), el('span', '', l)); stats.append(s); });
    r.append(stats);
    if (won) {
      A.wins[sec] = (A.wins[sec] || 0) + 1; A.beat[sec] = today();
      const got = loot(g.wrong === 0);
      const lb = el('div', 'rloot');
      lb.append(el('div', 'muted small', g.wrong === 0 ? 'Без единой ошибки: двойная награда' : 'Награда'));
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
    <div class="muted small hubnote">Каждый босс — раздел курса. Верный ответ — удар мехом, ошибка — удар босса. Три ошибки — поражение, но прогресс повторения сохраняется.</div>
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
  window.addEventListener('resize', () => { if (F) fitCanvas(); });

  window.Arena = { start, stop, onPick, onGrade, useShield, boost, beforeFinish, result, renderHome, openHub, fight, renderMods: () => F && renderMods() };
  renderHome();
})();
