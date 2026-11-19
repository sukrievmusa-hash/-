"""Минимальный рендер WMF из Microsoft Equation 3.0 / MathType в SVG.
Текст выводится Unicode-символами (Symbol и MT Extra перекодируются), составные скобки рисуются кривыми."""
import struct, os, sys, json
from wmfdump import recs

SYM = {0x22: '∀', 0x24: '∃', 0x27: '∋', 0x2A: '∗', 0x2D: '−', 0x40: '≅', 0x5C: '∴', 0x5E: '⊥', 0x60: '‾', 0x7E: '∼',
       0xA1: 'ϒ', 0xA2: '′', 0xA3: '≤', 0xA4: '⁄', 0xA5: '∞', 0xA6: 'ƒ', 0xAB: '↔', 0xAC: '←', 0xAD: '↑', 0xAE: '→', 0xAF: '↓',
       0xB0: '°', 0xB1: '±', 0xB2: '″', 0xB3: '≥', 0xB4: '×', 0xB5: '∝', 0xB6: '∂', 0xB7: '•', 0xB8: '÷', 0xB9: '≠', 0xBA: '≡',
       0xBB: '≈', 0xBC: '…', 0xC0: 'ℵ', 0xC4: '⊗', 0xC5: '⊕', 0xC6: '∅', 0xC7: '∩', 0xC8: '∪', 0xC9: '⊃', 0xCA: '⊇', 0xCB: '⊄',
       0xCC: '⊂', 0xCD: '⊆', 0xCE: '∈', 0xCF: '∉', 0xD0: '∠', 0xD1: '∇', 0xD5: '∏', 0xD6: '√', 0xD7: '⋅', 0xD8: '¬', 0xD9: '∧',
       0xDA: '∨', 0xDB: '⇔', 0xDC: '⇐', 0xDD: '⇑', 0xDE: '⇒', 0xDF: '⇓', 0xE0: '◊', 0xE1: '〈', 0xE5: '∑', 0xF1: '〉', 0xF2: '∫'}
GR = 'ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ'
gr = 'αβχδεφγηιϕκλμνοπθρστυϖωξψζ'
for i, ch in enumerate(GR): SYM[0x41 + i] = ch
for i, ch in enumerate(gr): SYM[0x61 + i] = ch
SYM[0x6A] = 'φ'  # в формулах «j» символьного шрифта — фи
MTX = {0x55: '∪', 0x6C: 'l', 0x4C: '⋯', 0x4B: '⋯'}
PIECE = {0xE6: ('(', 't'), 0xE7: ('(', 'm'), 0xE8: ('(', 'b'), 0xF6: (')', 't'), 0xF7: (')', 'm'), 0xF8: (')', 'b'),
         0xE9: ('[', 't'), 0xEA: ('[', 'm'), 0xEB: ('[', 'b'), 0xF9: (']', 't'), 0xFA: (']', 'm'), 0xFB: (']', 'b'),
         0xEC: ('{', 't'), 0xED: ('{', 'c'), 0xEE: ('{', 'b'), 0xEF: ('{', 'm'), 0xFC: ('}', 't'), 0xFD: ('}', 'c'), 0xFE: ('}', 'b'),
         0xBD: ('|', 'm'), 0xF4: ('∫', 'm'), 0xF3: ('∫', 't'), 0xF5: ('∫', 'b')}
