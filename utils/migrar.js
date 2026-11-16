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

// Acrescenta um valor novo a um ENUM existente (sem tirar nenhum). Só altera se faltar;
// o valor novo vai para o fim da lista, então os dados já gravados não são tocados.
async function garantirValorEnum(tabela, coluna, valores, novo) {
    if (!(await tabelaExiste(tabela))) return;
    const info = await colunaInfo(tabela, coluna);
    if (!info || String(info.COLUMN_TYPE || '').toUpperCase().includes(`'${novo}'`)) return;
    try {
        await db.query(`ALTER TABLE \`${tabela}\` MODIFY COLUMN \`${coluna}\` ENUM(${valores.map(v => `'${v}'`).join(',')}) NOT NULL`);
        console.log(`[migrar] ${tabela}.${coluna} atualizado com ${novo}.`);
    } catch (err) {
        // Não derruba o resto da migração; o SQL manual está em database/migration_casa_chat_up.sql.
        console.error(`[migrar] Não foi possível atualizar ${tabela}.${coluna}: ${err.message}`);
    }
}

async function garantirIndiceUnico(tabela, nome, colunas) {
    if (!(await tabelaExiste(tabela))) return;
    const [rows] = await db.query(
        `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
        [tabela, nome]
    );
    if (rows.length) return;
    try {
        await db.query(`ALTER TABLE \`${tabela}\` ADD UNIQUE KEY \`${nome}\` ${colunas}`);
        console.log(`[migrar] Índice criado: ${tabela}.${nome}`);
    } catch (err) {
        console.error(`[migrar] Não foi possível criar o índice ${tabela}.${nome}: ${err.message}`);
    }
}

