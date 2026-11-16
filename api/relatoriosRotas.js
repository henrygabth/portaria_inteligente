// Relatórios da secretaria (somente SECRETARIA e ADMIN).
const express = require('express');
const rotas = express.Router();
const { auth, exigirPapel } = require('../middlewares/authenticar');
const controller = require('../controller/relatoriosController');

rotas.get('/', auth, exigirPapel('SECRETARIA', 'ADMIN'), controller.gerar);

module.exports = rotas;
