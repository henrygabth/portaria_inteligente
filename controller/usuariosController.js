const usuariosModel = require('../model/usuariosModel');
const alunosModel = require('../model/alunosModel');
const responsaveisAlunosModel = require('../model/responsaveisAlunosModel');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { SEGREDO } = require('../middlewares/authenticar');
const { OAuth2Client } = require("google-auth-library");
const { enviarEmail } = require('../utils/email');
const { montarEmailHtml } = require('../utils/emailTemplate');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "725327633780-mt7ue9m9s39dgcq4n80487s82aheh9aq.apps.googleusercontent.com";
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Função para obter o transporter dinamicamente (garante leitura correta do process.env)
function getTransporter() {
    const emailUser = process.env.EMAIL_USER || "portariainteligente950@gmail.com";
    const emailPass = process.env.EMAIL_PASS;

    if (!emailPass) {
        console.error("ALERTA: process.env.EMAIL_PASS nao esta definido no .env!");
    }

    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // TLS/SSL direto na porta 465
        auth: {
            user: emailUser,
            pass: emailPass
        },
        // Evita ECONNREFUSED quando a máquina resolve smtp.gmail.com para IPv6
        // sem rota disponível.
        family: 4
    });
}

function gerarSenhaAleatoria() {
    return crypto.randomBytes(6).toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 8);
}

