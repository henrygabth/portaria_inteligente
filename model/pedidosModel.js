// pedidosModel.js
const db = require('../config/banco');
const historico = require('./historicoModel');

// Cadastrar novo pedido (Pai cria -> PENDENTE)
// Também grava o primeiro registro no histórico (status_anterior = null)
// hora_prevista_retorno e recorrente_id são opcionais: o primeiro alimenta o
// alerta de atraso, o segundo só é preenchido quando o pedido foi gerado
// automaticamente a partir de um molde recorrente.
async function cadastrar(aluno_id, nome_aluno, turma_id, solicitante_id, hora_prevista_saida, motivo, observacoes, hora_prevista_retorno = null, recorrente_id = null) {
    const [result] = await db.query(
        `INSERT INTO pedidos_saida (aluno_id, recorrente_id, nome_aluno, turma_id, solicitante_id, hora_prevista_saida, hora_prevista_retorno, motivo, observacoes, status, data_criacao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE', NOW())`,
        [aluno_id, recorrente_id, nome_aluno, turma_id, solicitante_id, hora_prevista_saida, hora_prevista_retorno, motivo, observacoes]
    );

    const pedido_id = result.insertId;

    await historico.registrar(pedido_id, solicitante_id, null, 'PENDENTE', recorrente_id ? 'Solicitação gerada automaticamente (pedido recorrente)' : 'Solicitação criada pelo responsável');

    return pedido_id;
}

// Atualizar status de um pedido (aprovar / rejeitar / liberar / retorno)
// Também grava, na mesma operação, o registro correspondente no histórico imutável
async function atualizarStatus(pedido_id, statusNovo, usuario_id, observacao = null) {
    const transicoes = {
        APROVADA: 'PENDENTE', RECUSADA: 'PENDENTE',
        EM_SAIDA: 'APROVADA', CONCLUIDA: 'EM_SAIDA', CANCELADA: 'APROVADA'
    };
    const anteriorEsperado = transicoes[statusNovo];
    if (!anteriorEsperado) throw new Error('Transição de status desconhecida.');
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        // FOR UPDATE evita aprovações/saídas simultâneas e duplicações de comunicados.
        const [atuais] = await conn.query('SELECT status FROM pedidos_saida WHERE pedidos_saida_id = ? FOR UPDATE', [pedido_id]);
        if (!atuais.length) { await conn.rollback(); return false; }
        if (atuais[0].status !== anteriorEsperado) {
            await conn.rollback(); const e = new Error('O pedido mudou de situação. Atualize a lista.'); e.status = 409; throw e;
        }
        const extras = statusNovo === 'EM_SAIDA' ? ', hora_saida_real = NOW()'
            : statusNovo === 'CONCLUIDA' ? ', hora_retorno_real = NOW()' : '';
        await conn.query(`UPDATE pedidos_saida SET status = ?, usuario_id = ?, observacao = ?,
          data_atualizacao = NOW()${extras} WHERE pedidos_saida_id = ?`,
        [statusNovo, usuario_id, observacao, pedido_id]);
        await conn.query(`INSERT INTO historico_pedidos
          (pedido_id, usuario_id, status_anterior, status_novo, observacao)
          VALUES (?, ?, ?, ?, ?)`, [pedido_id, usuario_id, anteriorEsperado, statusNovo, observacao]);
        // Ao registrar retorno atrasado, preserva a ordem lógica: atraso primeiro,
        // retorno por último. Se o agendador já avisou, UNIQUE impede duplicação.
        if (statusNovo === 'CONCLUIDA') {
            const [atraso] = await conn.query(`SELECT
              (hora_prevista_retorno IS NOT NULL AND hora_retorno_real > DATE_ADD(hora_prevista_retorno, INTERVAL 5 MINUTE)) AS passou_cinco
              FROM pedidos_saida WHERE pedidos_saida_id = ?`, [pedido_id]);
            if (atraso[0]?.passou_cinco) await require('./professoresModel').registrarEvento(conn, pedido_id, 'ATRASADO');
            // Qualquer ocorrência aberta de atraso/não retorno fica resolvida no momento
            // em que a portaria registra o retorno. A auditoria continua preservada.
            try {
                await require('./ocorrenciasModel').resolverPendentes(pedido_id, conn);
            } catch (erroAuditoria) {
                // A rastreabilidade é importante, mas não pode impedir o aluno de ter
                // o retorno registrado se a tabela de auditoria estiver indisponível.
                console.error('[ocorrencias] Falha ao resolver ocorrências do pedido:', erroAuditoria.message);
            }
        }
        const tipoAviso = { APROVADA: 'APROVADA', EM_SAIDA: 'SAIDA', CONCLUIDA: 'RETORNO' }[statusNovo];
        if (tipoAviso) await require('./professoresModel').registrarEvento(conn, pedido_id, tipoAviso);
        await conn.commit();
        return true;
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
}

