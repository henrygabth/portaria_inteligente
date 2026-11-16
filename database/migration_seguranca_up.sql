-- Migration: versão do token (segurança).
-- OPCIONAL: o servidor aplica isto sozinho ao iniciar (utils/migrar.js), só se faltar.
-- Só ACRESCENTA uma coluna; nenhum dado existente é alterado.
-- Aumenta a cada troca de senha e derruba as sessões antigas.
ALTER TABLE usuarios ADD COLUMN token_versao INT UNSIGNED NOT NULL DEFAULT 0;
