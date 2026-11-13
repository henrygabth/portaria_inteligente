-- Rastreabilidade operacional de atrasos e não retornos.
-- Aplicar após migration_professores_up.sql / migration_alertas_email_up.sql.
-- Não altera nem apaga pedidos existentes.
CREATE TABLE IF NOT EXISTS ocorrencias_pedidos (
  ocorrencia_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  pedido_id INT NOT NULL,
  tipo_evento ENUM('ATRASADO','NAO_RETORNOU','CHEGOU_ATRASADO') NOT NULL,
  detalhe VARCHAR(350) NULL,
  data_evento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolvida_em DATETIME NULL,
  UNIQUE KEY uq_ocorrencia_pedido_tipo (pedido_id, tipo_evento),
  KEY idx_ocorrencias_data (data_evento),
  KEY idx_ocorrencias_abertas (resolvida_em, tipo_evento),
  CONSTRAINT fk_ocorrencias_pedido FOREIGN KEY (pedido_id)
    REFERENCES pedidos_saida(pedidos_saida_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
