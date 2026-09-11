//turmas controller
const turmas = require('../model/turmasModel');
const usuarios = require('../model/turmasModel');

const turmasController = {
    listarTodas: async (req, res) => {
        try {
            const resultado = await turmas.listarTodas();
            res.status(200).json(resultado);
        } catch (error) {
            console.error(error);
            res.status(500).json({ erro: "Erro ao carregar lista de turmas" });
        }
    },

    cadastrar: async (req, res) => {
        try {
            const { sala_turma, turno } = req.body;

            if (!sala_turma || !turno) {
                return res.status(400).json({ erro: "Todos os campos são obrigatórios" });
            }
            const id_turma = await turmas.cadastrar(
                sala_turma, turno
            );
            return res.status(201).json({ mensagem: `Turma ${id_turma} cadastrada com sucesso` });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ erro: "Erro ao cadastrar turma", detalhes: error.message });
        }
    },

    buscarPorTurma: async (req, res) => {
        try {
            const { sala_turma } = req.body;
            const resultado = await usuarios.buscarPorTurma(sala_turma);
            if (!resultado) {
                return res.status(404).json({ "resultado": "Turma não encontrado" });
            }
            res.status(200).json(resultado);
        } catch (error) {
            console.log(error)
            res.status(500).json({ "erro": "Erro ao buscar por turma" });
        }
    },
        buscarPorTurno: async (req, res) => {
        try {
            const { turno } = req.body;
            const resultado = await turmas.buscarPorTurno(turno);
            if (!resultado) {
                return res.status(404).json({ "resultado": "Turno não encontrado" });
            }
            res.status(200).json(resultado);
        } catch (error) {
            console.log(error)
            res.status(500).json({ "erro": "Erro ao buscar por turno" });
        }
    }
};

module.exports = turmasController;