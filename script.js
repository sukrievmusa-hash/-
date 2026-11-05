'use strict';
window.addEventListener('error', (e) => {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:99;background:#ef5b6b;color:#fff;padding:10px 12px;border-radius:10px;font:13px system-ui';
  d.textContent = 'Ошибка на сайте: ' + e.message + ' (скиньте это сообщение Claude)';
  document.body.append(d);
});
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
const LECS = (window.BUILTIN_LECTURES || []).map((l) => ({ id: 'b-' + l.id, section: l.section, title: l.title }));
const lecLabel = (t) => t.split('. ')[0];            // «Лекция 1»
const lecTopic = (t) => t.split('. ').slice(1).join('. '); // «Матрицы и определители»
const ALL = { t: 'all' };
const inScope = (c, sc) => (!sc || sc.t === 'all') ? true : sc.t === 'sec' ? sectionOf(c) === sc.id : c.lecture === sc.id;
function scopeTitle(sc) {
  if (!sc || sc.t === 'all') return 'Все темы';
  if (sc.t === 'sec') return `Раздел ${sc.id}. ${SEC_NAMES[sc.id]}`;
  return (LECS.find((l) => l.id === sc.id) || {}).title || '';
}
function dueCards(sc = ALL) {
  const now = Date.now();
  const rev = S.cards.filter((c) => inScope(c, sc) && c.seen && c.due <= now).sort((a, b) => a.due - b.due);
  const fresh = S.cards.filter((c) => inScope(c, sc) && !c.seen).slice(0, newLeft());
  return rev.concat(fresh);
}
function extraNewCards(sc = ALL) { return S.cards.filter((c) => inScope(c, sc) && !c.seen).slice(0, 10); }
function weakCards(sc = ALL) {
  return S.cards.filter((c) => inScope(c, sc) && (c.bad || 0) > 0)
    .sort((a, b) => (b.bad / ((b.ok || 0) + b.bad)) - (a.bad / ((a.ok || 0) + a.bad)) || b.bad - a.bad).slice(0, 10);
}
function practiceCards(sc = ALL) {
  return S.cards.filter((c) => inScope(c, sc))
    .map((c) => [c, (c.seen ? c.ease : 2.6) - 0.15 * Math.min(c.bad || 0, 6) + Math.random() * 0.6]) // слабые и «ошибочные» карточки чаще
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

  const dl = dueCards(ALL), due = dl.length;
  $('#dueCount').textContent = due;
  const by = {}; dl.forEach((c) => { by[c.lecture] = (by[c.lecture] || 0) + 1; });
  const parts = LECS.filter((l) => by[l.id]).map((l) => `${lecLabel(l.title)} · ${by[l.id]}`);
  $('#dueSplit').textContent = parts.length
    ? 'Сегодня: ' + parts.slice(0, 4).join(', ') + (parts.length > 4 ? ` и ещё ${parts.length - 4}` : '')
    : (S.cards.some((c) => !c.seen) ? 'На сегодня всё повторено ✓ Норма новых карточек выполнена' : 'На сегодня всё повторено ✓');
  const pb = $('#playBtn');
  pb.textContent = due ? '▶ Повторить на сегодня' : extraNewCards(ALL).length ? '➕ Выучить ещё 10 новых карточек' : '▶ Практика по всем темам';
  renderTopics();
  renderProgress();
  if (!$('#sheet').hidden) refreshSheet();

  const done = S.stats.log[dayKey()] || 0;
  const goal = S.settings.goal;
  $('#goalBar').style.width = Math.min(100, done / goal * 100) + '%';
  $('#goalText').textContent = `${done} из ${goal} карточек${done >= goal ? ' — цель выполнена! 🎉' : ''}`;

  // прогноз на 7 дней
  const f = $('#forecast'); f.innerHTML = '';
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const counts = [];
  for (let i = 0; i < 7; i++) {
    const a = start.getTime() + i * DAY, b = a + DAY;
    counts.push(i === 0 ? due : S.cards.filter((c) => c.seen && c.due >= a && c.due < b).length);
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
/* уровень знания карточки: 0 — не изучена, растёт с интервалом повторения (30+ дней = 100%) */
const cardLevel = (c) => !c.seen ? 0 : Math.min(1, 0.1 + 0.9 * Math.log2(1 + (c.interval || 0)) / Math.log2(31));
const LEVELS = [[0.2, 'Новичок'], [0.4, 'Знакомство'], [0.6, 'Уверенно'], [0.8, 'Хорошо'], [1.01, 'Мастер']];
const levelName = (x) => LEVELS.find((l) => x < l[0])[1];
const levelColor = (x) => x < 0.2 ? 'var(--bad)' : x < 0.4 ? 'var(--warn)' : x < 0.6 ? 'var(--accent)' : 'var(--good)';
function scopeStats(sc) {
  const all = S.cards.filter((c) => inScope(c, sc)), now = Date.now();
  const seen = all.filter((c) => c.seen).length;
  const rev = all.filter((c) => c.seen && c.due <= now).length;
  const fresh = Math.min(all.length - seen, newLeft());
  const level = all.length ? all.reduce((a, c) => a + cardLevel(c), 0) / all.length : 0;
  const ok = all.reduce((a, c) => a + (c.ok || 0), 0), bad = all.reduce((a, c) => a + (c.bad || 0), 0);
  return { total: all.length, seen, rev, fresh, due: rev + fresh, level, ok, bad, answers: ok + bad, errRate: ok + bad ? bad / (ok + bad) : 0 };
}
let openSec = 0;
function renderTopics() {
  const box = $('#topics'); box.innerHTML = '';
  const secs = Object.keys(SEC_NAMES).map(Number);
  if (!openSec) openSec = secs.find((k) => dueCards({ t: 'sec', id: k }).length) || secs[0] || 0;
  const pill = (st) => { // число — сколько карточек пора ПОВТОРИТЬ; «новое» — есть неизученные; ✓ — всё в порядке
    const p = document.createElement('span');
    p.className = 'pill' + (st.rev || st.fresh ? '' : ' zero') + (!st.rev && st.fresh ? ' new' : '');
    p.textContent = st.rev ? st.rev : st.fresh ? 'новое' : '✓';
    return p;
  };
  const row = (label, topic, sc, cls) => {
    const st = scopeStats(sc);
    const b = document.createElement('button'); b.className = 'lecrow ' + (cls || '');
    const t = document.createElement('div'); t.className = 't';
    const l1 = document.createElement('b'); l1.textContent = label;
    t.append(l1);
    if (topic) { const l2 = document.createElement('span'); l2.textContent = topic; t.append(l2); }
    const l3 = document.createElement('span'); l3.textContent = `Знание ${Math.round(st.level * 100)}% · ${levelName(st.level)}`; t.append(l3);
    const l4 = document.createElement('span'); l4.textContent = `изучено ${st.seen} из ${st.total}` + (st.rev ? ` · пора повторить: ${st.rev}` : ''); t.append(l4);
    const mini = document.createElement('div'); mini.className = 'mini'; const i = document.createElement('i'); i.style.width = Math.round(st.level * 100) + '%'; i.style.background = levelColor(st.level); mini.append(i); t.append(mini);
    b.append(t, pill(st)); b.onclick = () => openSheet(sc); return b;
  };
  secs.forEach((k) => {
    const sc = { t: 'sec', id: k };
    const wrap = document.createElement('div'); wrap.className = 'sec' + (openSec === k ? ' open' : '');
    const head = document.createElement('button'); head.className = 'sechead';
    const ar = document.createElement('span'); ar.className = 'arrow'; ar.textContent = '▸';
    const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = `Раздел ${k}. ${SEC_NAMES[k]}`;
    head.append(ar, nm, pill(scopeStats(sc)));
    head.onclick = () => { openSec = openSec === k ? -1 : k; renderTopics(); };
    const body = document.createElement('div'); body.className = 'lecs';
    body.append(row('Весь раздел', '', sc, 'all'));
    LECS.filter((l) => l.section === k).forEach((l) => body.append(row(lecLabel(l.title), lecTopic(l.title), { t: 'lec', id: l.id })));
    wrap.append(head, body); box.append(wrap);
  });
}

/* ---------- выбор: повторить или практика ---------- */
let sheetScope = null;
function openSheet(sc) { sheetScope = sc; refreshSheet(); $('#sheet').hidden = false; }
function closeSheet() { $('#sheet').hidden = true; }
function refreshSheet() {
  const sc = sheetScope, all = S.cards.filter((c) => inScope(c, sc));
  const st = scopeStats(sc), due = st.due;
  $('#shTitle').textContent = scopeTitle(sc);
  $('#shInfo').textContent = `Знание ${Math.round(st.level * 100)}% (${levelName(st.level)}). Изучено ${st.seen} из ${st.total}. Сегодня: повторить ${st.rev}, новых ${st.fresh}`;
  const more = extraNewCards(sc).length;
  $('#shRepeat').disabled = !due && !more;
  $('#shRepeat').textContent = due ? `▶ Повторить (${due})` : more ? `➕ Выучить ещё ${Math.min(10, more)} новых` : 'Всё повторено ✓';
  $('#shPractice').textContent = `Практика (${Math.min(10, all.length)} карточек)`;
  $('#shPractice').disabled = !all.length;
}
$('#shClose').onclick = closeSheet;
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
$('#shRepeat').onclick = () => { const sc = sheetScope; closeSheet(); startGame(false, sc, !dueCards(sc).length); };
$('#shPractice').onclick = () => { const sc = sheetScope; closeSheet(); startGame(true, sc); };

/* ---------- вкладка «Прогресс» ---------- */
function prow(title, sub, right, frac, color) {
  const d = document.createElement('div'); d.className = 'prow';
  const top = document.createElement('div'); top.className = 'ptop';
  const a = document.createElement('b'); a.textContent = title; const r = document.createElement('span'); r.textContent = right;
  top.append(a, r); d.append(top);
  if (sub) { const m = document.createElement('div'); m.className = 'muted small'; m.textContent = sub; d.append(m); }
  const bar = document.createElement('div'); bar.className = 'mini big'; const i = document.createElement('i');
  i.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%'; i.style.background = color; bar.append(i); d.append(bar);
  return d;
}
function renderProgress() {
  const secs = Object.keys(SEC_NAMES).map(Number);
  // общий уровень
  const all = scopeStats(ALL), pct = Math.round(all.level * 100);
  $('#lvOverall').textContent = pct + '%';
  $('#lvOverallName').textContent = `${levelName(all.level)} · изучено ${all.seen} из ${all.total}`;
  // шкала по разделам и лекциям
  const lv = $('#lvList'); lv.innerHTML = '';
  secs.forEach((k) => {
    const st = scopeStats({ t: 'sec', id: k });
    lv.append(prow(`Раздел ${k}. ${SEC_NAMES[k]}`, levelName(st.level), Math.round(st.level * 100) + '%', st.level, levelColor(st.level)));
    LECS.filter((l) => l.section === k).forEach((l) => {
      const ls = scopeStats({ t: 'lec', id: l.id }), r = prow(lecLabel(l.title), lecTopic(l.title), Math.round(ls.level * 100) + '%', ls.level, levelColor(ls.level));
      r.classList.add('sub'); lv.append(r);
    });
  });
  // где ошибаешься
  const errBox = $('#errList'); errBox.innerHTML = '';
  const MIN = 3; // мало ответов — статистика ненадёжна
  const errRow = (title, sub, st) => prow(title, sub, `${Math.round(st.errRate * 100)}% ошибок`, st.errRate, st.errRate >= .35 ? 'var(--bad)' : st.errRate >= .2 ? 'var(--warn)' : 'var(--good)');
  const secRows = secs.map((k) => ({ k, st: scopeStats({ t: 'sec', id: k }) })).filter((x) => x.st.answers >= MIN).sort((a, b) => b.st.errRate - a.st.errRate);
  const lecRows = LECS.map((l) => ({ l, st: scopeStats({ t: 'lec', id: l.id }) })).filter((x) => x.st.answers >= MIN).sort((a, b) => b.st.errRate - a.st.errRate);
  const hard = S.cards.filter((c) => (c.bad || 0) > 0).sort((a, b) => b.bad - a.bad || (b.bad / ((b.ok || 0) + b.bad)) - (a.bad / ((a.ok || 0) + a.bad))).slice(0, 5);
  $('#errEmpty').hidden = lecRows.length > 0 || hard.length > 0;
  $('#weakBtn').hidden = hard.length === 0;
  if (lecRows.length && lecRows[0].st.bad) {
    const w = lecRows[0]; const n = document.createElement('div'); n.className = 'weak';
    n.textContent = `Слабее всего: ${lecLabel(w.l.title)} — ${w.st.bad} ошибок из ${w.st.answers} ответов`; errBox.append(n);
  }
  if (secRows.length) { const h = document.createElement('div'); h.className = 'subh'; h.textContent = 'По разделам'; errBox.append(h);
    secRows.forEach((x) => errBox.append(errRow(`Раздел ${x.k}`, SEC_NAMES[x.k], x.st))); }
  if (lecRows.length) { const h = document.createElement('div'); h.className = 'subh'; h.textContent = 'По лекциям'; errBox.append(h);
    lecRows.forEach((x) => errBox.append(errRow(lecLabel(x.l.title), `${lecTopic(x.l.title)} · ${x.st.bad} из ${x.st.answers}`, x.st))); }
  const hb = $('#hardList'); hb.innerHTML = '';
  hard.forEach((c) => {
    const d = document.createElement('div'); d.className = 'item';
    const t = document.createElement('div'); t.className = 't';
    const q = document.createElement('div'); q.textContent = c.q;
    const m = document.createElement('div'); m.className = 'badge'; m.textContent = `${lectureName(c.lecture)} · ошибок ${c.bad} из ${(c.ok || 0) + c.bad}`;
    t.append(q, m); d.append(t); hb.append(d); renderMath(q);
  });
  $('#hardHead').hidden = hard.length === 0;
}
$('#weakBtn').onclick = () => startGame(true, ALL, false, true);

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
function startGame(practice, sc = ALL, extra = false, weak = false) {
  let q = weak ? weakCards(sc) : practice ? practiceCards(sc) : extra ? extraNewCards(sc) : dueCards(sc).slice(0, 10);
  if (!q.length) return;
  G = { q, total: q.length, i: 0, hearts: 3, combo: 0, bestCombo: 0, xp: 0, right: 0, wrong: 0, practice, extra, weak, scope: sc, lvl: level(S.stats.xp) };
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
  $('#gLecture').textContent = (G.weak ? 'Слабые места · ' : G.practice ? 'Практика · ' : 'Повторение · ') + lectureName(c.lecture);
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
  if (g === 0) c.bad = (c.bad || 0) + 1; else c.ok = (c.ok || 0) + 1; // статистика ошибок (и в практике тоже)
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
  const wasPractice = G.practice, wasWeak = G.weak, sc = G.scope;
  again.onclick = () => { closeGame(); if (wasWeak) startGame(true, sc, false, true); else if (wasPractice) startGame(true, sc); else if (dueCards(sc).length) startGame(false, sc); else if (extraNewCards(sc).length) startGame(false, sc, true); };
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
$('#playBtn').onclick = () => {
  if (dueCards(ALL).length) startGame(false, ALL);
  else if (extraNewCards(ALL).length) startGame(false, ALL, true);
  else startGame(true, ALL);
};

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
