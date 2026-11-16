// Inscrições de notificação (Web Push) de cada aparelho.
const crypto = require('crypto');
const db = require('../config/banco');
const hash = txt => crypto.createHash('sha256').update(String(txt)).digest('hex');

const pushModel = {
    // Mesmo aparelho inscrito de novo (ou outro usuário no mesmo navegador): atualiza o dono.
    salvar: async (usuario_id, { endpoint, keys }, aparelho = null) => {
        await db.query(
            `INSERT INTO push_inscricoes (usuario_id, endpoint_hash, endpoint, p256dh, auth, aparelho)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id), p256dh = VALUES(p256dh), auth = VALUES(auth), aparelho = VALUES(aparelho)`,
            [usuario_id, hash(endpoint), endpoint, keys.p256dh, keys.auth, aparelho]);
    },
    remover: async (usuario_id, endpoint) => {
        const [r] = await db.query('DELETE FROM push_inscricoes WHERE endpoint_hash = ? AND usuario_id = ?', [hash(endpoint), usuario_id]);
        return r.affectedRows > 0;
    },
    removerPorId: async (id) => { await db.query('DELETE FROM push_inscricoes WHERE inscricao_id = ?', [id]); },
    removerDoUsuario: async (usuario_id) => { await db.query('DELETE FROM push_inscricoes WHERE usuario_id = ?', [usuario_id]); },
    marcarEnvio: async (id) => { await db.query('UPDATE push_inscricoes SET ultimo_envio = NOW() WHERE inscricao_id = ?', [id]); },
    contarDoUsuario: async (usuario_id) => {
        const [r] = await db.query('SELECT COUNT(*) AS n FROM push_inscricoes WHERE usuario_id = ?', [usuario_id]);
        return Number(r[0]?.n || 0);
    },
    contarTodas: async () => {
        const [r] = await db.query('SELECT COUNT(*) AS n, COUNT(DISTINCT usuario_id) AS usuarios FROM push_inscricoes');
        return { aparelhos: Number(r[0]?.n || 0), usuarios: Number(r[0]?.usuarios || 0) };
    },
    listarPorUsuarios: async (ids) => {
        if (!ids.length) return [];
        const [rows] = await db.query(
            `SELECT p.inscricao_id, p.usuario_id, p.endpoint, p.p256dh, p.auth
             FROM push_inscricoes p JOIN usuarios u ON u.id_usuario = p.usuario_id
             WHERE p.usuario_id IN (?) AND u.status = '1'`, [ids]);
        return rows;
    },
    usuariosComPapel: async (papeis) => {
        const [rows] = await db.query("SELECT id_usuario FROM usuarios WHERE tipo_usuario IN (?) AND status = '1'", [papeis]);
        return rows.map(r => r.id_usuario);
    },
    // Responsáveis vinculados ao aluno do pedido + quem fez o pedido.
    responsaveisDoPedido: async (pedido_id) => {
        const [rows] = await db.query(
            `SELECT p.solicitante_id AS id FROM pedidos_saida p WHERE p.pedidos_saida_id = ?
             UNION
             SELECT ra.usuario_id FROM pedidos_saida p JOIN responsaveis_alunos ra ON ra.aluno_id = p.aluno_id
             WHERE p.pedidos_saida_id = ?`, [pedido_id, pedido_id]);
        return rows.map(r => r.id);
    },
    // true só na primeira vez para (pedido, tipo): o agendador repete a checagem a cada minuto.
    marcarAvisado: async (pedido_id, tipo) => {
        const [r] = await db.query('INSERT IGNORE INTO push_envios (pedido_id, tipo) VALUES (?, ?)', [pedido_id, tipo]);
        return r.affectedRows > 0;
    }
};

module.exports = pushModel;
