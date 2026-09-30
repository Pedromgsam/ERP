'use strict';
// Gera o tema-escuro.css a partir do CSS que já existe (ERP antigo + Gestão + editor).
// O modo claro não muda nada: cada regra com cor fixa ganha uma cópia
// "html[data-tema=escuro] seletor { cor escura }", que só vale com o modo escuro ligado.
//  - fundo/borda claros viram escuros (mesmo matiz, pouca saturação);
//  - texto escuro vira claro;
//  - var(--navy) usado como TEXTO vira var(--ink) (o navy continua no fundo da barra);
//  - cores fixas em style="..." dentro do HTML/JS ganham regra por atributo.
// Cores que já vêm de tokens.css (var(--surface), var(--text)...) mudam sozinhas.

const PRE = 'html[data-tema="escuro"]';
const NOMES = { white: '#ffffff', black: '#000000' };
const PROP_TEXTO = /^(color|-webkit-text-fill-color|fill|caret-color)$/;
const PROP_FUNDO = /^(background|background-color|background-image|border|border-(top|right|bottom|left)(-color)?|border-color|outline(-color)?|stroke|column-rule(-color)?)$/;

function hexRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a];
}
function rgbHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6;
  }
  return [h, s, l];
}
function hslHex(h, s, l) {
  const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  let r, g, b;
  if (!s) r = g = b = l; else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3); }
  return '#' + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('');
}
// papel = 'texto' | 'fundo'; devolve a cor nova ou null (fica igual)
function mapear(r, g, b, a, papel) {
  const [h, s, l] = rgbHsl(r, g, b);
  if (papel === 'texto') {
    if (l >= 0.55) return null;                                   // já é clara
    const l2 = Math.min(0.93, 0.97 - l * 0.55), s2 = s * (s > 0.6 ? 0.6 : 0.15);   // Backup 18: cinzas neutros (sem azul)
    return a < 1 ? rgba(hslHex(h, s2, l2), a) : hslHex(h, s2, l2);
  }
  if (a < 1) {
    if (l < 0.35) return rgba('#ffffff', Math.min(0.22, a * 1.1));  // véu escuro → claro
    return a >= 0.3 ? rgba('#ffffff', 0.03) : null;                 // zebra clara → leve; véu fraco (sobre a barra) fica
  }
  if (l <= 0.5) return null;                                      // fundo escuro (barra, botão) fica
  if (s < 0.45 || l > 0.975) {                                     // branco e cinzas: superfícies do tema
    if (papel === 'borda') return 'var(--line)';
    return l >= 0.985 ? 'var(--surface)' : l >= 0.94 ? 'var(--surface2)' : 'var(--surface3)';
  }
  const l2 = 0.14 + (1 - l) * 0.45, s2 = Math.min(s, 1) * (s > 0.6 ? 0.3 : 0.1);   // Backup 23: tons de grafite (antes quase pretos), pouco tingidos
  return a < 1 ? rgba(hslHex(h, s2, l2), a) : hslHex(h, s2, l2);
}
function rgba(hex, a) { const [r, g, b] = hexRgb(hex); return 'rgba(' + r + ',' + g + ',' + b + ',' + (+a.toFixed(3)) + ')'; }

