const express = require('express');
const rotas = express.Router();
const controller = require('../controller/pedidosRecorrentesController');
const { auth, exigirPapel } = require('../middlewares/authenticar');

// Todas as rotas são do próprio Pai autenticado (dono do molde).
rotas.post('/cadastrar', auth, exigirPapel('PAI'), controller.cadastrar);
rotas.get('/meus', auth, exigirPapel('PAI'), controller.listarMeus);
rotas.put('/status/:id', auth, exigirPapel('PAI'), controller.alternarStatus);
rotas.delete('/:id', auth, exigirPapel('PAI'), controller.remover);

module.exports = rotas;
