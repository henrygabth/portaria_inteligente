// pedidosModel.js
const db = require('../config/banco');
const historico = require('./historicoModel');

// Cadastrar novo pedido (Pai cria -> PENDENTE)
// Também grava o primeiro registro no histórico (status_anterior = null)
<<<<<<< HEAD
// hora_prevista_retorno e recorrente_id são opcionais: o primeiro alimenta o
// alerta de atraso, o segundo só é preenchido quando o pedido foi gerado
// automaticamente a partir de um molde recorrente.
async function cadastrar(aluno_id, nome_aluno, turma_id, solicitante_id, hora_prevista_saida, motivo, observacoes, hora_prevista_retorno = null, recorrente_id = null) {
    const [result] = await db.query(
        `INSERT INTO pedidos_saida (aluno_id, recorrente_id, nome_aluno, turma_id, solicitante_id, hora_prevista_saida, hora_prevista_retorno, motivo, observacoes, status, data_criacao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE', NOW())`,
        [aluno_id, recorrente_id, nome_aluno, turma_id, solicitante_id, hora_prevista_saida, hora_prevista_retorno, motivo, observacoes]
=======
async function cadastrar(aluno_id, nome_aluno, turma_id, solicitante_id, hora_prevista_saida, motivo, observacoes) {
    const [result] = await db.query(
        `INSERT INTO pedidos_saida (aluno_id, nome_aluno, turma_id, solicitante_id, hora_prevista_saida, motivo, observacoes, status, data_criacao)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDENTE', NOW())`,
        [aluno_id, nome_aluno, turma_id, solicitante_id, hora_prevista_saida, motivo, observacoes]
>>>>>>> 4f592c031e07562a0df70c9cabbe1e2474f1b4e7
    );

    const pedido_id = result.insertId;

<<<<<<< HEAD
    await historico.registrar(pedido_id, solicitante_id, null, 'PENDENTE', recorrente_id ? 'Solicitação gerada automaticamente (pedido recorrente)' : 'Solicitação criada pelo responsável');
=======
    await historico.registrar(pedido_id, solicitante_id, null, 'PENDENTE', 'Solicitação criada pelo responsável');
>>>>>>> 4f592c031e07562a0df70c9cabbe1e2474f1b4e7

    return pedido_id;
}

// Atualizar status de um pedido (aprovar / rejeitar / liberar / retorno)
// Também grava, na mesma operação, o registro correspondente no histórico imutável
async function atualizarStatus(pedido_id, statusNovo, usuario_id, observacao = null) {
    // 1. Descobre o status atual, para registrar a transição completa no histórico
    const [pedidoAtual] = await db.query(
        'SELECT status FROM pedidos_saida WHERE pedidos_saida_id = ?',
        [pedido_id]
    );
    if (pedidoAtual.length === 0) {
        return false; // pedido não existe
    }
    const statusAnterior = pedidoAtual[0].status;

    let camposExtras = '';
    // Registra a hora real de saída na portaria
    if (statusNovo === 'EM_SAIDA') {
        camposExtras = ', hora_saida_real = NOW()';
    }
    // Registra a hora real de retorno na portaria
    else if (statusNovo === 'CONCLUIDA') {
        camposExtras = ', hora_retorno_real = NOW()';
    }

    // 2. Atualiza o pedido
    const [result] = await db.query(
        `UPDATE pedidos_saida
         SET status = ?, usuario_id = ?, observacao = ?${camposExtras}, data_atualizacao = NOW()
         WHERE pedidos_saida_id = ?`,
        [statusNovo, usuario_id, observacao, pedido_id]
    );

    if (result.affectedRows === 0) {
        return false;
    }

    // 3. Grava a transição no histórico imutável
    await historico.registrar(pedido_id, usuario_id, statusAnterior, statusNovo, observacao);

    return true;
}

// Base do SELECT usada nas buscas de pedidos, já com os JOINs necessários
const SELECT_BASE = `
    SELECT p.pedidos_saida_id, p.nome_aluno, p.data_criacao, p.hora_prevista_saida,
<<<<<<< HEAD
           p.hora_prevista_retorno, p.recorrente_id,
=======
>>>>>>> 4f592c031e07562a0df70c9cabbe1e2474f1b4e7
           p.status, p.motivo, p.observacoes, p.observacao,
           p.hora_saida_real, p.hora_retorno_real,
           t.sala_turma AS turma, t.turno,
           sol.nome AS responsavel,
<<<<<<< HEAD
           usu.nome AS aprovador,
           (p.status = 'EM_SAIDA' AND p.hora_prevista_retorno IS NOT NULL
                AND NOW() > DATE_ADD(p.hora_prevista_retorno, INTERVAL 5 MINUTE)) AS atrasado
=======
           usu.nome AS aprovador
>>>>>>> 4f592c031e07562a0df70c9cabbe1e2474f1b4e7
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
// (recusa pela secretaria ou cancelamento pela portaria).
async function buscarParaNotificacao(pedido_id) {
    const sql = `
        SELECT p.pedidos_saida_id, p.nome_aluno, p.hora_prevista_saida,
               sol.nome AS responsavel_nome, sol.email AS responsavel_email
        FROM pedidos_saida p
        JOIN usuarios sol ON p.solicitante_id = sol.id_usuario
        WHERE p.pedidos_saida_id = ?
    `;
    const [rows] = await db.query(sql, [pedido_id]);
    return rows[0] || null;
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

<<<<<<< HEAD
// ==========================================
// ALERTA DE ATRASO NO RETORNO
// ==========================================

// Pedidos com aluno em saída (EM_SAIDA), com horário previsto de retorno já
// passado há mais de 5 minutos, que ainda não geraram alerta.
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
    buscarParaNotificacao, obterStatus, buscarAtrasadosParaAlerta, buscarAtrasados,
    marcarAlertaEnviado, obterEstatisticas
};

=======
module.exports = {
    cadastrar, atualizarStatus, buscarPorStatus, buscarPorSolicitante, buscarHistorico,
    buscarParaNotificacao, obterStatus
};
>>>>>>> 4f592c031e07562a0df70c9cabbe1e2474f1b4e7
