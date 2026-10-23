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
