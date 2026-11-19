'use strict';
/* Арена: бойцы, нарисованные кодом. Бык и боссы собраны из частей (корпус, суставы, поршни, шестерёнки),
   руки и ноги ставятся через IK: голем держит быка за рога, ноги упираются в пол.
   Координаты «виртуальные»: ширина сцены 430, пол на y = 0, вверх — минус. */
window.Rig = (() => {
  let cx = null, TINT = 0, TC = [255, 255, 255], FLIP = false;
  const OUT = '#0b0e16', LW = 3;
  const VW = 430;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rad = (d) => d * Math.PI / 180;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const C = (h, s = 0) => {
    let r = hex(h);
    if (s > 0) r = mixc(r, [255, 255, 255], s); else if (s < 0) r = mixc(r, [6, 8, 16], -s);
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
    cx.save(); cx.translate(x, y); if (FLIP) cx.scale(-1, 1); cx.rotate(rot);
    cx.font = `900 ${size}px system-ui,sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.lineWidth = 2.5; cx.strokeStyle = OUT; cx.strokeText(s, 0, 0); cx.fillStyle = color; cx.fillText(s, 0, 0); cx.restore();
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
  function bullPose(P) {
    const pr = P.p, k = P.kickM, t = P.t, str = .4 + Math.abs(pr);
    const lean = 3 + 5 * pr + 9 * k + Math.sin(t * 34) * str * 1.1;
    const dip = 2 + 14 * Math.max(0, -pr) - 5 * k + Math.sin(t * 17) * .7 + P.koM * 26;
    const ha = 22 + 10 * Math.max(0, -pr) - 6 * Math.max(0, pr) + 8 * k - P.koM * 14;
    const PIV = [46, 0], ca = Math.cos(rad(lean)), sa = Math.sin(rad(lean));
    const tf = (x, y) => { const dx = x - PIV[0]; return [PIV[0] + dx * ca - y * sa, dx * sa + y * ca + dip]; };
    const N = [54, -106], hc = Math.cos(rad(ha)), hs = Math.sin(rad(ha));
    const head = (x, y) => tf(N[0] + x * hc - y * hs, N[1] + x * hs + y * hc);
    return { lean, dip, ha, PIV, tf, N, head, gN: head(47, -45), gF: head(30, -36) };
  }
  function hornPath() { cx.beginPath(); cx.moveTo(-6, -20); cx.quadraticCurveTo(21, -62, 68, -48); cx.quadraticCurveTo(32, -42, 8, -12); cx.closePath(); }
  function drawBull(P, S) {
    const t = P.t, pr = P.p, { tf, N, ha, PIV, dip, lean } = S, sc = P.scars;
    const BLUE = P.col || '#2f7dff', DARK = '#262d40', STEEL = '#58627a', BDK = shade(BLUE, .33), BSC = shade(BLUE, .2);
    cx.save(); cx.translate(P.bx, 0);
    shadow(10, 86);
    if (P.koM) { cx.translate(-50, 0); cx.rotate(-rad(P.koM * 14)); cx.translate(50, 0); }
    TINT = P.flashM * .7; TC = [255, 50, 40];
    if (P.charge > 0 && TINT < P.charge * .45) { TINT = P.charge * .45; TC = [130, 220, 255]; }
    const jig = (i) => pr < -.1 ? Math.sin(t * 30 + i * 2.1) * 2 * -pr : 0;
    const legs = [[-50, -74, -52, 1, 1], [30, -70, 40, -1, 1], [-36, -72, -34, 1, 0], [44, -68, 58, -1, 0]];
    const leg = (L, i) => {
      const [hx, hy, fx, dir, far] = L, h = tf(hx, hy), [kn, ft] = ik(h, [fx + jig(i), 0], 34, 36, dir), c = far ? BDK : BLUE;
      limb(h, kn, far ? 18 : 22, c); limb(kn, ft, far ? 13 : 15, far ? '#3e475d' : STEEL);
      const pa = [h[0] + (kn[0] - h[0]) * .3 + 6 * dir, h[1] + (kn[1] - h[1]) * .3], pb = [kn[0] + (ft[0] - kn[0]) * .45 + 5 * dir, kn[1] + (ft[1] - kn[1]) * .45];
      cx.lineCap = 'round'; cx.strokeStyle = OUT; cx.lineWidth = 6; line(pa, pb); cx.stroke(); cx.strokeStyle = C('#cfd6e4'); cx.lineWidth = 2.5; line(pa, pb); cx.stroke();
      disc(kn[0], kn[1], 7.5, far ? '#3e475d' : '#4b556d'); cx.beginPath(); cx.arc(kn[0], kn[1], 3.2, 0, 7); cx.fillStyle = C('#ffb02e'); cx.fill();
      poly([[ft[0] - 11, 0], [ft[0] + 14, 0], [ft[0] + 15, -8], [ft[0] + 4, -14], [ft[0] - 8, -12]]); shape(vg(-14, 0, far ? '#2a3042' : '#3a4258'));
    };
    leg(legs[0], 0); leg(legs[1], 1);
    // корпус
    cx.save(); cx.translate(PIV[0], dip); cx.rotate(rad(lean)); cx.translate(-PIV[0], 0);
    const sw = Math.sin(t * 5) * 6 - pr * 5;
    limb([-54, -100], [-78, -94 + sw * .4], 7, DARK, false); limb([-78, -94 + sw * .4], [-90, -118 + sw], 5, DARK, false);
    blob([[-90, -116 + sw], [-100, -130 + sw], [-86, -128 + sw], [-84, -140 + sw], [-78, -122 + sw]]); shape(C('#3a4258'), 2);
    poly([[-18, -140], [-6, -140], [-6, -152], [-18, -152]]); shape(vg(-152, -140, '#3a4258'));
    blob([[-56, -92], [-48, -122], [-8, -138], [32, -144], [62, -126], [70, -96], [54, -66], [14, -58], [-30, -58], [-56, -72]]);
    shape(vg(-146, -58, BLUE, .38, .45));
    blob([[-42, -66], [0, -60], [46, -68], [42, -80], [0, -73], [-38, -78]]); shape(C(DARK), 2);
    cx.lineCap = 'round'; cx.strokeStyle = RGBA('#bfe4ff', .55); cx.lineWidth = 4; cx.beginPath(); cx.moveTo(-44, -116); cx.quadraticCurveTo(-8, -136, 30, -138); cx.stroke();
    [[-20, -104], [-4, -88]].forEach(([x, y]) => { poly([[x, y], [x + 22, y - 2], [x + 22, y + 4], [x, y + 6]]); shape(C('#ffb02e', .1), 1.6); glow(x + 11, y + 2, 14, '#ff9a2e', .35); });
    // бедро
    disc(-30, -98, 24, sc >= 2 ? '#1d4aa8' : '#2563d6'); disc(-30, -98, 12.5, '#1a2236');
    gear(-30, -98, 9, t * 3, '#ffb02e', 7); glow(-30, -98, 16, '#ff9a2e', .45);
    // повреждения
    if (sc >= 1) {
      cx.beginPath(); cx.ellipse(6, -116, 11, 7, -.2, 0, 7); shape(C('#0d1018'), 2);
      gear(4, -116, 6, -t * 6, '#9aa6bd', 6);
      cx.lineWidth = 2; [['#5cc8ff', 2], ['#ff8a1e', -3]].forEach(([c, o]) => { cx.strokeStyle = c; cx.beginPath(); cx.moveTo(10, -116); cx.quadraticCurveTo(20 + o, -104 + Math.sin(t * 9 + o) * 3, 16 + o, -94); cx.stroke(); });
      if (Math.sin(t * 23) > .3) glow(14, -100, 10, '#7cf0ff', .9);
      cx.strokeStyle = OUT; cx.lineWidth = 1.6; cx.beginPath(); cx.moveTo(-50, -84); cx.lineTo(-40, -88); cx.lineTo(-44, -80); cx.lineTo(-34, -82); cx.stroke();
    }
    if (sc >= 2) {
      cx.strokeStyle = OUT; cx.lineWidth = 1.8; cx.beginPath(); cx.moveTo(40, -128); cx.lineTo(30, -118); cx.lineTo(38, -114); cx.lineTo(26, -102); cx.stroke();
      if (Math.sin(t * 12) > 0) lamp(-24, -128, 3.5, '#ff2a20');
    }
    // плечо + турбина
    disc(34, -104, 30, sc >= 2 ? BSC : BLUE);
    disc(34, -104, 19, '#1a2236');
    cx.save(); cx.translate(34, -104); cx.rotate(t * (4 + 14 * Math.abs(pr) + 10 * P.kickM));
    for (let i = 0; i < 6; i++) { cx.rotate(Math.PI / 3); cx.beginPath(); cx.moveTo(3, 0); cx.quadraticCurveTo(10, -6, 16, -2); cx.lineTo(15, 2); cx.closePath(); cx.fillStyle = C('#9fe2ff'); cx.fill(); }
    cx.restore();
    glow(34, -104, 26, P.turbo ? '#ff8a1e' : '#4fd2ff', .55 + .35 * Math.abs(Math.sin(t * 6))); lamp(34, -104, 4.5, P.turbo ? '#ffb02e' : '#9ff0ff');
    // шея и голова
    limb([46, -110], [N[0] + 6, N[1] + 4], 22, DARK, false);
    cx.save(); cx.translate(N[0], N[1]); cx.rotate(rad(ha));
    cx.save(); cx.translate(-8, -9); hornPath(); shape(vg(-62, -12, '#a39a7c', .2, .3)); cx.restore();
    blob([[-20, -10], [-12, -26], [12, -30], [36, -22], [48, -6], [48, 10], [34, 18], [8, 20], [-14, 12]]);
    shape(vg(-30, 20, BLUE, .4, .45));
    blob([[32, -6], [50, -6], [56, 6], [50, 16], [32, 16], [28, 4]]); shape(vg(-6, 16, '#7d8597', .3, .35));
    cx.beginPath(); cx.ellipse(48, 4, 2.5, 3.5, 0, 0, 7); cx.fillStyle = C('#14171f'); cx.fill();
    cx.lineWidth = 2; cx.strokeStyle = OUT; cx.beginPath(); cx.moveTo(34, 13); cx.lineTo(48, 13); cx.stroke();
    poly([[8, -16], [28, -14], [24, -9], [6, -9]]); shape(C('#1a2236'), 2);
    lamp(19, -12, 3.2, '#ffb02e'); glow(19, -12, 12, '#ff8a1e', .6 + .3 * Math.sin(t * 8));
    poly([[-12, -22], [-26, -32], [-18, -16]]); shape(C(BLUE, -.2), 2);
    hornPath(); shape(vg(-62, -12, '#d8cfae', .35, .3));
    cx.strokeStyle = RGBA('#ffffff', .55); cx.lineWidth = 2; cx.beginPath(); cx.moveTo(4, -24); cx.quadraticCurveTo(24, -50, 54, -48); cx.stroke();
    cx.restore();
    cx.restore();
    leg(legs[2], 2); leg(legs[3], 3);
    TINT = 0;
    // щит
    const sh = Math.max(P.shield, P.blockT);
    if (sh > 0) {
      const cxx = 4, cy = -86, pulse = 1 + .03 * Math.sin(t * 6) + .08 * P.blockT;
      cx.save(); cx.beginPath(); cx.ellipse(cxx, cy, 104 * pulse, 94 * pulse, 0, 0, 7);
      const g = cx.createRadialGradient(cxx, cy - 20, 10, cxx, cy, 104); g.addColorStop(0, RGBA('#7cd8ff', .05)); g.addColorStop(.75, RGBA('#7cd8ff', .14 * sh)); g.addColorStop(1, RGBA('#bff0ff', .45 * sh));
      cx.fillStyle = g; cx.fill(); cx.lineWidth = 2.5 + 3 * P.blockT; cx.strokeStyle = RGBA('#aef0ff', .8 * sh); cx.stroke(); cx.restore();
      glow(cxx + 90, cy, 40, '#7cd8ff', .3 * sh + .6 * P.blockT);
    }
    cx.restore();
  }

  /* ================= БОССЫ (рисуются лицом вправо, потом зеркалятся) ================= */
  // общая трансформация «наклона» корпуса вокруг передней ноги
  function leanTf(piv, lean, dip) { const c = Math.cos(rad(lean)), s = Math.sin(rad(lean)); return (x, y) => { const dx = x - piv; return [piv + dx * c - y * s, dx * s + y * c + dip]; }; }
  function bodyStart(piv, lean, dip) { cx.save(); cx.translate(piv, dip); cx.rotate(rad(lean)); cx.translate(-piv, 0); }

  /* ----- Голем Матриц ----- */
  const golem = {
    sx: 40, D: (p) => 64 + 12 * p, w: 70,
    draw(P, g) {
      const t = P.t, bp = -P.p, k = P.kickB;
      const lean = 8 + 9 * bp + 10 * k - 8 * P.stun + Math.sin(t * 31) * (.4 + Math.abs(bp)) * 1.1;
      const dip = 3 + 8 * Math.max(0, -bp) + Math.sin(t * 15) * .6;
      const tf = leanTf(20, lean, dip), STONE = '#7a8e9e', DK = '#4a5866';
      const legsD = [[-8, -64, -28], [20, -64, 34]];
      const legDraw = ([hx, hy, fx], far) => {
        const h = tf(hx, hy), [kn, ft] = ik(h, [fx + (bp < -.1 ? Math.sin(t * 28 + hx) * 2 * -bp : 0), 0], 32, 34, -1);
        limb(h, kn, far ? 28 : 32, far ? '#5d6f7e' : STONE); limb(kn, ft, far ? 24 : 28, far ? '#4c5a68' : '#66798a');
        disc(kn[0], kn[1], 10, far ? '#56606e' : '#6a7686'); glow(kn[0], kn[1], 9, '#ff9a2e', .5); cx.beginPath(); cx.arc(kn[0], kn[1], 3, 0, 7); cx.fillStyle = C('#ffb02e'); cx.fill();
        poly([[ft[0] - 16, 0], [ft[0] + 22, 0], [ft[0] + 26, -9], [ft[0] + 16, -20], [ft[0] - 12, -19]]); shape(vg(-20, 0, far ? '#4a5866' : '#5d6f7e'));
      };
      const S1 = tf(48, -152), S2 = tf(-4, -160);
      const arm = (S, T, far) => {
        const [el, hd] = ik(S, T, 44, 46, 1), c = far ? '#5d6f7e' : STONE;
        limb(S, el, far ? 24 : 29, c); limb(el, hd, far ? 22 : 26, far ? '#55626f' : '#6c7f8f');
        const wr = [el[0] + (hd[0] - el[0]) * .72, el[1] + (hd[1] - el[1]) * .72];
        cx.lineCap = 'butt'; cx.strokeStyle = C('#ffb02e'); cx.lineWidth = 4; const a = Math.atan2(hd[1] - el[1], hd[0] - el[0]) + Math.PI / 2;
        line([wr[0] + Math.cos(a) * 11, wr[1] + Math.sin(a) * 11], [wr[0] - Math.cos(a) * 11, wr[1] - Math.sin(a) * 11]); cx.stroke();
        disc(el[0], el[1], 10, far ? '#56606e' : '#6a7686'); glow(el[0], el[1], 10, '#ff9a2e', .45);
        return hd;
      };
      const fist = (hd, far) => {
        cx.save(); cx.translate(hd[0], hd[1]);
        blob([[-17, -17], [10, -19], [21, -5], [17, 15], [-7, 18], [-19, 5]]); shape(vg(-16, 15, far ? '#55626f' : '#6f8292'));
        cx.strokeStyle = OUT; cx.lineWidth = 2; [-8, -1, 6].forEach((x) => { cx.beginPath(); cx.moveTo(x, -12); cx.lineTo(x + 2, 10); cx.stroke(); });
        cx.restore();
      };
      cx.save(); cx.translate(P.bx, 0); FLIP = true; cx.scale(-1, 1);
      shadow(6, 80);
      if (P.koB) { cx.translate(-30, P.koB * 18); cx.rotate(-rad(P.koB * 34)); cx.translate(30, 0); cx.globalAlpha = 1 - .5 * P.koB; }
      TINT = P.flashB * .85; TC = [255, 255, 255];
      const loc = (w) => [P.bx - w[0], w[1]];
      legDraw(legsD[0], true);
      const hdF = arm(S2, loc(g.gF), true); fist(hdF, true);
      bodyStart(20, lean, dip);
      cx.translate(8, -120); cx.scale(1.22, 1.22); cx.translate(-8, 120);
      poly([[-46, -150], [-30, -152], [-30, -110], [-46, -108]]); shape(vg(-152, -108, '#3c4654'));
      [-140, -128, -116].forEach((y) => { cx.beginPath(); cx.arc(-38, y, 2.2, 0, 7); cx.fillStyle = C('#ff8a1e'); cx.fill(); });
      const body = [[-40, -116], [-32, -156], [6, -172], [44, -162], [58, -126], [50, -88], [16, -74], [-26, -80]];
      blob(body); shape(vg(-172, -74, STONE, .3, .45));
      cx.save(); blob(body); cx.clip();
      const pulse = .55 + .45 * Math.abs(Math.sin(t * 3 + bp));
      cx.strokeStyle = RGBA('#ffb02e', .55 + .4 * pulse); cx.lineWidth = 2;
      for (let x = -40; x <= 60; x += 13) { line([x, -175], [x + 6, -70]); cx.stroke(); }
      for (let y = -165; y <= -75; y += 13) { line([-45, y], [62, y + 3]); cx.stroke(); }
      cx.restore();
      glow(14, -122, 46, '#ff8a1e', .18 + .2 * pulse);
      poly([[6, -132], [18, -138], [30, -132], [30, -118], [18, -112], [6, -118]]); shape(C('#ffb02e', .15), 2); glow(18, -125, 22, '#ffb02e', .9);
      poly([[-30, -94], [44, -92], [40, -78], [-26, -80]]); shape(vg(-94, -78, DK)); [-20, 0, 20, 36].forEach((x) => bolt(x, -86));
      if (P.hpFrac < .5) { cx.strokeStyle = OUT; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(30, -160); cx.lineTo(20, -146); cx.lineTo(28, -140); cx.lineTo(16, -126); cx.stroke(); glow(22, -144, 14, '#ff5a2a', .6); }
      // голова
      const hb = P.kickB * 6 - P.stun * 8;
      cx.save(); cx.translate(14, -176); cx.rotate(rad(hb));
      poly([[-16, -18], [18, -20], [22, 0], [12, 10], [-12, 10], [-18, -4]]); shape(vg(-20, 10, '#8597a6', .3, .4));
      poly([[-6, -8], [20, -9], [20, -2], [-6, -1]]); shape(C('#1a1f2b'), 2);
      lamp(4, -5, 2.8, '#ff2a20'); lamp(14, -5, 2.8, '#ff2a20');
      poly([[0, 4], [16, 4], [14, 9], [2, 9]]); shape(C('#3c4654'), 1.6);
      cx.restore();
      cx.restore();
      // наплечник ближней руки
      legDraw(legsD[1], false);
      const hdN = arm(S1, loc(g.gN), false);
      cx.save(); cx.translate(S1[0], S1[1]); cx.rotate(rad(lean * .6));
      poly([[-22, -24], [24, -24], [28, 4], [20, 22], [-20, 22], [-26, 2]]); shape(vg(-20, 18, '#8193a3', .3, .4));
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) txt(String(((r * 3 + c) * 7 + 3) % 9 + 1), -13 + c * 13, -12 + r * 12, 10, '#ffb02e');
      cx.restore();
      fist(hdN, false);
      TINT = 0; FLIP = false; cx.restore();
      return { body: [P.bx - 10, -120], head: [P.bx - 20, -196], mouth: [P.bx - 30, -190] };
    }
  };

  /* ----- Дракон Пределов ----- */
  const dragon = {
    sx: 34, D: (p) => 56 + 10 * p, w: 80,
    draw(P, g) {
      const t = P.t, bp = -P.p, k = P.kickB;
      const lean = 10 + 8 * bp + 10 * k - 8 * P.stun + Math.sin(t * 29) * (.4 + Math.abs(bp));
      const dip = 2 + 7 * Math.max(0, -bp);
      const tf = leanTf(18, lean, dip), RED = '#e3361f', DK = '#8c1a10';
      const legDraw = ([hx, hy, fx], far) => {
        const h = tf(hx, hy), [kn, ft] = ik(h, [fx, 0], 34, 38, -1);
        limb(h, kn, far ? 20 : 24, far ? '#a8261a' : RED); limb(kn, ft, 15, far ? '#4a4f5e' : '#646c80');
        disc(kn[0], kn[1], 8, '#5a6275'); glow(kn[0], kn[1], 9, '#4fd2ff', .5);
        [[-8, 0], [6, -2], [18, 0]].forEach(([dx]) => { poly([[ft[0] + dx - 5, -2], [ft[0] + dx + 9, 0], [ft[0] + dx + 2, -9]]); shape(C('#cfd6e4', -.2), 1.6); });
        blob([[ft[0] - 12, -4], [ft[0] + 14, -4], [ft[0] + 10, -14], [ft[0] - 8, -14]]); shape(vg(-14, -4, far ? '#a8261a' : RED));
      };
      cx.save(); cx.translate(P.bx, 0); FLIP = true; cx.scale(-1, 1);
      shadow(0, 84);
      if (P.koB) { cx.translate(-30, P.koB * 18); cx.rotate(-rad(P.koB * 34)); cx.translate(30, 0); cx.globalAlpha = 1 - .5 * P.koB; }
      TINT = P.flashB * .85; TC = [255, 255, 255];
      const loc = (w) => [P.bx - w[0], w[1]];
      // крыло
      const flap = Math.sin(t * (P.raged ? 8 : 5)) * .22 + .05 * k;
      const WR = tf(-2, -146);
      cx.save(); cx.translate(WR[0], WR[1]); cx.rotate(flap);
      const wpts = [[0, 0], [-34, -64], [-78, -78], [-112, -50], [-96, -28], [-104, -4], [-78, 6], [-70, 22], [-30, 10]];
      poly(wpts); const wg = cx.createLinearGradient(0, -78, -60, 22); wg.addColorStop(0, C('#ff9a3c', .1)); wg.addColorStop(1, C('#d24a1a', -.2)); shape(wg);
      cx.strokeStyle = C(DK); cx.lineWidth = 3; [[-112, -50], [-104, -4], [-70, 22]].forEach((p) => { line([-34, -64], p); cx.stroke(); });
      limb([0, 0], [-34, -64], 9, RED); limb([-34, -64], [-78, -78], 7, RED);
      cx.restore();
      // хвост
      let tp = tf(-28, -88), ta = Math.PI * .92;
      const tail = [tp];
      for (let i = 0; i < 6; i++) { ta += .12 + Math.sin(t * 3 - i * .7) * .13; tp = [tp[0] + Math.cos(ta) * 14, tp[1] - Math.sin(ta) * -14 * .2 - 4 + i * 1.5]; tail.push(tp); }
      for (let i = tail.length - 2; i >= 0; i--) limb(tail[i], tail[i + 1], 16 - i * 2, RED);
      const te = tail[tail.length - 1], tb = tail[tail.length - 2], an = Math.atan2(te[1] - tb[1], te[0] - tb[0]);
      cx.save(); cx.translate(te[0], te[1]); cx.rotate(an); poly([[0, -8], [16, 0], [0, 8], [4, 0]]); shape(C('#9aa6bd'), 2); cx.restore();
      legDraw([-8, -74, -24], true);
      const S1 = tf(34, -128), S2 = tf(22, -134);
      const arm = (S, T, far) => {
        const [el, hd] = ik(S, T, 34, 38, 1);
        limb(S, el, far ? 13 : 16, far ? '#a8261a' : RED); limb(el, hd, far ? 11 : 13, far ? '#4a4f5e' : '#646c80');
        disc(el[0], el[1], 6, '#5a6275');
        const a = Math.atan2(hd[1] - el[1], hd[0] - el[0]);
        cx.save(); cx.translate(hd[0], hd[1]); cx.rotate(a);
        [-1, 0, 1].forEach((s) => { cx.beginPath(); cx.moveTo(-4, s * 5); cx.quadraticCurveTo(10, s * 10 - 4, 12, s * 4 + 9); cx.lineTo(4, s * 4 + 2); cx.closePath(); shape(C('#d8dde8', -.1), 1.8); });
        disc(-3, 0, 6.5, far ? '#a8261a' : RED, 2);
        cx.restore();
      };
      arm(S2, loc(g.gF), true);
      bodyStart(18, lean, dip);
      const body = [[-34, -96], [-30, -138], [-2, -156], [34, -146], [46, -116], [38, -84], [4, -70], [-26, -76]];
      blob(body); shape(vg(-156, -70, RED, .35, .45));
      cx.save(); blob(body); cx.clip(); for (let y = -132; y < -70; y += 10) { poly([[20, y], [52, y], [52, y + 7], [22, y + 7]]); shape(C('#7e8aa0'), 1.6); } cx.restore();
      [[-24, -150], [-8, -162], [8, -164]].forEach(([x, y]) => { poly([[x - 6, y + 10], [x, y - 6], [x + 6, y + 10]]); shape(C('#5a6275'), 1.6); });
      blob([[-2, -128], [26, -130], [32, -110], [20, -96], [-4, -100]]); shape(vg(-130, -96, '#b52a18'));
      txt('lim', 14, -114, 13, '#ffd27a', -.15); glow(14, -114, 22, '#ff8a1e', .55);
      disc(-12, -108, 9, '#5a6275'); lamp(-12, -108, 3.5, '#4fd2ff');
      // шея и голова
      const neck = [[26, -142], [34, -160], [46, -174]];
      limb(neck[0], neck[1], 22, RED); limb(neck[1], neck[2], 20, RED);
      const hang = 16 + 10 * Math.max(0, bp) - 10 * P.stun, jaw = 10 + 26 * k + 6 * Math.abs(Math.sin(t * 2.4));
      cx.save(); cx.translate(48, -178); cx.rotate(rad(hang));
      cx.save(); cx.translate(2, 6); cx.rotate(rad(jaw));
      poly([[-6, 0], [34, 2], [30, 9], [-4, 8]]); shape(vg(0, 9, '#b52a18'));
      for (let x = 4; x < 30; x += 7) { poly([[x, 1], [x + 3, -4], [x + 6, 1]]); shape(C('#ffffff'), 1.2); }
      cx.restore();
      poly([[-14, -10], [10, -16], [38, -8], [44, 2], [30, 6], [-8, 8]]); shape(vg(-16, 8, RED, .35, .4));
      for (let x = 10; x < 38; x += 7) { poly([[x, 4], [x + 3, 9], [x + 6, 4]]); shape(C('#ffffff'), 1.2); }
      poly([[-6, -12], [-34, -34], [-12, -6]]); shape(C('#9aa6bd'), 2); poly([[2, -14], [-22, -40], [-2, -8]]); shape(C('#c3ccdc'), 2);
      lamp(16, -8, 3, '#ff2a20'); glow(16, -8, 12, '#ff5a2a', .7);
      cx.restore();
      cx.restore();
      legDraw([16, -72, 28], false);
      arm(S1, loc(g.gN), false);
      TINT = 0; FLIP = false;
      // огонь из пасти: тонкие язычки всегда, мощная струя при атаке
      const ma = rad(lean + hang + 4), mx = 48 + Math.cos(ma) * 44, my = -178 + Math.sin(ma) * 44 + dip;
      const M = [mx, my], tgt = loc(g.gN), fire = .25 + 1.2 * k;
      for (let i = 0; i < 9; i++) {
        const u = ((t * 2.2 + i / 9) % 1) * Math.min(1, .35 + k * 1.2);
        const x = M[0] + (tgt[0] + 8 - M[0]) * u, y = M[1] + (tgt[1] - 24 - M[1]) * u + Math.sin(t * 20 + i) * 3;
        glow(x, y, (6 + 18 * u) * fire, i % 2 ? '#ff8a1e' : '#ffd24a', .7 * (1 - u * .6));
      }
      cx.restore();
      return { body: [P.bx - 10, -116], head: [P.bx - 60, -182], mouth: [P.bx - mx, my] };
    }
  };

  /* ----- Скорпион Векторов ----- */
  const scorpion = {
    sx: 40, D: (p) => 32 + 8 * p, w: 70,
    draw(P, g) {
      const t = P.t, bp = -P.p, k = P.kickB;
      const lean = -2 + 4 * bp + 4 * k - 4 * P.stun + Math.sin(t * 27) * (.4 + Math.abs(bp)) * .8;
      const dip = Math.max(0, -bp) * 4;
      const tf = leanTf(20, lean, dip), ST = '#3f4a62', OR = '#ffb347';
      cx.save(); cx.translate(P.bx, 0); FLIP = true; cx.scale(-1, 1);
      shadow(-10, 88);
      if (P.koB) { cx.translate(-30, P.koB * 14); cx.rotate(-rad(P.koB * 26)); cx.translate(30, 0); cx.globalAlpha = 1 - .5 * P.koB; }
      TINT = P.flashB * .85; TC = [255, 255, 255];
      const loc = (w) => [P.bx - w[0], w[1]];
      const legs = (far) => {
        [-34, -18, -2, 14].forEach((hx, i) => {
          const h = tf(hx + (far ? -4 : 0), -44), fx = hx + [-30, -14, 8, 26][i] + (far ? -6 : 0);
          const lift = Math.max(0, Math.sin(t * 14 + i * 1.7 + (far ? 1 : 0))) * 4 * (Math.abs(bp) + .3);
          const [kn, ft] = ik(h, [fx, -lift], 26, 34, -1);
          limb(h, kn, far ? 7 : 9, far ? '#2e3648' : ST, false); limb(kn, ft, far ? 5 : 7, far ? '#2e3648' : '#55607a', false);
          if (!far) { cx.beginPath(); cx.arc(kn[0], kn[1], 2.6, 0, 7); cx.fillStyle = C(OR); cx.fill(); }
        });
      };
      legs(true);
      // хвост
      const R = tf(-62, -60), sway = Math.sin(t * 2.6) * 8, strike = k;
      const c1 = [-118, -80], c2 = [-112 + strike * 40, -200 + sway], tip = [-34 + strike * 96 + sway, -178 + strike * 52];
      const segs = [];
      for (let i = 0; i <= 7; i++) { const u = i / 7, a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), d = u ** 3; segs.push([a * R[0] + b * c1[0] + c * c2[0] + d * tip[0], a * R[1] + b * c1[1] + c * c2[1] + d * tip[1]]); }
      for (let i = 0; i < 7; i++) { limb(segs[i], segs[i + 1], 15 - i * 1.2, ST); cx.beginPath(); cx.arc(segs[i + 1][0], segs[i + 1][1], 3, 0, 7); cx.fillStyle = C(OR); cx.fill(); }
      const sa = Math.atan2(tip[1] - segs[6][1], tip[0] - segs[6][0]);
      cx.save(); cx.translate(tip[0], tip[1]); cx.rotate(sa + .9);
      poly([[0, -10], [26, 0], [0, 10], [6, 0]]); shape(C(OR, .1), 2.4); glow(12, 0, 26, '#ff9a2e', .7);
      cx.restore();
      // тело
      bodyStart(20, lean, dip);
      [[-70, -60, 14], [-52, -62, 16]].forEach(([x, y, r]) => { blob([[x - r, y + 6], [x - r + 3, y - 10], [x + r, y - 12], [x + r + 2, y + 6], [x, y + 14]]); shape(vg(y - 14, y + 14, ST)); });
      const body = [[-44, -56], [-34, -80], [8, -88], [42, -76], [56, -56], [42, -40], [0, -36], [-38, -42]];
      blob(body); shape(vg(-88, -36, ST, .35, .45));
      cx.strokeStyle = C(OR); cx.lineWidth = 3; cx.beginPath(); cx.moveTo(-30, -74); cx.quadraticCurveTo(10, -86, 40, -72); cx.stroke(); glow(6, -80, 30, '#ff9a2e', .25);
      [[-20, -62], [4, -66], [28, -60]].forEach(([x, y]) => { poly([[x - 8, y], [x, y - 12], [x + 8, y]]); shape(C('#55607a'), 1.6); });
      lamp(46, -62, 3.2, '#ff2a20'); lamp(52, -56, 2.6, '#ff2a20');
      poly([[50, -50], [60, -46], [52, -42]]); shape(C('#cfd6e4'), 1.4);
      if (P.hpFrac < .5) glow(10, -60, 16, '#ff5a2a', .6);
      cx.restore();
      legs(false);
      // клешни
      const claw = (S, T, far) => {
        const [el, hd] = ik(S, T, 40, 44, -1);
        limb(S, el, far ? 11 : 14, far ? '#2e3648' : ST); limb(el, hd, far ? 12 : 15, far ? '#2e3648' : '#4b5670');
        disc(el[0], el[1], 6, '#55607a');
        const a = Math.atan2(hd[1] - el[1], hd[0] - el[0]), open = .5 + .25 * Math.sin(t * 3) - .35 * k;
        cx.save(); cx.translate(hd[0], hd[1]); cx.rotate(a);
        cx.beginPath(); cx.moveTo(-10, 0); cx.arc(-10, 0, 20, open, Math.PI * 2 - open); cx.closePath(); shape(vg(-20, 20, far ? '#2e3648' : '#4b5670'));
        cx.strokeStyle = C(OR); cx.lineWidth = 3; cx.beginPath(); cx.arc(-10, 0, 14, open + .15, Math.PI * 2 - open - .15); cx.stroke();
        glow(4, 0, 16, '#ff9a2e', .5);
        cx.restore();
      };
      claw(tf(36, -60), loc(g.gF), true);
      claw(tf(44, -54), loc(g.gN), false);
      TINT = 0; FLIP = false; cx.restore();
      return { body: [P.bx, -60], head: [P.bx - 46, -62], mouth: [P.bx - tip[0], tip[1]] };
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
  const BOSS = { golem, dragon, scorpion, serpent, rival };

  /* P: { t, p, kickM, kickB, flashM, flashB, koM, koB, scars, shield, blockT, charge, turbo, raged, stun, hpFrac, introM, introB, key } */
  function draw(ctx, P) {
    cx = ctx;
    const B = BOSS[P.key] || golem, S = bullPose(P);
    const gx = VW / 2 + P.p * 30;
    const jit = Math.sin(P.t * 41) * (.4 + Math.abs(P.p)) * .9;
    P.bx = gx - S.gN[0] + P.introM + jit;
    const gw = { gN: [P.bx + S.gN[0], S.gN[1]], gF: [P.bx + S.gF[0], S.gF[1]] };
    const bossBx = gx + B.sx + B.D(P.p) + P.introB - jit;
    if (P.introB > 1) { gw.gN = [gx + 40 + P.introB, -128]; gw.gF = [gx + 50 + P.introB, -122]; }
    if (P.hide !== 'bull') drawBull(P, S);
    const Q = Object.assign({}, P, { bx: bossBx });
    let an;
    if (P.key === 'rival') {
      const P2 = Object.assign({}, P, { p: -P.p, kickM: P.kickB, flashM: P.flashB, koM: P.koB, scars: P.rscars || 0, col: P.rcol, shield: 0, blockT: 0, charge: 0, t: P.t + 1.7, hide: null });
      const S2 = bullPose(P2), gx2 = VW / 2 + P2.p * 30;
      P2.bx = gx2 - S2.gN[0] + P.introB - jit;
      if (P.hide !== 'boss') { cx.save(); cx.translate(VW, 0); cx.scale(-1, 1); FLIP = true; drawBull(P2, S2); FLIP = false; cx.restore(); }
      an = { body: [VW - (P2.bx + 6), -96], head: [VW - (P2.bx + 40), -110], mouth: [VW - (P2.bx + 50), -90] };
      return { contact: [gw.gN[0], gw.gN[1]], bull: [P.bx + 6, -96], bullRear: [P.bx - 50, -40], bullFront: [P.bx + 50, -40], boss: an.body, bossHead: an.head, mouth: an.mouth, bossRear: [VW - (P2.bx - 50), -40] };
    }
    an = P.hide === 'boss' ? { body: [bossBx, -110], head: [bossBx, -170], mouth: [bossBx, -170] } : B.draw(Q, gw);
    return { contact: [gw.gN[0], gw.gN[1]], bull: [P.bx + 6, -96], bullRear: [P.bx - 50, -40], bullFront: [P.bx + 50, -40], boss: an.body, bossHead: an.head, mouth: an.mouth, bossRear: [bossBx + B.w, -40] };
  }
  return { draw, VW };
})();
