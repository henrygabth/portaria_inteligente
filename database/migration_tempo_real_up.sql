-- Migration: comunicados de recusa/cancelamento + chat em tempo real (sem duplicar mensagens).
-- OPCIONAL: o servidor já aplica tudo isto sozinho ao iniciar (utils/migrar.js), só quando falta.
-- Use este arquivo apenas se preferir aplicar à mão no Aiven.
-- ANTES: faça BACKUP do banco. Só ADICIONA coisas; nenhum dado é alterado ou apagado.
-- Cada comando abaixo deve ser executado UMA vez (os ALTER não são idempotentes). Antes de rodar,
-- confira com: SHOW COLUMNS FROM comunicados_professores LIKE 'tipo';  e  SHOW COLUMNS FROM chat_mensagens;

-- 1) Novos tipos de comunicado para o professor (o valor novo vai para o fim da lista;
--    inclui CASA caso ainda não exista, sem tocar nas linhas já gravadas).
ALTER TABLE comunicados_professores MODIFY COLUMN tipo
  ENUM('APROVADA','SAIDA','RETORNO','ATRASADO','NAO_RETORNOU','CASA','RECUSADA','CANCELADA') NOT NULL;

-- 2) Identificador de cliente do chat (evita mensagem duplicada) + índice único.
ALTER TABLE chat_mensagens ADD COLUMN client_uuid VARCHAR(40) NULL;
ALTER TABLE chat_mensagens ADD UNIQUE KEY uq_chat_remetente_uuid (remetente_id, client_uuid);
