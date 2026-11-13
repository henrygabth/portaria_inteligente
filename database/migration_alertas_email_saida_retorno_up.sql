-- Aplicar em bancos que JÁ possuem alertas_email_envios (criada antes desta versão).
-- Acrescenta os avisos de SAIDA e RETORNO normais à fila de e-mails para todos os grupos.
-- Idempotente e sem perda de dados: apenas amplia a lista de valores do ENUM.
-- (O servidor também faz este ajuste sozinho ao iniciar, via utils/migrar.js.)
ALTER TABLE alertas_email_envios MODIFY COLUMN tipo_evento
  ENUM('SAIDA','RETORNO','ATRASADO','NAO_RETORNOU','CHEGOU_ATRASADO') NOT NULL;
