USE projetocodemasters;

-- A tabela responsaveis_alunos existia mas nunca teve código ligado a ela.
-- Recriando com a estrutura necessária para vincular um responsável (usuário PAI) a um aluno.
DROP TABLE IF EXISTS responsaveis_alunos;

CREATE TABLE responsaveis_alunos (
    id_vinculo   INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id   INT NOT NULL,        -- conta do responsável (tipo_usuario = 'PAI')
    aluno_id     INT NOT NULL,        -- aluno vinculado
    parentesco   VARCHAR(50),         -- ex: Pai, Mãe, Avó, Responsável legal
    data_vinculo DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    FOREIGN KEY (aluno_id) REFERENCES alunos(aluno_id) ON DELETE CASCADE,
    UNIQUE KEY vinculo_unico (usuario_id, aluno_id)
);
