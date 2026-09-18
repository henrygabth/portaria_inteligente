// pedidosRecorrentesController.js
const pedidosRecorrentes = require('../model/pedidosRecorrentesModel');
const responsaveisAlunosModel = require('../model/responsaveisAlunosModel');

const DIAS_VALIDOS = [0, 1, 2, 3, 4, 5, 6];

const pedidosRecorrentesController = {
    // PAI: cria um molde de pedido recorrente ("toda sexta, saída 12h")
    cadastrar: async (req, res) => {
        try {
            const { aluno_id, dia_semana, hora_saida, hora_retorno, motivo } = req.body;
            const usuario_id = req.usuario.id_usuario;

            if (!aluno_id || dia_semana === undefined || dia_semana === null || !hora_saida) {
                return res.status(400).json({ erro: "Informe o aluno, o dia da semana e o horário de saída." });
            }
            if (!DIAS_VALIDOS.includes(Number(dia_semana))) {
                return res.status(400).json({ erro: "Dia da semana inválido." });
            }

            const vinculado = await responsaveisAlunosModel.pertence(usuario_id, aluno_id);
            if (!vinculado) {
                return res.status(403).json({ erro: "Este aluno não está vinculado à sua conta." });
            }

            const id = await pedidosRecorrentes.cadastrar(aluno_id, usuario_id, dia_semana, hora_saida, hora_retorno, motivo);
            res.status(201).json({ mensagem: "Pedido recorrente criado com sucesso.", id });
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
