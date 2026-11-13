-- Desfazer (só se necessário). ATENÇÃO: apaga as mensagens do chat e o tipo dos pedidos.
-- Antes, confirme que não há comunicados/alertas do tipo CASA (senão o MODIFY falha, protegendo os dados):
--   SELECT COUNT(*) FROM comunicados_professores WHERE tipo = 'CASA';
--   SELECT COUNT(*) FROM alertas_email_envios WHERE tipo_evento = 'CASA';
DROP TABLE IF EXISTS chat_mensagens;
ALTER TABLE comunicados_professores MODIFY COLUMN tipo ENUM('APROVADA','SAIDA','RETORNO','ATRASADO','NAO_RETORNOU') NOT NULL;
ALTER TABLE alertas_email_envios MODIFY COLUMN tipo_evento ENUM('SAIDA','RETORNO','ATRASADO','NAO_RETORNOU','CHEGOU_ATRASADO') NOT NULL;
ALTER TABLE pedidos_saida DROP COLUMN tipo;
