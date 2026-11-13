const express = require('express');
const rotas = express.Router();

// Importar o controller
const alunosController = require('../controller/alunosController');
const { auth, exigirPapel } = require('../middlewares/authenticar');

// Todas as rotas exigem usuário autenticado.
// Cadastro, atualização e exclusão de alunos ficam restritos à Secretaria/Admin.
rotas.post('/cadastrar', auth, exigirPapel('SECRETARIA', 'ADMIN'), alunosController.cadastrar);

// Foto 3x4: só a Secretaria/Admin envia (corpo binário JPEG, até 400 KB). Quem pode ver é decidido
// no controller (secretaria, portaria e o responsável vinculado ao aluno).
const receberFoto = (req, res, next) => express.raw({ type: 'image/jpeg', limit: '400kb' })(req, res, err => {
    if (!err) return next();
    return res.status(err.status === 413 ? 413 : 400).json({ erro: err.status === 413 ? 'A foto é grande demais (máximo 400 KB).' : 'Não foi possível ler a foto enviada.' });
});
rotas.put('/:id/foto', auth, exigirPapel('SECRETARIA', 'ADMIN'), receberFoto, alunosController.enviarFoto);
rotas.get('/:id/foto', auth, alunosController.obterFoto);
rotas.get('/buscarTodos', auth, exigirPapel('SECRETARIA', 'ADMIN'), alunosController.listarTodos);
rotas.put('/atualizar/:id', auth, exigirPapel('SECRETARIA', 'ADMIN'), alunosController.atualizar);
rotas.put('/turma-status/:id', auth, exigirPapel('SECRETARIA', 'ADMIN'), alunosController.atualizarTurmaEStatus);
rotas.delete('/apagar/:id', auth, exigirPapel('SECRETARIA', 'ADMIN'), alunosController.apagar);
rotas.get('/buscarPorNome', auth, exigirPapel('SECRETARIA', 'ADMIN'), alunosController.buscarPorNome);
rotas.get('/buscarPorId', auth, exigirPapel('SECRETARIA', 'ADMIN'), alunosController.buscarPorId);
rotas.get('/buscarPorMatricula', auth, exigirPapel('SECRETARIA', 'ADMIN'), alunosController.buscarPorMatricula);
rotas.get('/buscarPorTurma', auth, exigirPapel('SECRETARIA', 'ADMIN'), alunosController.buscarPorTurma);
rotas.get('/buscarPorStatus', auth, exigirPapel('SECRETARIA', 'ADMIN'), alunosController.buscarPorStatus);

module.exports = rotas;
