-- Migration: foto 3x4 do aluno (identificação na portaria sem documento).
-- OPCIONAL: o servidor cria esta tabela sozinho ao iniciar (utils/migrar.js), só se ela não existir.
-- Use este arquivo apenas se preferir aplicar à mão no Aiven. ANTES: faça BACKUP do banco.
-- Só CRIA uma tabela nova; nenhuma tabela ou dado existente é alterado.
CREATE TABLE IF NOT EXISTS alunos_fotos (
    aluno_id       INT NOT NULL PRIMARY KEY,
    mime           VARCHAR(30) NOT NULL DEFAULT 'image/jpeg',
    dados          MEDIUMBLOB NOT NULL,
    tamanho        INT NOT NULL,
    atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_por INT NULL,
    CONSTRAINT fk_foto_aluno FOREIGN KEY (aluno_id) REFERENCES alunos(aluno_id) ON DELETE CASCADE
) ENGINE=InnoDB;
