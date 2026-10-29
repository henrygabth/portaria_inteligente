// utils/migrar.js
// Garante, ao iniciar o servidor, que o banco tem todas as tabelas e colunas
// que o código usa. Resolve o caso de o banco ter sido criado só com o
// schema.sql (ou ter ficado sem alguma migration): nesse caso, criar pedido,
// aprovar, liberar e avisar os pais falhavam com erro 500.
// É seguro rodar toda vez: só cria/altera o que ainda não existe.
const db = require('../config/banco');

async function tabelaExiste(tabela) {
    const [rows] = await db.query(
        `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
        [tabela]
    );
    return rows.length > 0;
}

async function colunaInfo(tabela, coluna) {
    const [rows] = await db.query(
        `SELECT COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
        [tabela, coluna]
    );
    return rows[0] || null;
}

// Retorna true se a coluna foi criada agora.
async function garantirColuna(tabela, coluna, definicao) {
    if (!(await tabelaExiste(tabela))) return false;
    if (await colunaInfo(tabela, coluna)) return false;
    await db.query(`ALTER TABLE \`${tabela}\` ADD COLUMN \`${coluna}\` ${definicao}`);
    console.log(`[migrar] Coluna criada: ${tabela}.${coluna}`);
    return true;
}

async function criarTabelaSePreciso(nome, sqlComFk, sqlSemFk) {
    if (await tabelaExiste(nome)) return;
    try {
        await db.query(sqlComFk);
    } catch (err) {
        // Se a chave estrangeira não puder ser criada (tipos/engine diferentes), cria sem ela.
        console.warn(`[migrar] ${nome}: criando sem chaves estrangeiras (${err.message})`);
        await db.query(sqlSemFk);
    }
    console.log(`[migrar] Tabela criada: ${nome}`);
}

