#!/usr/bin/env python3
"""Builds styles/minawa-themes-auto.css: the Dark and Frost versions of every colour in the light theme's CSS.

The light theme stays exactly as written. For each rule that sets a colour, this writes the same rule again under
html[data-theme=dark] / html[data-theme=frost] with the colour moved to that theme: light surfaces become dark (or
frosted glass), dark text becomes light, light borders become faint lines. Rules that set a colour through a variable
are copied as they are, so the order of the cascade is kept. Hand-made touches live in styles/minawa-themes.css.
Run again after changing the light theme:  python3 scripts/build-themes.py
"""
import colorsys, re, sys, pathlib
import tinycss2

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCES = ['minawa-theme.css', 'minawa-additions.css', 'minawa-refresh.css', 'minawa-live.css', 'minawa-mobile.css']
PROPS_TEXT = {'color', 'fill', 'stroke', '-webkit-text-fill-color', 'caret-color', 'text-decoration-color'}
PROPS_BG = {'background', 'background-color', 'background-image'}
PROPS_LINE = {'border', 'border-color', 'border-top', 'border-bottom', 'border-left', 'border-right', 'border-top-color',
              'border-bottom-color', 'border-left-color', 'border-right-color', 'outline', 'outline-color', 'border-block', 'border-inline'}
PROPS_SHADOW = {'box-shadow'}
# kept as they are, so a 'background' shorthand above them does not undo them (e.g. gradient text)
PROPS_KEEP = {'background-clip', '-webkit-background-clip', 'background-size', 'background-position', 'background-repeat', 'background-attachment', 'background-origin', 'background-blend-mode'}
SKIP_SEL = ('.doc', 'signin', '.lv-cal', '.bd-t', '.pay-page', '.wa-phone', '.wa-msg', '.wa-bubble', '::selection')
TEXT_VARS = {'var(--ink)': '#E8EAED', 'var(--ink-2)': '#C9CDD3', 'var(--fg)': '#E8EAED', 'var(--slate-100)': '#2A2D33'}

COLOR_RE = re.compile(r'#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\bwhite\b')

def parse(c):
    c = c.strip()
    if c == 'white': return (255, 255, 255, 1.0)
    if c.startswith('#'):
        h = c[1:]
        if len(h) in (3, 4): h = ''.join(x * 2 for x in h)
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return (r, g, b, a)
    nums = re.findall(r'[\d.]+%?', c)
    if len(nums) < 3: return None
    vals = [float(n[:-1]) * 2.55 if n.endswith('%') else float(n) for n in nums[:3]]
    a = float(nums[3][:-1]) / 100 if len(nums) > 3 and nums[3].endswith('%') else (float(nums[3]) if len(nums) > 3 else 1.0)
    return (vals[0], vals[1], vals[2], a)

def hls(rgb): return colorsys.rgb_to_hls(*(x / 255 for x in rgb[:3]))
def out(h, l, s, a=1.0):
    r, g, b = colorsys.hls_to_rgb(h, max(0, min(1, l)), max(0, min(1, s)))
    r, g, b = round(r * 255), round(g * 255), round(b * 255)
    return f'rgba({r},{g},{b},{round(a, 3)})' if a < 1 else f'#{r:02x}{g:02x}{b:02x}'

def m_text(c, theme):
    h, l, s = hls(c)
    if l >= .5: return None
    if s > .35 and l > .2 and not (.55 < h < .7 and s < .6): l2 = .66 + (.5 - l) * .32; s2 = s * .85
    else: l2 = .95 - l * .72; s2 = s * .2      # near-black and slate text becomes a soft, neutral white
    return out(h, l2, s2, c[3])

def m_bg(c, theme):
    h, l, s = hls(c); a = c[3]
    white = c[0] > 245 and c[1] > 245 and c[2] > 245
    if a < 1:
        if not white and l < .9: return None
        if a < .4: return None
    elif not (l > .82 or (l > .6 and s < .25)): return None
    if theme == 'dark':
        if s < .2 or white: return out(.6, .105 + (1 - l) * .55, .08, a)
        return out(h, .12 + (1 - l) * .45, s * .4, a)
    # frost: translucent glass
    if s < .2 or white: return f'rgba(255,255,255,{round(.08 + (a if a < 1 else 1) * .07 + (1 - l) * .2, 3)})'
    return out(h, .6, s * .55, .22)

