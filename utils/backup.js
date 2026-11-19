// utils/backup.js — cópia de segurança do banco em SQL compactado (.sql.gz), sem precisar do mysqldump.
//  - Automática: uma vez por dia (madrugada), guardada em BACKUP_DIR (padrão: ./backups), mantendo as
//    últimas BACKUP_MANTER (padrão: 7).
//  - Manual: o administrador baixa na tela "Saúde do sistema" (o arquivo vai direto para o computador).
// ATENÇÃO: em hospedagens com disco temporário (ex.: Render gratuito) a pasta some a cada novo deploy.
// Nesses casos, baixe o backup pela tela de vez em quando ou aponte BACKUP_DIR para um disco persistente.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const PASTA = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups'));
const MANTER = Math.max(1, Number(process.env.BACKUP_MANTER) || 7);
const LOTE = 500;

const dois = n => String(n).padStart(2, '0');
function dataSql(d) {
    return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())} ${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`;
}
// Escapa um valor para SQL (mesmas regras do mysqldump).
function valorSql(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? 'NULL' : `'${dataSql(v)}'`;
    if (Buffer.isBuffer(v)) return v.length ? `X'${v.toString('hex')}'` : "''";
    if (typeof v === 'object') v = JSON.stringify(v);
    return "'" + String(v).replace(/[\0\n\r\b\t\\'"\x1a]/g, c => ({ '\0': '\\0', '\n': '\\n', '\r': '\\r', '\b': '\\b', '\t': '\\t', '\x1a': '\\Z', '\\': '\\\\', "'": "\\'", '"': '\\"' }[c])) + "'";
}
const nomeSql = n => '`' + String(n).replace(/`/g, '``') + '`';

// Gera o SQL aos pedaços (não carrega o banco inteiro na memória).
async function* gerarSql(db) {
    const [[info]] = await db.query('SELECT DATABASE() AS banco, VERSION() AS versao');
    yield `-- Backup do Portaria Inteligente\n-- Banco: ${info.banco} | MySQL ${info.versao}\n-- Gerado em: ${dataSql(new Date())}\n`;
    yield '-- Para restaurar: mysql -u USUARIO -p NOME_DO_BANCO < arquivo.sql\n\n';
    yield 'SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\nSET UNIQUE_CHECKS = 0;\n\n';
    const [tabelas] = await db.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
    for (const linha of tabelas) {
        const tabela = Object.values(linha)[0];
        const [[criar]] = await db.query(`SHOW CREATE TABLE ${nomeSql(tabela)}`);
        yield `-- ----------------------------\n-- Tabela ${tabela}\n-- ----------------------------\nDROP TABLE IF EXISTS ${nomeSql(tabela)};\n${criar['Create Table']};\n\n`;
        for (let desloc = 0; ; desloc += LOTE) {
            const [rows] = await db.query(`SELECT * FROM ${nomeSql(tabela)} LIMIT ? OFFSET ?`, [LOTE, desloc]);
            if (!rows.length) break;
            const colunas = Object.keys(rows[0]).map(nomeSql).join(', ');
            yield `INSERT INTO ${nomeSql(tabela)} (${colunas}) VALUES\n` +
                rows.map(r => '(' + Object.values(r).map(valorSql).join(', ') + ')').join(',\n') + ';\n';
            if (rows.length < LOTE) break;
        }
        yield '\n';
    }
    yield 'SET FOREIGN_KEY_CHECKS = 1;\nSET UNIQUE_CHECKS = 1;\n-- Fim do backup\n';
}

const nomeArquivo = (d = new Date()) => `portaria-backup-${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}_${dois(d.getHours())}${dois(d.getMinutes())}.sql.gz`;

// Envia o backup compactado para um stream (resposta HTTP ou arquivo).
async function escreverBackup(destino, db = require('../config/banco')) {
    await pipeline(Readable.from(gerarSql(db)), zlib.createGzip({ level: 6 }), destino);
}

async function backupEmArquivo(db = require('../config/banco')) {
    fs.mkdirSync(PASTA, { recursive: true });
    const final = path.join(PASTA, nomeArquivo());
    const temp = final + '.parcial';
    await escreverBackup(fs.createWriteStream(temp, { mode: 0o600 }), db);
    fs.renameSync(temp, final);
    // Mantém só os mais recentes.
    const antigos = listarArquivos().slice(MANTER);
    for (const a of antigos) { try { fs.unlinkSync(path.join(PASTA, a.nome)); } catch (_) { /* ignora */ } }
    return { arquivo: path.basename(final), bytes: fs.statSync(final).size };
}

function listarArquivos() {
    try {
        return fs.readdirSync(PASTA).filter(n => /^portaria-backup-.*\.sql\.gz$/.test(n))
            .map(nome => { const st = fs.statSync(path.join(PASTA, nome)); return { nome, bytes: st.size, criado_em: st.mtime }; })
            .sort((a, b) => b.criado_em - a.criado_em);
    } catch (_) { return []; }
}

// Chamado pelo agendador a cada hora: faz o backup do dia uma vez, depois das 2h da manhã.
let rodando = false;
async function backupDiarioSePreciso(db = require('../config/banco')) {
    if (rodando || String(process.env.BACKUP_AUTOMATICO || '').toLowerCase() === 'desligado') return null;
    const agora = new Date();
    if (agora.getHours() < 2) return null;
    const hoje = `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
    const ultimo = listarArquivos()[0];
    if (ultimo && nomeArquivo(ultimo.criado_em).slice(16, 26) === hoje) return null;
    rodando = true;
    try {
        const r = await backupEmArquivo(db);
        await db.query("INSERT INTO config_sistema (chave, valor) VALUES ('ultimo_backup', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)",
            [JSON.stringify({ ...r, em: new Date().toISOString(), tipo: 'automatico' })]).catch(() => {});
        require('./auditoria').registrar(null, 'BACKUP_GERADO', { descricao: `Backup automático gerado: ${r.arquivo} (${Math.round(r.bytes / 1024)} KB)` });
        console.log(`[backup] ${r.arquivo} gerado (${Math.round(r.bytes / 1024)} KB).`);
        return r;
    } catch (err) {
        console.error('[backup] Falha no backup automático:', err.message);
        await db.query("INSERT INTO config_sistema (chave, valor) VALUES ('ultimo_backup_erro', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)",
            [JSON.stringify({ erro: err.message, em: new Date().toISOString() })]).catch(() => {});
        return null;
    } finally { rodando = false; }
}

module.exports = { gerarSql, valorSql, escreverBackup, backupEmArquivo, backupDiarioSePreciso, listarArquivos, nomeArquivo, PASTA };
