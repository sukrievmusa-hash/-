'use strict';
/* Мат-повтор: интервальное повторение (кривая забывания) + игровой режим.
   Всё хранится в localStorage браузера, сервер не нужен. */

const KEY = 'mathrepeat_v1';
const DAY = 864e5;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let S = (() => {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d) return d; } catch (e) {}
  return {
    lectures: [], cards: [],
    stats: { xp: 0, streak: 0, last: '', best: 0, log: {} },
    settings: { goal: 15, newPerDay: 15, remind: '', lastNotify: 0 }
  };
})();
S.stats.newLog = S.stats.newLog || {};
S.builtinSeen = S.builtinSeen || [];
if (S.settings.newPerDay == null) S.settings.newPerDay = 15;
const save = () => localStorage.setItem(KEY, JSON.stringify(S));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const dayKey = (d = new Date()) => d.toLocaleDateString('sv');
const level = (xp) => Math.floor(Math.sqrt(xp / 60)) + 1;

/* ---------- планировщик (упрощённый SM-2) ---------- */
function schedule(c, g) { // g: 0 забыл, 1 трудно, 2 помню, 3 легко
  if (g === 0) {
    c.reps = 0; c.lapses++; c.interval = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.due = Date.now() + 10 * 60e3;
    return;
  }
  c.reps++;
  if (c.reps === 1) c.interval = g === 3 ? 4 : 1;
  else if (c.reps === 2) c.interval = g === 3 ? 8 : 3;
  else {
    const m = g === 1 ? 1.2 : g === 2 ? c.ease : c.ease * 1.3;
    c.interval = Math.max(c.interval + 1, Math.round(c.interval * m));
  }
  if (g === 1) c.ease = Math.max(1.3, c.ease - 0.15);
  if (g === 3) c.ease += 0.1;
  c.due = Date.now() + c.interval * DAY;
}
function previewLabel(c, g) {
  const t = { ...c }; schedule(t, g);
  if (g === 0) return '10 мин';
  return t.interval + ' дн';
}
function newLeft() { return Math.max(0, S.settings.newPerDay - (S.stats.newLog[dayKey()] || 0)); }
/* разделы: номер раздела берём из встроенных лекций */
const SEC_NAMES = window.BUILTIN_SECTIONS || {};
const SEC_BY_LECTURE = {};
(window.BUILTIN_LECTURES || []).forEach((l) => { SEC_BY_LECTURE['b-' + l.id] = l.section; });
const sectionOf = (c) => SEC_BY_LECTURE[c.lecture] || 0;
const curSec = () => { const v = +S.settings.section || 0; return SEC_NAMES[v] ? v : 0; };
const inSec = (c, sec) => !sec || sectionOf(c) === sec;
function dueCards(sec = 0) {
  const now = Date.now();
  const rev = S.cards.filter((c) => inSec(c, sec) && c.seen && c.due <= now).sort((a, b) => a.due - b.due);
  const fresh = S.cards.filter((c) => inSec(c, sec) && !c.seen).slice(0, newLeft());
  return rev.concat(fresh);
}
function practiceCards(sec = 0) {
  return S.cards.filter((c) => inSec(c, sec))
    .map((c) => [c, (c.seen ? c.ease : 2.6) + Math.random() * 0.6]) // слабые карточки чаще, остальное вперемешку
    .sort((a, b) => a[1] - b[1]).slice(0, 10).map((x) => x[0]);
}

/* ---------- встроенные лекции (lectures.js) ---------- */
function mergeBuiltin() {
  const B = window.BUILTIN_LECTURES || [];
  const seen = new Set(S.builtinSeen);
  B.forEach((l) => {
    const lid = 'b-' + l.id;
    if (!S.lectures.some((x) => x.id === lid) && l.cards.some((_, i) => !seen.has(lid + '-' + i)))
      S.lectures.push({ id: lid, title: l.title, notes: '', created: Date.now(), builtin: true });
    l.cards.forEach(([q, a], i) => {
      const cid = lid + '-' + i;
      if (seen.has(cid)) return;
      S.cards.push({ id: cid, lecture: lid, q, a, ease: 2.5, interval: 0, reps: 0, lapses: 0, due: Date.now(), created: Date.now(), seen: false });
      S.builtinSeen.push(cid);
    });
  });
}
mergeBuiltin();
const lectureName = (id) => (S.lectures.find((l) => l.id === id) || {}).title || '';

