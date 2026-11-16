-- Desfaz migration_seguranca_lgpd_push_up.sql. ATENÇÃO: apaga a auditoria e as inscrições de notificação.
-- Faça BACKUP antes.
DROP TABLE IF EXISTS dispositivos_confiaveis;
DROP TABLE IF EXISTS login_codigos;
DROP TABLE IF EXISTS push_envios;
DROP TABLE IF EXISTS push_inscricoes;
DROP TABLE IF EXISTS auditoria;
DROP TABLE IF EXISTS config_sistema;
ALTER TABLE usuarios DROP COLUMN termos_versao;
ALTER TABLE usuarios DROP COLUMN termos_aceitos_em;
ALTER TABLE usuarios DROP COLUMN excluido_em;
