// Salas e Turmas: a secretaria cadastra, renomeia e remove (somente turma vazia).
const turmas = require('../model/turmasModel');
const { registrar: auditar } = require('../utils/auditoria');

const TURNOS = ['Manhã', 'Tarde', 'Noite', 'Integral'];
const semAcento = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Confere nome e turno. Aceita o turno sem acento ou em maiúsculas ("MANHA" vira "Manhã").
function validar(body) {
    const sala_turma = String(body?.sala_turma ?? '').replace(/\s+/g, ' ').trim();
    const turno = TURNOS.find(t => semAcento(t) === semAcento(body?.turno));
    if (sala_turma.length < 1 || sala_turma.length > 100) return { erro: 'Informe o nome da sala/turma (até 100 caracteres).' };
    if (/[<>{}]/.test(sala_turma)) return { erro: 'O nome da turma tem caracteres inválidos.' };
    if (!turno) return { erro: `Escolha o turno: ${TURNOS.join(', ')}.` };
    return { sala_turma, turno };
}

const turmasController = {
    TURNOS,
    _validar: validar,

    listarTodas: async (req, res) => {
        try {
            res.status(200).json(await turmas.listarTodas());
        } catch (error) {
            console.error('Erro ao listar turmas:', error);
            res.status(500).json({ erro: 'Erro ao carregar lista de turmas' });
        }
    },

    resumo: async (req, res) => {
        try {
            res.json({ turnos: TURNOS, turmas: await turmas.listarComResumo() });
        } catch (error) {
            console.error('Erro ao listar turmas:', error);
            res.status(500).json({ erro: 'Erro ao carregar as turmas' });
        }
    },

    cadastrar: async (req, res) => {
        try {
            const v = validar(req.body);
            if (v.erro) return res.status(400).json({ erro: v.erro });
            const igual = await turmas.buscarMesmoNome(v.sala_turma);
            if (igual) return res.status(409).json({ erro: `Já existe a turma "${igual.sala_turma}".` });
            const id_turma = await turmas.cadastrar(v.sala_turma, v.turno);
            auditar(req, 'TURMA_CRIADA', { alvo_tipo: 'TURMA', alvo_id: id_turma, descricao: `Cadastrou a turma ${v.sala_turma} (${v.turno})` });
            return res.status(201).json({ mensagem: `Turma ${v.sala_turma} cadastrada.`, id_turma, ...v });
        } catch (error) {
            console.error('Erro ao cadastrar turma:', error);
            return res.status(500).json({ erro: 'Erro ao cadastrar turma' });
        }
    },

    atualizar: async (req, res) => {
        try {
            const id = Number(req.params.id);
            const antes = await turmas.buscarPorId(id);
            if (!antes) return res.status(404).json({ erro: 'Turma não encontrada.' });
            const v = validar(req.body);
            if (v.erro) return res.status(400).json({ erro: v.erro });
            const igual = await turmas.buscarMesmoNome(v.sala_turma, id);
            if (igual) return res.status(409).json({ erro: `Já existe a turma "${igual.sala_turma}".` });
            await turmas.atualizar(id, v.sala_turma, v.turno);
            auditar(req, 'TURMA_ALTERADA', { alvo_tipo: 'TURMA', alvo_id: id,
                descricao: `Alterou a turma ${antes.sala_turma} (${antes.turno}) para ${v.sala_turma} (${v.turno})` });
            return res.json({ mensagem: 'Turma atualizada.', id_turma: id, ...v });
        } catch (error) {
            console.error('Erro ao atualizar turma:', error);
            return res.status(500).json({ erro: 'Erro ao atualizar turma' });
        }
    },

    apagar: async (req, res) => {
        try {
            const id = Number(req.params.id);
            const turma = await turmas.buscarPorId(id);
            if (!turma) return res.status(404).json({ erro: 'Turma não encontrada.' });
            const v = await turmas.contarVinculos(id);
            if (v.alunos || v.professores) {
                const partes = [v.alunos ? `${v.alunos} aluno(s)` : null, v.professores ? `${v.professores} professor(es)` : null].filter(Boolean).join(' e ');
                return res.status(409).json({ erro: `A turma ${turma.sala_turma} tem ${partes}. Mude os alunos de turma em "Gerenciar Alunos" e tire os professores em "Professores e Turmas" antes de remover.` });
            }
            await turmas.apagar(id);
            auditar(req, 'TURMA_APAGADA', { alvo_tipo: 'TURMA', alvo_id: id, descricao: `Removeu a turma ${turma.sala_turma} (${turma.turno})` });
            return res.json({ mensagem: `Turma ${turma.sala_turma} removida.` });
        } catch (error) {
            console.error('Erro ao remover turma:', error);
            return res.status(500).json({ erro: 'Erro ao remover turma' });
        }
    },

    buscarPorTurma: async (req, res) => {
        try {
            const resultado = await turmas.buscarPorTurma(req.query.sala_turma || req.body?.sala_turma);
            if (!resultado) return res.status(404).json({ resultado: 'Turma não encontrada' });
            res.status(200).json(resultado);
        } catch (error) {
            console.error('Erro ao buscar turma:', error);
            res.status(500).json({ erro: 'Erro ao buscar por turma' });
        }
    },
    buscarPorTurno: async (req, res) => {
        try {
            const resultado = await turmas.buscarPorTurno(req.query.turno || req.body?.turno);
            if (!resultado) return res.status(404).json({ resultado: 'Turno não encontrado' });
            res.status(200).json(resultado);
        } catch (error) {
            console.error('Erro ao buscar turno:', error);
            res.status(500).json({ erro: 'Erro ao buscar por turno' });
        }
    }
};

module.exports = turmasController;
