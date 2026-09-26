#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gerador padrão de páginas HTML a partir de arquivos .docx (POPs e Checklists).

Como funciona:
- Lê o(s) arquivo(s) .docx informado(s) (texto, imagens e tabelas).
- Extrai as imagens para assets/<slug>/ e monta o HTML no padrão visual
  do escritório (mesmas classes do estilo.css usado em todo o manual).
- Cada novo POP/checklist deve ser cadastrado no dicionário CONFIG abaixo
  (título, categoria e introdução curta) — o resto é gerado automaticamente.

Uso:
    python3 _gerar_pop.py --all
    python3 _gerar_pop.py "1 - POP - Procedimento inicial.docx"
"""
import sys
import os
import re
import html

import docx
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph
from docx.table import Table

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(BASE_DIR, "assets")

# ---------------------------------------------------------------------------
# CONFIG — metadados curados de cada documento de origem.
# "skip" = quantos parágrafos não-vazios do início do .docx já estão
# representados pelo eyebrow/título/introdução abaixo (não são repetidos
# no corpo do texto gerado).
# ---------------------------------------------------------------------------
CONFIG = {
    "1 - POP - Procedimento inicial.docx": dict(
        slug="pop-01-procedimento-inicial",
        tipo="pop",
        eyebrow="POP 01 · Inventário",
        titulo="Procedimento Inicial — Reunião, Documentos e Certidões",
        intro="Fluxo operacional do procedimento inicial de um processo de "
              "inventário: da primeira reunião com a família até a obtenção "
              "das certidões necessárias para a distribuição.",
        skip=4,
    ),
    "2 - POP - Declaração de bens e direitos.docx": dict(
        slug="pop-02-declaracao-bens-direitos",
        tipo="pop",
        eyebrow="POP 02 · Inventário",
        titulo="Declaração de Bens e Direitos (e-ITCD/MG)",
        intro="Passo a passo ilustrado para realizar a Declaração de Bens e "
              "Direitos (DBD) no sistema e-ITCD da Secretaria de Estado de "
              "Fazenda de Minas Gerais.",
        skip=2,
    ),
    "3 - POP -  Distribuição Inventário EPROC.docx": dict(
        slug="pop-03-distribuicao-eproc",
        tipo="pop",
        eyebrow="POP 03 · Inventário",
        titulo="Montagem do Processo e Distribuição no eproc/TJMG",
        intro="Fluxo completo para montagem do processo de inventário e sua "
              "distribuição no sistema eproc do TJMG.",
        skip=4,
    ),
    "Checklist - inventário.docx": dict(
        slug="checklist-inventario",
        tipo="checklist",
        eyebrow="Checklist · Inventário Judicial",
        titulo="Checklist de Documentos",
        intro="Documentos necessários para a instrução de um processo de "
              "inventário judicial, organizados por categoria.",
        skip=4,
    ),
}

PASSO_RE = re.compile(r"^PASSO\s+(\d+)\s*[—\-]?\s*(.*)$", re.IGNORECASE)
PARTE_RE = re.compile(r"^PARTE\s+(\d+)\s*[—\-]?\s*(.*)$", re.IGNORECASE)
BULLET_RE = re.compile(r"^[•\-–▸]\s*")
NUM_RE = re.compile(r"^\d+[.)]\s*")
# Item numerado digitado manualmente como parágrafo "Normal" (não List Paragraph),
# ex.: "3. Definição da via adequada" — tratado como item de lista quando aparece
# no meio de uma sequência de bullets, ou como mini-título quando isolado.
MINI_RE = re.compile(r"^(\d{1,2})[.)]\s+([A-ZÀ-Ú].{0,60})$")


def esc(s):
    return html.escape(s or "", quote=False)


# ---------------------------------------------------------------------------
# Imagens
# ---------------------------------------------------------------------------
def extract_image(doc, run, slug, counter):
    drawings = run._element.findall(qn("w:drawing"))
    if not drawings:
        return None
    blips = drawings[0].findall(".//" + qn("a:blip"))
    if not blips:
        return None
    rid = blips[0].get(qn("r:embed"))
    if not rid or rid not in doc.part.rels:
        return None
    part = doc.part.rels[rid].target_part
    ext = os.path.splitext(part.partname)[1].lstrip(".") or "png"
    counter[0] += 1
    fname = f"img{counter[0]:03d}.{ext}"
    out_dir = os.path.join(ASSETS_DIR, slug)
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, fname), "wb") as f:
        f.write(part.blob)
    return f"assets/{slug}/{fname}"


def paragraph_image(doc, p, slug, counter):
    for run in p.runs:
        img = extract_image(doc, run, slug, counter)
        if img:
            return img
    return None


# ---------------------------------------------------------------------------
# Listas (com aninhamento por nível de indentação)
# ---------------------------------------------------------------------------
def build_list_tree(lines):
    root = []
    stack = [(0, root)]
    for ilvl, text in lines:
        while len(stack) > 1 and stack[-1][0] > ilvl:
            stack.pop()
        if stack[-1][0] < ilvl:
            if stack[-1][1]:
                parent_item = stack[-1][1][-1]
                stack.append((ilvl, parent_item["children"]))
            else:
                ilvl = stack[-1][0]
        node = {"text": text, "children": []}
        stack[-1][1].append(node)
    return root


def render_list_tree(nodes):
    if not nodes:
        return ""
    out = ['<ul class="pop-list">']
    for n in nodes:
        children_html = render_list_tree(n["children"])
        out.append(f"<li>{esc(n['text'])}{children_html}</li>")
    out.append("</ul>")
    return "\n".join(out)


def render_plain_lines(lines):
    """Para textos soltos (dentro de caixas de alerta) que usam marcadores
    digitados (•, -, 1.) em vez de listas nativas do Word."""
    out = []
    buf = []

    def flush():
        if buf:
            out.append(
                '<ul class="pop-list">'
                + "".join(f"<li>{esc(x)}</li>" for x in buf)
                + "</ul>"
            )
            buf.clear()

    for line in lines:
        if BULLET_RE.match(line):
            buf.append(BULLET_RE.sub("", line).strip())
        elif NUM_RE.match(line):
            buf.append(NUM_RE.sub("", line).strip())
        else:
            flush()
            out.append(f'<p class="pop-p">{esc(line)}</p>')
    flush()
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Tabelas
# ---------------------------------------------------------------------------
def render_table(t):
    rows = list(t.rows)
    cols = len(t.columns)

    if cols == 1:
        lines = []
        for r in rows:
            for p in r.cells[0].paragraphs:
                txt = p.text.strip()
                if txt:
                    lines.append(txt)
        is_warning = bool(lines) and "⚠" in lines[0]
        variant = "alerta-vermelho" if is_warning else "alerta-azul"
        icon = "⚠️" if is_warning else "ℹ️"
        body = render_plain_lines(lines)
        return f'<div class="alerta {variant}"><span class="alerta-icone">{icon}</span><div>{body}</div></div>'

    header_cells = [c.text.strip() for c in rows[0].cells]
    header_lower = [h.lower() for h in header_cells]
    ok_idx = next((i for i, h in enumerate(header_lower) if "ok" in h), None)
    resp_idx = next((i for i, h in enumerate(header_lower) if "responsável" in h), None)

    out = ['<div class="tabela-wrap"><table><thead><tr>']
    for h in header_cells:
        out.append(f"<th>{esc(h)}</th>")
    out.append("</tr></thead><tbody>")

    for r in rows[1:]:
        cells = [c.text.strip() for c in r.cells]
        if len(set(cells)) == 1 and cells[0]:
            cls = "chk-subgrupo" if cells[0].startswith("▸") else "chk-grupo"
            out.append(f'<tr class="{cls}"><td colspan="{cols}">{esc(cells[0])}</td></tr>')
            continue
        out.append("<tr>")
        for i, val in enumerate(cells):
            if i == ok_idx:
                out.append('<td class="chk-ok">☐</td>')
            elif i == resp_idx:
                tagcls = "tag-verde" if "escrit" in val.lower() else "tag-azul"
                out.append(f'<td><span class="card-tag {tagcls}" style="margin-top:0">{esc(val)}</span></td>')
            else:
                disp = esc(val) if val and val != "-" else '<span style="color:#ccc">—</span>'
                out.append(f"<td>{disp}</td>")
        out.append("</tr>")
    out.append("</tbody></table></div>")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Corpo do documento
# ---------------------------------------------------------------------------
def render_body(doc, slug, skip):
    out = []
    img_counter = [0]
    pending_list = []
    seen = 0

    def flush_list():
        nonlocal pending_list
        if pending_list:
            out.append(render_list_tree(build_list_tree(pending_list)))
            pending_list = []

    for child in doc.element.body.iterchildren():
        if child.tag == qn("w:p"):
            p = Paragraph(child, doc)
            text = p.text.strip()
            img_path = paragraph_image(doc, p, slug, img_counter)

            if not text and not img_path:
                continue

            if seen < skip:
                seen += 1
                continue

            if img_path:
                flush_list()
                cap = f'<div class="pop-caption">{esc(text)}</div>' if text else ""
                out.append(f'<div class="pop-img-wrap"><img src="{img_path}" alt="">{cap}</div>')
                continue

            m = PARTE_RE.match(text)
            if m:
                flush_list()
                num, title = m.groups()
                label = f"PARTE {num} — {title}" if title else text
                out.append(f'<div class="pop-parte">{esc(label)}</div>')
                continue

            m = PASSO_RE.match(text)
            if m:
                flush_list()
                num, title = m.groups()
                out.append(
                    f'<div class="pop-passo"><div class="num">{esc(num)}</div>'
                    f'<div class="titulo">{esc(title) if title else "Passo " + num}</div></div>'
                )
                continue

            style_name = p.style.name if p.style else ""

            m = MINI_RE.match(text) if style_name != "List Paragraph" else None
            if m:
                title_txt = m.group(2)
                if pending_list:
                    pending_list.append((0, title_txt))
                else:
                    flush_list()
                    out.append(f'<p class="secao-titulo" style="margin-top:22px">{esc(title_txt)}</p>')
                continue

            if style_name == "List Paragraph":
                ilvl = 0
                ppr = p._p.pPr
                if ppr is not None and ppr.numPr is not None and ppr.numPr.ilvl is not None:
                    ilvl = ppr.numPr.ilvl.val
                pending_list.append((ilvl, text))
                continue

            flush_list()
            out.append(f'<p class="pop-p">{esc(text)}</p>')

        elif child.tag == qn("w:tbl"):
            if seen < skip:
                continue
            flush_list()
            t = Table(child, doc)
            out.append(render_table(t))

    flush_list()
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Página HTML
# ---------------------------------------------------------------------------
VOLTAR_HREF = "inventario.html"

PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{titulo} — Araujo &amp; Castro</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300..700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../../estilo.css">
</head>
<body>

<nav>
  <a href="../juridico.html" class="ativo">⚖️ Jurídico</a>
  <a href="../../operacoes.html">⚙️ Operações</a>
  <a href="../../financeiro.html">💰 Financeiro</a>
  <a href="../../relacionamento.html">🤝 Relacionamento</a>
  <a href="../../marketing.html">📣 Marketing</a>
  <a href="../../administrativo.html">🗂️ Administrativo</a>
</nav>

<div class="breadcrumb">
  <a href="../../../inicio.html">Início</a>
  <span>›</span>
  <a href="../juridico.html">Jurídico</a>
  <span>›</span>
  <a href="{voltar}">Inventário e Sucessório</a>
  <span>›</span>
  {titulo}
</div>

<div class="main-wrapper sem-sidebar">
  <main class="conteudo pop-conteudo">
    <a class="pop-voltar" href="{voltar}">← Voltar para Inventário e Sucessório</a>
    <span class="pop-eyebrow">{eyebrow}</span>
    <h1>{titulo}</h1>
    <p class="pop-intro">{intro}</p>

{body}

    <div class="pop-rodape-doc">Gerado a partir de {fonte} · Araujo &amp; Castro Advocacia — uso interno</div>
  </main>
</div>

<footer>
  <div><strong>Araujo &amp; Castro Advocacia</strong> — Manual interno de uso restrito</div>
  <div>Santo Antônio do Monte · Lagoa da Prata · Nacional</div>
</footer>

</body>
</html>
"""


def render_page(cfg, body_html, fonte):
    return PAGE_TEMPLATE.format(
        titulo=esc(cfg["titulo"]),
        eyebrow=esc(cfg["eyebrow"]),
        intro=esc(cfg["intro"]),
        body=body_html,
        voltar=VOLTAR_HREF,
        fonte=esc(fonte),
    )


def process(fname):
    cfg = CONFIG.get(fname)
    if not cfg:
        print(f"[aviso] sem configuração cadastrada para: {fname}")
        return
    path = os.path.join(BASE_DIR, fname)
    if not os.path.exists(path):
        print(f"[erro] arquivo não encontrado: {fname}")
        return
    doc = docx.Document(path)
    body_html = render_body(doc, cfg["slug"], cfg["skip"])
    html_out = render_page(cfg, body_html, fname)
    out_path = os.path.join(BASE_DIR, cfg["slug"] + ".html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html_out)
    print(f"gerado: {cfg['slug']}.html")


def main():
    args = sys.argv[1:]
    targets = list(CONFIG.keys()) if (not args or args[0] == "--all") else args
    for fname in targets:
        process(fname)


if __name__ == "__main__":
    main()
