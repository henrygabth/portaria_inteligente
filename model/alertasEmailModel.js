// Fila de alertas coletivos (responsáveis, secretaria, portaria, professores).
// Cada pedido/evento/e-mail é registrado no banco antes de tentar entregar.
const db = require('../config/banco');
const pedidosModel = require('./pedidosModel');

const TIPOS = ['ATRASADO', 'NAO_RETORNOU', 'CHEGOU_ATRASADO'];

// Somente eventos recentes: evita disparar alertas antigos quando o servidor volta.
async function listarEventosRecentes() {
    const [rows] = await db.query(`
      SELECT p.pedidos_saida_id AS pedido_id, 'ATRASADO' AS tipo
      FROM pedidos_saida p
      WHERE p.status = 'EM_SAIDA' AND p.hora_prevista_retorno IS NOT NULL
        AND p.hora_prevista_retorno >= DATE_SUB(NOW(), INTERVAL 1 DAY)
        AND NOW() > DATE_ADD(p.hora_prevista_retorno, INTERVAL 5 MINUTE)
      UNION ALL
      SELECT p.pedidos_saida_id AS pedido_id, 'NAO_RETORNOU' AS tipo
      FROM pedidos_saida p
      WHERE p.status = 'EM_SAIDA' AND p.hora_prevista_retorno IS NOT NULL
        AND p.hora_prevista_retorno >= DATE_SUB(NOW(), INTERVAL 1 DAY)
        AND NOW() > DATE_ADD(p.hora_prevista_retorno, INTERVAL 15 MINUTE)
      UNION ALL
      SELECT p.pedidos_saida_id AS pedido_id, 'CHEGOU_ATRASADO' AS tipo
      FROM pedidos_saida p
      WHERE p.status = 'CONCLUIDA' AND p.hora_prevista_retorno IS NOT NULL
        AND p.hora_retorno_real >= DATE_SUB(NOW(), INTERVAL 1 DAY)
        AND p.hora_retorno_real > DATE_ADD(p.hora_prevista_retorno, INTERVAL 5 MINUTE)
      ORDER BY pedido_id DESC LIMIT 300`);
    return rows;
}

const emailValido = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());

// A mesma pessoa pode pertencer a vários grupos. Recebe UM e-mail por evento.
// Professores só entram quando vinculados à turma do pedido.
async function buscarDestinatarios(pedido) {
    const destinatarios = new Map();
    function incluir(email, categoria) {
        const normalizado = String(email || '').trim().toLowerCase();
        if (emailValido(normalizado) && normalizado.length <= 150 && !destinatarios.has(normalizado)) {
            destinatarios.set(normalizado, { email: normalizado, categoria });
        }
    }

    // Reaproveita o vínculo já usado nos e-mails de saída/retorno aos responsáveis.
    for (const pessoa of await pedidosModel.buscarDestinatariosPais(pedido)) {
        incluir(pessoa.email, 'RESPONSAVEL');
    }
    const [equipe] = await db.query(`SELECT email, tipo_usuario FROM usuarios
      WHERE tipo_usuario IN ('SECRETARIA','PORTARIA','PORTEIRO')
        AND email IS NOT NULL AND email <> ''
        AND (status IS NULL OR status NOT IN ('0','INATIVO','DESATIVADO'))`);
    for (const pessoa of equipe) {
        incluir(pessoa.email, pessoa.tipo_usuario === 'SECRETARIA' ? 'SECRETARIA' : 'PORTARIA');
    }

    if (pedido.turma_id) {
        const [professores] = await db.query(`SELECT u.email FROM professores_turmas pt
          JOIN usuarios u ON u.id_usuario = pt.professor_id
          WHERE pt.turma_id = ? AND u.tipo_usuario = 'PROFESSOR'
            AND u.email IS NOT NULL AND u.email <> ''
            AND (u.status IS NULL OR u.status NOT IN ('0','INATIVO','DESATIVADO'))`, [pedido.turma_id]);
        for (const prof of professores) incluir(prof.email, 'PROFESSOR');
    }
    return [...destinatarios.values()];
}