const usuariosController = {
    cadastrar: async (req, res) => {
        try {
            const { nome, cpf, email, telefone, senha, tipo_usuario, status } = req.body;

            if (!nome || !cpf || !email || !telefone || !senha || !tipo_usuario) {
                return res.status(400).json({ erro: 'Todos os campos obrigatórios devem ser preenchidos.' });
            }

            const usuarioExistente = await usuariosModel.buscarPorEmail(email);
            if (usuarioExistente) {
                return res.status(400).json({ erro: 'E-mail já cadastrado.' });
            }

            const senhaHash = await bcrypt.hash(senha, 10);
            const tipoPadronizado = tipo_usuario.trim().toUpperCase();

            const id = await usuariosModel.cadastrar(
                nome,
                cpf,
                email,
                telefone,
                senhaHash,
                tipoPadronizado,
                status || '1'
            );

            const token = jwt.sign(
                { id_usuario: id, tipo_usuario: tipoPadronizado, nome },
                SEGREDO,
                { expiresIn: '8h' }
            );

            return res.status(201).json({
                mensagem: 'Usuário cadastrado com sucesso!',
                token,
                id_usuario: id
            });
        } catch (error) {
            console.error('Erro no cadastro:', error);
            return res.status(500).json({ erro: 'Erro ao cadastrar usuário.', detalhe: error.message });
        }
    },

    login: async (req, res) => {
        try {
            const { email, senha } = req.body;

            if (!email || !senha) {
                return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });
            }

            let usuario = await usuariosModel.buscarPorEmail(email);
            if (!usuario && usuariosModel.buscarPorNome) {
                usuario = await usuariosModel.buscarPorNome(email);
            }

            if (!usuario) {
                return res.status(401).json({ erro: 'Credenciais inválidas.' });
            }

            let senhaValida = false;
            const senhaEstaHasheada = usuario.senha && (usuario.senha.startsWith('$2b$') || usuario.senha.startsWith('$2a$'));

            if (senhaEstaHasheada) {
                senhaValida = await bcrypt.compare(senha, usuario.senha);
            } else {
                // Compatibilidade com registros antigos que ainda guardam a senha em
                // texto puro. Ao validar com sucesso, migramos imediatamente para
                // bcrypt, para que esse caminho deixe de ser usado a cada login.
                senhaValida = (senha === usuario.senha);
                if (senhaValida) {
                    const novaSenhaHash = await bcrypt.hash(senha, 10);
                    await usuariosModel.atualizarSenha(usuario.id_usuario, novaSenhaHash);
                }
            }

            if (!senhaValida) {
                return res.status(401).json({ erro: 'Credenciais inválidas.' });
            }

            const token = jwt.sign(
                { id_usuario: usuario.id_usuario, tipo_usuario: usuario.tipo_usuario, nome: usuario.nome },
                SEGREDO,
                { expiresIn: '8h' }
            );

            let redirecionarPara = 'home.html';
            const tipo = (usuario.tipo_usuario || '').toUpperCase();

            if (tipo === 'SECRETARIA' || tipo === 'ADMIN') {
                redirecionarPara = 'secretaria.html';
            } else if (tipo === 'PORTARIA' || tipo === 'PORTEIRO') {
                redirecionarPara = 'portaria.html';
            } else if (tipo === 'PAI' || tipo === 'RESPONSAVEL') {
                redirecionarPara = 'home.html';
            }

            return res.json({
                mensagem: 'Login realizado com sucesso!',
                token,
                redirecionarPara,
                usuario: {
                    id_usuario: usuario.id_usuario,
                    nome: usuario.nome,
                    tipo_usuario: usuario.tipo_usuario
                }
            });
        } catch (error) {
            console.error('Erro no login:', error);
            return res.status(500).json({ erro: 'Erro interno ao realizar login.', detalhe: error.message });
        }
    },

    loginGoogle: async (req, res) => {
        try {
            const { idToken } = req.body;
            if (!idToken) return res.status(400).json({ erro: 'Token do Google não fornecido.' });

            const ticket = await googleClient.verifyIdToken({
                idToken,
                audience: GOOGLE_CLIENT_ID
            });

            const payload = ticket.getPayload();
            const email = payload.email;

            let usuario = await usuariosModel.buscarPorEmail(email);

            if (!usuario) {
                return res.status(404).json({ erro: 'Nenhuma conta cadastrada encontrada para este e-mail do Google.' });
            }

            const token = jwt.sign(
                { id_usuario: usuario.id_usuario, tipo_usuario: usuario.tipo_usuario, nome: usuario.nome },
                SEGREDO,
                { expiresIn: '8h' }
            );

            let redirecionarPara = 'home.html';
            const tipo = (usuario.tipo_usuario || '').toUpperCase();

            if (tipo === 'SECRETARIA' || tipo === 'ADMIN') {
                redirecionarPara = 'secretaria.html';
            } else if (tipo === 'PORTARIA' || tipo === 'PORTEIRO') {
                redirecionarPara = 'portaria.html';
            }

            return res.json({
                mensagem: 'Autenticação via Google realizada com sucesso!',
                token,
                redirecionarPara,
                usuario: {
                    id_usuario: usuario.id_usuario,
                    nome: usuario.nome,
                    tipo_usuario: usuario.tipo_usuario
                }
            });
        } catch (error) {
            console.error('Erro na autenticação do Google:', error);
            return res.status(401).json({ erro: 'Token do Google inválido ou expirado.' });
        }
    },

    buscarPorNome: async (req, res) => {
        try {
            const { nome } = req.query;
            if (!nome) return res.status(400).json({ erro: 'O parâmetro nome é obrigatório.' });

            const usuario = await usuariosModel.buscarPorNome(nome);
            if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' });

            return res.json(usuario);
        } catch (error) {
            console.error('Erro ao buscar por nome:', error);
            return res.status(500).json({ erro: 'Erro ao buscar usuário.' });
        }
    },

    buscarPorId: async (req, res) => {
        try {
            const usuario = await usuariosModel.buscarPorId(req.params.id);
            if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' });

            return res.json(usuario);
        } catch (error) {
            console.error('Erro ao buscar por ID:', error);
            return res.status(500).json({ erro: 'Erro ao buscar usuário.' });
        }
    },

    getConta: async (req, res) => {
        try {
            const usuario = await usuariosModel.buscarContaPorId(req.usuario.id_usuario);
            if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' });

            return res.json(usuario);
        } catch (error) {
            console.error('Erro ao carregar conta:', error);
            return res.status(500).json({ erro: 'Erro ao carregar dados da conta.' });
        }
    },

    atualizarConta: async (req, res) => {
        try {
            const { nome, email, telefone, senhaAtual, novaSenha } = req.body;
            let novaSenhaHash = null;

            if (novaSenha && novaSenha.trim() !== '') {
                if (!senhaAtual) {
                    return res.status(400).json({ erro: 'Informe a senha atual para definir uma nova senha.' });
                }

                const hashAtual = await usuariosModel.buscarSenhaHashPorId(req.usuario.id_usuario);
                const senhaConfere = hashAtual && await bcrypt.compare(senhaAtual, hashAtual);

                if (!senhaConfere) {
                    return res.status(400).json({ erro: 'Senha atual incorreta.' });
                }

                novaSenhaHash = await bcrypt.hash(novaSenha, 10);
            }

            await usuariosModel.atualizarConta(req.usuario.id_usuario, nome, email, telefone, novaSenhaHash);
            return res.json({ mensagem: 'Conta atualizada com sucesso!' });
        } catch (error) {
            console.error('Erro ao atualizar conta:', error);
            return res.status(500).json({ erro: 'Erro ao atualizar conta.' });
        }
    },

    solicitarRecuperacao: async (req, res) => {
        try {
            const { email } = req.body;
            if (!email) return res.status(400).json({ erro: 'E-mail é obrigatório.' });

            const usuario = await usuariosModel.buscarPorEmail(email);
            if (!usuario) {
                return res.json({ mensagem: 'Se o e-mail estiver cadastrado, você receberá um link de redefinição.' });
            }

            const tokenReset = jwt.sign(
                { id_usuario: usuario.id_usuario, email: usuario.email },
                SEGREDO,
                { expiresIn: '15m' }
            );

            const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
            const linkRecuperacao = `${baseUrl}/reset_password.html?token=${tokenReset}`;
            const emailSistema = process.env.EMAIL_USER || "portariainteligente950@gmail.com";

            const mailOptions = {
                from: `"Controle de Saidas" <${emailSistema}>`,
                to: usuario.email,
                subject: 'Redefinicao de Senha - Controle de Saidas',
                text: `Olá ${usuario.nome}, acesse o link para redefinir sua senha: ${linkRecuperacao}`,
                html: montarEmailHtml({
                    titulo: 'Redefinição de Senha',
                    saudacao: `Olá, <strong>${usuario.nome}</strong>.`,
                    paragrafos: ['Você solicitou a redefinição de senha para a sua conta no Controle de Saídas. Clique no botão abaixo para criar uma nova senha:'],
                    botao: { texto: 'Redefinir Senha', url: linkRecuperacao },
                    rodape: 'Este link expira em 15 minutos. Se você não fez essa solicitação, pode ignorar este e-mail.'
                })
            };

            const transporter = getTransporter();
            await transporter.sendMail(mailOptions);

            return res.json({ mensagem: 'Se o e-mail estiver cadastrado, você receberá um link de redefinição.' });
        } catch (error) {
            console.error('ERRO DETALHADO NO SMTP/NODEMAILER:', error);
            return res.status(500).json({ 
                erro: 'Erro ao enviar e-mail de recuperação.', 
                detalhe: error.message 
            });
        }
    },

    redefinirSenha: async (req, res) => {
        try {
            const { token, novaSenha } = req.body;

            if (!token || !novaSenha) {
                return res.status(400).json({ erro: 'Token e nova senha são obrigatórios.' });
            }

            const decoded = jwt.verify(token, SEGREDO);
            const senhaHash = await bcrypt.hash(novaSenha, 10);

            await usuariosModel.atualizarConta(decoded.id_usuario, null, null, null, senhaHash);

            return res.json({ mensagem: 'Senha redefinida com sucesso!' });
        } catch (error) {
            console.error('Erro ao redefinir senha:', error);
            return res.status(400).json({ erro: 'Link inválido ou expirado.' });
        }
    },

    // SECRETARIA: cria a conta do responsável e vincula o aluno.
    // Se o e-mail já pertencer a um responsável (PAI) existente — caso comum de
    // dois irmãos na escola — não cria uma segunda conta: apenas vincula o novo
    // aluno à conta que já existe, sem mexer na senha atual.
    criarResponsavel: async (req, res) => {
        try {
            const { nome, cpf, email, telefone, nome_aluno, turma_id, parentesco } = req.body;

            if (!nome || !cpf || !email || !telefone || !nome_aluno) {
                return res.status(400).json({ erro: 'Preencha nome, cpf, e-mail, telefone e nome do aluno.' });
            }

            const existente = await usuariosModel.buscarPorEmail(email);

            if (existente) {
                if ((existente.tipo_usuario || '').toUpperCase() !== 'PAI') {
                    return res.status(400).json({ erro: 'Este e-mail já pertence a uma conta de outro tipo (não é um responsável).' });
                }

                const aluno_id = await alunosModel.buscarOuCriar(nome_aluno, turma_id || null);
                const jaVinculado = await responsaveisAlunosModel.pertence(existente.id_usuario, aluno_id);
                if (!jaVinculado) {
                    await responsaveisAlunosModel.vincular(existente.id_usuario, aluno_id, parentesco || 'Responsável');
                }

                let emailEnviado = true;
                try {
                    await enviarEmail({
                        to: email,
                        subject: 'Novo aluno vinculado à sua conta - Portaria Inteligente',
                        text: `Olá ${existente.nome}, o aluno ${nome_aluno} foi vinculado à sua conta existente. Use seu e-mail e senha de sempre para acessar.`,
                        html: montarEmailHtml({
                            titulo: 'Novo aluno vinculado à sua conta',
                            saudacao: `Olá, <strong>${existente.nome}</strong>.`,
                            paragrafos: [`O aluno <strong>${nome_aluno}</strong> foi vinculado à sua conta já existente no sistema.`],
                            rodape: 'Você já pode ver os dois filhos ao criar uma nova solicitação de saída, usando seu e-mail e senha de sempre.'
                        })
                    });
                } catch (erroEmail) {
                    console.error('Erro ao enviar e-mail de novo vínculo:', erroEmail);
                    emailEnviado = false;
                }

                return res.status(200).json({
                    mensagem: jaVinculado
                        ? `Este aluno já estava vinculado à conta de ${existente.nome}.`
                        : (emailEnviado
                            ? `Aluno vinculado à conta já existente de ${existente.nome}. E-mail de aviso enviado.`
                            : `Aluno vinculado à conta já existente de ${existente.nome}, mas não foi possível enviar o e-mail de aviso.`)
                });
            }

            const senhaTemporaria = gerarSenhaAleatoria();
            const senhaHash = await bcrypt.hash(senhaTemporaria, 10);

            const usuario_id = await usuariosModel.cadastrar(
                nome, cpf, email, telefone, senhaHash, 'PAI', '1'
            );

            const aluno_id = await alunosModel.buscarOuCriar(nome_aluno, turma_id || null);
            await responsaveisAlunosModel.vincular(usuario_id, aluno_id, parentesco || 'Responsável');

            let emailEnviado = true;
            try {
                const emailSistema = process.env.EMAIL_USER || "portariainteligente950@gmail.com";
                const transporter = getTransporter();

                await transporter.sendMail({
                    from: `"Controle de Saidas" <${emailSistema}>`,
                    to: email,
                    subject: 'Sua conta de acesso foi criada - Controle de Saidas',
                    text: `Olá ${nome}, sua conta foi criada. E-mail: ${email} | Senha temporária: ${senhaTemporaria}`,
                    html: montarEmailHtml({
                        titulo: 'Bem-vindo ao Controle de Saídas',
                        saudacao: `Olá, <strong>${nome}</strong>.`,
                        paragrafos: [`Sua conta de responsável vinculada ao aluno <strong>${nome_aluno}</strong> foi cadastrada com sucesso.`],
                        destaque: `
                            <p style="margin: 0 0 6px 0; color: #2d3748; font-size: 13px;"><strong>E-mail de acesso:</strong> ${email}</p>
                            <p style="margin: 0; color: #2d3748; font-size: 13px;"><strong>Senha temporária:</strong> <span style="font-family: monospace; font-weight: bold; background-color: #e2e8f0; padding: 2px 6px; border-radius: 3px;">${senhaTemporaria}</span></p>
                        `,
                        rodape: 'Recomendamos alterar sua senha após o primeiro acesso.'
                    })
                });
            } catch (erroEmail) {
                console.error('Erro ao enviar e-mail de boas-vindas:', erroEmail);
                emailEnviado = false;
            }

            const resposta = {
                mensagem: emailEnviado
                    ? `Conta criada e senha enviada por e-mail para ${email}.`
                    : `Conta criada, mas não foi possível enviar o e-mail. Informe a senha manualmente.`
            };

            if (!emailEnviado) {
                resposta.senha_temporaria = senhaTemporaria;
            }

            return res.status(201).json(resposta);
        } catch (error) {
            console.error('Erro ao criar conta do responsável:', error);
            return res.status(500).json({ erro: 'Erro ao criar conta do responsável.', detalhe: error.message });
        }
    }
};

module.exports = usuariosController;