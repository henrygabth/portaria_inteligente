const express = require('express');
const rotas = express.Router();

// Todo :id da URL precisa ser um número inteiro positivo (barra lixo/injeção antes do controller).
rotas.param('id', (req, res, next, valor) => (/^[1-9]\d{0,9}$/.test(valor) ? next() : res.status(400).json({ erro: 'Identificador inválido.' })));
const usuariosController = require('../controller/usuariosController');
const { auth, exigirPapel } = require('../middlewares/authenticar');
const { limitar } = require('../utils/seguranca');

const QUINZE_MIN = 15 * 60 * 1000;
const UMA_HORA = 60 * 60 * 1000;
const emailDoCorpo = req => (req.body && typeof req.body.email === 'string') ? req.body.email.trim() : '';

// Rotas públicas (não exigem login), com limite de tentativas contra força bruta:
//  - login: 8 tentativas por e-mail + IP e 40 por IP a cada 15 minutos;
//  - recuperação: 5 pedidos por IP por hora (evita usar o sistema para mandar spam);
//  - redefinição: 10 por IP por hora.
rotas.post('/login',
    limitar({ nome: 'login-ip', max: 40, janelaMs: QUINZE_MIN }),
    limitar({ nome: 'login-email', max: 8, janelaMs: QUINZE_MIN, chave: emailDoCorpo,
        mensagem: 'Muitas tentativas de login para este e-mail. Aguarde 15 minutos ou use "Esqueci minha senha".' }),
    usuariosController.login);
// 2ª etapa do login (secretaria/admin): código de 6 números enviado por e-mail.
rotas.post('/login/codigo', limitar({ nome: 'login-codigo', max: 20, janelaMs: QUINZE_MIN }), usuariosController.confirmarCodigo);
rotas.post('/recuperar-senha', limitar({ nome: 'recuperar', max: 5, janelaMs: UMA_HORA }), usuariosController.solicitarRecuperacao);
rotas.post('/redefinir-senha', limitar({ nome: 'redefinir', max: 10, janelaMs: UMA_HORA }), usuariosController.redefinirSenha);

// Cadastro direto (self-service) fica restrito à própria equipe interna já logada,
// evitando que qualquer pessoa de fora crie uma conta escolhendo o próprio papel.
rotas.post('/cadastrar', auth, exigirPapel('SECRETARIA', 'ADMIN'), usuariosController.cadastrar);

// Apenas a Secretaria (ou Admin) pode criar a conta de um responsável (Pai)
rotas.post('/vincular-responsavel', auth, exigirPapel('SECRETARIA', 'ADMIN'), usuariosController.criarResponsavel);

// Verifica se o e-mail informado é válido e se o domínio existe
rotas.post('/verificar-email', auth, exigirPapel('SECRETARIA', 'ADMIN'), usuariosController.verificarEmail);

// Gerenciar perfis: listar e ativar/desativar (secretaria/admin)
rotas.get('/perfis', auth, exigirPapel('SECRETARIA', 'ADMIN'), usuariosController.listarPerfis);
// Logins da equipe (secretaria, portaria, professor): criar e reenviar convite com senha temporária.
rotas.post('/equipe', auth, exigirPapel('SECRETARIA', 'ADMIN'), limitar({ nome: 'criar-equipe', max: 30, janelaMs: QUINZE_MIN }), usuariosController.criarEquipe);
rotas.post('/:id/convite', auth, exigirPapel('SECRETARIA', 'ADMIN'), limitar({ nome: 'reenviar-convite', max: 20, janelaMs: QUINZE_MIN }), usuariosController.reenviarConvite);
rotas.put('/:id/status', auth, exigirPapel('SECRETARIA', 'ADMIN'), usuariosController.alterarStatus);

// Uso interno (secretaria/admin) para localizar um usuário já cadastrado —
// não é usado pelo Pai/Portaria, então fica restrito por papel.
rotas.get('/buscarPorNome', auth, exigirPapel('SECRETARIA', 'ADMIN'), usuariosController.buscarPorNome);
rotas.get('/buscarPorId/:id', auth, exigirPapel('SECRETARIA', 'ADMIN'), usuariosController.buscarPorId);

// Rotas protegidas por JWT
rotas.get('/conta', auth, usuariosController.getConta);
rotas.post('/primeira-senha', auth, limitar({ nome: 'primeira-senha', max: 10, janelaMs: QUINZE_MIN }), usuariosController.primeiraSenha);
// LGPD: aceite do termo, cópia dos dados e exclusão da própria conta.
rotas.post('/aceitar-termos', auth, usuariosController.aceitarTermos);
rotas.get('/meus-dados', auth, limitar({ nome: 'meus-dados', max: 10, janelaMs: QUINZE_MIN }), usuariosController.meusDados);
rotas.post('/excluir-conta', auth, limitar({ nome: 'excluir-conta', max: 5, janelaMs: QUINZE_MIN }), usuariosController.excluirConta);
rotas.put('/conta', auth, limitar({ nome: 'conta', max: 20, janelaMs: QUINZE_MIN }), usuariosController.atualizarConta);

module.exports = rotas;
