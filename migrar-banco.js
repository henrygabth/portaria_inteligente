'use strict';

// migrar-banco.js
// Migração MySQL: Railway -> Aiven

const mysql = require('mysql2/promise');

function obrigatoria(nome) {
    const valor = process.env[nome];

    if (!valor) {
        throw new Error(`Variável ausente: ${nome}`);
    }

    return valor;
}

function configurarBanco(prefixo, usarSSL = false) {
    const config = {
        host: obrigatoria(`${prefixo}_HOST`),
        port: Number(obrigatoria(`${prefixo}_PORT`)),
        user: obrigatoria(`${prefixo}_USER`),
        password: obrigatoria(`${prefixo}_PASSWORD`),
        database: obrigatoria(`${prefixo}_NAME`),
        charset: 'utf8mb4',
        connectTimeout: 20000,
        supportBigNumbers: true,
        bigNumberStrings: true,
        dateStrings: true,
        timezone: 'Z'
    };

    if (usarSSL) {
        const ca = Buffer.from(
            obrigatoria('AIVEN_CA_PEM_BASE64'),
            'base64'
        ).toString('utf8');

        config.ssl = {
            ca,
            rejectUnauthorized: true,
            minVersion: 'TLSv1.2'
        };
    }

    return config;
}

function escapar(nome) {
    return '`' + String(nome).replace(/`/g, '``') + '`';
}

async function migrar() {
    if (process.env.CONFIRM_MIGRATION !== 'YES') {
        throw new Error('Migração não confirmada.');
    }

    if (process.env.WRITES_PAUSED !== 'YES') {
        throw new Error('Pause as gravações antes da migração.');
    }

    const origemConfig = configurarBanco('RAILWAY');
    const destinoConfig = configurarBanco('AIVEN', true);

    if (
        origemConfig.host === destinoConfig.host &&
        origemConfig.port === destinoConfig.port &&
        origemConfig.database === destinoConfig.database
    ) {
        throw new Error('Origem e destino são iguais.');
    }

    let origem;
    let destino;

    try {
        origem = await mysql.createConnection(origemConfig);
        destino = await mysql.createConnection(destinoConfig);

        console.log('Conexões estabelecidas.');

        await origem.query(
            'SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ'
        );

        await origem.query(
            'START TRANSACTION WITH CONSISTENT SNAPSHOT'
        );

        const [objetos] = await origem.query(
            `SELECT TABLE_NAME, TABLE_TYPE
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ?
             ORDER BY TABLE_NAME`,
            [origemConfig.database]
        );

        if (objetos.some(o => o.TABLE_TYPE !== 'BASE TABLE')) {
            throw new Error('Existem views que exigem migração adicional.');
        }

        const tabelas = objetos.map(o => o.TABLE_NAME);

        if (!tabelas.length) {
            throw new Error('Nenhuma tabela encontrada na Railway.');
        }

        const [existentes] = await destino.query(
            `SELECT TABLE_NAME
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ?`,
            [destinoConfig.database]
        );

        if (existentes.length) {
            throw new Error('O banco Aiven precisa estar vazio.');
        }

        for (const [tipo, tabelaInfo] of [
            ['procedures/functions', 'ROUTINES'],
            ['triggers', 'TRIGGERS'],
            ['events', 'EVENTS']
        ]) {
            const coluna = tabelaInfo === 'ROUTINES'
                ? 'ROUTINE_SCHEMA'
                : tabelaInfo === 'TRIGGERS'
                    ? 'TRIGGER_SCHEMA'
                    : 'EVENT_SCHEMA';

            const [[resultado]] = await origem.query(
                `SELECT COUNT(*) AS total
                 FROM information_schema.${tabelaInfo}
                 WHERE ${coluna} = ?`,
                [origemConfig.database]
            );

            if (Number(resultado.total) > 0) {
                throw new Error(
                    `Existem ${tipo} que este script não migra.`
                );
            }
        }

        console.log(`${tabelas.length} tabelas encontradas.`);

        await destino.query('SET SESSION foreign_key_checks = 0');

        // Criar todas as estruturas primeiro.
        for (const tabela of tabelas) {
            const [resultado] = await origem.query(
                `SHOW CREATE TABLE ${escapar(tabela)}`
            );

            const sql = resultado[0]['Create Table'];

            await destino.query(sql);

            console.log(`Tabela criada: ${tabela}`);
        }

        let totalGeral = 0;

        // Copiar os registros preservando os IDs.
        for (const tabela of tabelas) {
            const [[contagem]] = await origem.query(
                `SELECT COUNT(*) AS total FROM ${escapar(tabela)}`
            );

            const total = Number(contagem.total);

            const [colunas] = await origem.query(
                `SHOW COLUMNS FROM ${escapar(tabela)}`
            );

            const nomes = colunas.map(c => c.Field);
            const primarias = colunas
                .filter(c => c.Key === 'PRI')
                .map(c => c.Field);

            if (!primarias.length && total > 1000) {
                throw new Error(
                    `Tabela ${tabela} sem chave primária.`
                );
            }

            const ordem = primarias.length
                ? ` ORDER BY ${primarias.map(escapar).join(', ')}`
                : '';

            let copiados = 0;
            const lote = 200;

            while (copiados < total) {
                const [registros] = await origem.query(
                    `SELECT *
                     FROM ${escapar(tabela)}
                     ${ordem}
                     LIMIT ? OFFSET ?`,
                    [lote, copiados]
                );

                if (!registros.length) {
                    throw new Error(`Leitura incompleta: ${tabela}`);
                }

                const marcadores = '(' +
                    nomes.map(() => '?').join(',') +
                    ')';

                const sql = `
                    INSERT INTO ${escapar(tabela)}
                    (${nomes.map(escapar).join(',')})
                    VALUES ${registros.map(() => marcadores).join(',')}
                `;

                const valores = registros.flatMap(registro =>
                    nomes.map(nome => registro[nome])
                );

                await destino.query(sql, valores);

                copiados += registros.length;
            }

            const [[verificacao]] = await destino.query(
                `SELECT COUNT(*) AS total
                 FROM ${escapar(tabela)}`
            );

            if (Number(verificacao.total) !== total) {
                throw new Error(
                    `Divergência de registros na tabela ${tabela}`
                );
            }

            totalGeral += total;

            console.log(
                `${tabela}: ${total} registros transferidos e conferidos.`
            );
        }

        await destino.query('SET SESSION foreign_key_checks = 1');

        console.log('MIGRAÇÃO CONCLUÍDA!');
        console.log(`Tabelas: ${tabelas.length}`);
        console.log(`Registros: ${totalGeral}`);
        console.log('Verifique os relacionamentos e os fluxos do sistema.');
        console.log('Não desative a Railway antes dos testes.');

        await origem.commit();

    } finally {
        if (origem) await origem.end().catch(() => {});
        if (destino) await destino.end().catch(() => {});
    }
}

migrar().catch(erro => {
    console.error(
        'MIGRAÇÃO INTERROMPIDA:',
        erro.code || erro.name || 'Erro'
    );

    process.exitCode = 1;
});