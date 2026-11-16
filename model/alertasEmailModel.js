// Fila de alertas coletivos (responsáveis, secretaria, portaria, professores).
// Cada pedido/evento/e-mail é registrado no banco antes de tentar entregar.
const db = require('../config/banco');
const pedidosModel = require('./pedidosModel');

// SAIDA e RETORNO são avisos de movimentação normal (enfileirados na hora pelo controller).
// ATRASADO, NAO_RETORNOU e CHEGOU_ATRASADO são detectados pelo agendador (listarEventosRecentes).
const TIPOS = ['SAIDA', 'RETORNO', 'ATRASADO', 'NAO_RETORNOU', 'CHEGOU_ATRASADO', 'CASA'];
const TIPOS_MOVIMENTO = ['SAIDA', 'RETORNO', 'CASA'];

// Máximo de tentativas por e-mail. Entre uma e outra a espera dobra: 1, 2, 4, 8, 16, 30, 30 min.
const MAX_TENTATIVAS = 8;
// Condição única usada para LISTAR e para RESERVAR um envio (as duas precisam concordar).
const PRONTO_PARA_ENVIO = `criado_em >= DATE_SUB(NOW(), INTERVAL 1 DAY)
        AND tentativas < ${MAX_TENTATIVAS}
        AND ((status = 'PENDENTE' AND
              (tentativas = 0 OR atualizado_em < DATE_SUB(NOW(), INTERVAL LEAST(POW(2, tentativas - 1), 30) MINUTE)))
             OR (status = 'ENVIANDO' AND bloqueado_em < DATE_SUB(NOW(), INTERVAL 5 MINUTE)))`;

// ALERTAS_EQUIPE=criticos -> secretaria e portaria recebem por e-mail só atraso/não retorno
// (saídas e retornos normais elas já veem na tela em tempo real). Economiza a cota diária do
// Brevo (300/dia no plano gratuito). Padrão: "todos" (comportamento original).
function equipeRecebe(tipo) {
    const modo = String(process.env.ALERTAS_EQUIPE || 'todos').trim().toLowerCase();
    return modo !== 'criticos' || !TIPOS_MOVIMENTO.includes(tipo);
}

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
    const destinatarios = (await buscarDestinatarios(pedido))
        .filter(p => !['SECRETARIA', 'PORTARIA'].includes(p.categoria) || equipeRecebe(tipo));
    let novos = 0;
    for (const pessoa of destinatarios) {
        const [resultado] = await db.query(`INSERT IGNORE INTO alertas_email_envios
          (pedido_id, tipo_evento, email_destino, categoria)
          VALUES (?, ?, ?, ?)`, [pedidoId, tipo, pessoa.email, pessoa.categoria]);
        novos += resultado.affectedRows || 0;
    }
    return novos;
}

// Mais novos (menos tentativas) primeiro: um e-mail que está falhando não segura a fila.
async function listarEnviosPendentes() {
    const [rows] = await db.query(`SELECT envio_id, pedido_id, tipo_evento, email_destino, categoria, tentativas
      FROM alertas_email_envios
      WHERE ${PRONTO_PARA_ENVIO}
      ORDER BY tentativas ASC, criado_em ASC, envio_id ASC LIMIT 100`);
    return rows;
}

async function reservarEnvio(id) {
    const [resultado] = await db.query(`UPDATE alertas_email_envios
      SET status = 'ENVIANDO', bloqueado_em = NOW(), atualizado_em = NOW(),
          tentativas = tentativas + 1
      WHERE envio_id = ? AND ${PRONTO_PARA_ENVIO}`, [id]);
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

// Falha temporária volta para a fila (com espera crescente). Falha permanente (e-mail
// inválido, remetente recusado...) ou tentativas esgotadas: descarta e guarda o motivo,
// visível na tela "Ver alertas" da secretaria.
async function falharEnvio(id, erro) {
    const msg = String(erro?.message || erro);
    await db.query(`UPDATE alertas_email_envios
      SET status = IF(? OR tentativas >= ${MAX_TENTATIVAS}, 'DESCARTADO', 'PENDENTE'),
          atualizado_em = NOW(), bloqueado_em = NULL,
          ultimo_erro = IF(? OR tentativas >= ${MAX_TENTATIVAS}, LEFT(CONCAT('Não enviado: ', ?), 255), LEFT(?, 255))
      WHERE envio_id = ? AND status = 'ENVIANDO'`,
    [!!erro?.permanente, !!erro?.permanente, msg, msg, id]);
}

// Para avisar no log quando a cota diária do Brevo gratuito (300/dia) está acabando.
async function contarEnviadosHoje() {
    const [[r]] = await db.query(`SELECT COUNT(*) AS total FROM alertas_email_envios
      WHERE status = 'ENVIADO' AND enviado_em >= CURDATE()`);
    return Number(r?.total) || 0;
}

module.exports = {
    listarEventosRecentes, buscarDestinatarios, enfileirar,
    listarEnviosPendentes, reservarEnvio, concluirEnvio, falharEnvio,
    destinatarioAindaAutorizado, descartarEnvio, contarEnviadosHoje, equipeRecebe, MAX_TENTATIVAS
};
