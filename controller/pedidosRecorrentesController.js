// pedidosRecorrentesController.js
const pedidosRecorrentes = require('../model/pedidosRecorrentesModel');
const responsaveisAlunosModel = require('../model/responsaveisAlunosModel');
const { gerarPedidosRecorrentesDoDia } = require('../utils/agendador');

const DIAS_VALIDOS = [0, 1, 2, 3, 4, 5, 6];

const pedidosRecorrentesController = {
    // PAI: cria o horário fixo ("toda segunda a sexta, saída 12h"). Aceita vários dias de uma vez
    // (dias_semana: [1,2,3,4,5]) e continua aceitando um único dia (dia_semana).
    cadastrar: async (req, res) => {
        try {
            const { aluno_id, hora_saida, hora_retorno, motivo } = req.body;
            const usuario_id = req.usuario.id_usuario;

            let dias = req.body.dias_semana;
            if (!Array.isArray(dias)) {
                dias = (req.body.dia_semana === undefined || req.body.dia_semana === null || req.body.dia_semana === '')
                    ? [] : [req.body.dia_semana];
            }
            dias = [...new Set(dias.map(Number))];

            if (!aluno_id || dias.length === 0 || !hora_saida) {
                return res.status(400).json({ erro: "Informe o aluno, pelo menos um dia da semana e o horário de saída." });
            }
            if (dias.some(d => !DIAS_VALIDOS.includes(d))) {
                return res.status(400).json({ erro: "Dia da semana inválido." });
            }
            if (hora_retorno && hora_retorno <= hora_saida) {
                return res.status(400).json({ erro: "O horário de retorno deve ser depois do horário de saída." });
            }

            const vinculado = await responsaveisAlunosModel.pertence(usuario_id, aluno_id);
            if (!vinculado) {
                return res.status(403).json({ erro: "Este aluno não está vinculado à sua conta." });
            }

            const criados = [];
            let jaExistiam = 0;
            for (const dia of dias) {
                if (await pedidosRecorrentes.existeIgual(aluno_id, usuario_id, dia, hora_saida)) {
                    jaExistiam++;
                    continue;
                }
                const id = await pedidosRecorrentes.cadastrar(aluno_id, usuario_id, dia, hora_saida, hora_retorno, motivo);
                criados.push(id);
            }

            if (criados.length === 0) {
                return res.status(409).json({ erro: "Esse horário já está cadastrado para os dias escolhidos." });
            }

            // Se um dos dias for HOJE e o horário ainda não passou, a solicitação de hoje
            // já é criada agora (não precisa esperar a rotina automática).
            let geradosHoje = [];
            try {
                geradosHoje = await gerarPedidosRecorrentesDoDia();
            } catch (_) { /* a rotina automática tenta de novo em alguns minutos */ }
            const pedidoHoje = criados.some(id => geradosHoje.includes(id));

            let mensagem = criados.length === 1
                ? "Horário fixo criado com sucesso."
                : `${criados.length} horários fixos criados com sucesso.`;
            if (jaExistiam > 0) mensagem += ` (${jaExistiam} já existia${jaExistiam > 1 ? 'm' : ''} e foi ignorado.)`;
            if (pedidoHoje) mensagem += " A solicitação de hoje já foi enviada à secretaria.";

            res.status(201).json({ mensagem, ids: criados, pedido_hoje: pedidoHoje });
        } catch (error) {
            console.error('Erro ao cadastrar pedido recorrente:', error);
            res.status(500).json({ erro: "Erro ao cadastrar pedido recorrente." });
        }
    },

    listarMeus: async (req, res) => {
        try {
            const resultado = await pedidosRecorrentes.listarPorUsuario(req.usuario.id_usuario);
            res.json(resultado);
        } catch (error) {
            console.error('Erro ao listar pedidos recorrentes:', error);
            res.status(500).json({ erro: "Erro ao listar pedidos recorrentes." });
        }
    },

    alternarStatus: async (req, res) => {
        try {
            const { id } = req.params;
            const { ativo } = req.body;
            const ok = await pedidosRecorrentes.alternarStatus(id, req.usuario.id_usuario, !!ativo);
            if (!ok) return res.status(404).json({ erro: "Pedido recorrente não encontrado." });
            res.json({ mensagem: ativo ? "Pedido recorrente ativado." : "Pedido recorrente pausado." });
        } catch (error) {
            console.error('Erro ao atualizar pedido recorrente:', error);
            res.status(500).json({ erro: "Erro ao atualizar pedido recorrente." });
        }
    },

    remover: async (req, res) => {
        try {
            const { id } = req.params;
            const ok = await pedidosRecorrentes.remover(id, req.usuario.id_usuario);
            if (!ok) return res.status(404).json({ erro: "Pedido recorrente não encontrado." });
            res.json({ mensagem: "Pedido recorrente removido." });
        } catch (error) {
            console.error('Erro ao remover pedido recorrente:', error);
            res.status(500).json({ erro: "Erro ao remover pedido recorrente." });
        }
    }
};

module.exports = pedidosRecorrentesController;