const RE_COR = /url\([^)]*\)|var\(--[\w-]+|#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)|\bwhite\b|\bblack\b/g;
const NAVY_TEXTO = /^var\(--(navy|navy2|ac-navy|ac-navy2)$/;
function trocarValor(valor, papel) {
  let mudou = false;
  const novo = valor.replace(RE_COR, (c) => {
    if (/^url/.test(c)) return c;                                  // ícones SVG embutidos ficam
    if (/^var/.test(c)) { if (papel === 'texto' && NAVY_TEXTO.test(c)) { mudou = true; return 'var(--ink'; } return c; }
    let rgb;
    if (c[0] === '#') rgb = hexRgb(c);
    else if (/^rgb/.test(c)) { const n = c.match(/[\d.]+/g).map(Number); rgb = [n[0], n[1], n[2], n.length > 3 ? n[3] : 1]; }
    else rgb = hexRgb(NOMES[c]);
    const m = mapear(rgb[0], rgb[1], rgb[2], rgb[3], papel);
    if (m) { mudou = true; return m; }
    return c;
  });
  return mudou ? novo : null;
}
function papelDe(prop) { return PROP_TEXTO.test(prop) ? 'texto' : /^(border|outline|column-rule|stroke)/.test(prop) ? 'borda' : PROP_FUNDO.test(prop) ? 'fundo' : null; }

// separa declarações respeitando parênteses e aspas (data: URIs têm ";")
function declaracoes(corpo) {
  const out = []; let d = 0, q = '', ini = 0;
  for (let i = 0; i < corpo.length; i++) {
    const c = corpo[i];
    if (q) { if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") q = c; else if (c === '(') d++; else if (c === ')') d--;
    else if (c === ';' && !d) { out.push(corpo.slice(ini, i)); ini = i + 1; }
  }
  out.push(corpo.slice(ini));
  return out.map((x) => x.trim()).filter(Boolean);
}
function prefixar(sel) {
  sel = sel.trim();
  if (!sel || /^:root\b/.test(sel) || sel.includes('data-tema')) return null;
  if (/^html\b/.test(sel)) return sel.replace(/^html/, PRE);
  return PRE + ' ' + sel;
}
function regras(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '', i = 0;
  while (i < css.length) {
    const ab = css.indexOf('{', i); if (ab < 0) break;
    const cab = css.slice(i, ab).trim();
    let n = 1, j = ab + 1;
    while (n && j < css.length) { if (css[j] === '{') n++; else if (css[j] === '}') n--; j++; }
    const corpo = css.slice(ab + 1, j - 1); i = j;
    if (/^@media/.test(cab)) { if (/print/.test(cab) && !/screen/.test(cab)) continue; const r = regras(corpo); if (r) out += cab + '{' + r + '}\n'; continue; }
    if (/^@/.test(cab)) continue;
    const sels = cab.split(',').map(prefixar).filter(Boolean); if (!sels.length) continue;
    const novas = [];
    declaracoes(corpo).forEach((d) => {
      const k = d.indexOf(':'); if (k < 0) return;
      const prop = d.slice(0, k).trim().toLowerCase(); if (prop.startsWith('--')) return;
      const papel = papelDe(prop); if (!papel) return;
      const v = trocarValor(d.slice(k + 1), papel); if (v) novas.push(prop + ':' + v.trim());
    });
    if (novas.length) out += sels.join(',') + '{' + novas.join(';') + '}\n';
  }
  return out;
}
// style="..." fixos no HTML/JS → regra por atributo
function inline(fontes) {
  const vistos = new Set(); let out = '';
  const re = /style=\\?["']([^"'<>]*)/g;
  fontes.forEach((txt) => {
    let m; while ((m = re.exec(txt))) {
      declaracoes(m[1]).forEach((d) => {
        const k = d.indexOf(':'); if (k < 0) return;
        const prop = d.slice(0, k).trim().toLowerCase(), val = d.slice(k + 1).trim();
        if (!val || /[+'"\\]/.test(val) || /var\(--(?!navy)/.test(val)) return;
        const papel = papelDe(prop); if (!papel) return;
        const chave = prop + ':' + val; if (vistos.has(chave)) return; vistos.add(chave);
        const v = trocarValor(val, papel); if (!v) return;
        out += PRE + ' [style*="' + chave.replace(/"/g, '\\"') + '"]{' + prop + ':' + v.replace(/\s*!important/, '') + '!important}\n';
      });
    }
  });
  return out;
}
function gerar(cssFontes, fontesInline) {
  return '/* GERADO por sistema/ferramentas/tema-escuro.js — não edite. Só vale com html[data-tema="escuro"]. */\n' +
    cssFontes.map(regras).join('') + inline(fontesInline || []);
}
module.exports = { gerar, mapear, trocarValor };