async function garantirIndice(tabela, nome, colunas) {
    if (!(await tabelaExiste(tabela))) return;
    const [rows] = await db.query(
        `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
        [tabela, nome]
    );
    if (rows.length) return;
    try {
        await db.query(`ALTER TABLE \`${tabela}\` ADD KEY \`${nome}\` ${colunas}`);
        console.log(`[migrar] Índice criado: ${tabela}.${nome}`);
    } catch (err) {
        console.error(`[migrar] Não foi possível criar o índice ${tabela}.${nome}: ${err.message}`);
    }
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
                tipo_evento ENUM('SAIDA','RETORNO','ATRASADO','NAO_RETORNOU','CHEGOU_ATRASADO') NOT NULL,
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
                tipo_evento ENUM('SAIDA','RETORNO','ATRASADO','NAO_RETORNOU','CHEGOU_ATRASADO') NOT NULL,
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

        // Instalações anteriores só tinham os tipos de atraso na fila de e-mails.
        // Agora saída e retorno também avisam todos os grupos.
        const tipoAlerta = await colunaInfo('alertas_email_envios', 'tipo_evento');
        if (tipoAlerta) {
            const tipo = String(tipoAlerta.COLUMN_TYPE || '').toUpperCase();
            if (!tipo.includes("'SAIDA'") || !tipo.includes("'RETORNO'")) {
                await db.query(`ALTER TABLE alertas_email_envios MODIFY COLUMN tipo_evento
                    ENUM('SAIDA','RETORNO','ATRASADO','NAO_RETORNOU','CHEGOU_ATRASADO') NOT NULL`);
                console.log('[migrar] alertas_email_envios.tipo_evento atualizado com SAIDA e RETORNO.');
            }
        }

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

        // --- liberação para casa (pedido que não volta) ----------------------
        // Pedidos antigos viram ALMOCO automaticamente (valor padrão): nada muda para eles.
        await garantirColuna('pedidos_saida', 'tipo', "ENUM('ALMOCO','CASA') NOT NULL DEFAULT 'ALMOCO'");
        await garantirValorEnum('comunicados_professores', 'tipo',
            ['APROVADA', 'SAIDA', 'RETORNO', 'ATRASADO', 'NAO_RETORNOU', 'CASA'], 'CASA');
        // Foto 3x4 do aluno (o porteiro identifica o aluno sem pedir documento). Fica numa tabela
        // à parte para não pesar nas consultas de alunos; no banco (e não em disco) porque o disco do
        // servidor é apagado a cada deploy.
        await criarTabelaSePreciso('alunos_fotos',
            `CREATE TABLE alunos_fotos (
                aluno_id INT NOT NULL PRIMARY KEY,
                mime VARCHAR(30) NOT NULL DEFAULT 'image/jpeg',
                dados MEDIUMBLOB NOT NULL,
                tamanho INT NOT NULL,
                atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                atualizado_por INT NULL,
                CONSTRAINT fk_foto_aluno FOREIGN KEY (aluno_id) REFERENCES alunos(aluno_id) ON DELETE CASCADE
            ) ENGINE=InnoDB`,
            `CREATE TABLE alunos_fotos (
                aluno_id INT NOT NULL PRIMARY KEY,
                mime VARCHAR(30) NOT NULL DEFAULT 'image/jpeg',
                dados MEDIUMBLOB NOT NULL,
                tamanho INT NOT NULL,
                atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                atualizado_por INT NULL
            ) ENGINE=InnoDB`);

        // Recusa e cancelamento também geram comunicado ao professor.
        await garantirValorEnum('comunicados_professores', 'tipo',
            ['APROVADA', 'SAIDA', 'RETORNO', 'ATRASADO', 'NAO_RETORNOU', 'CASA', 'RECUSADA'], 'RECUSADA');
        await garantirValorEnum('comunicados_professores', 'tipo',
            ['APROVADA', 'SAIDA', 'RETORNO', 'ATRASADO', 'NAO_RETORNOU', 'CASA', 'RECUSADA', 'CANCELADA'], 'CANCELADA');
        await garantirValorEnum('alertas_email_envios', 'tipo_evento',
            ['SAIDA', 'RETORNO', 'ATRASADO', 'NAO_RETORNOU', 'CHEGOU_ATRASADO', 'CASA'], 'CASA');

        // --- chat entre responsável e secretaria ------------------------------
        // Uma conversa por responsável (responsavel_id); "de" diz quem escreveu e
        // "lida" indica se o OUTRO lado já viu a mensagem.
        await criarTabelaSePreciso('chat_mensagens',
            `CREATE TABLE chat_mensagens (
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
            `CREATE TABLE chat_mensagens (
                mensagem_id BIGINT AUTO_INCREMENT PRIMARY KEY,
                responsavel_id INT NOT NULL,
                remetente_id INT NOT NULL,
                de ENUM('RESPONSAVEL','SECRETARIA') NOT NULL,
                texto VARCHAR(1000) NOT NULL,
                criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                lida TINYINT(1) NOT NULL DEFAULT 0,
                lida_em DATETIME NULL,
                KEY idx_chat_conversa (responsavel_id, mensagem_id),
                KEY idx_chat_nao_lidas (de, lida)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        // Chat em tempo real: identificador gerado pelo navegador para não gravar a mesma
        // mensagem duas vezes (duplo clique, reenvio após queda de rede). Mensagens antigas ficam NULL.
        await garantirColuna('chat_mensagens', 'client_uuid', 'VARCHAR(40) NULL');
        await garantirIndiceUnico('chat_mensagens', 'uq_chat_remetente_uuid', '(remetente_id, client_uuid)');

        // --- alunos.data_nascimento opcional ---------------------------------
        const nasc = await colunaInfo('alunos', 'data_nascimento');
        if (nasc && nasc.IS_NULLABLE === 'NO') {
            await db.query('ALTER TABLE alunos MODIFY COLUMN data_nascimento DATE NULL');
            console.log('[migrar] alunos.data_nascimento agora é opcional.');
        }

        // --- segurança: versão do token -------------------------------------
        // Aumenta a cada troca de senha: sessões abertas e links de redefinição antigos
        // deixam de valer (ver middlewares/authenticar.js).
        await garantirColuna('usuarios', 'token_versao', 'INT UNSIGNED NOT NULL DEFAULT 0');

        // --- aviso por e-mail de mensagem não lida no chat ---------------------
        // email_avisado: 1 quando o destinatário já recebeu e-mail sobre esta mensagem.
        // Ao criar a coluna, as mensagens antigas ficam como avisadas (sem e-mail retroativo).
        if (await garantirColuna('chat_mensagens', 'email_avisado', 'TINYINT(1) NOT NULL DEFAULT 0')) {
            await db.query('UPDATE chat_mensagens SET email_avisado = 1');
        }
        // Último e-mail de aviso por conversa e direção (no máximo um a cada 30 minutos).
        await criarTabelaSePreciso('chat_avisos_email',
            `CREATE TABLE chat_avisos_email (
                responsavel_id INT NOT NULL,
                direcao ENUM('PARA_RESPONSAVEL','PARA_SECRETARIA') NOT NULL,
                enviado_em DATETIME NOT NULL,
                PRIMARY KEY (responsavel_id, direcao),
                FOREIGN KEY (responsavel_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
            `CREATE TABLE chat_avisos_email (
                responsavel_id INT NOT NULL,
                direcao ENUM('PARA_RESPONSAVEL','PARA_SECRETARIA') NOT NULL,
                enviado_em DATETIME NOT NULL,
                PRIMARY KEY (responsavel_id, direcao)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        // --- chat interno secretaria <-> portaria -------------------------------
        // Um canal único entre as duas equipes. "lado" diz de qual equipe veio a mensagem.
        await criarTabelaSePreciso('chat_equipe',
            `CREATE TABLE chat_equipe (
                mensagem_id BIGINT AUTO_INCREMENT PRIMARY KEY,
                remetente_id INT NOT NULL,
                lado ENUM('SECRETARIA','PORTARIA') NOT NULL,
                texto VARCHAR(1000) NOT NULL,
                criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                client_uuid VARCHAR(40) NULL,
                UNIQUE KEY uq_equipe_remetente_uuid (remetente_id, client_uuid),
                KEY idx_equipe_lado (lado, mensagem_id),
                FOREIGN KEY (remetente_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
            `CREATE TABLE chat_equipe (
                mensagem_id BIGINT AUTO_INCREMENT PRIMARY KEY,
                remetente_id INT NOT NULL,
                lado ENUM('SECRETARIA','PORTARIA') NOT NULL,
                texto VARCHAR(1000) NOT NULL,
                criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                client_uuid VARCHAR(40) NULL,
                UNIQUE KEY uq_equipe_remetente_uuid (remetente_id, client_uuid),
                KEY idx_equipe_lado (lado, mensagem_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
        // Até qual mensagem cada usuário já leu (para o contador e o "visto").
        await criarTabelaSePreciso('chat_equipe_leitura',
            `CREATE TABLE chat_equipe_leitura (
                usuario_id INT NOT NULL PRIMARY KEY,
                ultima_lida_id BIGINT NOT NULL DEFAULT 0,
                atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
            `CREATE TABLE chat_equipe_leitura (
                usuario_id INT NOT NULL PRIMARY KEY,
                ultima_lida_id BIGINT NOT NULL DEFAULT 0,
                atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        // Índice que acelera a fila de e-mails (pendentes mais antigos primeiro).
        await garantirIndice('alertas_email_envios', 'idx_alertas_fila', '(status, criado_em)');

        await migrarRecursosSeguranca();

        console.log('[migrar] Estrutura do banco conferida.');
    } catch (err) {
        console.error('[migrar] Erro ao conferir a estrutura do banco:', err.message);
    }
}

// Notificações no celular, auditoria, login em duas etapas, backup e LGPD.
// O SQL equivalente (para aplicar à mão) está em database/migration_seguranca_lgpd_push_up.sql.
const TABELAS_NOVAS = [
    // Configurações internas geradas pelo próprio sistema (ex.: chaves das notificações).
    ['config_sistema', `CREATE TABLE config_sistema (
        chave VARCHAR(60) NOT NULL PRIMARY KEY,
        valor TEXT NOT NULL,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, null],
    // Aparelhos que aceitaram receber notificações (um usuário pode ter vários).
    ['push_inscricoes', `CREATE TABLE push_inscricoes (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'fk'],
    // Evita mandar a mesma notificação duas vezes (o agendador roda de minuto em minuto).
    ['push_envios', `CREATE TABLE push_envios (
        pedido_id INT NOT NULL,
        tipo VARCHAR(30) NOT NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (pedido_id, tipo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, null],
    // Registro de quem fez o quê. Só recebe INSERT: nada é alterado depois de gravado.
    ['auditoria', `CREATE TABLE auditoria (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, null],
    // Login em duas etapas: código de 6 números enviado por e-mail (guardado só o hash).
    ['login_codigos', `CREATE TABLE login_codigos (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'fk'],
    // "Confiar neste aparelho por 30 dias" (não pede o código de novo nesse navegador).
    ['dispositivos_confiaveis', `CREATE TABLE dispositivos_confiaveis (
        dispositivo_id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        token_hash CHAR(64) NOT NULL,
        aparelho VARCHAR(120) NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expira_em DATETIME NOT NULL,
        UNIQUE KEY uq_dispositivo_token (token_hash),
        KEY idx_dispositivo_usuario (usuario_id),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'fk']
];

async function migrarRecursosSeguranca() {
    for (const [nome, sql, temFk] of TABELAS_NOVAS) {
        try {
            const semFk = temFk ? sql.replace(/,\s*FOREIGN KEY[^\n]*/g, '') : sql;
            await criarTabelaSePreciso(nome, sql, semFk);
        } catch (err) {
            console.error(`[migrar] Não foi possível criar ${nome}: ${err.message}`);
        }
    }
    // LGPD: quando a pessoa aceitou o termo e a política de privacidade (e qual versão).
    await garantirColuna('usuarios', 'termos_versao', 'VARCHAR(20) NULL');
    await garantirColuna('usuarios', 'termos_aceitos_em', 'DATETIME NULL');
    // Conta apagada a pedido do titular: dados pessoais anonimizados, histórico da escola mantido.
    await garantirColuna('usuarios', 'excluido_em', 'DATETIME NULL');
}

module.exports = { migrar, TABELAS_NOVAS };
