// model/relatoriosModel.js — relatório de saídas por período (tela "Relatórios" da secretaria).
// Busca os pedidos do período UMA vez e calcula tudo em JavaScript (montarRelatorio), assim os
// números do resumo, dos gráficos e da tabela saem sempre da mesma base e batem entre si.
// Um pedido pertence ao dia da SAÍDA PREVISTA (hora_prevista_saida).
const db = require('../config/banco');

const TOLERANCIA_MIN = 5;      // mesmo critério do alerta de atraso
const MAX_LINHAS = 20000;

async function buscarPedidosDoPeriodo(inicio, fim, turmaId = null) {
    const params = [inicio, fim];
    let filtroTurma = '';
    if (turmaId) { filtroTurma = ' AND p.turma_id = ?'; params.push(turmaId); }
    params.push(MAX_LINHAS);
    const [linhas] = await db.query(`
        SELECT p.pedidos_saida_id AS id, p.nome_aluno AS aluno, p.turma_id, t.sala_turma AS turma, p.tipo, p.motivo, p.status,
               p.data_criacao AS criado_em, p.hora_prevista_saida AS saida_prevista, p.hora_saida_real AS saida_real,
               p.hora_prevista_retorno AS retorno_previsto, p.hora_retorno_real AS retorno_real,
               (SELECT MIN(h.data_mudanca) FROM historico_pedidos h
                 WHERE h.pedido_id = p.pedidos_saida_id AND h.status_novo IN ('APROVADA', 'RECUSADA')) AS decidido_em,
               (p.recorrente_id IS NOT NULL) AS recorrente
          FROM pedidos_saida p
          LEFT JOIN turmas t ON t.id_turma = p.turma_id
         WHERE DATE(p.hora_prevista_saida) BETWEEN ? AND ?${filtroTurma}
         ORDER BY p.hora_prevista_saida ASC
         LIMIT ?`, params);
    return linhas;
}

async function situacaoAgora() {
    const [[r]] = await db.query(`
        SELECT SUM(status = 'PENDENTE') AS pendentes,
               SUM(status = 'APROVADA') AS aguardandoSaida,
               SUM(status = 'EM_SAIDA') AS foraDaEscola,
               SUM(status = 'EM_SAIDA' AND hora_prevista_retorno IS NOT NULL
                   AND NOW() > DATE_ADD(hora_prevista_retorno, INTERVAL ${TOLERANCIA_MIN} MINUTE)) AS atrasados
          FROM pedidos_saida`);
    return {
        pendentes: Number(r?.pendentes) || 0,
        aguardandoSaida: Number(r?.aguardandoSaida) || 0,
        foraDaEscola: Number(r?.foraDaEscola) || 0,
        atrasados: Number(r?.atrasados) || 0
    };
}

// ------------------------------------------------------------------ cálculo (sem banco)
const pad = n => String(n).padStart(2, '0');
const diaLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const minutos = (a, b) => (a && b) ? Math.round((new Date(b) - new Date(a)) / 60000) : null;
const media = arr => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;
const mediana = arr => {
    if (!arr.length) return null;
    const o = [...arr].sort((a, b) => a - b), m = Math.floor(o.length / 2);
    return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2);
};

function diasEntre(inicio, fim) {
    const dias = [];
    const d = new Date(`${inicio}T12:00:00`), f = new Date(`${fim}T12:00:00`);
    while (d <= f && dias.length < 400) { dias.push(diaLocal(d)); d.setDate(d.getDate() + 1); }
    return dias;
}

// Situação de cada pedido quanto ao retorno: 'no_prazo', 'atrasado', 'fora_atrasado' (ainda fora
// e já passou do horário), 'fora' (ainda fora, dentro do prazo), 'sem_retorno' (foi para casa ou
// não tinha horário de volta) ou null (não chegou a sair).
function situacaoRetorno(p, agora) {
    if (!p.saida_real) return null;
    if (p.tipo === 'CASA' || !p.retorno_previsto) return 'sem_retorno';
    const limite = new Date(p.retorno_previsto).getTime() + TOLERANCIA_MIN * 60000;
    if (p.retorno_real) return new Date(p.retorno_real).getTime() > limite ? 'atrasado' : 'no_prazo';
    return agora.getTime() > limite ? 'fora_atrasado' : 'fora';
}

