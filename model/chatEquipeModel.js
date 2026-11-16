// Chat interno entre a SECRETARIA e a PORTARIA (um canal único entre as duas equipes).
const db = require('../config/banco');

const LIMITE = 200;

// ADMIN conversa pelo lado da secretaria; PORTEIRO é o mesmo que PORTARIA.
function ladoDoPapel(papel) {
    const p = String(papel || '').toUpperCase();
    if (p === 'SECRETARIA' || p === 'ADMIN') return 'SECRETARIA';
    if (p === 'PORTARIA' || p === 'PORTEIRO') return 'PORTARIA';
    return null;
}

async function listar() {
    const [rows] = await db.query(`SELECT m.mensagem_id, m.lado, m.texto, m.criado_em, m.remetente_id, u.nome AS remetente
      FROM chat_equipe m JOIN usuarios u ON u.id_usuario = m.remetente_id
      ORDER BY m.mensagem_id DESC LIMIT ?`, [LIMITE]);
    return rows.reverse();
}

async function buscar(id) {
    const [rows] = await db.query(`SELECT m.mensagem_id, m.lado, m.texto, m.criado_em, m.remetente_id, u.nome AS remetente
      FROM chat_equipe m JOIN usuarios u ON u.id_usuario = m.remetente_id WHERE m.mensagem_id = ?`, [id]);
    return rows[0] || null;
}

async function enviar(remetenteId, lado, texto, clientUuid = null) {
    if (clientUuid) {
        const [rows] = await db.query('SELECT mensagem_id FROM chat_equipe WHERE remetente_id = ? AND client_uuid = ? LIMIT 1', [remetenteId, clientUuid]);
        if (rows[0]) return { id: rows[0].mensagem_id, duplicada: true };
    }
    try {
        const [r] = await db.query('INSERT INTO chat_equipe (remetente_id, lado, texto, client_uuid) VALUES (?, ?, ?, ?)',
            [remetenteId, lado, texto, clientUuid]);
        return { id: r.insertId, duplicada: false };
    } catch (err) {
        if (clientUuid && err.code === 'ER_DUP_ENTRY') {
            const [rows] = await db.query('SELECT mensagem_id FROM chat_equipe WHERE remetente_id = ? AND client_uuid = ? LIMIT 1', [remetenteId, clientUuid]);
            if (rows[0]) return { id: rows[0].mensagem_id, duplicada: true };
        }
        throw err;
    }
}

async function enviadasUltimoMinuto(remetenteId) {
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM chat_equipe
      WHERE remetente_id = ? AND criado_em > DATE_SUB(NOW(), INTERVAL 1 MINUTE)`, [remetenteId]);
    return Number(total) || 0;
}

// Marca tudo até a última mensagem como lido para ESTE usuário. Devolve true se avançou
// (serve para só avisar o outro lado quando há leitura nova de verdade).
async function marcarLido(usuarioId) {
    const [[ult]] = await db.query('SELECT COALESCE(MAX(mensagem_id), 0) AS id FROM chat_equipe');
    const [[antes]] = await db.query('SELECT ultima_lida_id AS id FROM chat_equipe_leitura WHERE usuario_id = ?', [usuarioId]);
    const ultimo = Number(ult?.id) || 0;
    if (antes && Number(antes.id) >= ultimo) return false;
    await db.query(`INSERT INTO chat_equipe_leitura (usuario_id, ultima_lida_id) VALUES (?, ?)
      ON DUPLICATE KEY UPDATE ultima_lida_id = GREATEST(ultima_lida_id, VALUES(ultima_lida_id))`, [usuarioId, ultimo]);
    return ultimo > 0;
}

// Mensagens da OUTRA equipe que este usuário ainda não viu.
async function naoLidas(usuarioId, lado) {
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM chat_equipe m
      WHERE m.lado <> ? AND m.mensagem_id > COALESCE((SELECT ultima_lida_id FROM chat_equipe_leitura WHERE usuario_id = ?), 0)`,
    [lado, usuarioId]);
    return Number(total) || 0;
}

// "Visto": até qual mensagem alguém da OUTRA equipe já leu.
async function vistoPeloOutroLado(lado) {
    const papeis = lado === 'SECRETARIA' ? ['PORTARIA', 'PORTEIRO'] : ['SECRETARIA', 'ADMIN'];
    const [[r]] = await db.query(`SELECT COALESCE(MAX(l.ultima_lida_id), 0) AS ate FROM chat_equipe_leitura l
      JOIN usuarios u ON u.id_usuario = l.usuario_id WHERE UPPER(u.tipo_usuario) IN (?, ?)`, papeis);
    return Number(r?.ate) || 0;
}

module.exports = { ladoDoPapel, listar, buscar, enviar, enviadasUltimoMinuto, marcarLido, naoLidas, vistoPeloOutroLado, LIMITE };
