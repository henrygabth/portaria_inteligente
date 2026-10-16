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
