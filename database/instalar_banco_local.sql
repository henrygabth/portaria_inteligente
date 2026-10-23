-- SOMENTE PARA UM MYSQL DE TESTES. NÃO RODAR SOBRE O BANCO REAL!
-- Pode ser executado diretamente no MySQL Workbench; seleciona sempre
-- portaria_teste, independentemente do banco padrão da conexão.
CREATE DATABASE IF NOT EXISTS portaria_teste CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE portaria_teste;

-- Estrutura base original do projeto (sem selecionar banco de produção)
-- ==========================================================
-- Schema do banco "projetocodemasters"
-- Sistema de Liberação de Alunos (Pais -> Secretaria -> Portaria)
-- ==========================================================

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
    tipo_usuario   ENUM('PAI', 'SECRETARIA', 'PORTARIA', 'PORTEIRO', 'ADMIN', 'PROFESSOR') NOT NULL,
    status         VARCHAR(20) DEFAULT '1',          -- '1' = ativo, '0' = perfil desativado
    primeiro_acesso TINYINT(1) NOT NULL DEFAULT 1,   -- 1 até o primeiro login (sugere troca de senha)
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
-- pedidos_saida: o coração do sistema (fluxo Pai -> Secretaria -> Portaria)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos_saida (
    pedidos_saida_id     INT AUTO_INCREMENT PRIMARY KEY,
    aluno_id             INT NULL,              -- referência real ao cadastro em `alunos`
    recorrente_id        INT NULL,              -- se este pedido foi gerado automaticamente a partir de um molde recorrente
    nome_aluno           VARCHAR(150) NOT NULL,
    turma_id             INT,
    solicitante_id       INT NOT NULL,          -- usuário (Pai) que criou o pedido
    hora_prevista_saida  DATETIME NOT NULL,
    hora_prevista_retorno DATETIME NULL,        -- usado para detectar atraso no retorno
    motivo               VARCHAR(255),
    observacoes          TEXT,                  -- observações do pai ao criar
    status               ENUM('PENDENTE', 'APROVADA', 'RECUSADA', 'EM_SAIDA', 'CONCLUIDA', 'CANCELADA')
                             NOT NULL DEFAULT 'PENDENTE',
    usuario_id           INT,                   -- último usuário (secretaria/portaria) a mexer no pedido
    observacao           TEXT,                  -- motivo de recusa, por ex.
    hora_saida_real      DATETIME NULL,         -- preenchido pela portaria ao liberar
    hora_retorno_real    DATETIME NULL,         -- preenchido pela portaria ao registrar o retorno
    alerta_atraso_enviado TINYINT(1) NOT NULL DEFAULT 0,
    data_criacao         DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao     DATETIME NULL,
    FOREIGN KEY (turma_id) REFERENCES turmas(id_turma) ON DELETE SET NULL,
    FOREIGN KEY (solicitante_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    FOREIGN KEY (aluno_id) REFERENCES alunos(aluno_id) ON DELETE SET NULL,
    FOREIGN KEY (recorrente_id) REFERENCES pedidos_recorrentes(recorrente_id) ON DELETE SET NULL
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

-- Modulo dos professores: para novas instalacoes, aplicar tambem
-- database/migration_professores_up.sql apos schema.sql (a alteracao enum e idempotente).


-- Ajustes usados pelos modelos de notificação de responsáveis.
ALTER TABLE pedidos_saida ADD COLUMN aviso_pais_atraso_enviado TINYINT(1) NOT NULL DEFAULT 0;

-- Relacionamentos de responsáveis.
CREATE TABLE IF NOT EXISTS responsaveis_alunos (
  id_vinculo INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  aluno_id INT NOT NULL,
  parentesco VARCHAR(50),
  data_vinculo DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ra_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  CONSTRAINT fk_ra_aluno FOREIGN KEY (aluno_id) REFERENCES alunos(aluno_id) ON DELETE CASCADE,
  UNIQUE KEY vinculo_unico (usuario_id, aluno_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Vinculação dos professores e fila de alertas.
-- Executar no banco selecionado pela conexão (Railway: normalmente `railway`).
-- BACKUP OBRIGATÓRIO antes da primeira execução. Up: rodar somente uma vez.
-- Adiciona o papel PROFESSOR ao enum já existente sem modificar usuários antigos.
ALTER TABLE usuarios MODIFY COLUMN tipo_usuario
  ENUM('PAI','SECRETARIA','PORTARIA','PORTEIRO','ADMIN','PROFESSOR') NOT NULL;

-- Uma turma já está em turmas; alunos.turma_id e pedidos_saida.turma_id já existem.
CREATE TABLE IF NOT EXISTS professores_turmas (
  professor_id INT NOT NULL,
  turma_id INT NOT NULL,
  data_vinculo DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (professor_id, turma_id),
  KEY idx_prof_turma_turma (turma_id),
  CONSTRAINT fk_prof_turma_prof FOREIGN KEY (professor_id) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
  CONSTRAINT fk_prof_turma_turma FOREIGN KEY (turma_id) REFERENCES turmas(id_turma) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Uma notificação por professor/tipo/pedido: impede comunicados duplicados em polling
-- ou com reinício/repetição do agendador. Múltiplas saídas = pedidos distintos.
CREATE TABLE IF NOT EXISTS comunicados_professores (
  comunicado_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  professor_id INT NOT NULL,
  aluno_id INT NULL,
  turma_id INT NOT NULL,
  pedido_id INT NOT NULL,
  tipo ENUM('APROVADA','SAIDA','RETORNO','ATRASADO','NAO_RETORNOU') NOT NULL,
  mensagem VARCHAR(350) NOT NULL,
  data_evento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lido TINYINT(1) NOT NULL DEFAULT 0,
  lido_em DATETIME NULL,
  UNIQUE KEY uq_comunicado (professor_id, pedido_id, tipo),
  KEY idx_com_prof_data (professor_id, data_evento),
  KEY idx_com_prof_lido (professor_id, lido),
  KEY idx_com_turma (turma_id),
  KEY idx_com_aluno (aluno_id),
  KEY idx_com_tipo_data (tipo, data_evento),
  CONSTRAINT fk_com_prof FOREIGN KEY (professor_id) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
  CONSTRAINT fk_com_aluno FOREIGN KEY (aluno_id) REFERENCES alunos(aluno_id) ON DELETE SET NULL,
  CONSTRAINT fk_com_turma FOREIGN KEY (turma_id) REFERENCES turmas(id_turma) ON DELETE RESTRICT,
  CONSTRAINT fk_com_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos_saida(pedidos_saida_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- Fila persistente: envio individual por destinatário e evento, com tentativas
-- independentes. O índice único impede um segundo e-mail no polling normal.
CREATE TABLE IF NOT EXISTS alertas_email_envios (
  envio_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  pedido_id INT NOT NULL,
  tipo_evento ENUM('ATRASADO','NAO_RETORNOU','CHEGOU_ATRASADO') NOT NULL,
  email_destino VARCHAR(150) NOT NULL,
  categoria ENUM('RESPONSAVEL','SECRETARIA','PORTARIA','PROFESSOR') NOT NULL,
  status ENUM('PENDENTE','ENVIANDO','ENVIADO','DESCARTADO') NOT NULL DEFAULT 'PENDENTE',
  tentativas INT UNSIGNED NOT NULL DEFAULT 0,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  bloqueado_em DATETIME NULL,
  enviado_em DATETIME NULL,
  ultimo_erro VARCHAR(255) NULL,
  UNIQUE KEY uq_alerta_destino (pedido_id, tipo_evento, email_destino),
  KEY idx_alertas_pendentes (status, atualizado_em),
  KEY idx_alertas_tipo_pedido (tipo_evento, pedido_id),
  CONSTRAINT fk_alertas_pedido FOREIGN KEY (pedido_id)
    REFERENCES pedidos_saida(pedidos_saida_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
