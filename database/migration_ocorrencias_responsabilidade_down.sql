-- Reversão intencional. Só remove a tabela de rastreabilidade criada pela migration.
-- Antes de executar, exporte os registros se precisar preservar auditoria.
DROP TABLE IF EXISTS ocorrencias_pedidos;
