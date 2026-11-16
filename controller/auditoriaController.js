// Tela "Auditoria": quem fez o quê e quando (secretaria e administração).
const modelo = require('../model/auditoriaModel');
const { registrar, ROTULOS } = require('../utils/auditoria');

const data = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
function lerFiltros(q) {
    return {
        de: data(q.de), ate: data(q.ate),
        acao: typeof q.acao === 'string' && ROTULOS[q.acao] ? q.acao : null,
        usuario: /^[1-9]\d{0,9}$/.test(String(q.usuario || '')) ? Number(q.usuario) : null,
        busca: typeof q.busca === 'string' && q.busca.trim() ? q.busca.trim().slice(0, 80) : null
    };
}
const csv = v => {
    const t = String(v ?? '');
    const seguro = /^[=+\-@\t\r]/.test(t) ? "'" + t : t; // evita fórmula maliciosa ao abrir no Excel
    return /[";\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
};

module.exports = {
    acoes: (req, res) => res.json(Object.entries(ROTULOS).map(([acao, rotulo]) => ({ acao, rotulo }))),

    listar: async (req, res) => {
        try {
            const pagina = Math.max(1, Math.min(Number(req.query.pagina) || 1, 10000));
            const porPagina = 50;
            const r = await modelo.listar(lerFiltros(req.query), porPagina, (pagina - 1) * porPagina);
            res.json({ ...r, pagina, porPagina });
        } catch (err) { console.error('[auditoria] listar:', err.message); res.status(500).json({ erro: 'Não foi possível carregar a auditoria.' }); }
    },

    exportar: async (req, res) => {
        try {
            const { registros } = await modelo.listar(lerFiltros(req.query), 20000, 0);
            const linhas = [['Data e hora', 'Usuário', 'Perfil', 'Ação', 'Descrição', 'IP'].join(';')];
            for (const r of registros) {
                linhas.push([new Date(r.criado_em).toLocaleString('pt-BR'), r.usuario_nome || 'Sistema', r.papel || '', ROTULOS[r.acao] || r.acao, r.descricao, r.ip || ''].map(csv).join(';'));
            }
            res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="auditoria.csv"' });
            res.send('﻿' + linhas.join('\r\n'));
        } catch (err) { console.error('[auditoria] exportar:', err.message); res.status(500).json({ erro: 'Não foi possível exportar a auditoria.' }); }
    },

    trilhaPedido: async (req, res) => {
        try { res.json(await modelo.trilhaDoPedido(Number(req.params.id))); }
        catch (err) { console.error('[auditoria] trilha:', err.message); res.status(500).json({ erro: 'Não foi possível carregar o histórico do pedido.' }); }
    },

    // Portaria: o aluno que apareceu NÃO confere com a foto. Registra e avisa a secretaria.
    identificacao: async (req, res) => {
        try {
            const pedido_id = Number(req.body?.pedido_id);
            if (!Number.isInteger(pedido_id) || pedido_id <= 0) return res.status(400).json({ erro: 'Pedido inválido.' });
            const pedido = await require('../model/pedidosModel').buscarParaNotificacao(pedido_id);
            if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
            const texto = `ATENÇÃO: na portaria, a pessoa que se apresentou para a saída de ${pedido.nome_aluno}${pedido.turma ? ` (${pedido.turma})` : ''} NÃO confere com a foto cadastrada. A saída não foi registrada.`;
            registrar(req, 'IDENTIFICACAO_NAO_CONFERE', { alvo_tipo: 'PEDIDO', alvo_id: pedido_id, descricao: texto });
            try {
                const equipe = require('../model/chatEquipeModel');
                const { id } = await equipe.enviar(req.usuario.id_usuario, equipe.ladoDoPapel(req.usuario.tipo_usuario), texto, null);
                const mensagem = await equipe.buscar(id);
                require('../utils/tempoReal').publicarParaPapeis(['SECRETARIA', 'ADMIN', 'PORTARIA', 'PORTEIRO'], 'equipe:mensagem', { mensagem });
                require('../utils/push').enviarParaPapeis(['SECRETARIA', 'ADMIN'], { titulo: 'Portaria: aluno não confere', corpo: texto.slice(0, 160), url: '/secretaria.html?tela=tela-equipe', tag: `ident-${pedido_id}`, urgente: true });
            } catch (e) { console.error('[auditoria] aviso à secretaria:', e.message); }
            res.status(201).json({ mensagem: 'Registrado. A secretaria foi avisada.' });
        } catch (err) { console.error('[auditoria] identificacao:', err.message); res.status(500).json({ erro: 'Não foi possível registrar.' }); }
    },
    _lerFiltros: lerFiltros, _csv: csv
};
