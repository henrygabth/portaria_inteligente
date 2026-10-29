const db = require('../config/banco');

const TIPOS = ['ATRASADO', 'NAO_RETORNOU', 'CHEGOU_ATRASADO'];

async function registrar(pedidoId, tipo, conn = db) {
    if (!TIPOS.includes(tipo)) throw new Error('Tipo de ocorrência inválido.');
    const detalhe = {
        ATRASADO: 'Retorno ultrapassou 5 minutos do horário previsto.',
        NAO_RETORNOU: 'Aluno permanece sem retorno registrado após 15 minutos do horário previsto.',
        CHEGOU_ATRASADO: 'Retorno foi registrado depois do limite de tolerância.'
    }[tipo];
    await conn.query(`INSERT IGNORE INTO ocorrencias_pedidos
      (pedido_id, tipo_evento, detalhe, data_evento)
      VALUES (?, ?, ?, NOW())`, [pedidoId, tipo, detalhe]);
}

async function resolverPendentes(pedidoId, conn = db) {
    await conn.query(`UPDATE ocorrencias_pedidos
      SET resolvida_em = COALESCE(resolvida_em, NOW())
      WHERE pedido_id = ? AND tipo_evento IN ('ATRASADO','NAO_RETORNOU')`, [pedidoId]);
}

async function listarAuditoria(pedidoId) {
    const [ocorrencias] = await db.query(`SELECT ocorrencia_id, tipo_evento, detalhe,
      data_evento, resolvida_em
      FROM ocorrencias_pedidos WHERE pedido_id = ?
      ORDER BY data_evento ASC, ocorrencia_id ASC`, [pedidoId]);

    const [envios] = await db.query(`SELECT tipo_evento, categoria, email_destino, status,
      tentativas, criado_em, enviado_em, ultimo_erro
      FROM alertas_email_envios WHERE pedido_id = ?
      ORDER BY criado_em ASC, envio_id ASC`, [pedidoId]);

    return { ocorrencias, envios };
}

module.exports = { registrar, resolverPendentes, listarAuditoria, TIPOS };
