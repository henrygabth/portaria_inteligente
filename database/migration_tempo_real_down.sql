-- Reversão segura da migration_tempo_real_up.sql.
-- O ENUM de comunicados_professores NÃO é revertido: tirar valores do ENUM apagaria/alteraria
-- comunicados já gravados como RECUSADA/CANCELADA. Valores extras no ENUM não causam problema.
ALTER TABLE chat_mensagens DROP INDEX uq_chat_remetente_uuid;
ALTER TABLE chat_mensagens DROP COLUMN client_uuid;