async function migrar() {
    try {
        // --- tabelas ---------------------------------------------------------
        await criarTabelaSePreciso('responsaveis_alunos',
            `CREATE TABLE responsaveis_alunos (
                id_vinculo   INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id   INT NOT NULL,
                aluno_id     INT NOT NULL,
                parentesco   VARCHAR(50),
                data_vinculo DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
                FOREIGN KEY (aluno_id) REFERENCES alunos(aluno_id) ON DELETE CASCADE,
                UNIQUE KEY vinculo_unico (usuario_id, aluno_id)
            )`,
            `CREATE TABLE responsaveis_alunos (
                id_vinculo   INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id   INT NOT NULL,
                aluno_id     INT NOT NULL,
                parentesco   VARCHAR(50),
                data_vinculo DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY vinculo_unico (usuario_id, aluno_id)
            )`);

        await criarTabelaSePreciso('pedidos_recorrentes',
            `CREATE TABLE pedidos_recorrentes (
                recorrente_id   INT AUTO_INCREMENT PRIMARY KEY,
                aluno_id        INT NOT NULL,
                usuario_id      INT NOT NULL,
                dia_semana      TINYINT NOT NULL,
                hora_saida      TIME NOT NULL,
                hora_retorno    TIME NULL,
                motivo          VARCHAR(255),
                ativo           TINYINT(1) NOT NULL DEFAULT 1,
                data_criacao    DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (aluno_id) REFERENCES alunos(aluno_id) ON DELETE CASCADE,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
            )`,
            `CREATE TABLE pedidos_recorrentes (
                recorrente_id   INT AUTO_INCREMENT PRIMARY KEY,
                aluno_id        INT NOT NULL,
                usuario_id      INT NOT NULL,
                dia_semana      TINYINT NOT NULL,
                hora_saida      TIME NOT NULL,
                hora_retorno    TIME NULL,
                motivo          VARCHAR(255),
                ativo           TINYINT(1) NOT NULL DEFAULT 1,
                data_criacao    DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

        // --- usuarios ---------------------------------------------------------
        // Garante que instalações antigas aceitem o novo perfil PROFESSOR.
        const tipoUsuario = await colunaInfo('usuarios', 'tipo_usuario');
        if (tipoUsuario) {
            const tipo = String(tipoUsuario.COLUMN_TYPE || '').toUpperCase();
            if (!tipo.includes("'PROFESSOR'")) {
                await db.query(`ALTER TABLE usuarios MODIFY COLUMN tipo_usuario
                    ENUM('PAI','SECRETARIA','PORTARIA','PORTEIRO','ADMIN','PROFESSOR') NOT NULL`);
                console.log('[migrar] usuarios.tipo_usuario atualizado com PROFESSOR.');
            }
        }

        // primeiro_acesso: 1 até o usuário fazer o primeiro login (quando o sistema
        // sugere trocar a senha). Ao criar a coluna, quem já existe é marcado como
        // 0 para não receber o aviso retroativamente.
        const criouPrimeiroAcesso = await garantirColuna('usuarios', 'primeiro_acesso', 'TINYINT(1) NOT NULL DEFAULT 1');
        if (criouPrimeiroAcesso) {
            await db.query('UPDATE usuarios SET primeiro_acesso = 0');
        }
        // status: '1' = perfil ativo, '0' = perfil desativado (sem acesso ao sistema).
        await garantirColuna('usuarios', 'status', "VARCHAR(20) DEFAULT '1'");
        await db.query("UPDATE usuarios SET status = '1' WHERE status IS NULL OR status = ''");

        // --- colunas de pedidos_saida ----------------------------------------
        await garantirColuna('pedidos_saida', 'aluno_id', 'INT NULL');
        await garantirColuna('pedidos_saida', 'recorrente_id', 'INT NULL');
        await garantirColuna('pedidos_saida', 'hora_prevista_retorno', 'DATETIME NULL');
        await garantirColuna('pedidos_saida', 'hora_saida_real', 'DATETIME NULL');
        await garantirColuna('pedidos_saida', 'hora_retorno_real', 'DATETIME NULL');
        await garantirColuna('pedidos_saida', 'observacoes', 'TEXT NULL');
        await garantirColuna('pedidos_saida', 'observacao', 'TEXT NULL');
        await garantirColuna('pedidos_saida', 'usuario_id', 'INT NULL');
        await garantirColuna('pedidos_saida', 'data_atualizacao', 'DATETIME NULL');
        await garantirColuna('pedidos_saida', 'alerta_atraso_enviado', 'TINYINT(1) NOT NULL DEFAULT 0');

        // Aviso "aluno não voltou" enviado aos pais. Ao criar a coluna, marca os
        // pedidos antigos como já avisados para não disparar e-mails de datas passadas.
        const criouAvisoPais = await garantirColuna('pedidos_saida', 'aviso_pais_atraso_enviado', 'TINYINT(1) NOT NULL DEFAULT 0');
        if (criouAvisoPais) {
            await db.query('UPDATE pedidos_saida SET aviso_pais_atraso_enviado = 1');
        }

        // --- status com todos os valores usados pelo fluxo --------------------
        const status = await colunaInfo('pedidos_saida', 'status');
        if (status) {
            const valores = ['PENDENTE', 'APROVADA', 'RECUSADA', 'EM_SAIDA', 'CONCLUIDA', 'CANCELADA'];
            const tipo = String(status.COLUMN_TYPE || '').toUpperCase();
            if (valores.some(v => !tipo.includes(`'${v}'`))) {
                await db.query(`ALTER TABLE pedidos_saida MODIFY COLUMN status
                    ENUM('PENDENTE','APROVADA','RECUSADA','EM_SAIDA','CONCLUIDA','CANCELADA') NOT NULL DEFAULT 'PENDENTE'`);
                console.log('[migrar] Coluna pedidos_saida.status atualizada com todos os status.');
            }
        }

        // --- tabelas do fluxo de professores e alertas -----------------------
        await criarTabelaSePreciso('professores_turmas',
            `CREATE TABLE professores_turmas (
                professor_id INT NOT NULL,
                turma_id INT NOT NULL,
                data_vinculo DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (professor_id, turma_id),
                KEY idx_prof_turma_turma (turma_id),
                CONSTRAINT fk_prof_turma_prof FOREIGN KEY (professor_id) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
                CONSTRAINT fk_prof_turma_turma FOREIGN KEY (turma_id) REFERENCES turmas(id_turma) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
            `CREATE TABLE professores_turmas (
                professor_id INT NOT NULL,
                turma_id INT NOT NULL,
                data_vinculo DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (professor_id, turma_id),
                KEY idx_prof_turma_turma (turma_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        await criarTabelaSePreciso('comunicados_professores',
            `CREATE TABLE comunicados_professores (
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
            `CREATE TABLE comunicados_professores (
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
                KEY idx_com_tipo_data (tipo, data_evento)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        await criarTabelaSePreciso('alertas_email_envios',
            `CREATE TABLE alertas_email_envios (
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
                CONSTRAINT fk_alertas_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos_saida(pedidos_saida_id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
            `CREATE TABLE alertas_email_envios (
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
                KEY idx_alertas_tipo_pedido (tipo_evento, pedido_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        await criarTabelaSePreciso('ocorrencias_pedidos',
            `CREATE TABLE ocorrencias_pedidos (
                ocorrencia_id BIGINT AUTO_INCREMENT PRIMARY KEY,
                pedido_id INT NOT NULL,
                tipo_evento ENUM('ATRASADO','NAO_RETORNOU','CHEGOU_ATRASADO') NOT NULL,
                detalhe VARCHAR(350) NULL,
                data_evento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                resolvida_em DATETIME NULL,
                UNIQUE KEY uq_ocorrencia_pedido_tipo (pedido_id, tipo_evento),
                KEY idx_ocorrencias_data (data_evento),
                KEY idx_ocorrencias_abertas (resolvida_em, tipo_evento),
                CONSTRAINT fk_ocorrencias_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos_saida(pedidos_saida_id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
            `CREATE TABLE ocorrencias_pedidos (
                ocorrencia_id BIGINT AUTO_INCREMENT PRIMARY KEY,
                pedido_id INT NOT NULL,
                tipo_evento ENUM('ATRASADO','NAO_RETORNOU','CHEGOU_ATRASADO') NOT NULL,
                detalhe VARCHAR(350) NULL,
                data_evento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                resolvida_em DATETIME NULL,
                UNIQUE KEY uq_ocorrencia_pedido_tipo (pedido_id, tipo_evento),
                KEY idx_ocorrencias_data (data_evento),
                KEY idx_ocorrencias_abertas (resolvida_em, tipo_evento)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        // --- alunos.data_nascimento opcional ---------------------------------
        const nasc = await colunaInfo('alunos', 'data_nascimento');
        if (nasc && nasc.IS_NULLABLE === 'NO') {
            await db.query('ALTER TABLE alunos MODIFY COLUMN data_nascimento DATE NULL');
            console.log('[migrar] alunos.data_nascimento agora é opcional.');
        }

        console.log('[migrar] Estrutura do banco conferida.');
    } catch (err) {
        console.error('[migrar] Erro ao conferir a estrutura do banco:', err.message);
    }
}

module.exports = { migrar };