// Base do SELECT usada nas buscas de pedidos, já com os JOINs necessários
const SELECT_BASE = `
    SELECT p.pedidos_saida_id, p.nome_aluno, p.data_criacao, p.hora_prevista_saida,
           p.hora_prevista_retorno, p.recorrente_id,
           p.status, p.motivo, p.observacoes, p.observacao,
           p.hora_saida_real, p.hora_retorno_real,
           t.sala_turma AS turma, t.turno,
           sol.nome AS responsavel,
           usu.nome AS aprovador,
           (SELECT u2.nome FROM historico_pedidos h
              JOIN usuarios u2 ON h.usuario_id = u2.id_usuario
             WHERE h.pedido_id = p.pedidos_saida_id AND h.status_novo IN ('APROVADA', 'RECUSADA')
             ORDER BY h.id_historico DESC LIMIT 1) AS secretario,
           (p.status = 'EM_SAIDA' AND p.hora_prevista_retorno IS NOT NULL
                AND NOW() > DATE_ADD(p.hora_prevista_retorno, INTERVAL 5 MINUTE)) AS atrasado
    FROM pedidos_saida p
    LEFT JOIN turmas t ON p.turma_id = t.id_turma
    LEFT JOIN usuarios sol ON p.solicitante_id = sol.id_usuario
    LEFT JOIN usuarios usu ON p.usuario_id = usu.id_usuario
`;

// Buscar pedidos por status (Secretaria/Portaria)
async function buscarPorStatus(status) {
    let sql = SELECT_BASE;
    const params = [];

    if (status) {
        sql += ` WHERE p.status = ?`;
        params.push(status);
    }
    sql += ` ORDER BY p.data_criacao ASC`;

    const [rows] = await db.query(sql, params);
    return rows;
}

// Histórico geral da secretaria: tudo que já foi decidido ou seguiu adiante
// (aprovada, recusada, em saída, concluída, cancelada), do mais recente ao mais antigo.
async function buscarHistoricoGeral(limite = 300) {
    const sql = `${SELECT_BASE} WHERE p.status <> 'PENDENTE'
                 ORDER BY COALESCE(p.data_atualizacao, p.data_criacao) DESC LIMIT ?`;
    const [rows] = await db.query(sql, [Number(limite) || 300]);
    return rows;
}

// Buscar pedidos feitos por um solicitante (Pai/Histórico)
async function buscarPorSolicitante(solicitante_id) {
    const sql = `${SELECT_BASE} WHERE p.solicitante_id = ? ORDER BY p.data_criacao DESC`;
    const [rows] = await db.query(sql, [solicitante_id]);
    return rows;
}

// Buscar o histórico completo (linha do tempo) de um pedido específico
async function buscarHistorico(pedido_id) {
    return historico.listarPorPedido(pedido_id);
}

// Busca os dados necessários para notificar o responsável por e-mail
// (recusa, cancelamento, saída, retorno).
async function buscarParaNotificacao(pedido_id) {
    const sql = `
        SELECT p.pedidos_saida_id, p.status, p.aluno_id, p.turma_id, p.solicitante_id, p.nome_aluno,
               p.hora_prevista_saida, p.hora_prevista_retorno, p.hora_saida_real, p.hora_retorno_real,
               t.sala_turma AS turma,
               sol.nome AS responsavel_nome, sol.email AS responsavel_email
        FROM pedidos_saida p
        JOIN usuarios sol ON p.solicitante_id = sol.id_usuario
        LEFT JOIN turmas t ON p.turma_id = t.id_turma
        WHERE p.pedidos_saida_id = ?
    `;
    const [rows] = await db.query(sql, [pedido_id]);
    return rows[0] || null;
}

