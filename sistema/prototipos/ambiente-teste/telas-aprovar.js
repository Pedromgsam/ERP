/* "Para aprovar": tudo o que mudou nesta versão do ambiente, para o usuário marcar Aprovo / Não aprovo
   (fica guardado neste navegador; "Copiar minhas respostas" junta tudo num texto para colar na conversa). */
(function(){
  var APP = window.APP, ic = APP.ic, esc = APP.esc;
  var SUB = [['design','Design (Backup 77)'],['textos','Textos (antes → depois)'],['enxugar','O que foi enxugado'],['melhorias','Melhorias (uso simulado)'],['antigo','Tirar o ERP antigo']];
  var ENXUGAR = [
    ['E1', 'Tela Alertas sai do menu', 'Os alertas viram a faixa do Início; as "rotinas automáticas" foram para Administração → Saúde do sistema.'],
    ['E2', 'Sem cartões de número no topo das telas', 'Parcelamentos, Acordos, Tarefas, Execuções e Rotina. Os números ficam nas abas (ex.: "Atrasadas 3") ou numa linha só.'],
    ['E3', 'Início sem os cartões "Financeiro" e "Escritório"', 'Viraram uma faixa de avisos no alto (cada aviso abre a lista certa, já filtrada).'],
    ['E4', 'Placar da Rotina em uma linha', 'Antes eram 4 cartões grandes.'],
    ['E5', 'Processos: o resumo da carteira começa fechado', 'Clique para abrir os números e as tabelas por grupo, tribunal e natureza.'],
    ['E6', 'E-mails: de 13 tipos + grade por cliente para 3 automáticos + 3 manuais', 'Detalhes em Administração → E-mails → Como funciona.'],
    ['E7', 'Caixa de saída com 3 abas', 'No rascunho · Enviados · Com erro (saem "Revisar antes", "Da Rotina", "Na fila").'],
    ['E8', 'CRM em 4 colunas', 'Novo contato · Diagnóstico · Proposta · Fechamento (antes 8 etapas); ganhos e perdidos numa faixa embaixo.'],
    ['E9', 'Painel: sem a faixa do grupo repetida', 'O grupo é a 1ª coluna, com o ponto de cor; dinheiro resumido (R$ 96 mil) e "neg." embaixo.'],
    ['E10', 'Financeiro: "Lançamentos | Análise"', 'Em vez de 3 a 5 abas soltas e de duas barras de filtro (período em cima + filtros da tabela).'],
    ['E11', 'Menu sem "Gerar documentos" separado', 'Vira um botão dentro de Documentos.'],
    ['E12', 'Frases das telas curtas', 'Ver a aba "Textos": cada uma com o antes e o depois.']
  ];
  var MELHORIAS = [
    ['M1', 'Faixa de avisos clicável no Início', 'Cada aviso leva à lista certa já filtrada (ex.: "parcelas em atraso" abre Parcelamentos → Vencidas).', 'aplicado'],
    ['M2', '"Meu dia" no Início', 'Tarefas, reuniões e audiências de hoje e as atrasadas, com Concluir; ao lado, lembretes e os próximos 7 dias. "Só eu" ou "Equipe toda".', 'aplicado'],
    ['M3', 'Guias do mês: uma linha por empresa', 'Rotina → Guias do mês: "Emitir e mandar" abre a janela de anexar os PDFs de todas as guias da empresa de uma vez.', 'aplicado'],
    ['M4', 'Valor novo da guia vem do PDF', 'Se a guia veio com juros, o sistema lê o valor do PDF, avisa e grava na parcela (antes era digitado à mão).', 'aplicado'],
    ['M5', 'Rascunho ou envio direto, por tipo', 'Guias de parcelamento e de acordo: você escolhe uma vez em Administração → E-mails.', 'aplicado'],
    ['M6', 'Passivo: Salvar já marca como conferido', 'E "Conferir o grupo todo" para os grupos sem mudança.', 'aplicado'],
    ['M7', 'Processos: "Sem novidade" e "Movimentação" na própria linha', 'Mais "Marcar várias" para conferir de uma vez. Sem movimentação há 30 dias fica em vermelho.', 'aplicado'],
    ['M8', 'Recebe e-mails: chave na lista de clientes', 'E o e-mail de destino editável direto em Administração → E-mails → Quem recebe.', 'aplicado'],
    ['M9', 'Cliente sem e-mail vira aviso', 'O envio fica "Com erro" na Caixa de saída e aparece na faixa do Início, com "Tentar de novo".', 'aplicado'],
    ['M10', 'Ficha do cliente com "Ver como o cliente vê"', 'Abre o portal do cliente daquele grupo.', 'aplicado'],
    ['M11', 'Tarefas: vista Semana', 'Além da Lista; e a validação por outra pessoa (quem valida) no próprio formulário.', 'aplicado'],
    ['M12', 'Contratos: reajuste em 60 dias em âmbar + "Aplicar reajuste"', 'E "Marcar como assinado" lança as mensalidades.', 'aplicado'],
    ['M13', 'Publicação → tarefa com um clique', 'Botão "Tarefa" na linha já preenche o título.', 'aplicado'],
    ['M14', 'Documentos vencendo em 30 dias numa faixa', 'Certidões, procurações e certificados.', 'aplicado'],
    ['M15', 'Busca Ctrl+K também com ações', '"Nova tarefa", "Emitir as guias do mês", "Ver como o cliente vê"…', 'aplicado'],
    ['M16', 'Rotina do mês automática', 'Tarefas que se repetem sozinhas: dia 1 conferir pagamentos, dia 5 pedir documentos, dia 10 emitir guias (no ambiente aparecem como exemplo em Tarefas → Recorrentes).', 'exemplo'],
    ['M17', 'Honorário com boleto/PIX e baixa sozinha', 'O cliente paga e o sistema dá a baixa e manda o recibo sem ninguém mexer. Custo (Asaas): R$ 1,99 por pagamento, sem mensalidade — com 150 cobranças/mês, cerca de R$ 300/mês.', 'sugestão'],
    ['M18', 'Lembrete do honorário também pelo WhatsApp', 'Custo (API oficial da Meta): cerca de R$ 0,03 por mensagem + o provedor (de grátis a cerca de R$ 100/mês). Com 300 lembretes/mês: cerca de R$ 10 + o provedor.', 'sugestão']
  ];
  var DESIGN = [
    ['D1', 'A · Nítido (ROMPEX fiel)', 'Lateral azul-marinho com o item aberto em azul, fundo claro quente, ícone ao lado do título, cartões com contorno fino, tabela com linhas mais altas e números maiores.'],
    ['D2', 'B · Claro (estilo Linear / Vercel / Notion)', 'Lateral clara e discreta, sem ícone no título, contornos bem leves, cabeçalho da tabela sem caixa alta, situação só com a cor do texto, botões escolhidos em preto.'],
    ['D3', 'C · Executivo (o ERP antigo, marinho e dourado)', 'Lateral marinho com marcador dourado, títulos em Playfair Display (a letra dos títulos do ERP antigo), cartões sem contorno com sombra suave.'],
    ['X1', 'Enxuto: cartões de grupo com 2 linhas', '"Pagas 84 de 204" vira a legenda da barra; "Parcela do mês" sai (o "A pagar este mês" já diz o valor do mês). O detalhe continua ao clicar.'],
    ['X2', 'Enxuto: Painel com 5 números em vez de 8', 'RFB, PGFN e AGE/MG viram uma linha embaixo do "Passivo total".'],
    ['X3', 'Enxuto: sem frases de instrução', '"Clique no grupo…", "Clique na empresa…" saem: o cursor já mostra que abre.'],
    ['X4', 'Sem a bolinha de cor do grupo em todas as telas', 'Regra do ERP (Backup 72) que ainda não valia no ambiente.'],
    ['P1', 'Publicações como antes do Backup 72', 'Um cartão por publicação com o texto à vista, filtros em botões com contagem (situação, advogado, tribunal) e as ações no cartão. No ERP de verdade já foi aplicado.']
  ];
  var ANTIGO = [
    ['A1', 'Aprovar este ambiente (telas, textos, e-mails, portal).'],
    ['A2', 'Levar para o ERP, uma tela por vez, com os testes passando: Início, Tarefas, Painel, Processos, Execuções, Publicações, Financeiro (Jurídico e Contabilidade), Contratos, Clientes, CRM, Documentos, Rotina, Administração.'],
    ['A3', 'Portal do cliente novo (esta prévia) no lugar das telas antigas que o cliente usa hoje.'],
    ['A4', 'Apagar o ERP antigo: o arquivo ERP.html, os 190 remendos do montar-erp.js e os blocos "Backup N" do design.css. Fica só o sistema novo (mais leve e mais rápido).'],
    ['A5', 'Faxina do banco: as 39 funções escritas mais de uma vez no estrutura.sql (fica só a última).']
  ];
  function respostas(){ return APP.pref('aprov') || {}; }
  function marcar(id, v){ var r = respostas(); r[id] = r[id] === v ? '' : v; APP.pref('aprov', r); }
  function bts(id){ var v = respostas()[id] || ''; return '<span class="aprov"><button type="button" class="ap-bt sim" data-ap="' + id + '" data-v="sim" aria-pressed="' + (v === 'sim') + '">' + ic('check') + 'Aprovo</button><button type="button" class="ap-bt nao" data-ap="' + id + '" data-v="nao" aria-pressed="' + (v === 'nao') + '">' + ic('x') + 'Não</button></span>'; }

  APP.registrar('aprovar', { tit:'Para aprovar', ic:'estrela', pai:'Ambiente de teste',
    ajuda:['Marque <b>Aprovo</b> ou <b>Não</b> em cada item. Fica guardado neste navegador.', 'No fim, clique em <b>Copiar minhas respostas</b> e cole na conversa.', 'O botão "Aa" no alto troca os textos da tela entre o novo e o antigo (o antigo aparece marcado em amarelo).'],
    desenhar:function(el){
      var sub = APP.pref('ap-sub') || 'design', r = respostas(), n = Object.keys(r).filter(function(k){ return r[k]; }).length;
      el.innerHTML = APP.cabecalho({ ic:'estrela', tit:'Para aprovar', frase:'O que mudou nesta versão do ambiente · ' + n + ' respondido(s)', acoes:'<button class="bt bt-p" type="button" id="ap-copiar">' + ic('doc') + 'Copiar minhas respostas</button>' })
        + '<div class="seg seg-grande" id="ap-sub">' + SUB.map(function(a){ return '<button type="button" class="seg-bt" data-sub="' + a[0] + '" aria-selected="' + (a[0] === sub) + '">' + a[1] + '</button>'; }).join('') + '</div><div id="ap-corpo"></div>';
      APP.$('ap-sub').onclick = function(e){ var b = e.target.closest('[data-sub]'); if (b){ APP.pref('ap-sub', b.dataset.sub); APP.redesenhar(); } };
      APP.$('ap-copiar').onclick = copiar;
      var c = APP.$('ap-corpo');
      if (sub === 'design'){
        c.innerHTML = '<div class="texto"><h3>Escolha o design</h3><p>Use o seletor <b>Design</b> na faixa do alto (Atual · A · B · C) e passeie pelas telas em cada um, no claro e no escuro (botão da lua). A caixa <b>Enxuto</b> liga e desliga os resumos. Marque abaixo o que aprova; o design escolhido vai para o ERP de verdade numa rodada só.</p></div>'
          + '<div class="lista">' + DESIGN.map(function(x){ return '<div class="li li-ap"><span class="li-tipo t-rotina">' + x[0] + '</span><span class="li-tx"><b>' + esc(x[1]) + '</b><small>' + esc(x[2]) + '</small></span>' + bts(x[0]) + '</div>'; }).join('') + '</div>';
      } else if (sub === 'textos'){
        var T = window.TEXTOS, telas = {};
        Object.keys(T).forEach(function(k){ (telas[T[k].tela] = telas[T[k].tela] || []).push(k); });
        c.innerHTML = '<div class="dica">' + ic('texto') + '<span>Ligue <b>Aa</b> no alto da tela para ver os textos antigos marcados em amarelo em cada tela.</span></div>' + Object.keys(telas).map(function(t){
          return '<section class="quadro"><div class="quadro-hd"><h2>' + esc(t) + '</h2></div><table class="tab" style="min-width:0"><thead><tr><th style="width:42%">Antes</th><th style="width:38%">Depois</th><th></th></tr></thead><tbody>' + telas[t].map(function(k){
            return '<tr><td class="mudo"><s>' + esc(T[k].antigo) + '</s></td><td><b>' + esc(T[k].novo) + '</b></td><td class="dir">' + bts('T:' + k) + '</td></tr>'; }).join('') + '</tbody></table></section>'; }).join('');
      } else if (sub === 'enxugar'){
        c.innerHTML = '<div class="lista">' + ENXUGAR.map(function(x){ return '<div class="li li-ap"><span class="li-tipo t-rotina">' + x[0] + '</span><span class="li-tx"><b>' + esc(x[1]) + '</b><small>' + esc(x[2]) + '</small></span>' + bts(x[0]) + '</div>'; }).join('') + '</div>';
      } else if (sub === 'melhorias'){
        c.innerHTML = '<div class="texto"><h3>Como foi feita esta lista</h3><p>Usei o ambiente como se fosse alguém do escritório num mês normal: abrir o dia, emitir e mandar as guias até o dia 12, dar baixa nos pagamentos, conferir processos e passivo, cobrar honorário atrasado, atender um cliente que pergunta "quanto falta?". Cada ponto em que precisei de mais de um clique ou procurei a informação em outra tela virou uma melhoria.</p></div>'
          + '<div class="lista">' + MELHORIAS.map(function(x){ return '<div class="li li-ap"><span class="li-tipo ' + (x[3] === 'aplicado' ? 't-tarefa' : x[3] === 'exemplo' ? 't-reuniao' : 't-audiencia') + '">' + x[0] + '</span><span class="li-tx"><b>' + esc(x[1]) + '</b><small>' + esc(x[2]) + '</small><small class="' + (x[3] === 'aplicado' ? 'ok-txt' : 'pz-a') + '">' + ({ aplicado:'✓ já está no ambiente', exemplo:'no ambiente como exemplo', 'sugestão':'só sugestão (não aplicada)' }[x[3]]) + '</small></span>' + bts(x[0]) + '</div>'; }).join('') + '</div>';
      } else {
        c.innerHTML = '<div class="texto"><h3>Tirar o ERP antigo de vez</h3><p>Hoje o ERP ainda carrega, por baixo, o sistema antigo (o arquivo ERP.html com 190 remendos). As telas novas ficam por cima dele. Para tirar de vez, a ordem segura é:</p></div>'
          + '<div class="lista">' + ANTIGO.map(function(x){ return '<div class="li li-ap"><span class="li-tipo t-rotina">' + x[0] + '</span><span class="li-tx"><b>' + esc(x[1]) + '</b></span>' + bts(x[0]) + '</div>'; }).join('') + '</div>'
          + '<div class="texto"><p><b>Por que não de uma vez:</b> cada tela antiga ainda faz contas que outras telas usam (o Painel lê os parcelamentos, o Início lê o financeiro…). Trocando uma por vez, com os testes passando, nada some sem você ver.</p></div>';
      }
      c.onclick = function(e){ var b = e.target.closest('[data-ap]'); if (!b) return; marcar(b.dataset.ap, b.dataset.v); APP.redesenhar(); };
    } });
  function copiar(){
    var r = respostas(), L = [];
    Object.keys(r).forEach(function(k){ if (!r[k]) return; var nome = k.indexOf('T:') === 0 ? 'Texto ' + window.TEXTOS[k.slice(2)].tela + ': "' + window.TEXTOS[k.slice(2)].novo + '"' : k + ' ' + ((DESIGN.concat(ENXUGAR).concat(MELHORIAS).concat(ANTIGO)).find(function(x){ return x[0] === k; }) || [k, ''])[1];
      L.push((r[k] === 'sim' ? 'APROVO  ' : 'NÃO     ') + nome); });
    var txt = L.length ? 'Minhas respostas no ambiente de teste:\n' + L.join('\n') : 'Nenhuma resposta marcada ainda.';
    var ok = function(){ APP.aviso('Respostas copiadas. Cole na conversa.'); };
    try { navigator.clipboard.writeText(txt).then(ok, function(){ mostrar(txt); }); } catch (e) { mostrar(txt); }
  }
  function mostrar(txt){ var J = APP.janela({ kick:'Copie e cole na conversa', tit:'Minhas respostas', corpo:'<textarea class="ctl" style="height:260px!important" id="ap-tx">' + esc(txt) + '</textarea>' }); setTimeout(function(){ var t = J.q('#ap-tx'); t.focus(); t.select(); }, 50); }
})();