function montarRelatorio(linhas, inicio, fim, agora = new Date()) {
    const dias = diasEntre(inicio, fim);
    const porDia = Object.fromEntries(dias.map(d => [d, { dia: d, pedidos: 0, saidas: 0, atrasos: 0 }]));
    const porHora = Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 }));
    const turmas = {}, motivos = {}, alunos = {};
    const status = { PENDENTE: 0, APROVADA: 0, RECUSADA: 0, EM_SAIDA: 0, CONCLUIDA: 0, CANCELADA: 0 };
    const temposFora = [], temposResposta = [], atrasosMin = [];
    let saidas = 0, paraCasa = 0, retornosNoPrazo = 0, retornosAtrasados = 0, aindaForaAtrasados = 0, recorrentes = 0, decididos = 0, aprovados = 0;

    const detalhes = linhas.map(p => {
        const dia = diaLocal(new Date(p.saida_prevista));
        const sit = situacaoRetorno(p, agora);
        const atrasado = sit === 'atrasado' || sit === 'fora_atrasado';
        const atrasoMin = sit === 'atrasado' ? minutos(p.retorno_previsto, p.retorno_real)
            : sit === 'fora_atrasado' ? minutos(p.retorno_previsto, agora) : null;

        status[p.status] = (status[p.status] || 0) + 1;
        if (Number(p.recorrente)) recorrentes++;
        if (porDia[dia]) porDia[dia].pedidos++;
        const nomeTurma = p.turma || 'Sem turma';
        const t = turmas[nomeTurma] = turmas[nomeTurma] || { turma: nomeTurma, pedidos: 0, saidas: 0, atrasos: 0 };
        t.pedidos++;
        const motivo = String(p.motivo || 'Sem motivo informado').trim() || 'Sem motivo informado';
        motivos[motivo] = (motivos[motivo] || 0) + 1;

        if (p.decidido_em) {
            decididos++;
            if (p.status !== 'RECUSADA') aprovados++;
            const r = minutos(p.criado_em, p.decidido_em);
            if (r !== null && r >= 0) temposResposta.push(r);
        }
        if (p.saida_real) {
            saidas++; t.saidas++;
            if (porDia[dia]) porDia[dia].saidas++;
            porHora[new Date(p.saida_real).getHours()].total++;
            if (p.tipo === 'CASA') paraCasa++;
            const chave = `${p.aluno}|${nomeTurma}`;
            const a = alunos[chave] = alunos[chave] || { aluno: p.aluno, turma: nomeTurma, saidas: 0, atrasos: 0 };
            a.saidas++;
            if (atrasado) a.atrasos++;
        }
        if (sit === 'no_prazo') retornosNoPrazo++;
        if (sit === 'atrasado') retornosAtrasados++;
        if (sit === 'fora_atrasado') aindaForaAtrasados++;
        if (atrasado) { t.atrasos++; if (porDia[dia]) porDia[dia].atrasos++; if (atrasoMin !== null) atrasosMin.push(atrasoMin); }
        if (p.retorno_real && p.saida_real) { const m = minutos(p.saida_real, p.retorno_real); if (m !== null && m >= 0) temposFora.push(m); }

        return {
            id: p.id, aluno: p.aluno, turma: nomeTurma, tipo: p.tipo === 'CASA' ? 'CASA' : 'ALMOCO', motivo, status: p.status,
            saida_prevista: p.saida_prevista, saida_real: p.saida_real, retorno_previsto: p.retorno_previsto, retorno_real: p.retorno_real,
            situacao: sit, atraso_min: atrasoMin
        };
    });

    const retornosAvaliados = retornosNoPrazo + retornosAtrasados;
    const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : null;
    return {
        periodo: { inicio, fim, dias: dias.length },
        resumo: {
            pedidos: linhas.length,
            saidas,
            paraCasa,
            recorrentes,
            retornosNoPrazo,
            retornosAtrasados,
            aindaForaAtrasados,
            pontualidade: pct(retornosNoPrazo, retornosAvaliados),
            taxaAprovacao: pct(aprovados, decididos),
            tempoMedioForaMin: media(temposFora),
            tempoMedianoForaMin: mediana(temposFora),
            tempoMedioRespostaMin: media(temposResposta),
            atrasoMedioMin: media(atrasosMin),
            mediaSaidasPorDia: dias.length ? Math.round(saidas / dias.length * 10) / 10 : 0
        },
        status,
        porDia: dias.map(d => porDia[d]),
        porHora: porHora.filter(h => h.total > 0),
        porTurma: Object.values(turmas).sort((a, b) => b.saidas - a.saidas || b.pedidos - a.pedidos),
        porMotivo: Object.entries(motivos).map(([motivo, total]) => ({ motivo, total })).sort((a, b) => b.total - a.total).slice(0, 8),
        alunosFrequentes: Object.values(alunos).sort((a, b) => b.saidas - a.saidas || b.atrasos - a.atrasos).slice(0, 10),
        detalhes,
        truncado: linhas.length >= MAX_LINHAS,
        toleranciaMin: TOLERANCIA_MIN
    };
}

module.exports = { buscarPedidosDoPeriodo, situacaoAgora, montarRelatorio, situacaoRetorno, diasEntre, TOLERANCIA_MIN };