def m_line(c, theme):
    h, l, s = hls(c); a = c[3]
    white = c[0] > 245 and c[1] > 245 and c[2] > 245
    if a < 1:
        if white and a >= .4: return f'rgba(255,255,255,{round(a * (.12 if theme == "dark" else .3), 3)})'
        return None
    if l <= .7: return None
    if s > .3 and l < .93: return out(h, .34, s * .5) if theme == 'dark' else f'rgba(255,255,255,.28)'
    return f'rgba(255,255,255,{round(.06 + (1 - l) * .5, 3)})' if theme == 'dark' else f'rgba(255,255,255,{round(.18 + (1 - l) * .5, 3)})'

def m_shadow(c, theme):
    a = c[3]
    if c[0] > 245 and c[1] > 245 and c[2] > 245 and a >= .3: return f'rgba(255,255,255,{round(a * (.07 if theme == "dark" else .25), 3)})'
    return None

def transform(prop, value, theme):
    if prop in PROPS_TEXT:
        fn = m_text
        for k, v in TEXT_VARS.items(): value = value.replace(k, v)
    elif prop in PROPS_BG: fn = m_bg
    elif prop in PROPS_LINE: fn = m_line
    elif prop in PROPS_SHADOW: fn = m_shadow
    else: return value
    def rep(m):
        c = parse(m.group(0))
        if not c: return m.group(0)
        r = fn(c, theme)
        return r if r else m.group(0)
    return COLOR_RE.sub(rep, value)

def prefix(sel, theme):
    sel = sel.strip()
    a = f'[data-theme={theme}]'
    if sel.startswith(':root'): return ':root' + a + sel[5:]
    if re.match(r'html\b', sel): return 'html' + a + sel[4:]
    return f'html{a} ' + sel

def split_selectors(prelude):
    parts, cur, depth = [], [], 0
    for t in prelude:
        if t.type == '() block' or t.type == 'function' or t.type == '[] block': cur.append(t); continue
        if t.type == 'literal' and t.value == ',': parts.append(cur); cur = []; continue
        cur.append(t)
    parts.append(cur)
    return [tinycss2.serialize(p).strip() for p in parts]

def rules(nodes, theme):
    res = []
    for n in nodes:
        if n.type == 'qualified-rule':
            sels = [s for s in split_selectors(n.prelude) if s]
            if not sels: continue
            # paper-like parts (receipts, the calendar badge…) keep their light colours, but are still written out
            keep = any(k in s for s in sels for k in SKIP_SEL)
            decls = tinycss2.parse_declaration_list(n.content, skip_whitespace=True, skip_comments=True)
            body = []
            for d in decls:
                if d.type != 'declaration': continue
                p = d.lower_name
                if p.startswith('--') or not (p in PROPS_TEXT or p in PROPS_BG or p in PROPS_LINE or p in PROPS_SHADOW or p in PROPS_KEEP): continue
                v = tinycss2.serialize(d.value).strip()
                if p == 'background' and 'url(' in v and not COLOR_RE.search(v): continue
                body.append(f'{p}:{v if keep or p in PROPS_KEEP else transform(p, v, theme)}{" !important" if d.important else ""}')
            if body: res.append(','.join(prefix(s, theme) for s in sels) + '{' + ';'.join(body) + '}')
        elif n.type == 'at-rule' and n.lower_at_keyword in ('media', 'supports', 'container') and n.content:
            pre = tinycss2.serialize(n.prelude).strip()
            if n.lower_at_keyword == 'media' and re.search(r'\bprint\b', pre) and 'screen' not in pre: continue
            inner = rules(tinycss2.parse_rule_list(n.content, skip_whitespace=True, skip_comments=True), theme)
            if inner: res.append(f'@{n.lower_at_keyword} {pre}{{' + '\n'.join(inner) + '}')
    return res

def main():
    out_lines = ['/* Generated by scripts/build-themes.py from the light theme. Do not edit by hand. */']
    for theme in ('dark', 'frost'):
        out_lines.append(f'/* ---------- {theme} ---------- */')
        for f in SOURCES:
            src = (ROOT / 'styles' / f).read_text()
            out_lines += rules(tinycss2.parse_stylesheet(src, skip_whitespace=True, skip_comments=True), theme)
    (ROOT / 'styles' / 'minawa-themes-auto.css').write_text('\n'.join(out_lines) + '\n')
    print('wrote', sum(len(x) for x in out_lines), 'bytes')

if __name__ == '__main__': main()
