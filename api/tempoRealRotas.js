const express = require('express');
const rotas = express.Router();
const { auth } = require('../middlewares/authenticar');
const tempoReal = require('../utils/tempoReal');

// Qualquer perfil autenticado pode abrir a própria conexão; o que cada um recebe é
// decidido no servidor (cada evento é publicado só para quem tem direito a ele).
rotas.get('/eventos', auth, tempoReal.conectar);

module.exports = rotas;
