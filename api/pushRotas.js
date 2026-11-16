const express = require('express');
const rotas = express.Router();
const ctl = require('../controller/pushController');
const { auth } = require('../middlewares/authenticar');
const { limitar } = require('../utils/seguranca');

rotas.get('/chave', auth, ctl.chave);
rotas.post('/inscrever', auth, limitar({ nome: 'push', max: 20, janelaMs: 15 * 60 * 1000 }), ctl.inscrever);
rotas.post('/cancelar', auth, ctl.cancelar);
rotas.post('/testar', auth, limitar({ nome: 'push-teste', max: 5, janelaMs: 15 * 60 * 1000 }), ctl.testar);

module.exports = rotas;
