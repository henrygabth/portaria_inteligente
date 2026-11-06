-- A coluna `status` de pessoas_autorizadas veio de uma versão antiga da tabela
-- (provavelmente criada como TINYINT/CHAR bem pequeno) e não comporta o texto
-- 'ATIVO' que o sistema tenta gravar, causando o erro:
--   Error: Data too long for column 'status' at row 1
--
-- Este script alinha o tamanho ao padrão já usado em outras tabelas do
-- sistema (alunos.status, usuarios.status), que são VARCHAR(20).

ALTER TABLE pessoas_autorizadas
    MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ATIVO';
