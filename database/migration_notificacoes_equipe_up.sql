-- Avisos de mensagem nova no chat + chat interno entre secretaria e portaria.
-- (O servidor também aplica isto sozinho ao iniciar, em utils/migrar.js.)

-- 1) chat_mensagens: marca quais mensagens não lidas já geraram aviso por e-mail.
ALTER TABLE chat_mensagens ADD COLUMN email_avisado TINYINT(1) NOT NULL DEFAULT 0;
UPDATE chat_mensagens SET email_avisado = 1;  -- mensagens antigas não geram e-mail

-- 2) Controle do intervalo entre e-mails (no máximo 1 a cada 30 min por conversa e direção).
CREATE TABLE IF NOT EXISTS chat_avisos_email (
    responsavel_id INT NOT NULL,
    direcao        ENUM('PARA_RESPONSAVEL','PARA_SECRETARIA') NOT NULL,
    enviado_em     DATETIME NOT NULL,
    PRIMARY KEY (responsavel_id, direcao),
    FOREIGN KEY (responsavel_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3) Chat interno (um canal único entre as duas equipes).
CREATE TABLE IF NOT EXISTS chat_equipe (
    mensagem_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
    remetente_id INT NOT NULL,
    lado         ENUM('SECRETARIA','PORTARIA') NOT NULL,
    texto        VARCHAR(1000) NOT NULL,
    criado_em    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    client_uuid  VARCHAR(40) NULL,
    UNIQUE KEY uq_equipe_remetente_uuid (remetente_id, client_uuid),
    KEY idx_equipe_lado (lado, mensagem_id),
    FOREIGN KEY (remetente_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4) Até onde cada usuário já leu o chat interno (contador de não lidas e "visto").
CREATE TABLE IF NOT EXISTS chat_equipe_leitura (
    usuario_id     INT NOT NULL PRIMARY KEY,
    ultima_lida_id BIGINT NOT NULL DEFAULT 0,
    atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
