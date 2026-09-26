const fs=require('fs'),crypto=require('crypto'),vm=require('vm');
const {chromium}=require('playwright');
const sha=t=>crypto.createHash('sha256').update(t,'utf8').digest('hex');
const portal=[['Login','Senha','Grupos','Ativo','Email','Ultimo','WA'],['Pedro',sha('segredo1'),'admin','SIM','','',''],['Cliente A','senhaPura','Grupo A','SIM','','','']];
const sheet=r=>({getDataRange:()=>({getValues:()=>r}),getRange:()=>({setValue(){}}),getLastRow:()=>1,appendRow(){}});
const store={};
const ctx={CacheService:{getScriptCache:()=>({get:k=>store[k]??null,put:(k,v)=>{store[k]=String(v)},remove:k=>{delete store[k]}})},
 PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})},
 SpreadsheetApp:{openById:()=>({getSheetByName:n=>n==='Portal do Cliente'?sheet(portal):sheet([])})},
 Utilities:{getUuid:()=>crypto.randomUUID(),computeDigest:(a,t)=>[...crypto.createHash('sha256').update(t,'utf8').digest()].map(b=>b>127?b-256:b),DigestAlgorithm:{},Charset:{},formatDate:()=>'x',base64Decode:s=>Buffer.from(s,'base64'),newBlob:b=>({getDataAsString:()=>Buffer.from(b).toString('utf8')})},
 Session:{getScriptTimeZone:()=>'UTC'},ContentService:{createTextOutput:t=>({setMimeType(){return t}}),MimeType:{}},GmailApp:{createDraft(){}},Logger:{log(){}},console};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(process.argv[2]||require('path').join(__dirname,'../#Sistemas/2 - ERP/SCRIPT - MENU - ERP.gs'),'utf8'),ctx);
vm.runInContext(`_leitores=function(){return{baseDados:function(){return[{grupo:'Grupo A',nome:'Empresa Alfa',cpfCnpj:'11222333000144'},{grupo:'Grupo B',nome:'Empresa Beta',cpfCnpj:'55666777000188'}]},processos:function(){return[]},parcelamentos:function(){return[]},acordos:function(){return[]},financeiro:function(){return[]},financeiroContab:function(){return[]},tarefas:function(){return[{titulo:'Tarefa X',status:'pendente',grupo:'Grupo A'}]}}};`,ctx);
const pedidos=[];
(async()=>{
 const b=await chromium.launch();
 const results=[];
 async function run(file,passos){
  const pg=await b.newPage();
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.route(/script\.google\.com/,async route=>{
   const req=route.request(),u=new URL(req.url());const p=Object.fromEntries(u.searchParams);
   pedidos.push(req.method()+' '+(req.method()==='POST'?JSON.parse(req.postData()).acao:(p._auth?'auth':p._wb?'wb':'read '+(p.modulos||p.acao||''))));
   const out=req.method()==='POST'?ctx.doPost({postData:{contents:req.postData()}}):ctx.doGet({parameter:p});
   await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:out});
  });
  await pg.route(/^https?:\/\/(?!script\.google)/,r=>r.abort());
  await pg.goto(require('url').pathToFileURL(file).href);
  await passos(pg,errs);
  await pg.close();
 }
 const erp=require('path').join(__dirname,'../#Sistemas/2 - ERP/ERP.html');
 await run(erp,async(pg,errs)=>{
  await pg.evaluate(()=>localStorage.setItem('ac_saved_senha','velha'));
  await pg.fill('#ac-login-email','Pedro');await pg.fill('#ac-login-senha','errada');await pg.click('#ac-login-btn');
  await pg.waitForTimeout(800);
  const msg=await pg.textContent('#ac-login-msg');
  results.push(['ERP: senha errada mostra erro do servidor',/Senha incorreta/.test(msg)]);
  await pg.fill('#ac-login-senha','segredo1');await pg.check('#ac-lembrar').catch(()=>{});await pg.click('#ac-login-btn');
  await pg.waitForTimeout(3000);
  const st=await pg.evaluate(()=>({tok:!!(window.AC_SESSION&&window.AC_SESSION.token),n:DB.baseDados.length,senha:localStorage.getItem('ac_saved_senha'),login:localStorage.getItem('ac_saved_login'),overlay:document.getElementById('ac-login-overlay').classList.contains('open')}));
  results.push(['ERP: admin entra, recebe token e carrega as 2 empresas',st.tok&&st.n===2&&!st.overlay]);
  results.push(['ERP: senha não fica mais salva no navegador (só o login)',st.senha===null&&st.login==='Pedro']);
  // expira sessão no servidor
  for(const k of Object.keys(store)) if(k.startsWith('sess_')) delete store[k];
  await pg.evaluate(()=>loadData());await pg.waitForTimeout(1200);
  const ov=await pg.evaluate(()=>document.getElementById('ac-login-overlay').classList.contains('open'));
  results.push(['ERP: sessão expirada no servidor volta para a tela de login',ov]);
  results.push(['ERP: nenhum erro de JavaScript na página',errs.length===0]); if(errs.length)console.log(errs);
 });
 await run(erp,async(pg,errs)=>{
  await pg.fill('#ac-login-email','Cliente A');await pg.fill('#ac-login-senha','senhaPura');await pg.click('#ac-login-btn');
  await pg.waitForTimeout(3000);
  const n=await pg.evaluate(()=>DB.baseDados.map(r=>r.nome));
  results.push(['ERP: cliente entra e vê só a própria empresa',n.length===1&&n[0]==='Empresa Alfa']);
 });
 const trf=require('path').join(__dirname,'../#Sistemas/4 - Tarefas/Tarefas.html');
 await run(trf,async(pg,errs)=>{
  await pg.fill('#lgUser','Cliente A');await pg.fill('#lgPass','senhaPura');await pg.click('#lgBtn');await pg.waitForTimeout(800);
  results.push(['Tarefas: cliente é barrado',/uso interno/.test(await pg.textContent('#lgMsg'))]);
  await pg.fill('#lgUser','Pedro');await pg.fill('#lgPass','segredo1');await pg.click('#lgBtn');await pg.waitForTimeout(1500);
  const n=await pg.evaluate(()=>DB.length);
  results.push(['Tarefas: admin entra e carrega as tarefas',n===1]);
  results.push(['Tarefas: nenhum erro de JavaScript',errs.length===0]); if(errs.length)console.log(errs);
 });
 await b.close();
 results.forEach(([n,c])=>console.log((c?'PASSA ':'FALHA ')+n));
 console.log('\nPedidos feitos ao servidor:',[...new Set(pedidos)].join(' | '));
})();