COL = '#e9edf7'
esc = lambda s: s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def convert(b):
    objs, font, pen = {}, None, 1.0
    org, ext = (0, 0), (100, 100)
    cp = (0, 0)
    align = 0
    out, pieces, lines = [], [], []

    def slot():
        i = 0
        while i in objs: i += 1
        return i
    for fn, p in recs(b):
        if fn == 0x020B: org = (struct.unpack_from('<h', p, 2)[0], struct.unpack_from('<h', p, 0)[0])
        elif fn == 0x020C: ext = (struct.unpack_from('<h', p, 2)[0], struct.unpack_from('<h', p, 0)[0])
        elif fn == 0x012E: align = struct.unpack_from('<H', p, 0)[0]
        elif fn == 0x02FB:
            h = struct.unpack_from('<h', p, 0)[0]
            objs[slot()] = ('f', dict(h=abs(h), w=struct.unpack_from('<h', p, 8)[0], it=p[10], cs=p[13], face=p[18:50].split(b'\0')[0].decode('latin1')))
        elif fn == 0x02FA: objs[slot()] = ('p', max(1, struct.unpack_from('<h', p, 2)[0]))
        elif fn in (0x02FC, 0x0142, 0x00F7, 0x06FF, 0x01F9): objs[slot()] = ('x', None)
        elif fn == 0x012D:
            o = objs.get(struct.unpack_from('<H', p, 0)[0])
            if o and o[0] == 'f': font = o[1]
            if o and o[0] == 'p': pen = o[1]
        elif fn == 0x01F0: objs.pop(struct.unpack_from('<H', p, 0)[0], None)
        elif fn == 0x0214: cp = (struct.unpack_from('<h', p, 2)[0], struct.unpack_from('<h', p, 0)[0])
        elif fn == 0x0213:
            np_ = (struct.unpack_from('<h', p, 2)[0], struct.unpack_from('<h', p, 0)[0])
            lines.append((cp, np_, pen)); cp = np_
        elif fn == 0x0325 or fn == 0x0324:
            n = struct.unpack_from('<h', p, 0)[0]
            pts = [struct.unpack_from('<hh', p, 2 + 4 * i) for i in range(n)]
            d = 'M' + ' L'.join(f'{x} {y}' for x, y in pts) + (' Z' if fn == 0x0324 else '')
            out.append(f'<path d="{d}" ' + (f'fill="{COL}"/>' if fn == 0x0324 else f'fill="none" stroke="{COL}" stroke-width="{pen}"/>'))
        elif fn in (0x0A32, 0x0521):
            if fn == 0x0A32:
                y, x, cnt, opt = struct.unpack_from('<hhhH', p, 0)
                o0 = 8 + (8 if opt & 6 else 0)
                s = p[o0:o0 + cnt]
                dxo = o0 + cnt + (cnt & 1)
                dx = list(struct.unpack_from('<%dh' % cnt, p, dxo)) if len(p) >= dxo + 2 * cnt and cnt > 1 else None
            else:
                cnt = struct.unpack_from('<h', p, 0)[0]; s = p[2:2 + cnt]; dx = None
                y, x = struct.unpack_from('<hh', p, 2 + cnt + (cnt & 1))
            if align & 1: x, y = cp
            if not font or font['face'] == 'System': continue
            f = font; sz = f['h']
            face = f['face']
            if face == 'Symbol':
                rest = []
                for c in s:
                    if c in PIECE: pieces.append((PIECE[c], x, y, sz))
                    else: rest.append(SYM.get(c, chr(c)))
                txt = ''.join(rest); fam = "'Times New Roman',FreeSerif,'DejaVu Serif',serif"
            elif face == 'MT Extra':
                txt = ''
                for c in s:
                    if c in (0x72, 0x76, 0x77):  # стрелка вектора над буквой
                        w = sz * (.42 if c == 0x72 else .5); yy = y + sz * .06; x0 = x + sz * .05
                        out.append(f'<path d="M{x0:.0f} {yy:.0f} H{x0 + w:.0f} M{x0 + w - sz * .12:.0f} {yy - sz * .08:.0f} L{x0 + w:.0f} {yy:.0f} L{x0 + w - sz * .12:.0f} {yy + sz * .08:.0f}" fill="none" stroke="{COL}" stroke-width="{sz * .045:.0f}" stroke-linecap="round" stroke-linejoin="round"/>')
                    elif c == 0x6C: out.append(f'<text x="{x + sz * .14:.0f}" y="{y}" font-size="{sz}" font-family="\'Times New Roman\',FreeSerif,serif">l</text>')
                    else: txt += MTX.get(c, chr(c))
                fam = "'Times New Roman',FreeSerif,serif"
            else:
                enc = 'cp1251' if (f['cs'] == 204 or 'Cyr' in face) else 'cp1252'
                txt = s.decode(enc, 'replace'); fam = "'Times New Roman',FreeSerif,serif"
            if txt:
                st = ' font-style="italic"' if f['it'] else ''
                wt = ' font-weight="bold"' if f['w'] >= 600 else ''
                anchor = ''
                if align & 6 == 6: anchor = ' text-anchor="middle"'
                elif align & 2: anchor = ' text-anchor="end"'
                body = esc(txt)
                if dx and len(txt) == len(dx):
                    acc = x; body = ''
                    for ch, d in zip(txt, dx): body += f'<tspan x="{acc}">{esc(ch)}</tspan>'; acc += d
                xs = str(x)
                out.append(f'<text x="{xs}" y="{y}" font-size="{sz}" font-family="{fam}"{st}{wt}{anchor} xml:space="preserve">{body}</text>')
    for a, c, w in lines:
        out.append(f'<path d="M{a[0]} {a[1]} L{c[0]} {c[1]}" stroke="{COL}" stroke-width="{max(w, 12)}" stroke-linecap="square"/>')
    # составные скобки: группируем куски по типу и x
    groups = {}
    for (k, part), x, y, sz in pieces:
        key = (k, round(x / 40))
        g = groups.setdefault(key, dict(x=x, ys=[], sz=sz, parts=[]))
        g['ys'].append(y); g['parts'].append((part, y)); g['sz'] = max(g['sz'], sz)
    for (k, _), g in groups.items():
        s = g['sz']; x = g['x']; top = min(g['ys']) - .8 * s; bot = max(g['ys']) + .22 * s; mid = (top + bot) / 2
        sw = s * .065
        if k == '(':
            d = f'M{x + .34 * s:.0f} {top:.0f} Q{x + .02 * s:.0f} {mid:.0f} {x + .34 * s:.0f} {bot:.0f}'
        elif k == ')':
            d = f'M{x + .06 * s:.0f} {top:.0f} Q{x + .38 * s:.0f} {mid:.0f} {x + .06 * s:.0f} {bot:.0f}'
        elif k == '[':
            d = f'M{x + .32 * s:.0f} {top:.0f} H{x + .12 * s:.0f} V{bot:.0f} H{x + .32 * s:.0f}'
        elif k == ']':
            d = f'M{x + .06 * s:.0f} {top:.0f} H{x + .26 * s:.0f} V{bot:.0f} H{x + .06 * s:.0f}'
        elif k in '{}':
            l, m_, r = (x + .02 * s, x + .2 * s, x + .38 * s)
            if k == '}': l, r = r, l
            rr = .16 * s
            d = (f'M{r:.0f} {top:.0f} Q{m_:.0f} {top:.0f} {m_:.0f} {top + rr:.0f} V{mid - rr:.0f} Q{m_:.0f} {mid:.0f} {l:.0f} {mid:.0f} '
                 f'Q{m_:.0f} {mid:.0f} {m_:.0f} {mid + rr:.0f} V{bot - rr:.0f} Q{m_:.0f} {bot:.0f} {r:.0f} {bot:.0f}')
        elif k == '|':
            d = f'M{x + .2 * s:.0f} {top:.0f} V{bot:.0f}'
        else:  # большой интеграл
            d = f'M{x + .1 * s:.0f} {bot - .1 * s:.0f} Q{x + .2 * s:.0f} {bot:.0f} {x + .25 * s:.0f} {mid:.0f} Q{x + .3 * s:.0f} {top:.0f} {x + .45 * s:.0f} {top + .1 * s:.0f}'
        out.append(f'<path d="{d}" fill="none" stroke="{COL}" stroke-width="{sw:.0f}" stroke-linecap="round" stroke-linejoin="round"/>')
    ox, oy = org; ew, eh = ext
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" fill="{COL}" viewBox="{ox} {oy} {ew} {eh}" width="{ew}" height="{eh}">' + ''.join(out) + '</svg>'
    return svg, ext


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    meta = {}
    for f in os.listdir(src):
        if not f.endswith('.wmf'): continue
        svg, ext = convert(open(os.path.join(src, f), 'rb').read())
        n = f[5:-4]
        open(os.path.join(dst, n + '.svg'), 'w').write(svg)
        meta[n] = ext
    json.dump(meta, open(os.path.join(dst, '..', 'meta.json'), 'w'))
    print(len(meta))
