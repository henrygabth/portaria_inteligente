// Login em duas etapas: códigos por e-mail e aparelhos confiáveis. Só hashes vão para o banco.
const crypto = require('crypto');
const db = require('../config/banco');
const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');

module.exports = {
    hash,
    criarCodigo: async (usuario_id, desafio, codigo, minutos) => {
        await db.query(`INSERT INTO login_codigos (usuario_id, desafio_hash, codigo_hash, expira_em)
            VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`, [usuario_id, hash(desafio), hash(codigo), minutos]);
    },
    codigosRecentes: async (usuario_id, minutos) => {
        const [[r]] = await db.query('SELECT COUNT(*) AS n FROM login_codigos WHERE usuario_id = ? AND criado_em > DATE_SUB(NOW(), INTERVAL ? MINUTE)', [usuario_id, minutos]);
        return Number(r.n);
    },
    // Busca o desafio ainda válido (não usado, não expirado).
    buscarDesafio: async (desafio) => {
        const [rows] = await db.query(`SELECT codigo_id, usuario_id, codigo_hash, tentativas FROM login_codigos
            WHERE desafio_hash = ? AND usado = 0 AND expira_em > NOW() LIMIT 1`, [hash(desafio)]);
        return rows[0] || null;
    },
    registrarErro: async (codigo_id) => { await db.query('UPDATE login_codigos SET tentativas = tentativas + 1 WHERE codigo_id = ?', [codigo_id]); },
    // UPDATE condicional: o mesmo código não serve duas vezes nem em duas abas ao mesmo tempo.
    marcarUsado: async (codigo_id) => {
        const [r] = await db.query('UPDATE login_codigos SET usado = 1 WHERE codigo_id = ? AND usado = 0', [codigo_id]);
        return r.affectedRows > 0;
    },
    limparAntigos: async () => { await db.query('DELETE FROM login_codigos WHERE criado_em < DATE_SUB(NOW(), INTERVAL 7 DAY)'); },

    confiarAparelho: async (usuario_id, token, aparelho, dias) => {
        await db.query(`INSERT INTO dispositivos_confiaveis (usuario_id, token_hash, aparelho, expira_em)
            VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`, [usuario_id, hash(token), aparelho, dias]);
    },
    aparelhoConfiavel: async (usuario_id, token) => {
        if (typeof token !== 'string' || token.length < 30 || token.length > 100) return false;
        const [rows] = await db.query('SELECT 1 FROM dispositivos_confiaveis WHERE usuario_id = ? AND token_hash = ? AND expira_em > NOW() LIMIT 1', [usuario_id, hash(token)]);
        return rows.length > 0;
    },
    esquecerAparelhos: async (usuario_id) => { await db.query('DELETE FROM dispositivos_confiaveis WHERE usuario_id = ?', [usuario_id]); }
};
