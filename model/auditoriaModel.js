// Auditoria: só INSERT e SELECT. Não existe UPDATE nem DELETE de registros.
const db = require('../config/banco');

function filtros({ de, ate, acao, usuario, busca }) {
    const onde = [], params = [];
    if (de) { onde.push('a.criado_em >= ?'); params.push(`${de} 00:00:00`); }
    if (ate) { onde.push('a.criado_em <= ?'); params.push(`${ate} 23:59:59`); }
    if (acao) { onde.push('a.acao = ?'); params.push(acao); }
    if (usuario) { onde.push('a.usuario_id = ?'); params.push(usuario); }
    if (busca) { onde.push('(a.descricao LIKE ? OR a.usuario_nome LIKE ?)'); params.push(`%${busca}%`, `%${busca}%`); }
    return { where: onde.length ? 'WHERE ' + onde.join(' AND ') : '', params };
}

module.exports = {
    inserir: async (l) => {
        await db.query(`INSERT INTO auditoria (usuario_id, usuario_nome, papel, acao, alvo_tipo, alvo_id, descricao, ip)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [l.usuario_id, l.usuario_nome, l.papel, l.acao, l.alvo_tipo, l.alvo_id, l.descricao, l.ip]);
    },
    listar: async (f, limite = 50, deslocamento = 0) => {
        const { where, params } = filtros(f);
        const [rows] = await db.query(`SELECT a.auditoria_id, a.criado_em, a.usuario_id, a.usuario_nome, a.papel, a.acao,
                a.alvo_tipo, a.alvo_id, a.descricao, a.ip
            FROM auditoria a ${where} ORDER BY a.auditoria_id DESC LIMIT ? OFFSET ?`, [...params, limite, deslocamento]);
        const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM auditoria a ${where}`, params);
        return { registros: rows, total: Number(total) };
    },
    contarDesde: async (horas) => {
        const [[r]] = await db.query('SELECT COUNT(*) AS n FROM auditoria WHERE criado_em >= DATE_SUB(NOW(), INTERVAL ? HOUR)', [horas]);
        return Number(r.n);
    },
    // Trilha completa de um pedido: histórico de status (já existente) + eventos de auditoria.
    trilhaDoPedido: async (pedido_id) => {
        const [rows] = await db.query(
            `SELECT h.data_mudanca AS criado_em, u.nome AS usuario_nome, u.tipo_usuario AS papel,
                    CONCAT('Status: ', COALESCE(h.status_anterior, 'novo'), ' → ', h.status_novo, IF(h.observacao IS NULL OR h.observacao = '', '', CONCAT(' (', h.observacao, ')'))) AS descricao
             FROM historico_pedidos h LEFT JOIN usuarios u ON u.id_usuario = h.usuario_id WHERE h.pedido_id = ?
             UNION ALL
             SELECT a.criado_em, a.usuario_nome, a.papel, a.descricao FROM auditoria a WHERE a.alvo_tipo = 'PEDIDO' AND a.alvo_id = ?
             ORDER BY criado_em`, [pedido_id, pedido_id]);
        return rows;
    }
};