// Todos os responsáveis que devem receber os avisos sobre este pedido:
// quem criou o pedido + todos os responsáveis vinculados ao aluno (pai, mãe...).
// Sem e-mails repetidos.
async function buscarDestinatariosPais(pedido) {
    const params = [pedido.solicitante_id];
    let sql = `SELECT id_usuario, nome, email FROM usuarios
               WHERE email IS NOT NULL AND email <> ''
                 AND (id_usuario = ?`;
    if (pedido.aluno_id) {
        sql += ` OR id_usuario IN (SELECT usuario_id FROM responsaveis_alunos WHERE aluno_id = ?)`;
        params.push(pedido.aluno_id);
    }
    sql += `)`;
    const [rows] = await db.query(sql, params);

    const vistos = new Set();
    return rows.filter(r => {
        const chave = String(r.email).trim().toLowerCase();
        if (vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
    });
}

// Retorna apenas o status atual do pedido (usado para validar transições,
// ex: só cancelar na portaria um pedido que ainda está APROVADA).
async function obterStatus(pedido_id) {
    const [rows] = await db.query(
        'SELECT status FROM pedidos_saida WHERE pedidos_saida_id = ?',
        [pedido_id]
    );
    return rows.length > 0 ? rows[0].status : null;
}

// ==========================================
// ALERTA DE ATRASO NO RETORNO
// ==========================================

// Pedidos com aluno em saída (EM_SAIDA), com horário previsto de retorno já
// passado há mais de 5 minutos, que ainda não geraram alerta.
async function listarEmAtrasoParaProfessor() {
    const [rows] = await db.query(`SELECT pedidos_saida_id,
      (NOW() > DATE_ADD(hora_prevista_retorno, INTERVAL 15 MINUTE)) AS nao_retornou
      FROM pedidos_saida WHERE status = 'EM_SAIDA' AND hora_prevista_retorno IS NOT NULL
      AND NOW() > DATE_ADD(hora_prevista_retorno, INTERVAL 5 MINUTE)
      AND hora_prevista_retorno >= DATE_SUB(NOW(), INTERVAL 1 DAY)`);
    return rows;
}

async function buscarAtrasadosParaAlerta() {
    const sql = `
        SELECT p.pedidos_saida_id, p.nome_aluno, p.hora_prevista_retorno,
               t.sala_turma AS turma
        FROM pedidos_saida p
        LEFT JOIN turmas t ON p.turma_id = t.id_turma
        WHERE p.status = 'EM_SAIDA'
          AND p.hora_prevista_retorno IS NOT NULL
          AND NOW() > DATE_ADD(p.hora_prevista_retorno, INTERVAL 5 MINUTE)
          AND p.alerta_atraso_enviado = 0
    `;
    const [rows] = await db.query(sql);
    return rows;
}

// Lista (para exibir em tela) todos os pedidos atualmente atrasados,
// independente de o alerta já ter sido disparado ou não.
async function buscarAtrasados() {
    const sql = `${SELECT_BASE} WHERE p.status = 'EM_SAIDA'
          AND p.hora_prevista_retorno IS NOT NULL
          AND NOW() > DATE_ADD(p.hora_prevista_retorno, INTERVAL 5 MINUTE)
        ORDER BY p.hora_prevista_retorno ASC`;
    const [rows] = await db.query(sql);
    return rows;
}

// Pedidos em que o aluno AINDA NÃO VOLTOU (passou 5 min do retorno previsto) e os
// pais ainda não foram avisados. Só considera retornos previstos nas últimas 24h,
// para nunca disparar e-mail sobre pedidos antigos.
async function buscarNaoRetornaramParaPais() {
    const sql = `
        SELECT p.pedidos_saida_id, p.aluno_id, p.solicitante_id, p.nome_aluno,
               p.hora_prevista_retorno, p.hora_saida_real, t.sala_turma AS turma
        FROM pedidos_saida p
        LEFT JOIN turmas t ON p.turma_id = t.id_turma
        WHERE p.status = 'EM_SAIDA'
          AND p.hora_prevista_retorno IS NOT NULL
          AND NOW() > DATE_ADD(p.hora_prevista_retorno, INTERVAL 5 MINUTE)
          AND p.hora_prevista_retorno >= DATE_SUB(NOW(), INTERVAL 1 DAY)
          AND p.aviso_pais_atraso_enviado = 0
    `;
    const [rows] = await db.query(sql);
    return rows;
}

async function marcarAvisoPaisEnviado(pedido_id) {
    await db.query('UPDATE pedidos_saida SET aviso_pais_atraso_enviado = 1 WHERE pedidos_saida_id = ?', [pedido_id]);
}

async function marcarAlertaEnviado(pedido_id) {
    await db.query('UPDATE pedidos_saida SET alerta_atraso_enviado = 1 WHERE pedidos_saida_id = ?', [pedido_id]);
}

// ==========================================
// PAINEL DE ESTATÍSTICAS (dashboard)
// ==========================================
async function obterEstatisticas(data) {
    // 1) Saídas do dia (alunos que realmente saíram, liberados pela portaria)
    const [[{ total: saidasHoje }]] = await db.query(
        `SELECT COUNT(*) AS total FROM pedidos_saida WHERE DATE(hora_saida_real) = ?`,
        [data]
    );

    // 2) Pendentes agora (snapshot atual, não filtrado por dia)
    const [[{ total: pendentes }]] = await db.query(
        `SELECT COUNT(*) AS total FROM pedidos_saida WHERE status = 'PENDENTE'`
    );

    // 3) Quantos ainda não voltaram (em saída) e quantos disso estão atrasados
    const [[{ total: emSaida }]] = await db.query(
        `SELECT COUNT(*) AS total FROM pedidos_saida WHERE status = 'EM_SAIDA'`
    );
    const [[{ total: atrasados }]] = await db.query(
        `SELECT COUNT(*) AS total FROM pedidos_saida
         WHERE status = 'EM_SAIDA' AND hora_prevista_retorno IS NOT NULL
           AND NOW() > DATE_ADD(hora_prevista_retorno, INTERVAL 5 MINUTE)`
    );

    // 4) Tempo médio de retorno (minutos) dos pedidos concluídos no dia
    const [[{ media }]] = await db.query(
        `SELECT AVG(TIMESTAMPDIFF(MINUTE, hora_saida_real, hora_retorno_real)) AS media
         FROM pedidos_saida
         WHERE status = 'CONCLUIDA' AND DATE(hora_retorno_real) = ?`,
        [data]
    );

    // 5) Turmas que mais pedem saída no dia
    const [turmasRanking] = await db.query(
        `SELECT t.sala_turma AS turma, COUNT(*) AS total
         FROM pedidos_saida p
         LEFT JOIN turmas t ON p.turma_id = t.id_turma
         WHERE DATE(p.data_criacao) = ?
         GROUP BY p.turma_id
         ORDER BY total DESC
         LIMIT 5`,
        [data]
    );

    // 6) Horários de pico (pedidos agrupados por hora do dia)
    const [horariosPico] = await db.query(
        `SELECT HOUR(hora_prevista_saida) AS hora, COUNT(*) AS total
         FROM pedidos_saida
         WHERE DATE(data_criacao) = ?
         GROUP BY HOUR(hora_prevista_saida)
         ORDER BY hora ASC`,
        [data]
    );

    return {
        data,
        saidasHoje,
        pendentes,
        emSaida,
        atrasados,
        tempoMedioRetornoMin: media ? Math.round(media) : null,
        turmasRanking,
        horariosPico
    };
}

module.exports = {
    cadastrar, atualizarStatus, buscarPorStatus, buscarPorSolicitante, buscarHistorico,
    buscarParaNotificacao, buscarDestinatariosPais, obterStatus, buscarAtrasadosParaAlerta, buscarAtrasados,
    buscarNaoRetornaramParaPais, marcarAvisoPaisEnviado, buscarHistoricoGeral,
    marcarAlertaEnviado, obterEstatisticas, listarEmAtrasoParaProfessor
};

