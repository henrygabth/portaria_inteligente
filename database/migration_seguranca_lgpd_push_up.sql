-- Migration: notificações no celular, auditoria, login em duas etapas, backup e LGPD.
-- OPCIONAL: o servidor cria tudo isto sozinho ao iniciar (utils/migrar.js), só se ainda não existir.
-- Use este arquivo apenas se preferir aplicar à mão. ANTES: faça BACKUP do banco.
-- Só CRIA tabelas novas e ACRESCENTA 3 colunas em usuarios; nenhum dado existente é alterado.

CREATE TABLE IF NOT EXISTS config_sistema (
    chave VARCHAR(60) NOT NULL PRIMARY KEY,
    valor TEXT NOT NULL,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS push_inscricoes (
    inscricao_id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    endpoint_hash CHAR(64) NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh VARCHAR(200) NOT NULL,
    auth VARCHAR(100) NOT NULL,
    aparelho VARCHAR(120) NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultimo_envio DATETIME NULL,
    UNIQUE KEY uq_push_endpoint (endpoint_hash),
    KEY idx_push_usuario (usuario_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS push_envios (
    pedido_id INT NOT NULL,
    tipo VARCHAR(30) NOT NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (pedido_id, tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auditoria (
    auditoria_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    usuario_id INT NULL,
    usuario_nome VARCHAR(150) NULL,
    papel VARCHAR(20) NULL,
    acao VARCHAR(60) NOT NULL,
    alvo_tipo VARCHAR(30) NULL,
    alvo_id INT NULL,
    descricao VARCHAR(500) NOT NULL,
    ip VARCHAR(45) NULL,
    KEY idx_auditoria_data (criado_em),
    KEY idx_auditoria_acao (acao, criado_em),
    KEY idx_auditoria_usuario (usuario_id, criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS login_codigos (
    codigo_id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    desafio_hash CHAR(64) NOT NULL,
    codigo_hash CHAR(64) NOT NULL,
    expira_em DATETIME NOT NULL,
    tentativas TINYINT NOT NULL DEFAULT 0,
    usado TINYINT(1) NOT NULL DEFAULT 0,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_login_desafio (desafio_hash),
    KEY idx_login_usuario (usuario_id, criado_em),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dispositivos_confiaveis (
    dispositivo_id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    aparelho VARCHAR(120) NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_em DATETIME NOT NULL,
    UNIQUE KEY uq_dispositivo_token (token_hash),
    KEY idx_dispositivo_usuario (usuario_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- LGPD (rode cada ALTER só se a coluna ainda não existir)
ALTER TABLE usuarios ADD COLUMN termos_versao VARCHAR(20) NULL;
ALTER TABLE usuarios ADD COLUMN termos_aceitos_em DATETIME NULL;
ALTER TABLE usuarios ADD COLUMN excluido_em DATETIME NULL;
