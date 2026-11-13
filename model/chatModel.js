// Chat rápido entre responsável e secretaria. Uma conversa por responsável.
const db = require('../config/banco');

const LIMITE_MENSAGENS = 200;
const inteiro = v => Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null;

// Secretaria só abre/responde conversa com responsável ATIVO. Para iniciar uma conversa nova
// (sem mensagens ainda), o responsável precisa ter ao menos um aluno vinculado.
async function podeConversar(id) {
    const [rows] = await db.query(`SELECT 1 FROM usuarios u WHERE u.id_usuario = ? AND u.tipo_usuario = 'PAI'
      AND (u.status IS NULL OR u.status NOT IN ('0','INATIVO','DESATIVADO'))
      AND (EXISTS (SELECT 1 FROM responsaveis_alunos ra WHERE ra.usuario_id = u.id_usuario)
        OR EXISTS (SELECT 1 FROM chat_mensagens m WHERE m.responsavel_id = u.id_usuario)) LIMIT 1`, [id]);
    return rows.length > 0;
}

async function responsavelExiste(id) {
    const [rows] = await db.query(
        "SELECT 1 FROM usuarios WHERE id_usuario = ? AND tipo_usuario = 'PAI' LIMIT 1", [id]);
    return rows.length > 0;
}

// Mensagens da conversa, da mais antiga para a mais nova (as últimas LIMITE_MENSAGENS).
async function listarConversa(responsavelId) {
    const [rows] = await db.query(`SELECT m.mensagem_id, m.de, m.texto, m.criado_em, m.lida,
        u.nome AS remetente
      FROM chat_mensagens m JOIN usuarios u ON u.id_usuario = m.remetente_id
      WHERE m.responsavel_id = ? ORDER BY m.mensagem_id DESC LIMIT ?`, [responsavelId, LIMITE_MENSAGENS]);
    return rows.reverse();
}

// Quem lê marca como lidas as mensagens que o OUTRO lado enviou.
async function marcarLidas(responsavelId, leitor) {
    const deQuem = leitor === 'SECRETARIA' ? 'RESPONSAVEL' : 'SECRETARIA';
    await db.query(`UPDATE chat_mensagens SET lida = 1, lida_em = NOW()
      WHERE responsavel_id = ? AND de = ? AND lida = 0`, [responsavelId, deQuem]);
}

async function enviadasUltimoMinuto(remetenteId) {
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM chat_mensagens
      WHERE remetente_id = ? AND criado_em > DATE_SUB(NOW(), INTERVAL 1 MINUTE)`, [remetenteId]);
    return total;
}

// Uma mensagem já formatada como a lista da conversa devolve (usada no envio em tempo real).
async function buscarMensagem(id) {
    const [rows] = await db.query(`SELECT m.mensagem_id, m.responsavel_id, m.de, m.texto, m.criado_em, m.lida,
        u.nome AS remetente
      FROM chat_mensagens m JOIN usuarios u ON u.id_usuario = m.remetente_id
      WHERE m.mensagem_id = ?`, [id]);
    return rows[0] || null;
}

async function buscarPorClientUuid(remetenteId, uuid) {
    const [rows] = await db.query('SELECT mensagem_id, responsavel_id FROM chat_mensagens WHERE remetente_id = ? AND client_uuid = ? LIMIT 1', [remetenteId, uuid]);
    return rows[0] || null;
}

// Retorna { id, duplicada }. Com clientUuid, reenviar a MESMA mensagem (duplo clique, retry após
// queda de rede) devolve a já gravada em vez de criar outra.
async function enviar(responsavelId, remetenteId, de, texto, clientUuid = null) {
    if (clientUuid) {
        const existente = await buscarPorClientUuid(remetenteId, clientUuid);
        if (existente) return { id: existente.mensagem_id, duplicada: true };
    }
    try {
        const [r] = await db.query(`INSERT INTO chat_mensagens (responsavel_id, remetente_id, de, texto, client_uuid)
          VALUES (?, ?, ?, ?, ?)`, [responsavelId, remetenteId, de, texto, clientUuid]);
        return { id: r.insertId, duplicada: false };
    } catch (err) {
        // Duas requisições iguais ao mesmo tempo: a segunda bate no índice único.
        if (clientUuid && err.code === 'ER_DUP_ENTRY') {
            const existente = await buscarPorClientUuid(remetenteId, clientUuid);
            if (existente) return { id: existente.mensagem_id, duplicada: true };
        }
        throw err;
    }
}

async function naoLidasResponsavel(responsavelId) {
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM chat_mensagens
      WHERE responsavel_id = ? AND de = 'SECRETARIA' AND lida = 0`, [responsavelId]);
    return total;
}

async function naoLidasSecretaria() {
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM chat_mensagens
      WHERE de = 'RESPONSAVEL' AND lida = 0`);
    return total;
}

// Lista de conversas da secretaria: não lidas primeiro, depois a mais recente.
async function listarConversas() {
    const [rows] = await db.query(`SELECT u.id_usuario AS responsavel_id, u.nome, u.telefone,
        (SELECT GROUP_CONCAT(a.nome ORDER BY a.nome SEPARATOR ', ')
           FROM responsaveis_alunos ra JOIN alunos a ON a.aluno_id = ra.aluno_id
           WHERE ra.usuario_id = u.id_usuario) AS alunos,
        x.ultima_em, x.nao_lidas, ult.texto AS ultima_texto, ult.de AS ultima_de
      FROM (SELECT responsavel_id, MAX(mensagem_id) AS ultimo_id, MAX(criado_em) AS ultima_em,
                   SUM(de = 'RESPONSAVEL' AND lida = 0) AS nao_lidas
            FROM chat_mensagens GROUP BY responsavel_id) x
      JOIN usuarios u ON u.id_usuario = x.responsavel_id
      JOIN chat_mensagens ult ON ult.mensagem_id = x.ultimo_id
      ORDER BY (x.nao_lidas > 0) DESC, x.ultimo_id DESC LIMIT 100`);
    return rows.map(r => ({ ...r, nao_lidas: Number(r.nao_lidas) || 0 }));
}

// Para a secretaria iniciar conversa com um responsável que ainda não escreveu.
async function buscarResponsaveis(busca) {
    const termo = `%${String(busca || '').trim().replace(/[%_\\]/g, '')}%`;
    const [rows] = await db.query(`SELECT u.id_usuario AS responsavel_id, u.nome,
        (SELECT GROUP_CONCAT(a.nome ORDER BY a.nome SEPARATOR ', ')
           FROM responsaveis_alunos ra JOIN alunos a ON a.aluno_id = ra.aluno_id
           WHERE ra.usuario_id = u.id_usuario) AS alunos
      FROM usuarios u
      WHERE u.tipo_usuario = 'PAI' AND (u.status IS NULL OR u.status NOT IN ('0','INATIVO','DESATIVADO'))
        AND (u.nome LIKE ? OR EXISTS (SELECT 1 FROM responsaveis_alunos ra JOIN alunos a ON a.aluno_id = ra.aluno_id
              WHERE ra.usuario_id = u.id_usuario AND a.nome LIKE ?))
      ORDER BY u.nome LIMIT 15`, [termo, termo]);
    return rows;
}

module.exports = { inteiro, podeConversar, buscarMensagem, responsavelExiste, listarConversa, marcarLidas, enviadasUltimoMinuto,
    enviar, naoLidasResponsavel, naoLidasSecretaria, listarConversas, buscarResponsaveis };
