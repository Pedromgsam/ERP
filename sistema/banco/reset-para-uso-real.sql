-- ═══════════════════════════════════════════════════════════════════════════
-- RESET PARA USO REAL (Backup 46) — rodar UMA vez, quando o teste (beta) acabar.
--
-- O que faz:
--   • apaga TODOS os dados de trabalho (clientes, grupos, processos, parcelamentos,
--     acordos, lançamentos, contratos, tarefas, CRM, documentos, e-mails, histórico…);
--   • apaga todos os usuários, MENOS o Pedro (administrador);
--   • mantém as configurações: modelos de e-mail e de proposta, etapas do CRM,
--     automações, feriados, salários mínimos, OABs/partes monitoradas, dados do escritório,
--     senhas das integrações (config_privada). Os "acessos combinados" também são apagados.
--
-- Antes de rodar: Administração → Backup → baixe um backup (não dá para desfazer).
-- Depois: Administração → Importar planilhas → "Substituir" com as planilhas atualizadas.
-- Se aparecer "PARADO", nada foi apagado: leia a mensagem.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_pedro uuid;
  v_n int;
begin
  select count(*) into v_n from public.perfis where papel = 'admin' and nome ilike 'pedro%';
  if v_n <> 1 then
    raise exception 'PARADO: precisa existir exatamente 1 administrador com nome começando por "Pedro" (achei %). Nada foi apagado.', v_n;
  end if;
  select id into v_pedro from public.perfis where papel = 'admin' and nome ilike 'pedro%';

  -- partes monitoradas apontam para clientes: guarda, apaga, devolve sem o vínculo
  create temp table _partes on commit drop as select * from public.partes_monitoradas;

  truncate table
    public.acessos, public.acordos, public.agenda_links, public.automacoes_log, public.avisos_lidos,
    public.certidoes, public.cliente_certificado, public.cliente_etiquetas, public.clientes, public.cnpj_execucoes,
    public.comentarios, public.contas_bancarias, public.contatos, public.contratos, public.contratos_aditivos,
    public.crm_atividades, public.crm_oportunidades, public.crm_propostas, public.documentos, public.documentos_gerados,
    public.documentos_numeracao, public.email_fila, public.enderecos, public.exitos, public.fluxos, public.grupos,
    public.historico, public.interacoes, public.lancamentos, public.lembretes, public.mural, public.notificacoes,
    public.parcelamentos, public.parcelas, public.perfil_grupos, public.processo_movimentacoes, public.processos,
    public.publicacoes, public.reunioes, public.rotina_conferencias, public.tarefa_tempos, public.tarefas,
    public.usuarios_previstos, public.vinculos_societarios
  cascade;

  insert into public.partes_monitoradas select * from _partes on conflict do nothing;
  update public.partes_monitoradas set cliente_id = null where cliente_id is not null;

  -- usuários: fica só o Pedro (o login e o perfil)
  update public.perfis set revisor_id = null where revisor_id is not null;
  delete from auth.users where id <> v_pedro;
  delete from public.perfis where id <> v_pedro;

  -- arquivos enviados (pasta "documentos"); se o Supabase não deixar por aqui, esvazie em Storage → documentos
  begin
    delete from storage.objects where bucket_id = 'documentos';
  exception when others then
    raise notice 'Arquivos: esvazie a pasta em Supabase → Storage → documentos (motivo: %).', sqlerrm;
  end;

  insert into public.configuracoes (chave, valor) values ('reset_uso_real', to_jsonb(now()))
    on conflict (chave) do update set valor = excluded.valor;
  raise notice 'PRONTO: sistema zerado. Usuário que ficou: %.', (select nome || ' <' || email || '>' from public.perfis where id = v_pedro);
end $$;
-- ═══ fim do reset ═══
