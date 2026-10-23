-- Aplicar SOMENTE se migration_professores_up.sql já foi executada anteriormente.
-- Para instalação nova, a criação desta tabela já está incluída em migration_professores_up.sql.
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
