const express = require('express');
const rotas = express.Router();

// Todo :id da URL precisa ser um número inteiro positivo (barra lixo/injeção antes do controller).
rotas.param('id', (req, res, next, valor) => (/^[1-9]\d{0,9}$/.test(valor) ? next() : res.status(400).json({ erro: 'Identificador inválido.' })));
const controller = require('../controller/professoresController');
const { auth, exigirPapel } = require('../middlewares/authenticar');

rotas.get('/minhas-turmas', auth, exigirPapel('PROFESSOR'), controller.minhasTurmas);
rotas.get('/painel', auth, exigirPapel('PROFESSOR'), controller.painel);
rotas.get('/comunicados', auth, exigirPapel('PROFESSOR'), controller.comunicados);
rotas.put('/comunicados/:id/lido', auth, exigirPapel('PROFESSOR'), controller.marcarLido);
// Cadastro e vínculo de professores: Secretaria e Admin.
rotas.get('/', auth, exigirPapel('SECRETARIA', 'ADMIN'), controller.listarCadastro);
rotas.post('/', auth, exigirPapel('SECRETARIA', 'ADMIN'), controller.criar);
rotas.put('/:id/turmas', auth, exigirPapel('SECRETARIA', 'ADMIN'), controller.vincular);

module.exports = rotas;
