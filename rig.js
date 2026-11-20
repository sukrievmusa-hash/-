'use strict';
/* Арена: бойцы, нарисованные кодом. Бык и боссы собраны из частей (корпус, суставы, поршни, шестерёнки),
   руки и ноги ставятся через IK: голем держит быка за рога, ноги упираются в пол.
   Координаты «виртуальные»: ширина сцены 430, пол на y = 0, вверх — минус. */
window.Rig = (() => {
  let cx = null, BT = 0, BTC = [0, 0, 0], TINT = 0, TC = [255, 255, 255], FLIP = false, OUTER = false, MIR = false, PLANTS = [];
  const LASTU = {};
  const OUT = '#0b0e16', LW = 3;
  const VW = 430;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rad = (d) => d * Math.PI / 180;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const C = (h, s = 0) => {
    let r = hex(h);
    if (s > 0) r = mixc(r, [255, 255, 255], s); else if (s < 0) r = mixc(r, [6, 8, 16], -s);
    if (BT > 0) r = mixc(r, BTC, BT);
    if (TINT > 0) r = mixc(r, TC, TINT);
    return `rgb(${r[0] | 0},${r[1] | 0},${r[2] | 0})`;
  };
  const shade = (h, k) => '#' + mixc(hex(h), [6, 8, 16], k).map((v) => (v | 0).toString(16).padStart(2, '0')).join('');
  const RGBA = (h, a) => { const r = hex(h); return `rgba(${r[0]},${r[1]},${r[2]},${clamp(a, 0, 1)})`; };

  /* ---------- примитивы ---------- */
  function poly(pts) { cx.beginPath(); cx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) cx.lineTo(pts[i][0], pts[i][1]); cx.closePath(); }
  function blob(pts) {
    const n = pts.length, m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    cx.beginPath(); const s = m(pts[n - 1], pts[0]); cx.moveTo(s[0], s[1]);
    for (let i = 0; i < n; i++) { const p = pts[i], e = m(p, pts[(i + 1) % n]); cx.quadraticCurveTo(p[0], p[1], e[0], e[1]); }
    cx.closePath();
  }
  function shape(fill, lw = LW) { cx.fillStyle = fill; cx.fill(); cx.lineJoin = 'round'; cx.lineWidth = lw; cx.strokeStyle = OUT; cx.stroke(); }
  function vg(y0, y1, c, l = .35, d = .4) { const g = cx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, C(c, l)); g.addColorStop(.5, C(c)); g.addColorStop(1, C(c, -d)); return g; }
  function line(a, b) { cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); }
  function limb(a, b, w, c, hl = true) {
    cx.lineCap = 'round';
    cx.strokeStyle = OUT; cx.lineWidth = w + LW * 2; line(a, b); cx.stroke();
    cx.strokeStyle = C(c, -.1); cx.lineWidth = w; line(a, b); cx.stroke();
    if (hl) { const o = w * .18; cx.strokeStyle = C(c, .32); cx.lineWidth = w * .36; line([a[0] - o * .4, a[1] - o], [b[0] - o * .4, b[1] - o]); cx.stroke(); }
  }
  function disc(x, y, r, c, lw = LW) {
    cx.beginPath(); cx.arc(x, y, r, 0, 7);
    const g = cx.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r); g.addColorStop(0, C(c, .4)); g.addColorStop(1, C(c, -.35));
    shape(g, lw);
  }
  function glow(x, y, r, c, a = 1) {
    if (!(r > 0) || a <= 0) return;
    cx.save(); cx.globalCompositeOperation = 'lighter';
    const g = cx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, RGBA(c, a)); g.addColorStop(.4, RGBA(c, a * .45)); g.addColorStop(1, RGBA(c, 0));
    cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill(); cx.restore();
  }
  function lamp(x, y, r, c) { cx.beginPath(); cx.arc(x, y, r, 0, 7); shape(C(c, .25), 2); glow(x, y, r * 3.2, c, .8); }
  function gear(x, y, r, rot, c, teeth = 8) {
    cx.save(); cx.translate(x, y); cx.rotate(rot); cx.beginPath();
    for (let i = 0; i < teeth * 4; i++) { const a = i / (teeth * 4) * Math.PI * 2, rr = (i % 4 < 2) ? r : r * .78; cx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    cx.closePath(); shape(C(c), 2);
    cx.beginPath(); cx.arc(0, 0, r * .35, 0, 7); shape(C('#1a1f2b'), 1.5); cx.restore();
  }
  function bolt(x, y, r = 2) { cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fillStyle = C('#cfd6e4'); cx.fill(); cx.lineWidth = 1; cx.strokeStyle = OUT; cx.stroke(); }
  function txt(s, x, y, size, color, rot = 0) {
    cx.save(); cx.translate(x, y); if (FLIP !== OUTER) cx.scale(-1, 1); cx.rotate(rot);
    cx.font = `900 ${size}px system-ui,sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.lineWidth = 2.5; cx.strokeStyle = OUT; cx.strokeText(s, 0, 0); cx.fillStyle = color; cx.fillText(s, 0, 0); cx.restore();
  }
  /* шаг: опорная фаза — лапа скребёт назад, потом отрывается, летит вперёд и ударяет в пол (событие «приземление» для пыли и искр) */
  function stepFoot(key, off, t, eff, amp, wx) {
    const u = (((t * (1.05 + 1.7 * eff) + off) % 1) + 1) % 1;
    let dx, lift = 0;
    if (u < .62) dx = amp * (.5 - u / .62);
    else { const k = (u - .62) / .38; dx = amp * (-.5 + k); lift = Math.sin(Math.PI * k) * (7 + 13 * eff); }
    const pu = LASTU[key]; LASTU[key] = u;
    if (pu != null && pu > .8 && u < .25 && eff > .4) PLANTS.push({ x: MIR ? VW - wx : wx, e: eff });
    return [dx, lift];
  }
  function ik(a, t, l1, l2, dir) {
    const dx = t[0] - a[0], dy = t[1] - a[1], d = Math.hypot(dx, dy) || 1, dd = Math.min(d, l1 + l2 - .5), an = Math.atan2(dy, dx);
    const k = Math.acos(clamp((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), -1, 1)) * dir;
    return [[a[0] + Math.cos(an + k) * l1, a[1] + Math.sin(an + k) * l1], [a[0] + dx / d * dd, a[1] + dy / d * dd]];
  }
  function spline(pts, n) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < n; k++) {
        const u = k / n, u2 = u * u, u3 = u2 * u, f = (j) => .5 * (2 * p1[j] + (-p0[j] + p2[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u3);
        out.push([f(0), f(1)]);
      }
    }
    out.push(pts[pts.length - 1]); return out;
  }
  function shadow(x, w) { cx.save(); cx.fillStyle = 'rgba(0,0,0,.45)'; cx.beginPath(); cx.ellipse(x, 2, w, 7, 0, 0, 7); cx.fill(); cx.restore(); }
  function rot(p, o, a) { const c = Math.cos(a), s = Math.sin(a), dx = p[0] - o[0], dy = p[1] - o[1]; return [o[0] + dx * c - dy * s, o[1] + dx * s + dy * c]; }

  /* ================= БЫК ================= */
  // координаты образца (px картинки) → сцена: начало у переднего копыта на полу
  let K = .5; const OX = 330, OY = 466, L = (x, y) => [(x - OX) * K, (y - OY) * K];
  function bullPose(P) {
    const pr = P.p, k = P.kickM, t = P.t, str = .4 + Math.abs(pr);
    const lean = 2.5 * pr + 5 * k + Math.sin(t * 34) * str * .35;
    const dip = 4 * Math.max(0, -pr) - 2 * k + Math.sin(t * 17) * .4 + P.koM * 26;
    const PIV = L(342, 466), ca = Math.cos(rad(lean)), sa = Math.sin(rad(lean));
    const tf = (x, y) => { const dx = x - PIV[0]; return [PIV[0] + dx * ca - y * sa, dx * sa + y * ca + dip]; };
    return { lean, dip, PIV, tf, gN: tf(...L(440, 246)), gF: tf(...L(424, 241)) };
  }
  /* ---------- спрайты быка: собранный бык из образца + нижние части ног (красный → перекрашивается под цвет игрока) ---------- */
  const SPR = {}, CACHE = {};
  const PART = { body: [60, 205], hindN: [115, 392], hindF: [168, 420], frontS: [317, 423] };
  Object.keys(PART).forEach((k) => { const im = new Image(); im.onload = () => { SPR[k] = im; }; im.src = 'arena/bull2_' + k + '.webp?v=1'; });
  function hslOf(h) { const [r, g, b] = hex(h).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let hh = 0; if (d) { hh = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; } return hh * 60; }
  function recolor(name, col, tint, tc, lite) {
    const key = [name, col, tint, tc, lite ? 1 : 0].join('|'); if (CACHE[key]) return CACHE[key];
    const im = SPR[name], c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), px = d.data, shift = hslOf(col) - 3;
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      let r = px[i] / 255, gg = px[i + 1] / 255, b = px[i + 2] / 255;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), dl = mx - mn, l = (mx + mn) / 2;
      if (dl > .05) {
        let h = mx === r ? ((gg - b) / dl + 6) % 6 : mx === gg ? (b - r) / dl + 2 : (r - gg) / dl + 4; h *= 60;
        const sat = Math.min(1, dl / (1 - Math.abs(2 * l - 1) || 1) * 1.25);
        if (h < 28 || h > 330) { // красный металл перекрашиваем, жёлтые глаза и лампы не трогаем
          h = (h + shift + 720) % 360; const l2 = Math.min(.8, l * 1.08);
          const C2 = (1 - Math.abs(2 * l2 - 1)) * sat, X = C2 * (1 - Math.abs((h / 60) % 2 - 1)), m = l2 - C2 / 2, k = Math.floor(h / 60);
          const q = [[C2, X, 0], [X, C2, 0], [0, C2, X], [0, X, C2], [X, 0, C2], [C2, 0, X]][k % 6]; r = q[0] + m; gg = q[1] + m; b = q[2] + m;
        }
      }
      if (lite) { r = Math.min(1, r * 1.35); gg = Math.min(1, gg * 1.35); b = Math.min(1, b * 1.35); }
      if (tint > 0) { r += (tc[0] / 255 - r) * tint; gg += (tc[1] / 255 - gg) * tint; b += (tc[2] / 255 - b) * tint; }
      px[i] = r * 255; px[i + 1] = gg * 255; px[i + 2] = b * 255;
    }
    g.putImageData(d, 0, 0); return (CACHE[key] = c);
  }
  const img = (name, col, lite) => recolor(name, col, TINT > 0 ? Math.round(TINT * 6) / 6 : 0, TC, lite);
  // нога, стоящая на полу: голень поворачивается вокруг колена так, чтобы копыто касалось пола (lift — подъём при скрежете)
  /* ---------- ноги: копыта стоят на полу и не дёргаются ----------
     Тело едет вперёд → копыта стоят на месте, отстающая нога делает шаг вперёд.
     Тело толкают назад → бык упирается, копыта скользят по полу вместе с ним (искры). */
  const LEG4 = [ // J — колено на образце, F — точка копыта на полу, s — масштаб (ближняя передняя крупнее), pair — пара, по которой шагают по очереди
    { n: 'hindF', J: [182, 413], F: [190, 466], s: 1, pair: 0, d0: -6 },
    { n: 'frontS', J: [333, 415], F: [342, 466], s: 1, pair: 1, d0: 2 },
    { n: 'hindN', J: [137, 406], F: [130, 466], s: 1, pair: 0, d0: 4 },
    { n: 'frontS', J: [317, 404], F: [304, 466], s: 1.22, pair: 1, d0: -7, lite: true, PJ: [333, 418] },
  ];
  const FEET = {}, BACK = 11, FWD = 8, SWT = .2;
  function feetUpdate(P, base, legs = LEG4, key = '', ko = P.koM > .2, px = (L) => MIR ? VW - (P.bx + L.wx) : P.bx + L.wx, ks = 1) {
    const BK = BACK * ks, FW = FWD * ks;
    const sid = (P.sid || 'l') + key, st = FEET[sid] || (FEET[sid] = { bx: base, t: P.t, f: legs.map((L) => ({ d: L.d0, sw: null })) });
    let dt = P.t - st.t, db = base - st.bx; st.t = P.t; st.bx = base;
    if (dt < 0 || dt > .5 || Math.abs(db) > 40) { dt = 0; db = 0; } // пауза вкладки или перескок — не дёргаем
    const spd = dt > 0 ? Math.abs(db) / dt : 0, swT = clamp(SWT / (1 + spd / 50), .06, SWT);
    st.f.forEach((f, i) => {
      const L = legs[i];
      if (f.sw) { // шаг: копыто летит вперёд по дуге
        f.sw.u += dt / f.sw.T; f.sw.from -= db;
        if (f.sw.u >= 1) { f.d = f.sw.to; f.sw = null; PLANTS.push({ x: px(L), e: .35 }); }
        return;
      }
      if (db > 0) f.d -= db;                       // идёт вперёд: копыто стоит на полу
      else if (db < 0 && Math.random() < Math.min(.6, -db * .5)) PLANTS.push({ x: px(L), e: Math.min(1, -db * .4) }); // скользит назад
      f.d = clamp(f.d, -BK - 4 * ks, FW + 4 * ks);
      const busy = st.f.some((g, k) => g.sw && legs[k].pair === L.pair) || st.f.filter((g) => g.sw).length >= 2;
      if (!ko && f.d < -BK && !busy) f.sw = { u: 0, from: f.d, to: FW, T: swT };
    });
    return st.f.map((f) => {
      if (!f.sw) return { d: f.d, lift: 0 };
      const u = f.sw.u, e = u * u * (3 - 2 * u);
      return { d: f.sw.from + (f.sw.to - f.sw.from) * e, lift: Math.sin(Math.PI * u) * 9 * ks };
    });
  }
  function leg4(G, col, tf, ft) {
    if (!SPR[G.n]) return;
    const PJ = G.PJ || (G.n === 'frontS' ? [333, 415] : G.J), PF = G.n === 'frontS' ? [342, 466] : G.F; // точки на самом спрайте
    const j = tf(...L(G.J[0], G.J[1])), fp = L(G.F[0], G.F[1]), tx = fp[0] + ft.d, ty = -ft.lift;
    const sv = [(PF[0] - PJ[0]) * K * G.s, (PF[1] - PJ[1]) * K * G.s], v = [tx - j[0], ty - j[1]];
    const st = clamp(Math.hypot(v[0], v[1]) / Math.hypot(sv[0], sv[1]), .88, 1.12);
    G.wx = tx;
    cx.save(); cx.translate(j[0], j[1]); cx.rotate(Math.atan2(v[1], v[0])); cx.scale(st, 1); cx.rotate(-Math.atan2(sv[1], sv[0])); cx.scale(K * G.s, K * G.s);
    cx.drawImage(img(G.n, col, G.lite), PART[G.n][0] - PJ[0], PART[G.n][1] - PJ[1]); cx.restore();
  }
  function drawBull(P, S) {
    const t = P.t, pr = P.p, { tf, PIV, dip, lean } = S, sc = P.scars;
    const BLUE = P.col || '#2f7dff';
    cx.save(); cx.translate(P.bx, 0);
    shadow(-30 * K / .4, 92 * K / .4);
    if (P.koM) { cx.translate(-50, 0); cx.rotate(-rad(P.koM * 14)); cx.translate(50, 0); }
    TINT = P.flashM * .7; TC = [255, 50, 40];
    if (P.charge > 0 && TINT < P.charge * .45) { TINT = P.charge * .45; TC = [130, 220, 255]; }
    const eff = .45 + 1.1 * P.kickM + .45 * Math.abs(pr);
    const FT = feetUpdate(P, P.bx - (P.jit || 0));
    // дальняя задняя нога за телом
    leg4(LEG4[0], BLUE, tf, FT[0]); leg4(LEG4[1], BLUE, tf, FT[1]); leg4(LEG4[3], BLUE, tf, FT[3]); // передние уходят под корпус — шов закрыт коленом
    // тело целиком (голова, шея, хвост — как на образце, ничего не отрывается)
    cx.save(); cx.translate(PIV[0], dip); cx.rotate(rad(lean)); cx.translate(-PIV[0], 0);
    if (SPR.body) { cx.save(); cx.scale(K, K); cx.translate(-OX, -OY); cx.drawImage(img('body', BLUE), PART.body[0], PART.body[1]);
      cx.restore(); }
    const eye = L(413, 289); glow(eye[0], eye[1], 9, '#ffb02e', .45 + .3 * Math.sin(t * 8));
    if (P.turbo) { const w = L(308, 333); glow(w[0], w[1], 18, '#ff8a1e', .5 + .3 * Math.abs(Math.sin(t * 6))); }
    // повреждения
    if (sc >= 1) {
      const h = L(300, 300);
      cx.beginPath(); cx.ellipse(h[0], h[1], 9, 6, -.2, 0, 7); shape(C('#0d1018'), 2);
      gear(h[0] - 1, h[1], 5, -t * 6, '#9aa6bd', 6);
      cx.lineWidth = 2; [['#5cc8ff', 2], ['#ff8a1e', -3]].forEach(([c, o]) => { cx.strokeStyle = c; cx.beginPath(); cx.moveTo(h[0] + 5, h[1]); cx.quadraticCurveTo(h[0] + 12 + o, h[1] + 10 + Math.sin(t * 9 + o) * 3, h[0] + 9 + o, h[1] + 20); cx.stroke(); });
      if (Math.sin(t * 23) > .3) glow(h[0] + 8, h[1] + 14, 9, '#7cf0ff', .9);
      const k2 = L(170, 280); cx.strokeStyle = OUT; cx.lineWidth = 1.6; cx.beginPath(); cx.moveTo(k2[0], k2[1]); cx.lineTo(k2[0] + 9, k2[1] - 4); cx.lineTo(k2[0] + 5, k2[1] + 4); cx.lineTo(k2[0] + 14, k2[1] + 2); cx.stroke();
    }
    if (sc >= 2) {
      const c2 = L(330, 240); cx.strokeStyle = OUT; cx.lineWidth = 1.8; cx.beginPath(); cx.moveTo(c2[0], c2[1]); cx.lineTo(c2[0] - 9, c2[1] + 9); cx.lineTo(c2[0] - 2, c2[1] + 13); cx.lineTo(c2[0] - 12, c2[1] + 24); cx.stroke();
      const lp = L(180, 335); if (Math.sin(t * 12) > 0) lamp(lp[0], lp[1], 3.5, '#ff2a20');
    }
    cx.restore();
    // ближние ноги поверх тела
    leg4(LEG4[2], BLUE, tf, FT[2]);
    TINT = 0;
    // щит
    const sh = Math.max(P.shield, P.blockT);
    if (sh > 0) {
      const cxx = -60 * K, cy = -130 * K, pulse = 1 + .03 * Math.sin(t * 6) + .08 * P.blockT;
      cx.save(); cx.beginPath(); cx.ellipse(cxx, cy, 255 * K * pulse, 180 * K * pulse, 0, 0, 7);
      const g = cx.createRadialGradient(cxx, cy - 20, 10, cxx, cy, 255 * K); g.addColorStop(0, RGBA('#7cd8ff', .05)); g.addColorStop(.75, RGBA('#7cd8ff', .14 * sh)); g.addColorStop(1, RGBA('#bff0ff', .45 * sh));
      cx.fillStyle = g; cx.fill(); cx.lineWidth = 2.5 + 3 * P.blockT; cx.strokeStyle = RGBA('#aef0ff', .8 * sh); cx.stroke(); cx.restore();
      glow(cxx + 230 * K, cy, 40, '#7cd8ff', .3 * sh + .6 * P.blockT);
    }
    cx.restore();
  }

  /* ================= БОССЫ (рисуются лицом вправо, потом зеркалятся) ================= */
  // общая трансформация «наклона» корпуса вокруг передней ноги
  function leanTf(piv, lean, dip) { const c = Math.cos(rad(lean)), s = Math.sin(rad(lean)); return (x, y) => { const dx = x - piv; return [piv + dx * c - y * s, dx * s + y * c + dip]; }; }
  function bodyStart(piv, lean, dip) { cx.save(); cx.translate(piv, dip); cx.rotate(rad(lean)); cx.translate(-piv, 0); }

  /* ----- Голем Матриц ----- */
  /* Голем из картинки пользователя: корпус с ногами, шлем и рука-кулак (две копии: ближняя и дальняя) */
  const GK = .5, GS = [553, 159], GFOOT = [520, 466]; // масштаб, плечо и точка опоры в координатах листа
  const GPART = { gbody: [410, 81, 'golem2_body'], ghelm: [280, 70, 'golem2_helm'], garm: [628, 91, 'golem2_arm'] };
  Object.keys(GPART).forEach((k) => { const im = new Image(); im.onload = () => { SPR[k] = im; }; im.src = 'arena/' + GPART[k][2] + '.webp?v=1'; });
  function gimg(name, dark) { // оригинальные цвета + вспышка + затемнение дальней руки
    const tn = TINT > 0 ? Math.round(TINT * 6) / 6 : 0, bt = BT > 0 ? Math.round(BT * 20) / 20 : 0, key = ['g', name, dark ? 1 : 0, tn, bt, bt ? BTC.join(',') : ''].join('|'); if (CACHE[key]) return CACHE[key];
    const im = SPR[name], c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      let r = px[i], gg = px[i + 1], b = px[i + 2];
      if (bt > 0) { const l = (r + gg + b) / 765; r += (BTC[0] * l * 2.2 - r) * bt; gg += (BTC[1] * l * 2.2 - gg) * bt; b += (BTC[2] * l * 2.2 - b) * bt; } // оттенок экзаменатора
      if (dark) { r *= .68; gg *= .66; b *= .66; }
      if (tn > 0) { r += (255 - r) * tn; gg += (255 - gg) * tn; b += (255 - b) * tn; }
      px[i] = r; px[i + 1] = gg; px[i + 2] = b;
    }
    g.putImageData(d, 0, 0); return (CACHE[key] = c);
  }
  const golem = {
    sx: 40, D: (p) => 64 + 12 * p, w: 52,
    draw(P, g) {
      const t = P.t, bp = -P.p, k = P.kickB;
      const lean = 1.5 + 3 * bp + 4 * k - 3 * P.stun + Math.sin(t * 31) * (.2 + Math.abs(bp)) * .5;
      const dip = 1 + 3 * Math.max(0, -bp) + Math.sin(t * 15) * .4;
      cx.save(); cx.translate(P.bx, 0); FLIP = true; cx.scale(-1, 1);
      shadow(0, 70);
      if (P.koB) { cx.translate(-30, P.koB * 18); cx.rotate(-rad(P.koB * 34)); cx.translate(30, 0); cx.globalAlpha = 1 - .5 * P.koB; }
      TINT = P.flashB * .85;
      const loc = (w) => [P.bx - w[0], w[1]];
      const fx = (GS[0] - GFOOT[0]) * GK, fy = (GFOOT[1] - GFOOT[1]) * GK; // опора: перед ступни (в локальных координатах)
      const body = () => { // тело в системе листа: плечо в (0, ys), вперёд — вправо (лист смотрит влево, поэтому отражён)
        cx.translate(fx, 0); cx.translate(0, dip); cx.rotate(rad(lean)); cx.translate(-fx, 0);
      };
      const sheet = () => { cx.scale(-GK, GK); cx.translate(-GS[0], -GFOOT[1]); };
      // локальное плечо с учётом наклона
      const cl = Math.cos(rad(lean)), sl = Math.sin(rad(lean)), sy = (GS[1] - GFOOT[1]) * GK;
      const Sh = [fx + (0 - fx) * cl - (sy) * sl, dip + (0 - fx) * sl + sy * cl];
      const arm = (T, far) => {
        const v = [T[0] - Sh[0], T[1] - Sh[1]], dist = Math.hypot(v[0], v[1]), L = 246 * GK, st = clamp(dist / L, .7, 1.15) * 1.04;
        cx.save(); cx.translate(Sh[0], Sh[1]); cx.rotate(Math.atan2(v[1], v[0]) - Math.PI / 2); cx.scale(-GK, GK * st);
        if (SPR.garm) cx.drawImage(gimg('garm', far), -55, -45); cx.restore();
      };
      // дальняя рука
      arm(loc(g.gF), true);
      // корпус
      cx.save(); body(); sheet();
      if (SPR.gbody) cx.drawImage(gimg('gbody', false), GPART.gbody[0], GPART.gbody[1]);
      // шлем
      if (SPR.ghelm) { const hb = P.kickB * 5 - P.stun * 7 + Math.sin(t * 2.2) * 1; cx.save(); cx.translate(458, 157); cx.rotate(rad(-hb)); cx.drawImage(gimg('ghelm', false), 358 - 458, 72 - 157); cx.restore(); }
      const pulse = .55 + .45 * Math.abs(Math.sin(t * 3 + bp));
      glow(420, 118, 22, '#ff8a1e', .25 + .25 * pulse);
      if (P.hpFrac < .5) { cx.strokeStyle = OUT; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(560, 250); cx.lineTo(540, 290); cx.lineTo(556, 310); cx.lineTo(530, 350); cx.stroke(); glow(545, 300, 26, '#ff5a2a', .6); }
      cx.restore();
      // ближняя рука поверх тела
      arm(loc(g.gN), false);
      TINT = 0; FLIP = false; cx.restore();
      return { body: [P.bx - 6, -120], head: [P.bx - 55, -160], mouth: [P.bx - 70, -140] };
    }
  };

  /* ----- Дракон Пределов: тело и крыло из картинки пользователя, голени шагают по очереди ----- */
  const DK = .28, DOX = 190, DOY = 470, DWP = [420, 268]; // масштаб, точка отсчёта (нос, пол), корень крыла на листе
  const DPART = { dgbody: [173, 88, 'dg_body'], dgwing: [356, 43, 'dg_wing'], dgFN: [310, 383, 'dg_FN'], dgFF: [234, 405, 'dg_FF'], dgHN: [547, 383, 'dg_HN'], dgHF: [485, 388, 'dg_HF'] };
  Object.keys(DPART).forEach((k) => { const im = new Image(); im.onload = () => { SPR[k] = im; }; im.src = 'arena/' + DPART[k][2] + '.webp?v=2'; });
  const DL = (x, y) => [(DOX - x) * DK, (y - DOY) * DK];
  // pair — очерёдность: по диагонали (передняя ближняя + задняя дальняя, потом наоборот)
  const DLEGS = [
    { far: 1, n: 'dgHF', knee: [535, 398], ft: [515, 462], pair: 0, d0: -2 },
    { far: 1, n: 'dgFF', knee: [333, 403], ft: [255, 462], pair: 1, d0: 2 },
    { far: 0, n: 'dgHN', knee: [622, 400], ft: [575, 463], pair: 1, d0: 0 },
    { far: 0, n: 'dgFN', knee: [408, 397], ft: [352, 462], pair: 0, d0: -3 },
  ];
  function dleg(G, tf, ft) {
    if (!SPR[G.n]) return;
    const pt = DPART[G.n], k = DL(G.knee[0], G.knee[1]), fl = DL(G.ft[0], G.ft[1]), p0 = tf(k[0], k[1]), sv = [fl[0] - k[0], fl[1] - k[1]];
    const tx = fl[0] + ft.d, ty = -ft.lift, v = [tx - p0[0], ty - p0[1]], st = clamp(Math.hypot(v[0], v[1]) / Math.hypot(sv[0], sv[1]), .86, 1.14);
    cx.save(); cx.translate(p0[0], p0[1]); cx.rotate(Math.atan2(v[1], v[0])); cx.scale(st, 1); cx.rotate(-Math.atan2(sv[1], sv[0])); cx.scale(-DK, DK);
    cx.drawImage(gimg(G.n, !!G.far), pt[0] - G.knee[0], pt[1] - G.knee[1]); cx.restore();
    G.wx = tx;
  }
  const dragon = {
    sx: -4, D: (p) => 6 + 8 * p, w: 226,
    draw(P, g) {
      const t = P.t, bp = -P.p, k = P.kickB;
      const lean = 1 + 3 * bp + 7 * k - 5 * P.stun + Math.sin(t * 29) * (.2 + Math.abs(bp)) * .6;
      const dip = Math.max(0, -bp) * 3 + Math.sin(t * 15) * .3;
      const pv = (DOX - 640) * DK, tf = leanTf(pv, lean, dip);
      cx.save(); cx.translate(P.bx, 0); FLIP = true; cx.scale(-1, 1);
      shadow(-85, 125);
      if (P.koB) { cx.translate(-60, P.koB * 16); cx.rotate(-rad(P.koB * 26)); cx.translate(60, 0); cx.globalAlpha = 1 - .5 * P.koB; }
      TINT = P.flashB * .85; TC = [255, 255, 255];
      const FT = feetUpdate(P, -(P.bx + (P.jit || 0)), DLEGS, 'dg', P.koB > .2, (L) => { const x = P.bx - (L.wx || 0); return MIR ? VW - x : x; }, .5);
      DLEGS.forEach((G, i) => { if (G.far) dleg(G, tf, FT[i]); });
      // тело: крыло машет вокруг корня, остальное — одна деталь
      bodyStart(pv, lean, dip); cx.scale(-DK, DK); cx.translate(-DOX, -DOY);
      const flap = (Math.sin(t * (P.raged ? 8 : 4.5)) * .12 + .05 * k) * (P.koB ? 0 : 1);
      if (SPR.dgwing) { cx.save(); cx.translate(DWP[0], DWP[1]); cx.rotate(flap); cx.translate(-DWP[0], -DWP[1]); cx.drawImage(gimg('dgwing', false), DPART.dgwing[0], DPART.dgwing[1]); cx.restore(); }
      if (SPR.dgbody) cx.drawImage(gimg('dgbody', false), DPART.dgbody[0], DPART.dgbody[1]);
      if (k > .15) glow(190, 188, 26 + 30 * k, '#ff8a1e', Math.min(.8, k)); // огонь из пасти при ударе
      if (P.hpFrac < .5) glow(520, 330, 40, '#ff5a2a', .5);
      cx.restore();
      DLEGS.forEach((G, i) => { if (!G.far) dleg(G, tf, FT[i]); });
      TINT = 0; FLIP = false; cx.restore();
      return { body: [P.bx + 89, -40], head: [P.bx + 10, -84], mouth: [P.bx, -77] };
    }
  };

  /* ----- Скорпион Векторов: тело, клешни и ноги из картинки пользователя ----- */
  const SK = .37, SCS = 1.35, SOX = 447, SOY = 470, SSH = [447, 390], STIP = [262, 392]; // масштаб, точка отсчёта (плечо, пол), плечо клешни и точка хвата на листе
  const SPART = { scbody: [333, 81, 'sc_body'], scclaw: [185, 316, 'sc_claw'], scshA: [438, 398, 'sc_shA'], scshC: [573, 383, 'sc_shC'], scshD: [698, 378, 'sc_shD'], sclA: [449, 356, 'sc_lA'], sclB: [459, 435, 'sc_lB'], sclC: [548, 305, 'sc_lC'] };
  Object.keys(SPART).forEach((k) => { const im = new Image(); im.onload = () => { SPR[k] = im; }; im.src = 'arena/' + SPART[k][2] + '.webp?v=4'; });
  const SL = (x, y) => [(SOX - x) * SK, (y - SOY) * SK]; // точка листа → локальные координаты (вперёд — вправо, пол y=0)
  // Ближние ноги: на теле запечено бедро, отдельно крутится голень вокруг колена. Дальние ноги целиком, тёмные, позади тела.
  // pair — очерёдность шагов: соседние ноги шагают по очереди (в одной паре одновременно только одна).
  const SLEGS = [
    { far: 1, n: 'sclA', hip: [520, 372], hs: [530, 369], ft: [467, 457], fx: 452, pair: 0, d0: -4 },
    { far: 0, n: 'scshA', knee: [511, 420], ft: [467, 457], pair: 1, d0: 1 },
    { far: 1, n: 'sclB', hip: [560, 372], hs: [545, 447], ft: [477, 530], fx: 497, pair: 0, d0: -2 },
    { far: 0, n: 'scshC', knee: [621, 400], ft: [592, 457], pair: 1, d0: 2 },
    { far: 1, n: 'sclC', hip: [640, 338], hs: [595, 324], ft: [592, 457], fx: 640, pair: 0, d0: -3 },
    { far: 1, n: 'sclC', hip: [702, 338], hs: [595, 324], ft: [592, 457], fx: 700, pair: 1, d0: 0 },
    { far: 0, n: 'scshD', knee: [726, 395], ft: [752, 457], pair: 0, d0: -1 },
  ];
  function sleg(G, tf, ft) {
    if (!SPR[G.n]) return;
    const pt = SPART[G.n], fl = SL(G.ft[0], G.ft[1]);
    let p0, sv, tx, ty;
    if (G.far) { p0 = tf(...SL(G.hip[0], G.hip[1])); sv = [fl[0] - SL(G.hs[0], G.hs[1])[0], fl[1] - SL(G.hs[0], G.hs[1])[1]]; tx = SL(G.fx, 470)[0] + ft.d; }
    else { p0 = tf(...SL(G.knee[0], G.knee[1])); const k = SL(G.knee[0], G.knee[1]); sv = [fl[0] - k[0], fl[1] - k[1]]; tx = fl[0] + ft.d; }
    ty = -ft.lift;
    const v = [tx - p0[0], ty - p0[1]], st = clamp(Math.hypot(v[0], v[1]) / Math.hypot(sv[0], sv[1]), .86, 1.14), pv = G.far ? G.hs : G.knee;
    cx.save(); cx.translate(p0[0], p0[1]); cx.rotate(Math.atan2(v[1], v[0])); cx.scale(st, 1); cx.rotate(-Math.atan2(sv[1], sv[0])); cx.scale(-SK, SK);
    cx.drawImage(gimg(G.n, !!G.far), pt[0] - pv[0], pt[1] - pv[1]); cx.restore();
    G.wx = tx;
  }
  const scorpion = {
    sx: 22, D: (p) => 36 + 8 * p, w: 140,
    draw(P, g) {
      const t = P.t, bp = -P.p, k = P.kickB;
      const lean = -1 + 2 * bp + 3 * k - 3 * P.stun + Math.sin(t * 27) * (.2 + Math.abs(bp)) * .5;
      const dip = Math.max(0, -bp) * 3 + Math.sin(t * 15) * .3;
      const tf = leanTf(0, lean, dip);
      cx.save(); cx.translate(P.bx, 0); FLIP = true; cx.scale(-1, 1);
      shadow(-52, 118);
      if (P.koB) { cx.translate(-30, P.koB * 14); cx.rotate(-rad(P.koB * 26)); cx.translate(30, 0); cx.globalAlpha = 1 - .5 * P.koB; }
      TINT = P.flashB * .85; TC = [255, 255, 255];
      const loc = (w) => [P.bx - w[0], w[1]];
      const FT = feetUpdate(P, -(P.bx + (P.jit || 0)), SLEGS, 'sc', P.koB > .2, (L) => { const x = P.bx - (L.wx || 0); return MIR ? VW - x : x; }, .5);
      const claw = (T, far) => { // клешня: поворот вокруг плеча и растяжение до рога
        if (!SPR.scclaw) return;
        const S = tf(...SL(SSH[0] + (far ? 6 : 0), SSH[1] - (far ? 4 : 0))), tp = SL(STIP[0], STIP[1]), sh = SL(SSH[0], SSH[1]);
        const sv = [(tp[0] - sh[0]) * SCS, (tp[1] - sh[1]) * SCS], v = [T[0] - S[0], T[1] - S[1]], st = clamp(Math.hypot(v[0], v[1]) / Math.hypot(sv[0], sv[1]), .8, 1.22);
        cx.save(); cx.translate(S[0], S[1]); cx.rotate(Math.atan2(v[1], v[0])); cx.scale(st, 1); cx.rotate(-Math.atan2(sv[1], sv[0])); cx.scale(-SK * SCS, SK * SCS);
        cx.drawImage(gimg('scclaw', far), SPART.scclaw[0] - SSH[0], SPART.scclaw[1] - SSH[1]); cx.restore();
      };
      // дальние ноги и дальняя клешня позади тела
      SLEGS.forEach((G, i) => { if (G.far) sleg(G, tf, FT[i]); });
      claw(loc(g.gF), true); claw(loc(g.gN), false);
      // тело
      bodyStart(0, lean, dip); cx.scale(-SK, SK); cx.translate(-SOX, -SOY);
      if (SPR.scbody) cx.drawImage(gimg('scbody', false), SPART.scbody[0], SPART.scbody[1]);
      if (P.hpFrac < .5) { glow(520, 290, 40, '#ff5a2a', .5); }
      cx.restore();
      // ближние ноги (голени) и ближняя клешня поверх тела
      SLEGS.forEach((G, i) => { if (!G.far) sleg(G, tf, FT[i]); });
      TINT = 0; FLIP = false; cx.restore();
      return { body: [P.bx + 60, -45], head: [P.bx - 20, -70], mouth: [P.bx + 30, -125] };
    }
  };

  /* ----- Змей Бесконечности ----- */
  const serpent = {
    sx: 0, D: () => 6, w: 90,
    draw(P, g) {
      const t = P.t, bp = -P.p, k = P.kickB, PU = '#7a3fd6';
      cx.save(); cx.translate(P.bx, 0); FLIP = true; cx.scale(-1, 1);
      shadow(-80, 96);
      if (P.koB) { cx.translate(-30, P.koB * 14); cx.rotate(-rad(P.koB * 20)); cx.translate(30, 0); cx.globalAlpha = 1 - .5 * P.koB; }
      TINT = P.flashB * .85; TC = [255, 255, 255];
      const H = [P.bx - g.gN[0] - 4, g.gN[1] + 10];
      const base = [[0, -126], [-16, -152], [-44, -162], [-66, -136], [-64, -104], [-58, -74], [-72, -46], [-98, -24], [-124, -30], [-134, -56], [-120, -80], [-94, -72], [-72, -46], [-50, -20], [-26, -14], [-14, -34], [-24, -54]];
      const pts = base.map(([x, y], i) => {
        const w = Math.max(0, 1 - i / 6), und = Math.sin(t * 4 - i * .9) * (2 + Math.abs(bp) * 2.5);
        return [x + w * H[0] + (1 - w) * 0 + und * .6 + 8 * k * w, y + w * (H[1] + 126) + und + (i > 0 ? 12 * k * w : 0)];
      });
      const sp = spline(pts, 6), n = sp.length, wd = (i) => { const u = i / (n - 1); return u < .12 ? 15 + u * 60 : 22 - (u - .12) * 16; };
      cx.lineCap = 'round';
      for (let pass = 0; pass < 3; pass++) {
        for (let i = n - 2; i >= 0; i--) {
          const w = wd(i);
          cx.strokeStyle = pass === 0 ? OUT : pass === 1 ? C(PU, -.05 - .25 * (i % 2)) : RGBA('#c9a6ff', .45);
          cx.lineWidth = pass === 0 ? w + LW * 2 : pass === 1 ? w : w * .3;
          const a = sp[i], b = sp[i + 1], o = pass === 2 ? w * .2 : 0;
          line([a[0], a[1] - o], [b[0], b[1] - o]); cx.stroke();
        }
      }
      for (let i = 6; i < n - 3; i += 7) { const a = sp[i], b = sp[i + 1], an = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2, w = wd(i) * .55; cx.strokeStyle = C('#9aa6bd'); cx.lineWidth = 4; line([a[0] + Math.cos(an) * w, a[1] + Math.sin(an) * w], [a[0] - Math.cos(an) * w, a[1] - Math.sin(an) * w]); cx.stroke(); }
      for (let i = 3; i < n - 2; i += 4) { const a = sp[i], tw = .5 + .5 * Math.sin(t * 3 + i); glow(a[0] + Math.sin(i) * 4, a[1] + Math.cos(i) * 3, 7 * tw + 2, i % 3 ? '#ffffff' : '#ffd27a', .9 * tw); }
      if (P.hpFrac < .5) glow(sp[20][0], sp[20][1], 18, '#ff5a2a', .6);
      // голова
      const hd = sp[0], nx = sp[3], ang = Math.atan2(hd[1] - nx[1], hd[0] - nx[0]) + rad(-6 * P.stun);
      cx.save(); cx.translate(hd[0], hd[1]); cx.rotate(ang);
      const jaw = 8 + 22 * k + 5 * Math.abs(Math.sin(t * 3));
      cx.save(); cx.translate(0, 6); cx.rotate(rad(jaw)); poly([[-4, 0], [30, 2], [26, 8], [-2, 8]]); shape(C(PU, -.25)); for (let x = 6; x < 26; x += 6) { poly([[x, 1], [x + 3, -4], [x + 5, 1]]); shape(C('#fff'), 1); } cx.restore();
      poly([[-14, -10], [8, -16], [34, -8], [40, 2], [26, 6], [-6, 8]]); shape(vg(-16, 8, PU, .4, .4));
      [[-8, -12, -30, -26], [-2, -14, -20, -34], [-14, -4, -36, -8]].forEach(([a, b, c, d]) => { poly([[a, b], [c, d], [a + 8, b + 2]]); shape(C('#5c2fa8'), 1.8); });
      lamp(14, -6, 3, '#ff2a20'); glow(14, -6, 12, '#ff3a3a', .7);
      glow(38, 2, 10, '#9fd8ff', .5 + .5 * Math.sin(t * 5));
      cx.restore();
      TINT = 0; FLIP = false; cx.restore();
      return { body: [P.bx + 70, -90], head: [P.bx - hd[0], hd[1]], mouth: [P.bx - hd[0] - 30, hd[1]] };
    }
  };

  /* соперник-бык: тот же бык, отражённый зеркально; цвет и повреждения свои */
  const rival = {
    sx: 0, D: () => 0, w: 190,
    draw(P) { return null; }
  };
  /* «Сессия»: огромный голем в тёмно-багровой броне с золотым ореолом — финальный босс по всем разделам */
  const SS = 1.3;
  const examBoss = (GC, BC, BK = .42) => ({
    sx: 52, D: (p) => 84 + 14 * p, w: 92,
    draw(P, g) {
      const bx = P.bx, inv = (w) => [bx + (w[0] - bx) / SS, w[1] / SS];
      const t = P.t;
      glow(bx - 40, -170, 190, GC, .35 + .12 * Math.sin(t * 2.2) + (P.raged ? .15 : 0));
      cx.save(); cx.translate(bx, 0); cx.scale(SS, SS); cx.translate(-bx, 0);
      BT = BK; BTC = BC;
      const an = golem.draw(P, { gN: inv(g.gN), gF: inv(g.gF) });
      BT = 0;
      cx.restore();
      const sc = (w) => [bx + (w[0] - bx) * SS, w[1] * SS];
      return { body: sc(an.body), head: sc(an.head), mouth: sc(an.mouth) };
    }
  });
  const session = examBoss('#ff2a2a', [165, 8, 28]), english = examBoss('#2a8cff', [40, 110, 255], .72);
  const BOSS = { golem, dragon, scorpion, serpent, rival, session, english };

  /* P: { t, p, kickM, kickB, flashM, flashB, koM, koB, scars, shield, blockT, charge, turbo, raged, stun, hpFrac, introM, introB,
          key (правый боец: golem/dragon/scorpion/serpent/rival=бык), lkey (левый: 'bull' или босс), col, rcol, rscars } */
  function draw(ctx, P) {
    cx = ctx; PLANTS = []; OUTER = false; MIR = false;
    K = P.key === 'dragon' ? .4 : .5; // против дракона бык мельче, дракон выглядит крупнее
    const B = BOSS[P.key] || golem, LK = P.lkey && P.lkey !== 'bull' && BOSS[P.lkey] !== rival ? BOSS[P.lkey] : null, S = bullPose(P);
    const gx = VW / 2 + P.p * 30;
    const jit = Math.sin(P.t * 41) * (.4 + Math.abs(P.p)) * .9; P.jit = jit;
    const fall = { gN: [gx - 6, -125], gF: [gx - 2, -118] }; // куда тянутся руки, если напротив не бык с рогами
    let an, la, gw;
    // ----- левый боец -----
    if (LK) {
      const Pl = Object.assign({}, P, { p: -P.p, kickB: P.kickM, flashB: P.flashM, koB: P.koM, stun: P.lstun || 0, raged: false, hpFrac: 1, t: P.t + .9, introB: -P.introM, sid: 'L', key: P.lkey });
      const gxl = VW / 2 + Pl.p * 30, bxl = gxl + LK.sx + LK.D(Pl.p) + Pl.introB - jit, gl = { gN: [gxl - 6, -125], gF: [gxl - 2, -118] };
      let al = { body: [bxl, -110], head: [bxl, -170], mouth: [bxl, -170] };
      if (P.hide !== 'bull') { cx.save(); cx.translate(VW, 0); cx.scale(-1, 1); OUTER = true; MIR = true; al = LK.draw(Object.assign({}, Pl, { bx: bxl }), gl); OUTER = false; MIR = false; cx.restore(); }
      la = { bull: [VW - al.body[0], al.body[1]], bullRear: [VW - (bxl + LK.w), -40], bullFront: [VW - bxl, -40] };
      gw = { gN: [gx - 6, -125], gF: [gx - 2, -118] };
      P.bx = VW - bxl;
    } else {
      P.bx = gx - S.gN[0] + P.introM + jit; P.jit = jit;
      gw = { gN: [P.bx + S.gN[0], S.gN[1]], gF: [P.bx + S.gF[0], S.gF[1]] };
      if (P.hide !== 'bull') drawBull(P, S);
      la = { bull: [P.bx - 30 * K, -155 * K], bullRear: [P.bx - 255 * K, -40], bullFront: [P.bx + 125 * K, -40] };
    }
    const bossBx = gx + B.sx + B.D(P.p) + P.introB - jit;
    if (P.introB > 1 && !LK) { gw.gN = [gx + 40 + P.introB, -128]; gw.gF = [gx + 50 + P.introB, -122]; }
    const Q = Object.assign({}, P, { bx: bossBx });
    // ----- правый боец -----
    if (P.key === 'rival') {
      const P2 = Object.assign({}, P, { p: -P.p, kickM: P.kickB, flashM: P.flashB, koM: P.koB, scars: P.rscars || 0, col: P.rcol, shield: 0, blockT: 0, charge: 0, t: P.t + 1.7, hide: null, sid: 'R' });
      const S2 = bullPose(P2), gx2 = VW / 2 + P2.p * 30;
      P2.bx = gx2 - S2.gN[0] + P.introB - jit; P2.jit = -jit;
      if (P.hide !== 'boss') { cx.save(); cx.translate(VW, 0); cx.scale(-1, 1); FLIP = true; MIR = true; drawBull(P2, S2); FLIP = false; MIR = false; cx.restore(); }
      an = { body: [VW - (P2.bx - 30 * K), -155 * K], head: [VW - (P2.bx + 80 * K), -190 * K], mouth: [VW - (P2.bx + 105 * K), -165 * K], rear: VW - (P2.bx - 255 * K) };
    } else {
      const g2 = LK ? fall : gw;
      an = P.hide === 'boss' ? { body: [bossBx, -110], head: [bossBx, -170], mouth: [bossBx, -170] } : B.draw(Q, g2);
      an.rear = bossBx + B.w;
    }
    return { contact: [gw.gN[0], gw.gN[1]], bull: la.bull, bullRear: la.bullRear, bullFront: la.bullFront, boss: an.body, bossHead: an.head, mouth: an.mouth, bossRear: [an.rear, -40], plants: PLANTS };
  }
  return { draw, VW, _golem: golem };
})();
