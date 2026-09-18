-- ==========================================================
-- Schema do banco "projetocodemasters"
-- Sistema de Liberação de Alunos (Pais -> Secretaria -> Portaria)
-- ==========================================================

CREATE DATABASE IF NOT EXISTS projetocodemasters
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE projetocodemasters;

-- --------------------------------------------------------
-- usuarios: contas de acesso (Pais/Responsáveis, Secretaria, Portaria)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario     INT AUTO_INCREMENT PRIMARY KEY,
    nome           VARCHAR(150) NOT NULL,
    cpf            VARCHAR(20)  NOT NULL UNIQUE,
    email          VARCHAR(150) NOT NULL UNIQUE,
    telefone       VARCHAR(20),
    senha          VARCHAR(255) NOT NULL,
    tipo_usuario   ENUM('PAI', 'SECRETARIA', 'PORTARIA', 'ADMIN') NOT NULL,
    status         VARCHAR(20) DEFAULT '1',
    data_criacao   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------
-- turmas
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS turmas (
    id_turma    INT AUTO_INCREMENT PRIMARY KEY,
    sala_turma  VARCHAR(100) NOT NULL,
    turno       VARCHAR(20)  NOT NULL
);

-- --------------------------------------------------------
-- alunos (cadastro mestre de alunos, usado pela secretaria)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS alunos (
    aluno_id        INT AUTO_INCREMENT PRIMARY KEY,
    nome            VARCHAR(150) NOT NULL,
    matricula       VARCHAR(50) NOT NULL UNIQUE,
    turma_id        INT,
    data_nascimento DATE,
    status          VARCHAR(20) DEFAULT 'ATIVO',
    data_criacao    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (turma_id) REFERENCES turmas(id_turma) ON DELETE SET NULL
);

-- --------------------------------------------------------
<<<<<<< HEAD
-- pedidos_recorrentes: molde de pedido repetido toda semana num dia fixo
-- (precisa vir antes de pedidos_saida, que referencia esta tabela)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos_recorrentes (
    recorrente_id   INT AUTO_INCREMENT PRIMARY KEY,
    aluno_id        INT NOT NULL,
    usuario_id      INT NOT NULL,
    dia_semana      TINYINT NOT NULL, -- 0=domingo ... 6=sábado
    hora_saida      TIME NOT NULL,
    hora_retorno    TIME NULL,
    motivo          VARCHAR(255),
    ativo           TINYINT(1) NOT NULL DEFAULT 1,
    data_criacao    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (aluno_id) REFERENCES alunos(aluno_id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
);

-- --------------------------------------------------------
=======
>>>>>>> 4f592c031e07562a0df70c9cabbe1e2474f1b4e7
-- pedidos_saida: o coração do sistema (fluxo Pai -> Secretaria -> Portaria)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos_saida (
    pedidos_saida_id     INT AUTO_INCREMENT PRIMARY KEY,
    aluno_id             INT NULL,              -- referência real ao cadastro em `alunos`
<<<<<<< HEAD
    recorrente_id        INT NULL,              -- se este pedido foi gerado automaticamente a partir de um molde recorrente
=======
>>>>>>> 4f592c031e07562a0df70c9cabbe1e2474f1b4e7
    nome_aluno           VARCHAR(150) NOT NULL,
    turma_id             INT,
    solicitante_id       INT NOT NULL,          -- usuário (Pai) que criou o pedido
    hora_prevista_saida  DATETIME NOT NULL,
<<<<<<< HEAD
    hora_prevista_retorno DATETIME NULL,        -- usado para detectar atraso no retorno
=======
>>>>>>> 4f592c031e07562a0df70c9cabbe1e2474f1b4e7
    motivo               VARCHAR(255),
    observacoes          TEXT,                  -- observações do pai ao criar
    status               ENUM('PENDENTE', 'APROVADA', 'RECUSADA', 'EM_SAIDA', 'CONCLUIDA', 'CANCELADA')
                             NOT NULL DEFAULT 'PENDENTE',
    usuario_id           INT,                   -- último usuário (secretaria/portaria) a mexer no pedido
    observacao           TEXT,                  -- motivo de recusa, por ex.
    hora_saida_real      DATETIME NULL,         -- preenchido pela portaria ao liberar
    hora_retorno_real    DATETIME NULL,         -- preenchido pela portaria ao registrar o retorno
<<<<<<< HEAD
    alerta_atraso_enviado TINYINT(1) NOT NULL DEFAULT 0,
=======
>>>>>>> 4f592c031e07562a0df70c9cabbe1e2474f1b4e7
    data_criacao         DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao     DATETIME NULL,
    FOREIGN KEY (turma_id) REFERENCES turmas(id_turma) ON DELETE SET NULL,
    FOREIGN KEY (solicitante_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
<<<<<<< HEAD
    FOREIGN KEY (aluno_id) REFERENCES alunos(aluno_id) ON DELETE SET NULL,
    FOREIGN KEY (recorrente_id) REFERENCES pedidos_recorrentes(recorrente_id) ON DELETE SET NULL
=======
    FOREIGN KEY (aluno_id) REFERENCES alunos(aluno_id) ON DELETE SET NULL
>>>>>>> 4f592c031e07562a0df70c9cabbe1e2474f1b4e7
);

-- --------------------------------------------------------
-- historico_pedidos: registro imutável de cada mudança de status
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS historico_pedidos (
    id_historico    INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id       INT NOT NULL,
    usuario_id      INT,
    status_anterior VARCHAR(20),
    status_novo     VARCHAR(20) NOT NULL,
    observacao      TEXT,
    data_mudanca    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_id) REFERENCES pedidos_saida(pedidos_saida_id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario) ON DELETE SET NULL
);

-- --------------------------------------------------------
-- Dados iniciais de exemplo para testar o fluxo rapidamente
-- --------------------------------------------------------
INSERT INTO turmas (sala_turma, turno) VALUES
    ('1º Termo Desenvolvimento de Sistemas A', 'Manhã'),
    ('2º Termo Desenvolvimento de Sistemas B', 'Tarde')
ON DUPLICATE KEY UPDATE sala_turma = VALUES(sala_turma);
