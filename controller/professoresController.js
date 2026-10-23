const professores = require('../model/professoresModel');
const usuarios = require('../model/usuariosModel');
const bcrypt = require('bcrypt');
const db = require('../config/banco');

function tratarErro(res, err) {
    if (err.status) return res.status(err.status).json({ erro: err.message });
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'CPF ou e-mail já cadastrado.' });
    console.error('[professores] Erro:', err);
    return res.status(500).json({ erro: 'Não foi possível processar a solicitação.' });
}

function validarTurmas(turmas) {
    if (!Array.isArray(turmas) || turmas.length > 100) return null;
    const ids = turmas.map(professores.inteiro);
    if (ids.some(x => !x) || new Set(ids).size !== ids.length) return null;
    return ids;
}

module.exports = {
    minhasTurmas: async (req, res) => {
        try { res.json(await professores.minhasTurmas(req.usuario.id_usuario)); }
        catch (err) { tratarErro(res, err); }
    },
    painel: async (req, res) => {
        try { res.json(await professores.painel(req.usuario.id_usuario)); }
        catch (err) { tratarErro(res, err); }
    },
    comunicados: async (req, res) => {
        try {
            const [resultado, naoLidos] = await Promise.all([
                professores.comunicados(req.usuario.id_usuario, req.query),
                professores.naoLidos(req.usuario.id_usuario)
            ]);
            res.json({ comunicados: resultado.itens, naoLidos, temMais: resultado.temMais, pagina: resultado.pagina });
        } catch (err) { tratarErro(res, err); }
    },
    marcarLido: async (req, res) => {
        const id = professores.inteiro(req.params.id);
        if (!id) return res.status(400).json({ erro: 'Comunicado inválido.' });
        try {
            if (!(await professores.marcarLido(req.usuario.id_usuario, id))) {
                return res.status(404).json({ erro: 'Comunicado não encontrado para este professor.' });
            }
            res.json({ mensagem: 'Comunicado marcado como lido.' });
        } catch (err) { tratarErro(res, err); }
    },
    listarCadastro: async (req, res) => {
        try { res.json(await professores.listarCadastro()); }
        catch (err) { tratarErro(res, err); }
    },
    criar: async (req, res) => {
        const { nome, cpf, telefone, email, senha, turmas } = req.body || {};
        const ids = validarTurmas(turmas);
        if (!ids || !String(nome || '').trim() || String(nome).length > 150 ||
            !/^\d{11}$/.test(String(cpf || '').replace(/\D/g, '')) ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '')) || String(email).length > 150 ||
            typeof senha !== 'string' || senha.length < 8 || senha.length > 72 ||
            String(telefone || '').length > 20) {
            return res.status(400).json({ erro: 'Informe nome, CPF de 11 dígitos, e-mail, senha de 8 a 72 caracteres e turmas válidas.' });
        }
        const conn = await db.getConnection();
        try {
            const hash = await bcrypt.hash(senha, 10);
            await conn.beginTransaction();
            if (ids.length) {
                const [turmasDb] = await conn.query(`SELECT id_turma FROM turmas WHERE id_turma IN (${ids.map(() => '?').join(',')})`, ids);
                if (turmasDb.length !== ids.length) { const err = new Error('Turma inexistente.'); err.status = 400; throw err; }
            }
            const [resultado] = await conn.query(`INSERT INTO usuarios
              (nome, cpf, email, telefone, senha, tipo_usuario, status) VALUES (?, ?, ?, ?, ?, 'PROFESSOR', '1')`,
            [nome.trim(), String(cpf).replace(/\D/g, ''), String(email).trim().toLowerCase(), telefone || null, hash]);
            for (const turma of ids) await conn.query('INSERT INTO professores_turmas (professor_id, turma_id) VALUES (?, ?)', [resultado.insertId, turma]);
            await conn.commit();
            res.status(201).json({ mensagem: 'Professor cadastrado e vinculado às turmas.', id_usuario: resultado.insertId });
        } catch (err) { await conn.rollback(); tratarErro(res, err); }
        finally { conn.release(); }
    },
    vincular: async (req, res) => {
        const id = professores.inteiro(req.params.id);
        const ids = validarTurmas(req.body?.turmas);
        if (!id || !ids) return res.status(400).json({ erro: 'Professor ou lista de turmas inválidos.' });
        try {
            await professores.salvarVinculos(id, ids);
            res.json({ mensagem: 'Turmas atualizadas com sucesso.' });
        } catch (err) { tratarErro(res, err); }
    }
};
