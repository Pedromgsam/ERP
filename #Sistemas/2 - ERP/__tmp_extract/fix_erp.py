# -*- coding: utf-8 -*-
import io

path = "ERP.html"
with io.open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# ---------- Edit 1: _fcSeloRank (lines 6746-6749, 1-indexed) ----------
old1 = (
    "function _fcSeloRank(nome,i,n){\n"
    "  var t=tomAzul(i,n);\n"
    "  return '<span class=\"fa-pessoa\" style=\"background:'+t+'1c;color:'+t+'\">'+esc(nome)+'</span>';\n"
    "}\n"
)
seg1 = "".join(lines[6745:6749])
assert seg1 == old1, "EDIT1 anchor mismatch:\n" + repr(seg1)

new1 = (
    "function _fcSeloRank(nome,i,n){\n"
    "  var t=tomAzul(i,n);\n"
    "  // v53: selo usava a propria cor da rampa como texto -- nos tons claros\n"
    "  // do fim da rampa (rank baixo, roster grande de clientes) o texto ficava\n"
    "  // quase invisivel (texto claro sobre fundo do mesmo tom claro -- caso\n"
    "  // relatado do cliente Tiago). Texto agora e sempre o tom mais escuro da\n"
    "  // familia (RAMPA_AZUL[0]); so o fundo do selo varia por rank -- a ordem\n"
    "  // de grandeza continua visivel, a legibilidade nao some.\n"
    "  return '<span class=\"fa-pessoa\" style=\"background:'+t+'26;color:'+RAMPA_AZUL[0]+'\">'+esc(nome)+'</span>';\n"
    "}\n"
)
lines[6745:6749] = [new1]

with io.open(path, "w", encoding="utf-8") as f:
    f.writelines(lines)

print("Edit 1 applied. New line count:", len(lines))