/* ---------- математика (KaTeX) ---------- */
function renderMath(el) {
  if (window.renderMathInElement) {
    try {
      renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true }
        ], throwOnError: false
      });
    } catch (e) {}
  }
}
function setText(el, text) { el.textContent = text; renderMath(el); }

/* ---------- вкладки ---------- */
$$('.tabs button').forEach((b) => b.addEventListener('click', () => {
  $$('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  refresh();
}));

/* ---------- отрисовка ---------- */
function refresh() {
  save();
  $('#hStreak').textContent = streakNow();
  $('#hLevel').textContent = level(S.stats.xp);
  $('#hXp').textContent = S.stats.xp;

  const sec = curSec();
  renderChips();
  const dl = dueCards(sec), due = dl.length, nNew = dl.filter((c) => !c.seen).length;
  $('#dueCount').textContent = due;
  $('#dueSplit').textContent = due ? `повторить: ${due - nNew} · новых: ${nNew}` : (S.cards.some((c) => inSec(c, sec) && !c.seen) ? 'Новые карточки откроются завтра' : '');
  $('#playBtn').disabled = due === 0;
  const pc = S.cards.filter((c) => inSec(c, sec)).length;
  $('#practiceBtn').disabled = pc === 0;
  $('#practiceBtn').textContent = sec ? `Практика: раздел ${sec}` : 'Практика по всем разделам';
  $('#playBtn').style.opacity = due === 0 ? .5 : 1;

  const done = S.stats.log[dayKey()] || 0;
  const goal = S.settings.goal;
  $('#goalBar').style.width = Math.min(100, done / goal * 100) + '%';
  $('#goalText').textContent = `${done} из ${goal} карточек${done >= goal ? ' — цель выполнена! 🎉' : ''}`;

  const rem = $('#reminder');
  rem.hidden = due === 0;
  rem.textContent = `Пора повторять: ${due} ${plural(due)}`;

  // прогноз на 7 дней
  const f = $('#forecast'); f.innerHTML = '';
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const counts = [];
  for (let i = 0; i < 7; i++) {
    const a = start.getTime() + i * DAY, b = a + DAY;
    counts.push(i === 0 ? due : S.cards.filter((c) => inSec(c, sec) && c.seen && c.due >= a && c.due < b).length);
  }
  const max = Math.max(1, ...counts);
  counts.forEach((n, i) => {
    const d = new Date(start.getTime() + i * DAY);
    const col = document.createElement('div');
    const bar = document.createElement('i'); bar.style.height = (n / max * 60) + 'px';
    col.append(bar, document.createTextNode(n + ' · ' + (i === 0 ? 'сег' : d.toLocaleDateString('ru', { weekday: 'short' }))));
    f.append(col);
  });

  renderCards();
}
const plural = (n) => (n % 10 === 1 && n % 100 !== 11) ? 'карточка' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 'карточки' : 'карточек';
function streakNow() {
  const l = S.stats.last;
  if (!l) return 0;
  const y = dayKey(new Date(Date.now() - DAY));
  return (l === dayKey() || l === y) ? S.stats.streak : 0;
}
function renderChips() {
  const box = $('#secChips'); box.innerHTML = '';
  const sec = curSec();
  const add = (v, label, n) => {
    const b = document.createElement('button'); b.className = 'chip' + (v === sec ? ' active' : '');
    b.append(label);
    if (n) { const k = document.createElement('b'); k.textContent = n; b.append(k); }
    b.onclick = () => { S.settings.section = v; refresh(); };
    box.append(b);
  };
  add(0, 'Все', dueCards(0).length);
  Object.keys(SEC_NAMES).forEach((k) => add(+k, 'Раздел ' + k, dueCards(+k).length));
  $('#secName').textContent = sec ? `${sec}. ${SEC_NAMES[sec]}` : 'Все разделы вместе';
}
function renderCards() {
  const q = $('#search').value.trim().toLowerCase();
  const box = $('#cardList'); box.innerHTML = '';
  const list = S.cards.filter((c) => !q || (c.q + ' ' + c.a).toLowerCase().includes(q)).slice(0, 200);
  if (!list.length) { box.innerHTML = '<span class="muted">Карточек нет.</span>'; return; }
  list.forEach((c) => {
    const row = document.createElement('div'); row.className = 'item';
    const t = document.createElement('div'); t.className = 't';
    const qq = document.createElement('div'); qq.textContent = c.q;
    const bd = document.createElement('div'); bd.className = 'badge';
    const d = !c.seen ? 'новая' : c.due <= Date.now() ? 'пора повторить' : 'через ' + Math.ceil((c.due - Date.now()) / DAY) + ' дн';
    bd.textContent = `${lectureName(c.lecture)} · ${d}`;
    t.append(qq, bd); renderMath(qq);
    const del = document.createElement('button'); del.textContent = '✕';
    del.onclick = () => { S.cards = S.cards.filter((x) => x.id !== c.id); refresh(); };
    row.append(t, del); box.append(row);
  });
}
$('#search').addEventListener('input', renderCards);

/* ---------- добавление данных ---------- */
/* ---------- игра ---------- */
let G = null;
function startGame(practice) {
  let q = practice ? practiceCards(curSec()) : dueCards(curSec()).slice(0, 10);
  if (!q.length) return;
  G = { q, total: q.length, i: 0, hearts: 3, combo: 0, bestCombo: 0, xp: 0, right: 0, wrong: 0, practice, lvl: level(S.stats.xp) };
  $('#game').hidden = false; $('#gResult').hidden = true;
  $('.flash').hidden = false;
  nextCard();
}
function hearts() { $('#gHearts').textContent = '❤️'.repeat(G.hearts) + '🖤'.repeat(3 - G.hearts); }
function nextCard() {
  if (G.i >= G.q.length || G.hearts <= 0) return finish();
  const c = G.q[G.i];
  hearts();
  $('#gBar').style.width = (Math.min(G.i, G.total) / G.total * 100) + '%';
  $('#gCombo').textContent = G.combo >= 2 ? `🔥 комбо ×${G.combo}` : '';
  $('#gLecture').textContent = lectureName(c.lecture);
  setText($('#gQ'), c.q);
  setText($('#gA'), c.a);
  $('#gA').hidden = true; $('#gShow').hidden = false; $('#gGrades').hidden = true;
  $('.flash').classList.remove('pop'); void $('.flash').offsetWidth; $('.flash').classList.add('pop');
}
$('#gShow').onclick = () => {
  const c = G.q[G.i];
  $('#gA').hidden = false; $('#gShow').hidden = true; $('#gGrades').hidden = false;
  $$('#gGrades button').forEach((b) => { b.querySelector('small').textContent = G.practice ? '' : previewLabel(c, +b.dataset.g); });
};
$$('#gGrades button').forEach((b) => b.addEventListener('click', () => {
  const g = +b.dataset.g, c = G.q[G.i];
  if (g === 0) {
    G.wrong++; G.combo = 0; G.hearts--;
    if (!G.practice && !G.q.slice(G.i + 1).includes(c) && G.hearts > 0) G.q.push(c); // вернётся в конце раунда
  } else {
    G.right++; G.combo++; G.bestCombo = Math.max(G.bestCombo, G.combo);
    const gain = Math.round((g === 3 ? 15 : g === 2 ? 10 : 6) * (1 + Math.min(G.combo, 10) * 0.1) * (G.practice ? .5 : 1));
    G.xp += gain;
  }
  if (!G.practice) {
    if (!c.seen) { c.seen = true; const k = dayKey(); S.stats.newLog[k] = (S.stats.newLog[k] || 0) + 1; }
    schedule(c, g); bumpDay();
  }
  G.i++;
  save(); nextCard();
}));
function bumpDay() {
  const k = dayKey();
  S.stats.log[k] = (S.stats.log[k] || 0) + 1;
  if (S.stats.last !== k) {
    S.stats.streak = (S.stats.last === dayKey(new Date(Date.now() - DAY))) ? S.stats.streak + 1 : 1;
    S.stats.last = k;
    S.stats.best = Math.max(S.stats.best || 0, S.stats.streak);
  }
}
function finish() {
  S.stats.xp += G.xp;
  const lvl = level(S.stats.xp), up = lvl > G.lvl;
  save();
  $('.flash').hidden = true; $('#gShow').hidden = true; $('#gGrades').hidden = true;
  const r = $('#gResult'); r.hidden = false; r.innerHTML = '';
  const h = document.createElement('h2');
  h.textContent = G.hearts <= 0 ? 'Жизни закончились 💔' : 'Раунд пройден! 🎉';
  const lines = [
    `+${G.xp} XP${up ? ` · новый уровень ${lvl}! ⭐` : ''}`,
    `Верно: ${G.right} · Ошибок: ${G.wrong}`,
    `Лучшее комбо: ×${G.bestCombo}`,
    `Серия: 🔥 ${streakNow()} дн`
  ];
  r.append(h);
  lines.forEach((t) => { const p = document.createElement('div'); p.className = 'stat'; p.textContent = t; r.append(p); });
  const again = document.createElement('button'); again.className = 'primary'; again.textContent = 'Ещё раунд';
  const wasPractice = G.practice;
  again.onclick = () => { closeGame(); if (wasPractice || dueCards(curSec()).length) startGame(wasPractice); };
  const home = document.createElement('button'); home.className = 'ghost'; home.textContent = 'На главную';
  home.onclick = closeGame;
  r.append(again, home);
  refresh();
}
function closeGame() {
  if (G && G.i > 0 && G.i < G.q.length && G.hearts > 0) S.stats.xp += G.xp; // досрочный выход сохраняет набранное
  G = null; $('#game').hidden = true; $('.flash').hidden = false; refresh();
}
$('#gClose').onclick = closeGame;
$('#playBtn').onclick = () => startGame(false);
$('#practiceBtn').onclick = () => startGame(true);

/* ---------- настройки ---------- */
$('#goalInput').value = S.settings.goal;
$('#goalInput').onchange = (e) => { S.settings.goal = Math.max(1, +e.target.value || 20); refresh(); };
$('#newInput').value = S.settings.newPerDay;
$('#newInput').onchange = (e) => { S.settings.newPerDay = Math.max(0, +e.target.value || 0); refresh(); };
$('#remindTime').value = S.settings.remind || '';
$('#remindTime').onchange = (e) => { S.settings.remind = e.target.value; save(); };
$('#notifyBtn').onclick = async () => {
  if (!('Notification' in window)) return alert('Браузер не поддерживает уведомления');
  const p = await Notification.requestPermission();
  alert(p === 'granted' ? 'Уведомления включены' : 'Уведомления не разрешены');
};
$('#exportBtn').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }));
  a.download = 'mat-povtor-' + dayKey() + '.json'; a.click();
};
$('#importFile').onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then((t) => {
    try {
      const d = JSON.parse(t);
      if (!Array.isArray(d.cards) || !Array.isArray(d.lectures)) throw 0;
      if (!confirm('Заменить текущие данные загруженной копией?')) return;
      S = d; S.stats.newLog = S.stats.newLog || {}; S.builtinSeen = S.builtinSeen || []; mergeBuiltin(); refresh(); alert('Готово');
    } catch (err) { alert('Это не похоже на копию данных'); }
  });
};
$('#resetBtn').onclick = () => {
  if (confirm('Точно удалить все лекции, карточки и прогресс?')) { localStorage.removeItem(KEY); location.reload(); }
};

/* ---------- напоминания, пока сайт открыт ---------- */
function checkReminder() {
  const due = dueCards().length;
  if (!due || !('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date(), hhmm = now.toTimeString().slice(0, 5);
  const byTime = S.settings.remind && hhmm === S.settings.remind;
  const byGap = !S.settings.remind && Date.now() - (S.settings.lastNotify || 0) > 3 * 3600e3;
  if ((byTime && Date.now() - (S.settings.lastNotify || 0) > 120e3) || byGap) {
    S.settings.lastNotify = Date.now(); save();
    new Notification('Пора повторять математику', { body: `Карточек к повтору: ${due}. Заходи в игру!` });
  }
}
setInterval(() => { if ($('#game').hidden) refresh(); checkReminder(); }, 60e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden && $('#game').hidden) refresh(); });

refresh();
checkReminder();
