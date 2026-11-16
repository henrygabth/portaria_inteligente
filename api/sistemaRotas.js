const express = require('express');
const rotas = express.Router();
const ctl = require('../controller/sistemaController');
const { auth, exigirPapel } = require('../middlewares/authenticar');
const { limitar } = require('../utils/seguranca');
const HORA = 60 * 60 * 1000;

rotas.get('/saude', auth, exigirPapel('ADMIN', 'SECRETARIA'), ctl.saude);
// Backup contém dados de todas as famílias: só o administrador baixa.
rotas.get('/backup', auth, exigirPapel('ADMIN'), limitar({ nome: 'backup', max: 6, janelaMs: HORA }), ctl.baixarBackup);
rotas.post('/backup', auth, exigirPapel('ADMIN'), limitar({ nome: 'backup-gerar', max: 6, janelaMs: HORA }), ctl.gerarBackup);

module.exports = rotas;
