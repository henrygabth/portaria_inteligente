const express = require('express');
const rotas = express.Router();
const controller = require('../controller/professoresController');
const { auth, exigirPapel } = require('../middlewares/authenticar');

rotas.get('/minhas-turmas', auth, exigirPapel('PROFESSOR'), controller.minhasTurmas);
rotas.get('/painel', auth, exigirPapel('PROFESSOR'), controller.painel);
rotas.get('/comunicados', auth, exigirPapel('PROFESSOR'), controller.comunicados);
rotas.put('/comunicados/:id/lido', auth, exigirPapel('PROFESSOR'), controller.marcarLido);
rotas.get('/', auth, exigirPapel('ADMIN'), controller.listarCadastro);
rotas.post('/', auth, exigirPapel('ADMIN'), controller.criar);
rotas.put('/:id/turmas', auth, exigirPapel('ADMIN'), controller.vincular);

module.exports = rotas;
