'use strict';
/* Дуэли по ссылке: бык против быка (1 на 1 или команда на команду, до 2 на 2).
   У каждого свои карточки; верный ответ толкает быка соперника, ошибка откатывает своего.
   Связь: публичный MQTT-брокер по WebSocket — без своего сервера, ключей и аккаунтов, бесплатно.
   Протокол крошечный (CONNECT / SUBSCRIBE / PUBLISH), поэтому написан здесь, без библиотек. */
(() => {
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, txt) => { const d = document.createElement(tag); if (cls) d.className = cls; if (txt != null) d.textContent = txt; return d; };
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const A = S.arena;

  const AVS = ['🐂', '🦊', '🐼', '🐯', '🦁', '🐸', '🐵', '🦄', '🐲', '🤖', '👾', '🥷'];
  const COLS = [['Синий', '#2f7dff'], ['Красный', '#e5483c'], ['Зелёный', '#2fbf6a'], ['Фиолет', '#9b5cff'], ['Оранж', '#ff8a1e'], ['Золото', '#f2b705'], ['Розовый', '#ff5fa8'], ['Бирюза', '#19c6c0']];
  const FIGH = [['bull', 'Бык'], ['golem', 'Голем'], ['scorpion', 'Скорпион'], ['dragon', 'Дракон'], ['serpent', 'Змей']];
  const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
  const LIMIT = 240; // секунд на бой, потом решает положение быков
  const MAXP = 4;

  /* ---------- профиль ---------- */
  const P = A.duel = A.duel || {};
  if (!P.name) P.name = 'Игрок' + (100 + Math.floor(Math.random() * 900));
  if (!P.av) P.av = rnd(AVS);
  if (!FIGH.some((f) => f[0] === P.fk)) P.fk = 'bull';
  if (!P.col) P.col = rnd(COLS)[1];
  const myId = Math.random().toString(36).slice(2, 8);
  const mine = () => ({ id: myId, name: P.name.slice(0, 12), av: P.av, col: P.col, fk: P.fk });

  /* ---------- MQTT по WebSocket ---------- */
  const enc = new TextEncoder(), dec = new TextDecoder();
  const str = (s) => { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
  const remLen = (n) => { const o = []; do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; o.push(b); } while (n > 0); return o; };
  const pkt = (type, body) => Uint8Array.from([type, ...remLen(body.length), ...body]);
  function Net(topic, onMsg, onState) {
    let ws = null, ready = false, closed = false, ping = 0, ui = 0, buf = new Uint8Array(0);
    const cid = 'mr' + Math.random().toString(36).slice(2, 10);
    const brokers = (window.MR_CONFIG && MR_CONFIG.duelBrokers) || BROKERS;
    function open() {
      if (closed) return;
      const url = brokers[ui % brokers.length]; let done = false, to = 0; buf = new Uint8Array(0);
      onState('connecting');
      const retry = (ms) => { clearTimeout(to); clearInterval(ping); ready = false; try { me.close(); } catch (e) { /* уже закрыт */ } if (!closed) setTimeout(open, ms); };
      let me; try { me = ws = new WebSocket(url, 'mqtt'); } catch (e) { ui++; return setTimeout(open, 500); }
      const tx = (b) => { if (me.readyState === 1) me.send(b); };
      me.binaryType = 'arraybuffer';
      to = setTimeout(() => { if (!ready && ws === me) { ui++; retry(200); } }, 5000);
      me.onopen = () => tx(pkt(0x10, [0, 4, 77, 81, 84, 84, 4, 2, 0, 40, ...str(cid)]));
      me.onerror = () => { if (ws === me && !ready) { ui++; retry(300); } };
      me.onclose = () => { if (ws !== me || closed) return; if (ready) { clearInterval(ping); ready = false; onState('connecting'); setTimeout(open, 800); } else if (!done) { ui++; retry(300); } };
      me.onmessage = (e) => {
        const u = new Uint8Array(e.data), nb = new Uint8Array(buf.length + u.length); nb.set(buf); nb.set(u, buf.length); buf = nb;
        for (;;) {
          if (buf.length < 2) return;
          let i = 1, len = 0, mul = 1, b;
          do { if (i >= buf.length) return; b = buf[i++]; len += (b & 127) * mul; mul *= 128; } while (b & 128);
          if (buf.length < i + len) return;
          const t = buf[0] >> 4, fl = buf[0] & 15, body = buf.slice(i, i + len); buf = buf.slice(i + len);
          if (t === 2) { if (body[1] === 0) tx(pkt(0x82, [0, 1, ...str(topic), 0])); else { ui++; retry(500); return; } }
          else if (t === 9) { ready = true; done = true; clearTimeout(to); onState('ready'); clearInterval(ping); ping = setInterval(() => { try { tx(Uint8Array.of(0xC0, 0)); } catch (x) { /* связь оборвалась */ } }, 20000); }
          else if (t === 3) {
            const tl = (body[0] << 8) | body[1]; let k = 2 + tl; if ((fl >> 1) & 3) k += 2;
            try { onMsg(JSON.parse(dec.decode(body.slice(k)))); } catch (x) { /* чужой мусор в канале */ }
          }
        }
      };
    }
    open();
    return {
      send(o) { if (!ready || !ws || ws.readyState !== 1) return false; try { ws.send(pkt(0x30, [...str(topic), ...enc.encode(JSON.stringify(o))])); return true; } catch (e) { return false; } },
      close() { closed = true; clearInterval(ping); try { ws.close(); } catch (e) { /* уже закрыт */ } },
      get ready() { return ready; }
    };
  }

  /* ---------- состояние комнаты ---------- */
  let net = null, room = '', isHost = false, list = [], sec = 0, peers = {}, teamOf = {}, hostSeen = 0, netState = 'off', timers = [], match = null, note = '';
  const rc = () => Array.from({ length: 6 }, () => rnd('abcdefghjkmnpqrstuvwxyz23456789')).join('');
  const link = () => (window.MR_CONFIG && MR_CONFIG.site || location.origin + location.pathname) + '#duel=' + room;
  const every = (ms, f) => { const t = setInterval(f, ms); timers.push(t); return t; };
  const clearTimers = () => { timers.forEach(clearInterval); timers = []; };
  const send = (o) => net && net.send(Object.assign({ id: myId }, o));
  const secs = () => Object.keys(window.BUILTIN_SECTIONS || {}).map(Number);
  const secTitle = (k) => k === 99 ? 'Сессия 1. Математика (300 вопросов)' : `Раздел ${k}. ${SEC_NAMES[k]}`;

  function connect(code, host) {
    leaveNet(); room = code; isHost = host; list = []; peers = {}; teamOf = {}; hostSeen = host ? Date.now() : 0; note = '';
    if (!sec) sec = secs()[0] || 1;
    net = Net('mathrepeat/duel1/' + code, onMsg, (s) => { netState = s; if (s === 'ready') { hello(); if (isHost) rebuild(); } renderRoom(); });
    every(1500, () => { if (!match) { hello(); if (isHost) rebuild(); } renderRoom(); });
    if (!host) hash(code);
  }
  function leaveNet() { clearTimers(); if (net) net.close(); net = null; room = ''; list = []; netState = 'off'; }
  function hash(code) { try { history.replaceState(null, '', location.pathname + location.search + (code ? '#duel=' + code : '')); } catch (e) { /* не страшно */ } }
  const hello = () => send({ t: 'hello', p: mine() });

  /* хозяин собирает список игроков и команды; остальные только показывают присланное */
  function rebuild(force) {
    if (!isHost) return;
    const now = Date.now(), live = Object.values(peers).filter((x) => now - x.seen < 6000).map((x) => x.p), out = [];
    const all = [Object.assign(mine(), { host: 1 }), ...live].slice(0, MAXP);
    const cnt = [0, 0]; all.forEach((x) => { if (teamOf[x.id] != null) cnt[teamOf[x.id]]++; });
    all.forEach((x) => { if (teamOf[x.id] == null) { teamOf[x.id] = cnt[0] <= cnt[1] ? 0 : 1; cnt[teamOf[x.id]]++; } out.push(Object.assign({}, x, { team: teamOf[x.id] })); });
    const same = JSON.stringify(out) === JSON.stringify(list); list = out;
    send({ t: 'room', sec, list });
    if (!same || force) renderRoom();
  }

  function onMsg(m) {
    if (!m || m.id === myId) return;
    if (m.t === 'hello' && isHost) { peers[m.id] = { p: m.p, seen: Date.now() }; rebuild(); }
    else if (m.t === 'room' && !isHost) { hostSeen = Date.now(); list = m.list || []; sec = m.sec || sec; renderRoom(); }
    else if (m.t === 'team' && isHost) { teamOf[m.id] = m.team; rebuild(true); }
    else if (m.t === 'start' && !match) beginMatch(m.list, m.sec);
    else if (match) inMatch(m);
  }

  /* ---------- бой ---------- */
  function calc(right, crit) { // сила толчка одинакова у всех: решают только знания и скорость ответа
    const f = match.fac;
    return right ? (crit ? 0.3 : 0.2) * f : -0.14 * f;
  }
  function beginMatch(l, s) {
    const meE = l.find((x) => x.id === myId); if (!meE) return;
    const mates = l.filter((x) => x.team === meE.team && x.id !== myId), foes = l.filter((x) => x.team !== meE.team);
    if (!foes.length) return;
    sec = s; const sc = { t: 'sec', id: s };
    let pool = [...dueCards(sc), ...extraNewCards(sc)];
    if (pool.length < 25) pool = pool.concat(practiceCards(sc));
    const seen = new Set(); pool = pool.filter((c) => !seen.has(c.id) && seen.add(c.id));
    if (!pool.length) pool = S.cards.filter((c) => sectionOf(c) === s);
    if (!pool.length) { note = 'В этом разделе нет карточек'; return; }
    let q = shuffle(pool).slice(0, 60); while (q.length < 40) q = q.concat(shuffle(pool));
    const fac = 2 / (mates.length + 2);
    const D = {
      me: meE, mates, foes, myTeam: meE.team, rcol: foes[0].col === meE.col ? COLS.find((c) => c[1] !== meE.col)[1] : foes[0].col, calc,
      send: (o) => send(o), localEnd: (won) => endMatch(won ? meE.team : 1 - meE.team, null, true)
    };
    match = { D, myTeam: meE.team, fac, ended: false, seen: {}, left: {}, t0: Date.now(), list: l };
    l.forEach((x) => { match.seen[x.id] = Date.now(); });
    clearTimers(); hideLobby();
    launch(q, { practice: false, extra: false, scope: sc, size: q.length, hearts: 99, arena: { sec: s, duel: D } });
    every(1000, tick); every(1200, () => { const f = Arena._f(); if (f) send({ t: 'sync', p: f.pt, tm: match.myTeam }); }); every(2000, () => send({ t: 'hb' }));
  }
  function tick() {
    if (!match || match.ended) return;
    const left = Math.max(0, LIMIT - Math.floor((Date.now() - match.t0) / 1000));
    const v = $('#game .avs'); if (v) v.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
    const now = Date.now();
    Object.keys(match.seen).forEach((id) => { if (id !== myId && !match.left[id] && now - match.seen[id] > 12000) gone(id); });
    if (left === 0 && isHost) {
      const f = Arena._f(), p = f ? f.pt : 0;
      endMatch(p > 0.03 ? match.myTeam : p < -0.03 ? 1 - match.myTeam : -1, null, true);
    }
  }
  function gone(id) {
    match.left[id] = 1;
    const team = match.list.find((x) => x.id === id).team;
    if (!match.list.some((x) => x.team === team && !match.left[x.id] && x.id !== myId)) { if (team !== match.myTeam) endMatch(match.myTeam, 'left', true); }
  }
  function inMatch(m) {
    if (match.seen[m.id] == null) return; match.seen[m.id] = Date.now();
    const who = match.list.find((x) => x.id === m.id); if (!who) return;
    if (m.t === 'push') Arena.duelMsg(m.d, m.crit, who.av, who.team === match.myTeam);
    else if (m.t === 'sync' && who.host) { const f = Arena._f(); if (f && !f.ko) f.pt += ((who.team === match.myTeam ? m.p : -m.p) - f.pt) * 0.5; }
    else if (m.t === 'end') endMatch(m.w, m.why, false);
    else if (m.t === 'leave') gone(m.id);
  }
  function endMatch(winTeam, why, announce) {
    if (!match || match.ended) return; match.ended = true;
    if (announce) [0, 300, 900].forEach((d) => setTimeout(() => send({ t: 'end', w: winTeam, why }), d));
    Arena.duelFinish(winTeam === -1 ? null : winTeam === match.myTeam, why);
  }
  function onStop() { // бой закрыт (результат, выход)
    if (match && !match.ended) send({ t: 'leave' });
    if (match) { match = null; clearTimers(); if (net) { every(1500, () => { hello(); if (isHost) rebuild(); }); } }
  }

  /* ---------- экран «Дуэль» ---------- */
  const box = el('div', 'overlay dlobby'); box.id = 'duelLobby'; box.hidden = true;
  box.innerHTML = `<div class="hubbox"><div class="gtop"><button class="x" id="dlClose" aria-label="Закрыть">✕</button><h2>ДУЭЛЬ</h2></div>
    <div class="muted small hubnote">Бык против быка. Прокачки нет: решают только знания. У каждого свои карточки: верный ответ толкает быка соперника, быстрый — сильнее, ошибка откатывает твоего. Кто первым вдавит соперника в стену, тот выиграл. Можно 2 на 2: позови друзей по ссылке.</div>
    <div class="dl-card" id="dlProf"></div>
    <div class="dl-card" id="dlRoom"></div></div>`;
  document.body.append(box);
  $('#dlClose').onclick = () => { hideLobby(); if (netState !== 'off' && !match) leave(); };
  const hideLobby = () => { box.hidden = true; stopPrev(); };

  let prevRaf = 0;
  function stopPrev() { cancelAnimationFrame(prevRaf); prevRaf = 0; }
  function preview(cv) {
    const cx = cv.getContext('2d'), W = cv.width, H = cv.height;
    const frame = (t) => {
      if (box.hidden) { prevRaf = 0; return; }
      cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, W, H);
      const k = { bull: 1.0, golem: .8, dragon: .86, scorpion: 1.0, serpent: .95 }[P.fk] || 1; cx.setTransform(k, 0, 0, k, { bull: 22, golem: 36, dragon: 28, scorpion: 14, serpent: 10 }[P.fk] || 12, H - 10);
      const s = .5 + .5 * Math.sin(t / 600);
      Rig.draw(cx, { key: 'golem', lkey: P.fk, hide: 'boss', t: t / 1000, p: .15, kickM: s * .5, kickB: 0, flashM: 0, flashB: 0, koM: 0, koB: 0, scars: 0, shield: 0, blockT: 0, charge: 0, turbo: false, raged: false, stun: 0, hpFrac: 1, introM: 0, introB: 0, col: P.col });
      prevRaf = requestAnimationFrame(frame);
    };
    stopPrev(); prevRaf = requestAnimationFrame(frame);
  }

  function renderProf() {
    const c = $('#dlProf'); c.innerHTML = '';
    c.append(el('h3', '', 'Твой боец'), el('div', 'muted small', 'Боец, цвет и аватарка только для красоты. В бою всё решают знания: сила толчка у всех одинаковая.'));
    const top = el('div', 'dl-top');
    const cv = el('canvas', 'dl-prev'); cv.width = 300; cv.height = 190; top.append(cv);
    const f = el('div', 'dl-form');
    const inp = el('input'); inp.maxLength = 12; inp.value = P.name; inp.placeholder = 'Имя'; inp.oninput = () => { P.name = inp.value.trim() || 'Игрок'; save(); hello(); };
    f.append(inp);
    const av = el('div', 'dl-av'); AVS.forEach((a) => { const b = el('button', a === P.av ? 'on' : '', a); b.onclick = () => { P.av = a; save(); renderProf(); hello(); }; av.append(b); }); f.append(av);
    top.append(f); c.append(top);
    const fg = el('div', 'dl-fig'); FIGH.forEach(([k, n]) => { const b = el('button', k === P.fk ? 'on' : ''); const im = el('img'); im.src = `arena/${k}.webp?v=2`; im.alt = ''; b.append(im, el('span', '', n)); b.onclick = () => { P.fk = k; save(); renderProf(); hello(); }; fg.append(b); }); c.append(fg);
    const cols = el('div', 'dl-cols'); if (P.fk !== 'bull') cols.hidden = true; COLS.forEach(([n, h]) => { const b = el('button', h === P.col ? 'on' : ''); b.style.background = h; b.title = n; b.setAttribute('aria-label', n); b.onclick = () => { P.col = h; save(); renderProf(); hello(); }; cols.append(b); }); c.append(cols);
    preview(cv);
  }

  function renderRoom() {
    const c = $('#dlRoom'); if (box.hidden || !c) return;
    const keep = c.querySelector('input.dl-code'), typing = keep && document.activeElement === keep;
    if (typing) return;
    c.innerHTML = '';
    if (!room) {
      c.append(el('h3', '', 'Бой'));
      const sel = el('select'); secs().forEach((k) => { const o = el('option', '', secTitle(k)); o.value = k; if (k === sec) o.selected = true; sel.append(o); });
      sel.onchange = () => { sec = +sel.value; };
      const mk = el('button', 'primary', 'Создать бой и позвать друга');
      mk.onclick = () => { sec = +sel.value; connect(rc(), true); renderRoom(); };
      c.append(el('label', 'muted small', 'Тема боя'), sel, mk);
      const j = el('div', 'dl-join'); const code = el('input', 'dl-code'); code.placeholder = 'Ссылка или код друга';
      const jb = el('button', 'ghost', 'Войти');
      jb.onclick = () => { const m = /duel=([a-z0-9]+)/i.exec(code.value) || /^\s*([a-z0-9]{4,10})\s*$/i.exec(code.value); if (m) { connect(m[1].toLowerCase(), false); renderRoom(); } else code.focus(); };
      j.append(code, jb); c.append(j);
      if (note) c.append(el('div', 'dl-note', note));
      return;
    }
    c.append(el('h3', '', isHost ? 'Твоя комната' : 'Комната друга'));
    if (netState !== 'ready') { c.append(el('div', 'dl-note', 'Подключаюсь к серверу…')); }
    const lb = el('div', 'dl-link'); lb.append(el('code', '', link()));
    const sh = el('button', 'primary', 'Поделиться ссылкой'); sh.onclick = share;
    c.append(lb, sh);
    const teams = [0, 1].map((t) => list.filter((x) => x.team === t));
    const row = el('div', 'dl-teams');
    teams.forEach((tm, t) => {
      const col = el('div', 'dl-team'); col.append(el('div', 'th', 'Команда ' + (t ? 'Б' : 'А')));
      tm.forEach((x) => {
        const a = el('div', 'dl-pl'); a.style.setProperty('--c', x.col);
        const fi = el('img', 'fi'); fi.src = `arena/${x.fk || 'bull'}.webp?v=2`; fi.alt = ''; a.append(fi, el('i', '', x.av), el('b', '', x.name + (x.id === myId ? ' (ты)' : '')));
        if (x.id === myId) { const sw = el('button', 'sw', '⇄'); sw.title = 'Сменить команду'; sw.onclick = () => { if (isHost) { teamOf[myId] = 1 - t; rebuild(true); } else send({ t: 'team', team: 1 - t }); }; a.append(sw); }
        col.append(a);
      });
      if (!tm.length) col.append(el('div', 'muted small', 'пусто'));
      row.append(col);
    });
    c.append(row);
    const ok = teams[0].length && teams[1].length;
    if (isHost) {
      const sel = el('select'); secs().forEach((k) => { const o = el('option', '', secTitle(k)); o.value = k; if (k === sec) o.selected = true; sel.append(o); });
      sel.onchange = () => { sec = +sel.value; rebuild(true); };
      const go = el('button', 'primary', ok ? 'НАЧАТЬ БОЙ' : 'Ждём соперника…'); go.disabled = !ok;
      go.onclick = () => { const l = list.slice(); [0, 250, 600].forEach((d) => setTimeout(() => send({ t: 'start', list: l, sec }), d)); beginMatch(l, sec); };
      c.append(el('label', 'muted small', 'Тема боя'), sel, go);
      if (list.length < 2) c.append(el('div', 'muted small', 'Отправь ссылку другу: как только он зайдёт, он появится здесь.'));
    } else {
      c.append(el('div', 'dl-note', hostSeen && Date.now() - hostSeen < 6000 ? `Тема: ${secTitle(sec)}. Ждём, пока хозяин начнёт бой` : netState === 'ready' && Date.now() - (hostSeen || 0) > 7000 ? 'Хозяин комнаты не отвечает. Проверь ссылку: он должен держать страницу открытой.' : 'Ищу комнату…'));
    }
    const lv = el('button', 'ghost', 'Выйти из комнаты'); lv.onclick = leave; c.append(lv);
    if (note) c.append(el('div', 'dl-note', note));
  }
  async function share() {
    const url = link(), text = 'Сыграем в дуэль быков по математике! Заходи по ссылке:';
    if (navigator.share) { try { await navigator.share({ title: 'Дуэль быков', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); } catch (e) { const t = el('textarea'); t.value = url; document.body.append(t); t.select(); try { document.execCommand('copy'); } catch (x) { /* нет прав */ } t.remove(); }
    const b = $('#dlRoom .primary'); if (b) { b.textContent = 'Ссылка скопирована ✓'; setTimeout(() => { if (b.isConnected) b.textContent = 'Поделиться ссылкой'; }, 1600); }
  }
  function leave() { if (match && !match.ended) send({ t: 'leave' }); leaveNet(); hash(''); renderRoom(); }
  function open(code) {
    if (!S.cards.length) return;
    hideAllOverlays();
    box.hidden = false; note = ''; renderProf();
    if (code && code !== room) connect(code, false);
    renderRoom();
  }
  const hideAllOverlays = () => { const h = $('#arenaHub'); if (h) h.hidden = true; };
  function fromHash() { const m = /duel=([a-z0-9]+)/i.exec(location.hash); if (m && !match) open(m[1].toLowerCase()); }
  window.addEventListener('hashchange', fromHash);
  setTimeout(fromHash, 400);

  window.Duel = { open, leave, onStop, rematch: () => { box.hidden = false; renderProf(); renderRoom(); } };
})();
