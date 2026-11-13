-- OPCIONAL: o servidor já faz tudo isto sozinho ao iniciar (utils/migrar.js).
-- Use somente se preferir aplicar à mão no Aiven. Só ADICIONA coisas; nada é apagado nem alterado nos dados.
-- Faça backup antes. Pode ser executado mais de uma vez? NÃO: rode cada ALTER uma única vez.

-- 1) Tipo do pedido: pedidos antigos viram ALMOCO automaticamente.
ALTER TABLE pedidos_saida ADD COLUMN tipo ENUM('ALMOCO','CASA') NOT NULL DEFAULT 'ALMOCO';

-- 2) Novos tipos de aviso (o valor novo vai para o fim da lista).
ALTER TABLE comunicados_professores MODIFY COLUMN tipo
  ENUM('APROVADA','SAIDA','RETORNO','ATRASADO','NAO_RETORNOU','CASA') NOT NULL;
ALTER TABLE alertas_email_envios MODIFY COLUMN tipo_evento
  ENUM('SAIDA','RETORNO','ATRASADO','NAO_RETORNOU','CHEGOU_ATRASADO','CASA') NOT NULL;

-- 3) Chat entre responsável e secretaria.
CREATE TABLE IF NOT EXISTS chat_mensagens (
  mensagem_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  responsavel_id INT NOT NULL,
  remetente_id INT NOT NULL,
  de ENUM('RESPONSAVEL','SECRETARIA') NOT NULL,
  texto VARCHAR(1000) NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lida TINYINT(1) NOT NULL DEFAULT 0,
  lida_em DATETIME NULL,
  KEY idx_chat_conversa (responsavel_id, mensagem_id),
  KEY idx_chat_nao_lidas (de, lida),
  CONSTRAINT fk_chat_responsavel FOREIGN KEY (responsavel_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