async function enfileirar(pedidoId, tipo) {
    if (!TIPOS.includes(tipo)) throw new Error('Tipo de alerta inválido.');
    const pedido = await pedidosModel.buscarParaNotificacao(pedidoId);
    if (!pedido) return 0;
    const destinatarios = await buscarDestinatarios(pedido);
    let novos = 0;
    for (const pessoa of destinatarios) {
        const [resultado] = await db.query(`INSERT IGNORE INTO alertas_email_envios
          (pedido_id, tipo_evento, email_destino, categoria)
          VALUES (?, ?, ?, ?)`, [pedidoId, tipo, pessoa.email, pessoa.categoria]);
        novos += resultado.affectedRows || 0;
    }
    return novos;
}

async function listarEnviosPendentes() {
    const [rows] = await db.query(`SELECT envio_id, pedido_id, tipo_evento, email_destino, categoria
      FROM alertas_email_envios
      WHERE criado_em >= DATE_SUB(NOW(), INTERVAL 1 DAY)
        AND ((status = 'PENDENTE' AND
              (tentativas = 0 OR atualizado_em < DATE_SUB(NOW(), INTERVAL 2 MINUTE)))
             OR (status = 'ENVIANDO' AND bloqueado_em < DATE_SUB(NOW(), INTERVAL 5 MINUTE)))
      ORDER BY criado_em ASC, envio_id ASC LIMIT 20`);
    return rows;
}

async function reservarEnvio(id) {
    const [resultado] = await db.query(`UPDATE alertas_email_envios
      SET status = 'ENVIANDO', bloqueado_em = NOW(), atualizado_em = NOW(),
          tentativas = tentativas + 1
      WHERE envio_id = ? AND criado_em >= DATE_SUB(NOW(), INTERVAL 1 DAY)
        AND ((status = 'PENDENTE' AND
              (tentativas = 0 OR atualizado_em < DATE_SUB(NOW(), INTERVAL 2 MINUTE)))
             OR (status = 'ENVIANDO' AND bloqueado_em < DATE_SUB(NOW(), INTERVAL 5 MINUTE)))`, [id]);
    return resultado.affectedRows === 1;
}

async function concluirEnvio(id) {
    await db.query(`UPDATE alertas_email_envios
      SET status = 'ENVIADO', enviado_em = NOW(), atualizado_em = NOW(),
          bloqueado_em = NULL, ultimo_erro = NULL
      WHERE envio_id = ? AND status = 'ENVIANDO'`, [id]);
}

// Evita um aviso tardio incorreto e bloqueia alerta a professor desvinculado.
async function destinatarioAindaAutorizado(item, pedido) {
    if (item.categoria !== 'PROFESSOR') return true;
    if (!pedido.turma_id) return false;
    const [rows] = await db.query(`SELECT 1 FROM professores_turmas pt
      JOIN usuarios u ON u.id_usuario = pt.professor_id
      WHERE pt.turma_id = ? AND LOWER(TRIM(u.email)) = ?
        AND u.tipo_usuario = 'PROFESSOR'
        AND (u.status IS NULL OR u.status NOT IN ('0','INATIVO','DESATIVADO')) LIMIT 1`,
    [pedido.turma_id, item.email_destino]);
    return rows.length > 0;
}

async function descartarEnvio(id, motivo) {
    await db.query(`UPDATE alertas_email_envios
      SET status = 'DESCARTADO', atualizado_em = NOW(), bloqueado_em = NULL,
          ultimo_erro = ? WHERE envio_id = ? AND status = 'ENVIANDO'`,
    [String(motivo).slice(0, 255), id]);
}

async function falharEnvio(id, erro) {
    await db.query(`UPDATE alertas_email_envios
      SET status = 'PENDENTE', atualizado_em = NOW(), bloqueado_em = NULL,
          ultimo_erro = ? WHERE envio_id = ? AND status = 'ENVIANDO'`,
    [String(erro?.message || erro).slice(0, 255), id]);
}

module.exports = {
    listarEventosRecentes, buscarDestinatarios, enfileirar,
    listarEnviosPendentes, reservarEnvio, concluirEnvio, falharEnvio,
    destinatarioAindaAutorizado, descartarEnvio
};
