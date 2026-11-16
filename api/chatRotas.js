const express = require('express');
const rotas = express.Router();

// Todo :id da URL precisa ser um número inteiro positivo (barra lixo/injeção antes do controller).
rotas.param('id', (req, res, next, valor) => (/^[1-9]\d{0,9}$/.test(valor) ? next() : res.status(400).json({ erro: 'Identificador inválido.' })));
const controller = require('../controller/chatController');
const { auth, exigirPapel } = require('../middlewares/authenticar');

// Responsável: só enxerga e escreve na própria conversa com a secretaria.
rotas.get('/minha', auth, exigirPapel('PAI'), controller.minhaConversa);
rotas.post('/minha', auth, exigirPapel('PAI'), controller.enviarResponsavel);

rotas.get('/nao-lidas', auth, exigirPapel('PAI', 'SECRETARIA', 'ADMIN'), controller.naoLidas);

// Secretaria/Admin: todas as conversas.
rotas.get('/conversas', auth, exigirPapel('SECRETARIA', 'ADMIN'), controller.conversas);
rotas.get('/responsaveis', auth, exigirPapel('SECRETARIA', 'ADMIN'), controller.buscarResponsaveis);
rotas.get('/conversas/:id', auth, exigirPapel('SECRETARIA', 'ADMIN'), controller.conversaDoResponsavel);
rotas.post('/conversas/:id', auth, exigirPapel('SECRETARIA', 'ADMIN'), controller.responder);

// Chat interno entre secretaria e portaria (as duas equipes no mesmo canal).
rotas.get('/equipe', auth, exigirPapel('SECRETARIA', 'ADMIN', 'PORTARIA', 'PORTEIRO'), controller.equipeListar);
rotas.post('/equipe', auth, exigirPapel('SECRETARIA', 'ADMIN', 'PORTARIA', 'PORTEIRO'), controller.equipeEnviar);
rotas.get('/equipe/nao-lidas', auth, exigirPapel('SECRETARIA', 'ADMIN', 'PORTARIA', 'PORTEIRO'), controller.equipeNaoLidas);

module.exports = rotas;
