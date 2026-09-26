const fs=require('fs'),crypto=require('crypto'),vm=require('vm');
const src=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'../#Sistemas/2 - ERP/SCRIPT - MENU - ERP.gs'),'utf8');
const sha=t=>crypto.createHash('sha256').update(t,'utf8').digest('hex');
const portal=[['Login','Senha','Grupos','Ativo','Email','Ultimo','WA'],
  ['Pedro',sha('segredo1'),'admin','SIM','p@x','',''],
  ['Cliente A','senhaPura','Grupo A','SIM','a@x','',''],
  ['Inativo','x','Grupo A','NAO','','','']];
const log=[];
const sheet=(rows)=>({getDataRange:()=>({getValues:()=>rows}),getRange:()=>({setValue(){}}),getLastRow:()=>rows.length,appendRow:r=>log.push(r)});
const store={};let props={};
const ctx={
  CacheService:{getScriptCache:()=>({get:k=>store[k]??null,put:(k,v)=>{store[k]=String(v)},remove:k=>{delete store[k]}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]??null})},
  SpreadsheetApp:{openById:()=>({getSheetByName:n=>n==='Portal do Cliente'?sheet(portal):sheet([])})},
  Utilities:{getUuid:()=>crypto.randomUUID(),computeDigest:(a,t)=>[...crypto.createHash('sha256').update(t,'utf8').digest()].map(b=>b>127?b-256:b),
    DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1},formatDate:()=>'agora',
    base64Decode:s=>Buffer.from(s,'base64'),newBlob:b=>({getDataAsString:()=>Buffer.from(b).toString('utf8')})},
  Session:{getScriptTimeZone:()=>'America/Sao_Paulo'},
  ContentService:{createTextOutput:t=>({setMimeType(){return JSON.parse(t)}}),MimeType:{JSON:1}},
  GmailApp:{createDraft(){},sendEmail(){}},
  Logger:{log(){}}, console
};
vm.createContext(ctx);vm.runInContext(src,ctx);
// stub leitores
vm.runInContext(`_leitores=function(){return{baseDados:function(){return[{grupo:'Grupo A',nome:'Empresa A',cpfCnpj:'1',obs:'interno'},{grupo:'Grupo B',nome:'Empresa B',cpfCnpj:'2'}]},processos:function(){return[]},parcelamentos:function(){return[]},acordos:function(){return[]},financeiro:function(){return[{grupo:'Grupo A',v:1}]},financeiroContab:function(){return[]},tarefas:function(){return[]}}};
diagnosticarCarga=function(){return{ok:true,diag:1}};`,ctx);
const get=p=>ctx.doGet({parameter:p});
const post=o=>ctx.doPost({postData:{contents:JSON.stringify(o)}});
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64');
let ok=0,fail=0;const t=(nome,c)=>{c?ok++:fail++;console.log((c?'PASSA ':'FALHA ')+nome)};
let r;
r=get({modulos:'baseDados,financeiro'}); t('leitura sem token é negada',r._negado&&!r.baseDados);
r=get({login:'Pedro',modulos:'baseDados'}); t('leitura só com nome de login é negada',r._negado&&!r.baseDados);
r=get({token:'inventado',modulos:'baseDados'}); t('token inventado é negado e marcado como expirado',r._negado&&r._sessaoExpirada);
r=get({diag:'1'}); t('diagnóstico sem token é negado',!r.modulos&&!r.diag);
r=get({acao:'ping'}); t('ping continua aberto (só versão)',r.ok&&r.msg==='pong');
r=get({_auth:'1',payload:b64({acao:'autenticarCliente',email:'Pedro'})}); t('rota antiga não devolve hash de senha',!r.ok&&!JSON.stringify(r).includes(sha('segredo1')));
r=get({_auth:'1',payload:b64({acao:'lerUsuariosPortal'})}); t('lista de usuários sem token é negada',!r.ok&&!r.usuarios);
r=post({_auth:1,acao:'login',login:'Pedro',senha:'errada'}); t('senha errada é recusada',!r.ok&&!r.token);
r=post({_auth:1,acao:'login',login:'Ninguem',senha:'x'}); t('usuário inexistente é recusado',!r.ok&&!r.token);
r=post({_auth:1,acao:'login',login:'Inativo',senha:'x'}); t('usuário inativo é recusado',!r.ok&&!r.token);
r=post({_auth:1,acao:'login',login:'pedro',senha:'segredo1'}); t('admin com senha certa recebe token (sem hash na resposta)',r.ok&&r.token&&!JSON.stringify(r).includes(sha('segredo1')));
const tokA=r.token;
r=get({token:tokA,modulos:'baseDados,financeiro'}); t('admin com token lê tudo',r.baseDados.length===2&&r.financeiro.length===1&&r._nivel==='admin');
r=get({token:tokA,diag:'1'}); t('admin com token acessa diagnóstico',r.ok&&r.diag===1);
r=get({_auth:'1',payload:b64({acao:'lerUsuariosPortal',token:tokA})}); t('admin lista usuários',r.ok&&r.usuarios.length>=2);
r=post({_auth:1,acao:'login',login:'Cliente A',senha:'senhaPura'}); t('cliente com senha pura na planilha entra',r.ok&&r.token);
const tokC=r.token;
r=get({token:tokC,modulos:'baseDados,financeiro'}); t('cliente vê só o próprio grupo, sem financeiro e sem obs',r._nivel==='cliente'&&r.baseDados.length===1&&r.baseDados[0].grupo==='Grupo A'&&!('obs' in r.baseDados[0])&&!r.financeiro);
r=get({token:tokC,diag:'1'}); t('cliente não acessa diagnóstico',!r.diag);
r=get({_wb:'1',payload:b64({acao:'criarRascunhoEmail',dados:{}})}); t('gravação sem token é negada',!r.ok);
r=get({_wb:'1',payload:b64({acao:'criarRascunhoEmail',dados:{},token:tokC})}); t('cliente não grava',!r.ok);
r=get({_wb:'1',payload:b64({acao:'criarRascunhoEmail',dados:{},token:tokA})}); t('admin grava',r.ok);
r=get({app:'SJ',chave:'troque-esta-chave-antes-de-usar'}); t('chave padrão antiga do Sistema Jurídico não abre mais',r._negado);
props.SJ_CHAVE='minha-chave-longa';
r=get({app:'SJ',chave:'minha-chave-longa'}); t('Sistema Jurídico com chave configurada lê só a Base',r.ok&&r.dados.length===2);
portal[1][3]='NAO';
r=get({token:tokA,modulos:'baseDados'}); t('desativar usuário na planilha corta o token na hora',r._negado);
portal[1][3]='SIM';
post({_auth:1,acao:'logout',token:tokA});
r=get({token:tokA,modulos:'baseDados'}); t('após sair, token não vale mais',r._negado&&r._sessaoExpirada);
for(let i=0;i<5;i++) post({_auth:1,acao:'login',login:'Pedro',senha:'chute'+i});
r=post({_auth:1,acao:'login',login:'Pedro',senha:'segredo1'}); t('5 senhas erradas bloqueiam o login (mesmo com a senha certa depois)',!r.ok&&r.bloqueado);
t('tentativas são registradas no log de acesso',log.some(l=>l[3]==='NAO')&&log.some(l=>l[3]==='SIM'));
console.log(`\n${ok} passaram, ${fail} falharam`);
