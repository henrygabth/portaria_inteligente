const express = require('express');
const rotas = express.Router();
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
