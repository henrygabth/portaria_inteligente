// controller/relatoriosController.js — GET /api/relatorios?inicio=AAAA-MM-DD&fim=AAAA-MM-DD&turma=ID
const relatorios = require('../model/relatoriosModel');

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 366;
const pad = n => String(n).padStart(2, '0');
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dataValida = s => DATA.test(s) && !Number.isNaN(new Date(`${s}T12:00:00`).getTime()) && new Date(`${s}T12:00:00`).toISOString().slice(0, 10) === s;

function lerPeriodo(query) {
    const hoje = hojeLocal();
    const inicio = String(query.inicio || hoje), fim = String(query.fim || inicio);
    if (!dataValida(inicio) || !dataValida(fim)) return { erro: 'Datas inválidas. Use o formato AAAA-MM-DD.' };
    if (inicio > fim) return { erro: 'A data inicial precisa ser anterior à final.' };
    const dias = Math.round((new Date(`${fim}T12:00:00`) - new Date(`${inicio}T12:00:00`)) / 864e5) + 1;
    if (dias > MAX_DIAS) return { erro: 'Escolha um período de até 1 ano.' };
    let turma = null;
    if (query.turma !== undefined && query.turma !== '') {
        turma = Number(query.turma);
        if (!Number.isInteger(turma) || turma <= 0) return { erro: 'Turma inválida.' };
    }
    return { inicio, fim, turma };
}

module.exports = {
    lerPeriodo,
    gerar: async (req, res) => {
        const periodo = lerPeriodo(req.query);
        if (periodo.erro) return res.status(400).json({ erro: periodo.erro });
        try {
            const [linhas, agora] = await Promise.all([
                relatorios.buscarPedidosDoPeriodo(periodo.inicio, periodo.fim, periodo.turma),
                relatorios.situacaoAgora()
            ]);
            const relatorio = relatorios.montarRelatorio(linhas, periodo.inicio, periodo.fim);
            res.json({ ...relatorio, agora, turmaFiltro: periodo.turma, geradoEm: new Date().toISOString() });
        } catch (error) {
            console.error('Erro ao gerar relatório:', error);
            res.status(500).json({ erro: 'Não foi possível gerar o relatório agora.' });
        }
    }
};
