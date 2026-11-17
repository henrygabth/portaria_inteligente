const usuariosModel = require('../model/usuariosModel');
const alunosModel = require('../model/alunosModel');
const responsaveisAlunosModel = require('../model/responsaveisAlunosModel');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { SEGREDO, gerarTokenSessao } = require('../middlewares/authenticar');
const { validarSenha, emailValido, escaparHtml } = require('../utils/seguranca');
const { OAuth2Client } = require("google-auth-library");
const { enviarEmail } = require('../utils/email');
const { montarEmailHtml } = require('../utils/emailTemplate');
const { verificarEmail } = require('../utils/verificarEmail');
const { formatarCPF, formatarTelefone } = require('../utils/formatadores');
const { registrar: auditar } = require('../utils/auditoria');

const MSG_PERFIL_DESATIVADO = 'Este perfil está desativado. Procure a secretaria da escola para reativar o seu acesso.';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "725327633780-mt7ue9m9s39dgcq4n80487s82aheh9aq.apps.googleusercontent.com";
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Senha temporária de 10 caracteres, sempre com letras e números e sem caracteres
// parecidos (0/O, 1/l/I) para o responsável não errar ao digitar.
function gerarSenhaAleatoria() {
    const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
    const numeros = '23456789';
    const todos = letras + numeros;
    const escolher = conjunto => conjunto[crypto.randomInt(conjunto.length)];
    const chars = [escolher(letras), escolher(numeros)];
    while (chars.length < 10) chars.push(escolher(todos));
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

// Hash "falso" usado quando o e-mail não existe: o bcrypt roda do mesmo jeito, então o
// tempo de resposta não revela se a conta existe.
const HASH_FICTICIO = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.LmHqQ7vY6l2Q3Yq9iC6m9QnS6Q0y';

// Link de redefinição: token próprio (proposito = reset), que não serve como login e
// deixa de valer assim que a senha é trocada (tv muda).
function gerarTokenReset(usuario) {
    return jwt.sign(
        { id_usuario: usuario.id_usuario, proposito: 'reset', tv: Number(usuario.token_versao || 0) },
        SEGREDO,
        { expiresIn: '30m', algorithm: 'HS256' }
    );
}

// Envia sem segurar a resposta da tela (o Brevo pode demorar alguns segundos).
function enviarEmSegundoPlano(opcoes, contexto) {
    enviarEmail(opcoes).catch(err => console.error(`[email] Falha ao enviar ${contexto}:`, err.message));
}

// ------------------------------------------------------------------ logins da equipe
// Quem pode criar (e reenviar convite para) qual perfil da equipe da escola.
// Só o ADMIN cria SECRETARIA: ela tem acesso aos dados de todos os alunos.
const EQUIPE_POR_PAPEL = {
    ADMIN: ['SECRETARIA', 'PORTARIA', 'PROFESSOR'],
    SECRETARIA: ['PORTARIA', 'PROFESSOR']
};
const ROTULO_PERFIL = { SECRETARIA: 'Secretaria', PORTARIA: 'Portaria', PORTEIRO: 'Portaria', PROFESSOR: 'Professor(a)' };
const podeGerirEquipe = (papelLogado, papelAlvo) =>
    (EQUIPE_POR_PAPEL[String(papelLogado).toUpperCase()] || []).includes(papelAlvo === 'PORTEIRO' ? 'PORTARIA' : papelAlvo);

// E-mail de convite com a senha temporária. Devolve true se o envio funcionou.
async function enviarConvite({ nome, email, tipo, senha, quem, reenvio }) {
    const base = (process.env.BASE_URL || '').replace(/\/+$/, '');
    try {
        await enviarEmail({
            to: email,
            subject: reenvio ? 'Nova senha temporária - Portaria Inteligente' : 'Seu acesso ao Portaria Inteligente foi criado',
            text: `Olá ${nome}. ${reenvio ? 'Foi gerada uma nova senha temporária para o seu acesso' : `Foi criado um acesso para você (${ROTULO_PERFIL[tipo] || tipo})`}. E-mail: ${email} | Senha temporária: ${senha}${base ? ` | Entre em: ${base}` : ''}. No primeiro acesso você vai criar a sua própria senha.`,
            html: montarEmailHtml({
                titulo: reenvio ? 'Nova senha temporária' : 'Seu acesso foi criado',
                saudacao: `Olá, <strong>${escaparHtml(nome)}</strong>.`,
                paragrafos: [reenvio
                    ? 'Foi gerada uma nova senha temporária para você entrar no Portaria Inteligente. A senha anterior não vale mais.'
                    : `${escaparHtml(quem || 'A escola')} criou o seu acesso ao Portaria Inteligente com o perfil <strong>${escaparHtml(ROTULO_PERFIL[tipo] || tipo)}</strong>.`],
                destaque: `
                    <p style="margin: 0 0 6px 0; color: #2d3748; font-size: 13px;"><strong>E-mail de acesso:</strong> ${escaparHtml(email)}</p>
                    <p style="margin: 0; color: #2d3748; font-size: 13px;"><strong>Senha temporária:</strong> <span style="font-family: monospace; font-weight: bold; background-color: #e2e8f0; padding: 2px 6px; border-radius: 3px;">${escaparHtml(senha)}</span></p>
                    ${base ? `<p style="margin: 10px 0 0 0; font-size: 13px;"><a href="${escaparHtml(base)}" style="color: #0052cc; font-weight: bold;">Abrir o Portaria Inteligente</a></p>` : ''}`,
                rodape: 'No primeiro acesso você vai receber um código de 6 números neste e-mail, criar a sua própria senha e aceitar a política de privacidade. Se não esperava este e-mail, ignore-o.'
            }),
            tag: 'convite-equipe', tentativas: 2
        });
        return true;
    } catch (err) {
        console.error('[equipe] Falha ao enviar convite:', err.message);
        return false;
    }
}

// ------------------------------------------------------------------ login em duas etapas
// Secretaria, administração e portaria mexem com dados de todos os alunos: além da senha, recebem um
// código de 6 números por e-mail. DOIS_FATORES=desligado no .env desativa (ex.: em testes).
const doisFatores = require('../model/doisFatoresModel');
const { VERSAO_TERMOS, precisaAceitar } = require('../utils/lgpd');
const PAPEIS_2FA = (process.env.DOIS_FATORES_PAPEIS || 'SECRETARIA,ADMIN,PORTARIA,PORTEIRO').split(',').map(p => p.trim().toUpperCase()).filter(Boolean);
const MINUTOS_CODIGO = 10;
const DIAS_APARELHO = 30;
const exige2fa = u => String(process.env.DOIS_FATORES || '').toLowerCase() !== 'desligado' && PAPEIS_2FA.includes(String(u.tipo_usuario || '').toUpperCase());
const mascararEmail = e => String(e || '').replace(/^(.)(.*)(.@.*)$/, (_, a, meio, b) => a + '*'.repeat(Math.min(meio.length, 6)) + b);

function destinoDoPapel(tipo) {
    tipo = String(tipo || '').toUpperCase();
    if (tipo === 'SECRETARIA' || tipo === 'ADMIN') return 'secretaria.html';
    if (tipo === 'PORTARIA' || tipo === 'PORTEIRO') return 'portaria.html';
    if (tipo === 'PROFESSOR') return 'professor.html';
    return 'home.html';
}

// Última etapa de qualquer login (senha, Google ou código): cria a sessão.
function concluirLogin(req, res, usuario, mensagem, extras = {}) {
    auditar(req, 'LOGIN', { usuario, alvo_tipo: 'USUARIO', alvo_id: usuario.id_usuario, descricao: extras.via ? `Entrou no sistema (${extras.via})` : 'Entrou no sistema' });
    return res.json({
        mensagem,
        token: gerarTokenSessao(usuario),
        redirecionarPara: destinoDoPapel(usuario.tipo_usuario),
        trocarSenha: Number(usuario.primeiro_acesso) === 1,
        aceitarTermos: precisaAceitar(usuario),
        versaoTermos: VERSAO_TERMOS,
        ...(extras.dispositivo ? { dispositivo: extras.dispositivo } : {}),
        usuario: { id_usuario: usuario.id_usuario, nome: usuario.nome, tipo_usuario: usuario.tipo_usuario }
    });
}

// Senha conferida: entra direto ou pede o código por e-mail.
async function liberarOuPedirCodigo(req, res, usuario, mensagem, via) {
    if (!exige2fa(usuario) || await doisFatores.aparelhoConfiavel(usuario.id_usuario, req.body?.dispositivo).catch(() => false)) {
        return concluirLogin(req, res, usuario, mensagem, { via });
    }
    if (await doisFatores.codigosRecentes(usuario.id_usuario, 15) >= 5) {
        return res.status(429).json({ erro: 'Muitos códigos pedidos em pouco tempo. Aguarde 15 minutos.' });
    }
    const desafio = crypto.randomBytes(32).toString('base64url');
    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await doisFatores.criarCodigo(usuario.id_usuario, desafio, codigo, MINUTOS_CODIGO);
    enviarEmSegundoPlano({
        to: usuario.email,
        subject: `${codigo} é o seu código de acesso - Portaria Inteligente`,
        text: `Seu código de acesso é ${codigo}. Ele vale por ${MINUTOS_CODIGO} minutos. Se não foi você, troque sua senha.`,
        html: montarEmailHtml({
            titulo: 'Código de acesso',
            saudacao: `Olá, <strong>${escaparHtml(usuario.nome)}</strong>.`,
            paragrafos: ['Use o código abaixo para terminar de entrar no Portaria Inteligente:'],
            destaque: `<p style="margin:0;text-align:center;font-family:monospace;font-size:30px;letter-spacing:8px;font-weight:bold;color:#0A192F">${codigo}</p>`,
            rodape: `O código vale por ${MINUTOS_CODIGO} minutos e só pode ser usado uma vez. Se não foi você que tentou entrar, troque sua senha agora: alguém pode conhecê-la.`
        }),
        tag: 'codigo-acesso', tentativas: 2
    }, 'código de acesso');
    auditar(req, 'LOGIN_2FA_ENVIADO', { usuario, alvo_tipo: 'USUARIO', alvo_id: usuario.id_usuario });
    return res.json({ doisFatores: true, desafio, email: mascararEmail(usuario.email), validadeMin: MINUTOS_CODIGO, mensagem: 'Enviamos um código de 6 números para o seu e-mail.' });
}

const usuariosController = {
    // 2ª etapa do login: confere o código enviado por e-mail.
    confirmarCodigo: async (req, res) => {
        try {
            const { desafio, codigo, confiar } = req.body || {};
            if (typeof desafio !== 'string' || desafio.length > 100 || typeof codigo !== 'string' || !/^\d{6}$/.test(codigo.trim())) {
                return res.status(400).json({ erro: 'Digite os 6 números do código.' });
            }
            const registro = await doisFatores.buscarDesafio(desafio);
            if (!registro) return res.status(400).json({ erro: 'O código expirou. Entre com a senha de novo para receber outro.', expirado: true });
            if (registro.tentativas >= 5) return res.status(429).json({ erro: 'Código bloqueado depois de 5 erros. Entre com a senha de novo.', expirado: true });
            const confere = crypto.timingSafeEqual(Buffer.from(registro.codigo_hash, 'hex'), Buffer.from(doisFatores.hash(codigo.trim()), 'hex'));
            if (!confere) {
                await doisFatores.registrarErro(registro.codigo_id);
                auditar(req, 'LOGIN_2FA_FALHOU', { usuario: { id_usuario: registro.usuario_id }, alvo_tipo: 'USUARIO', alvo_id: registro.usuario_id });
                const restam = 4 - registro.tentativas;
                return res.status(400).json({ erro: restam > 0 ? `Código incorreto. Você ainda tem ${restam} tentativa(s).` : 'Código incorreto. Entre com a senha de novo.', expirado: restam <= 0 });
            }
            if (!(await doisFatores.marcarUsado(registro.codigo_id))) return res.status(400).json({ erro: 'Este código já foi usado.', expirado: true });
            const conta = await usuariosModel.buscarContaPorId(registro.usuario_id);
            const usuario = conta && await usuariosModel.buscarPorEmail(conta.email);
            if (!usuario || !usuariosModel.estaAtivo(usuario)) return res.status(403).json({ erro: MSG_PERFIL_DESATIVADO });
            let dispositivo = null;
            if (confiar === true) {
                dispositivo = crypto.randomBytes(32).toString('base64url');
                const aparelho = String(req.headers['user-agent'] || '').slice(0, 120);
                await doisFatores.confiarAparelho(usuario.id_usuario, dispositivo, aparelho, DIAS_APARELHO);
            }
            return concluirLogin(req, res, usuario, 'Login realizado com sucesso!', { via: 'senha + código por e-mail', dispositivo });
        } catch (error) {
            console.error('Erro ao conferir código de acesso:', error);
            return res.status(500).json({ erro: 'Não foi possível conferir o código agora.' });
        }
    },

    // LGPD: o titular baixa uma cópia de todos os seus dados (arquivo JSON).
    meusDados: async (req, res) => {
        try {
            const dados = await usuariosModel.exportarDados(req.usuario.id_usuario);
            auditar(req, 'DADOS_EXPORTADOS', { alvo_tipo: 'USUARIO', alvo_id: req.usuario.id_usuario });
            res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="meus-dados-portaria-inteligente.json"', 'Cache-Control': 'no-store' });
            return res.send(JSON.stringify({ gerado_em: new Date().toISOString(), sistema: 'Portaria Inteligente', ...dados }, null, 2));
        } catch (error) {
            console.error('Erro ao exportar dados do titular:', error);
            return res.status(500).json({ erro: 'Não foi possível gerar o arquivo agora.' });
        }
    },

    // LGPD: o responsável pede a exclusão da própria conta (precisa da senha e digitar EXCLUIR).
    excluirConta: async (req, res) => {
        try {
            const { senha, confirmacao } = req.body || {};
            const id = req.usuario.id_usuario;
            if (String(req.usuario.tipo_usuario).toUpperCase() !== 'PAI') {
                return res.status(403).json({ erro: 'Contas da equipe da escola são encerradas pela administração. Procure o administrador do sistema.' });
            }
            if (confirmacao !== 'EXCLUIR' || typeof senha !== 'string' || !senha) return res.status(400).json({ erro: 'Digite sua senha e a palavra EXCLUIR para confirmar.' });
            const hashAtual = await usuariosModel.buscarSenhaHashPorId(id);
            if (!hashAtual || !(await bcrypt.compare(senha, hashAtual))) return res.status(400).json({ erro: 'Senha incorreta.' });
            if (await usuariosModel.pedidosEmAndamento(id)) {
                return res.status(409).json({ erro: 'Existe uma saída em andamento (pendente, aprovada ou com o aluno fora da escola). Aguarde ela terminar ou peça o cancelamento à secretaria.' });
            }
            const conta = await usuariosModel.buscarContaPorId(id);
            await usuariosModel.anonimizar(id, await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10));
            auditar(req, 'CONTA_EXCLUIDA', { alvo_tipo: 'USUARIO', alvo_id: id, descricao: `Conta #${id} excluída a pedido do titular (dados pessoais anonimizados)` });
            if (conta?.email) enviarEmSegundoPlano({
                to: conta.email, subject: 'Sua conta foi excluída - Portaria Inteligente',
                text: 'Sua conta no Portaria Inteligente foi excluída e seus dados pessoais foram apagados.',
                html: montarEmailHtml({ titulo: 'Conta excluída', saudacao: `Olá, <strong>${escaparHtml(conta.nome)}</strong>.`,
                    paragrafos: ['Conforme o seu pedido, sua conta foi excluída e seus dados pessoais (nome, CPF, e-mail, telefone, mensagens e aparelhos) foram apagados.',
                        'O registro das saídas dos alunos continua com a escola, sem identificar você, porque é necessário para a segurança dos alunos.'] })
            }, 'confirmação de exclusão de conta');
            return res.json({ mensagem: 'Conta excluída. Seus dados pessoais foram apagados.' });
        } catch (error) {
            console.error('Erro ao excluir conta:', error);
            return res.status(500).json({ erro: 'Não foi possível excluir a conta agora.' });
        }
    },

    // LGPD: registra o aceite do termo de uso e da política de privacidade.
    aceitarTermos: async (req, res) => {
        try {
            if (req.body?.aceito !== true || req.body?.versao !== VERSAO_TERMOS) return res.status(400).json({ erro: 'Marque que leu e aceita o termo e a política de privacidade.' });
            await usuariosModel.registrarAceiteTermos(req.usuario.id_usuario, VERSAO_TERMOS);
            auditar(req, 'TERMOS_ACEITOS', { alvo_tipo: 'USUARIO', alvo_id: req.usuario.id_usuario, descricao: `Aceitou o termo e a política de privacidade (versão ${VERSAO_TERMOS})` });
            return res.json({ mensagem: 'Obrigado! Aceite registrado.', versao: VERSAO_TERMOS });
        } catch (error) {
            console.error('Erro ao registrar aceite:', error);
            return res.status(500).json({ erro: 'Não foi possível registrar o aceite agora.' });
        }
    },

    cadastrar: async (req, res) => {
        try {
            const { nome, cpf, email, telefone, senha, tipo_usuario, status } = req.body;

            if (!nome || !cpf || !email || !telefone || !senha || !tipo_usuario) {
                return res.status(400).json({ erro: 'Todos os campos obrigatórios devem ser preenchidos.' });
            }
            if (String(nome).trim().length > 150 || !emailValido(email)) {
                return res.status(400).json({ erro: 'Nome ou e-mail inválido.' });
            }
            const problemaSenha = validarSenha(senha);
            if (problemaSenha) return res.status(400).json({ erro: problemaSenha });

            const usuarioExistente = await usuariosModel.buscarPorEmail(email);
            if (usuarioExistente) {
                return res.status(400).json({ erro: 'E-mail já cadastrado.' });
            }

            const checagemEmail = await verificarEmail(email);
            if (!checagemEmail.valido) {
                return res.status(400).json({ erro: checagemEmail.motivo, sugestao: checagemEmail.sugestao });
            }

            const senhaHash = await bcrypt.hash(senha, 10);
            const tipoPadronizado = String(tipo_usuario).trim().toUpperCase();
            const papeisPermitidos = req.usuario.tipo_usuario === 'ADMIN'
                ? ['PAI', 'SECRETARIA', 'PORTARIA', 'PROFESSOR']
                : ['PAI', 'PORTARIA'];
            if (!papeisPermitidos.includes(tipoPadronizado)) {
                return res.status(403).json({ erro: 'Perfil não permitido para cadastro.' });
            }

            const id = await usuariosModel.cadastrar(
                String(nome).trim(),
                formatarCPF(cpf),
                String(email).trim().toLowerCase(),
                formatarTelefone(telefone),
                senhaHash,
                tipoPadronizado,
                status === '0' ? '0' : '1'
            );

            auditar(req, 'USUARIO_CRIADO', { alvo_tipo: 'USUARIO', alvo_id: id, descricao: `Cadastrou ${String(nome).trim()} (${tipoPadronizado})` });
            // Não devolve token do usuário criado: quem cadastra (secretaria) não pode
            // receber uma sessão em nome de outra pessoa.
            return res.status(201).json({
                mensagem: 'Usuário cadastrado com sucesso!',
                id_usuario: id
            });
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'CPF ou e-mail já cadastrado.' });
            console.error('Erro no cadastro:', error);
            return res.status(500).json({ erro: 'Erro ao cadastrar usuário.' });
        }
    },

    login: async (req, res) => {
        try {
            const { email, senha } = req.body;

            if (typeof email !== 'string' || typeof senha !== 'string' || !email.trim() || !senha) {
                return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });
            }
            if (email.length > 150 || senha.length > 200) {
                return res.status(401).json({ erro: 'Credenciais inválidas.' });
            }

            // Login só por e-mail (antes também aceitava "nome parecido", o que permitia
            // entrar na conta errada e facilitava adivinhação).
            const usuario = await usuariosModel.buscarPorEmail(email.trim());

            if (!usuario) {
                try { await bcrypt.compare(senha, HASH_FICTICIO); } catch (_) { /* só para gastar o mesmo tempo */ }
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
                const a = Buffer.from(String(senha));
                const b = Buffer.from(String(usuario.senha || ''));
                senhaValida = a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
                if (senhaValida) {
                    const novaSenhaHash = await bcrypt.hash(senha, 10);
                    await usuariosModel.atualizarSenha(usuario.id_usuario, novaSenhaHash);
                }
            }

            if (!senhaValida) {
                auditar(req, 'LOGIN_FALHOU', { usuario: usuario, alvo_tipo: 'USUARIO', alvo_id: usuario.id_usuario, descricao: 'Senha incorreta' });
                return res.status(401).json({ erro: 'Credenciais inválidas.' });
            }

            // Só depois de confirmar a senha avisamos que o perfil está desativado
            // (assim não dá para descobrir quais e-mails existem sem saber a senha).
            if (!usuariosModel.estaAtivo(usuario)) {
                return res.status(403).json({ erro: MSG_PERFIL_DESATIVADO });
            }

            // Primeiro acesso (troca de senha obrigatória) e aceite da LGPD são tratados na
            // resposta; secretaria/admin ainda precisam do código enviado por e-mail.
            return await liberarOuPedirCodigo(req, res, usuario, 'Login realizado com sucesso!', 'senha');
        } catch (error) {
            console.error('Erro no login:', error);
            return res.status(500).json({ erro: 'Erro interno ao realizar login.' });
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

            if (!usuariosModel.estaAtivo(usuario)) {
                return res.status(403).json({ erro: MSG_PERFIL_DESATIVADO });
            }

            return await liberarOuPedirCodigo(req, res, usuario, 'Autenticação via Google realizada com sucesso!', 'Google');
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

    // Primeiro acesso: troca obrigatória da senha temporária.
    primeiraSenha: async (req, res) => {
        try {
            const { senhaAtual, novaSenha } = req.body || {};
            const id = req.usuario.id_usuario;
            if (typeof senhaAtual !== 'string' || !senhaAtual || typeof novaSenha !== 'string') {
                return res.status(400).json({ erro: 'Informe a senha temporária e a nova senha.' });
            }
            const problema = validarSenha(novaSenha);
            if (problema) return res.status(400).json({ erro: problema });
            if (novaSenha === senhaAtual) return res.status(400).json({ erro: 'A nova senha precisa ser diferente da senha temporária.' });

            const hashAtual = await usuariosModel.buscarSenhaHashPorId(id);
            let confere = false;
            if (hashAtual && /^\$2[aby]\$/.test(hashAtual)) confere = await bcrypt.compare(senhaAtual, hashAtual);
            else if (hashAtual) {
                const a = Buffer.from(senhaAtual), b = Buffer.from(String(hashAtual));
                confere = a.length === b.length && crypto.timingSafeEqual(a, b);
            }
            if (!confere) return res.status(400).json({ erro: 'A senha temporária está incorreta.' });

            if (req.body.aceitoTermos !== true) return res.status(400).json({ erro: 'Para continuar, leia e aceite o termo de uso e a política de privacidade.' });
            await usuariosModel.trocarSenha(id, await bcrypt.hash(novaSenha, 10));
            await usuariosModel.registrarAceiteTermos(id, VERSAO_TERMOS);
            auditar(req, 'SENHA_TROCADA', { alvo_tipo: 'USUARIO', alvo_id: id, descricao: 'Definiu a senha no primeiro acesso' });
            auditar(req, 'TERMOS_ACEITOS', { alvo_tipo: 'USUARIO', alvo_id: id, descricao: `Aceitou o termo e a política de privacidade (versão ${VERSAO_TERMOS})` });
            const conta = await usuariosModel.buscarContaPorId(id);
            const atual = conta && await usuariosModel.buscarPorEmail(conta.email);
            return res.json({ mensagem: 'Senha definida! Bem-vindo(a) ao Portaria Inteligente.', token: atual ? gerarTokenSessao(atual) : null });
        } catch (error) {
            console.error('Erro ao definir a primeira senha:', error);
            return res.status(500).json({ erro: 'Não foi possível salvar a nova senha agora.' });
        }
    },

    atualizarConta: async (req, res) => {
        try {
            const { nome, email, telefone, senhaAtual, novaSenha } = req.body || {};
            const id = req.usuario.id_usuario;

            const nomeLimpo = typeof nome === 'string' && nome.trim() ? nome.trim() : null;
            if (nomeLimpo && nomeLimpo.length > 150) return res.status(400).json({ erro: 'Nome muito longo (máximo 150 caracteres).' });
            const emailLimpo = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
            if (emailLimpo) {
                if (!emailValido(emailLimpo)) return res.status(400).json({ erro: 'E-mail inválido.' });
                if (await usuariosModel.buscarEmailDeOutro(emailLimpo, id)) {
                    return res.status(409).json({ erro: 'Este e-mail já está em uso por outra conta.' });
                }
            }
            if (telefone && String(telefone).length > 20) return res.status(400).json({ erro: 'Telefone inválido.' });

            let novoToken = null;
            if (typeof novaSenha === 'string' && novaSenha.trim() !== '') {
                if (!senhaAtual) {
                    return res.status(400).json({ erro: 'Informe a senha atual para definir uma nova senha.' });
                }
                const problemaSenha = validarSenha(novaSenha);
                if (problemaSenha) return res.status(400).json({ erro: problemaSenha });

                const hashAtual = await usuariosModel.buscarSenhaHashPorId(id);
                const senhaConfere = hashAtual && await bcrypt.compare(String(senhaAtual), hashAtual);

                if (!senhaConfere) {
                    return res.status(400).json({ erro: 'Senha atual incorreta.' });
                }
                await usuariosModel.trocarSenha(id, await bcrypt.hash(novaSenha, 10));
            }

            await usuariosModel.atualizarConta(id, nomeLimpo, emailLimpo, telefone ? formatarTelefone(telefone) : null, null);
            auditar(req, novaSenha && String(novaSenha).trim() ? 'SENHA_TROCADA' : 'CONTA_ATUALIZADA', { alvo_tipo: 'USUARIO', alvo_id: id,
                descricao: novaSenha && String(novaSenha).trim() ? 'Alterou a própria senha e os dados da conta' : 'Alterou os próprios dados da conta' });

            // A troca de senha derruba as outras sessões; esta aba recebe um token novo.
            const atual = await usuariosModel.buscarPorEmail(emailLimpo || (await usuariosModel.buscarContaPorId(id)).email);
            if (atual) novoToken = gerarTokenSessao(atual);
            return res.json({ mensagem: 'Conta atualizada com sucesso!', token: novoToken });
        } catch (error) {
            console.error('Erro ao atualizar conta:', error);
            return res.status(500).json({ erro: 'Erro ao atualizar conta.' });
        }
    },

    solicitarRecuperacao: async (req, res) => {
        try {
            const MENSAGEM = 'Se o e-mail estiver cadastrado, você receberá um link de redefinição em alguns minutos.';
            const { email } = req.body || {};
            if (typeof email !== 'string' || !email.trim()) return res.status(400).json({ erro: 'E-mail é obrigatório.' });
            if (!emailValido(email)) return res.json({ mensagem: MENSAGEM });

            const usuario = await usuariosModel.buscarPorEmail(email.trim());
            // Mesma resposta exista ou não a conta (não dá para descobrir quem é cadastrado).
            if (!usuario || !usuariosModel.estaAtivo(usuario)) {
                return res.json({ mensagem: MENSAGEM });
            }

            const tokenReset = gerarTokenReset(usuario);
            const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
            const linkRecuperacao = `${baseUrl}/reset_password.html?token=${encodeURIComponent(tokenReset)}`;
            enviarEmSegundoPlano({
                to: usuario.email,
                subject: 'Redefinição de senha - Portaria Inteligente',
                text: `Olá ${usuario.nome}, acesse o link para redefinir sua senha (válido por 30 minutos): ${linkRecuperacao}`,
                html: montarEmailHtml({
                    titulo: 'Redefinição de senha',
                    saudacao: `Olá, <strong>${escaparHtml(usuario.nome)}</strong>.`,
                    paragrafos: ['Você solicitou a redefinição de senha da sua conta no Portaria Inteligente. Clique no botão abaixo para criar uma nova senha:'],
                    botao: { texto: 'Redefinir senha', url: linkRecuperacao },
                    rodape: 'Este link expira em 30 minutos e só pode ser usado uma vez. Se você não fez essa solicitação, ignore este e-mail: sua senha continua a mesma.'
                })
            }, 'link de redefinição de senha');

            return res.json({ mensagem: MENSAGEM });
        } catch (error) {
            console.error('Erro ao solicitar recuperação de senha:', error);
            return res.status(500).json({ erro: 'Não foi possível processar a solicitação agora. Tente novamente.' });
        }
    },

    redefinirSenha: async (req, res) => {
        try {
            const { token, novaSenha } = req.body || {};

            if (typeof token !== 'string' || !token || typeof novaSenha !== 'string' || !novaSenha) {
                return res.status(400).json({ erro: 'Token e nova senha são obrigatórios.' });
            }
            const problemaSenha = validarSenha(novaSenha);
            if (problemaSenha) return res.status(400).json({ erro: problemaSenha });

            let decoded;
            try {
                decoded = jwt.verify(token, SEGREDO, { algorithms: ['HS256'] });
            } catch (_) {
                return res.status(400).json({ erro: 'Link inválido ou expirado. Solicite um novo.' });
            }
            // Só aceita o token do link de redefinição (antes, qualquer token de login servia
            // para trocar a senha sem saber a senha atual).
            if (decoded.proposito !== 'reset') {
                return res.status(400).json({ erro: 'Link inválido ou expirado. Solicite um novo.' });
            }
            const registro = await usuariosModel.buscarStatusPorId(decoded.id_usuario);
            if (!registro || !usuariosModel.estaAtivo(registro) ||
                Number(registro.token_versao || 0) !== Number(decoded.tv || 0)) {
                return res.status(400).json({ erro: 'Este link já foi usado ou expirou. Solicite um novo.' });
            }

            await usuariosModel.trocarSenha(decoded.id_usuario, await bcrypt.hash(novaSenha, 10));
            doisFatores.esquecerAparelhos(decoded.id_usuario).catch(() => {});
            auditar(req, 'SENHA_REDEFINIDA', { alvo_tipo: 'USUARIO', alvo_id: decoded.id_usuario, usuario: { id_usuario: decoded.id_usuario } });
            return res.json({ mensagem: 'Senha redefinida com sucesso!' });
        } catch (error) {
            console.error('Erro ao redefinir senha:', error);
            return res.status(500).json({ erro: 'Não foi possível redefinir a senha agora.' });
        }
    },

    // Verifica se um e-mail é válido e se o domínio existe (usado pelo formulário
    // de vincular responsável antes de enviar).
    verificarEmail: async (req, res) => {
        try {
            const { email } = req.body;
            const resultado = await verificarEmail(email);
            const existente = resultado.valido ? await usuariosModel.buscarPorEmail(String(email).trim()) : null;
            return res.json({ ...resultado, jaCadastrado: !!existente });
        } catch (error) {
            console.error('Erro ao verificar e-mail:', error);
            return res.status(500).json({ erro: 'Erro ao verificar e-mail.' });
        }
    },

    // ADMIN/SECRETARIA: cria o login de alguém da equipe (secretaria, portaria ou professor).
    // O sistema gera a senha temporária e manda o convite por e-mail; no 1º acesso a pessoa
    // confirma o código do e-mail, cria a própria senha e aceita a política de privacidade.
    criarEquipe: async (req, res) => {
        try {
            const nome = String(req.body?.nome ?? '').replace(/\s+/g, ' ').trim();
            const email = String(req.body?.email ?? '').trim().toLowerCase();
            const tipo = String(req.body?.tipo_usuario ?? '').trim().toUpperCase();
            const cpfInformado = String(req.body?.cpf ?? '').replace(/\D/g, '');
            const telefoneInformado = String(req.body?.telefone ?? '').replace(/\D/g, '');

            if (nome.length < 3 || nome.length > 150 || /[<>{}]/.test(nome)) return res.status(400).json({ erro: 'Informe o nome completo (3 a 150 caracteres).' });
            if (!emailValido(email)) return res.status(400).json({ erro: 'E-mail inválido.' });
            if (!['SECRETARIA', 'PORTARIA', 'PROFESSOR'].includes(tipo)) return res.status(400).json({ erro: 'Escolha o perfil: Secretaria, Portaria ou Professor.' });
            if (!podeGerirEquipe(req.usuario.tipo_usuario, tipo)) {
                return res.status(403).json({ erro: tipo === 'SECRETARIA' ? 'Somente o administrador pode criar logins da secretaria.' : 'Você não tem permissão para criar este perfil.' });
            }
            if (cpfInformado && cpfInformado.length !== 11) return res.status(400).json({ erro: 'CPF deve ter 11 números (ou deixe em branco).' });
            if (telefoneInformado && (telefoneInformado.length < 10 || telefoneInformado.length > 11)) return res.status(400).json({ erro: 'Telefone inválido (DDD + número) ou deixe em branco.' });

            if (await usuariosModel.buscarPorEmail(email)) return res.status(409).json({ erro: 'Já existe uma conta com este e-mail.' });
            const checagemEmail = await verificarEmail(email);
            if (!checagemEmail.valido) return res.status(400).json({ erro: checagemEmail.motivo, sugestao: checagemEmail.sugestao });

            const senhaTemporaria = gerarSenhaAleatoria();
            // CPF é obrigatório e único no banco; para a equipe é opcional, então usa um identificador provisório.
            const cpf = cpfInformado ? formatarCPF(cpfInformado) : `PROV-${crypto.randomBytes(5).toString('hex')}`;
            const id = await usuariosModel.cadastrarEquipe(nome, cpf, email,
                telefoneInformado ? formatarTelefone(telefoneInformado) : null, await bcrypt.hash(senhaTemporaria, 10), tipo);

            auditar(req, 'USUARIO_CRIADO', { alvo_tipo: 'USUARIO', alvo_id: id, descricao: `Criou o login de ${nome} (${ROTULO_PERFIL[tipo]}) e enviou o convite para ${email}` });
            const emailEnviado = await enviarConvite({ nome, email, tipo, senha: senhaTemporaria, quem: req.usuario.nome });
            return res.status(201).json({
                id_usuario: id, nome, email, tipo_usuario: tipo,
                senha_temporaria: senhaTemporaria,
                email_enviado: emailEnviado,
                mensagem: emailEnviado ? `Login criado. O convite foi enviado para ${email}.` : 'Login criado, mas o e-mail não foi enviado. Passe a senha temporária para a pessoa.'
            });
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'CPF ou e-mail já cadastrado.' });
            console.error('Erro ao criar login da equipe:', error);
            return res.status(500).json({ erro: 'Erro ao criar o login.' });
        }
    },

    // ADMIN/SECRETARIA: "Reenviar convite" — gera nova senha temporária e manda por e-mail.
    reenviarConvite: async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (id === req.usuario.id_usuario) return res.status(400).json({ erro: 'Para a sua própria conta, use "Minha Conta" ou "Esqueci minha senha".' });
            const alvo = await usuariosModel.buscarPorId(id);
            if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado.' });
            const papelAlvo = String(alvo.tipo_usuario || '').toUpperCase();
            if (!podeGerirEquipe(req.usuario.tipo_usuario, papelAlvo)) return res.status(403).json({ erro: 'Você não tem permissão para gerar senha para este perfil.' });
            if (!usuariosModel.estaAtivo(alvo)) return res.status(409).json({ erro: 'Este perfil está desativado. Reative antes de reenviar o convite.' });

            const senhaTemporaria = gerarSenhaAleatoria();
            await usuariosModel.definirSenhaTemporaria(id, await bcrypt.hash(senhaTemporaria, 10));
            doisFatores.esquecerAparelhos(id).catch(() => {});
            auditar(req, 'CONVITE_REENVIADO', { alvo_tipo: 'USUARIO', alvo_id: id, descricao: `Gerou nova senha temporária para ${alvo.nome} (${ROTULO_PERFIL[papelAlvo] || papelAlvo})` });
            const emailEnviado = await enviarConvite({ nome: alvo.nome, email: alvo.email, tipo: papelAlvo, senha: senhaTemporaria, reenvio: true });
            return res.json({
                senha_temporaria: senhaTemporaria, email_enviado: emailEnviado, nome: alvo.nome, email: alvo.email,
                mensagem: emailEnviado ? `Nova senha temporária enviada para ${alvo.email}.` : 'Nova senha gerada, mas o e-mail não foi enviado. Passe a senha temporária para a pessoa.'
            });
        } catch (error) {
            console.error('Erro ao reenviar convite:', error);
            return res.status(500).json({ erro: 'Erro ao gerar a nova senha.' });
        }
    },

    // SECRETARIA/ADMIN: lista os perfis que podem ser ativados/desativados.
    listarPerfis: async (req, res) => {
        try {
            const papelLogado = (req.usuario.tipo_usuario || '').toUpperCase();
            const tipos = papelLogado === 'ADMIN'
                ? ['PAI', 'PORTARIA', 'PORTEIRO', 'SECRETARIA', 'PROFESSOR']
                : ['PAI', 'PORTARIA', 'PORTEIRO', 'PROFESSOR'];
            const perfis = await usuariosModel.listarPerfis(tipos);
            return res.json(perfis.map(p => ({
                ...p,
                ativo: usuariosModel.estaAtivo(p),
                eu: p.id_usuario === req.usuario.id_usuario,
                aguardando_primeiro_acesso: Number(p.primeiro_acesso) === 1,
                pode_reenviar: p.id_usuario !== req.usuario.id_usuario && podeGerirEquipe(papelLogado, String(p.tipo_usuario).toUpperCase())
            })));
        } catch (error) {
            console.error('Erro ao listar perfis:', error);
            return res.status(500).json({ erro: 'Erro ao listar perfis.' });
        }
    },

    // SECRETARIA/ADMIN: ativa ou desativa um perfil. Perfil desativado não consegue
    // entrar (login) e perde o acesso na hora, mesmo com sessão aberta (ver middleware auth).
    alterarStatus: async (req, res) => {
        try {
            const id = Number(req.params.id);
            const { ativo } = req.body;

            if (!Number.isInteger(id) || typeof ativo !== 'boolean') {
                return res.status(400).json({ erro: 'Informe o usuário e o campo "ativo" (true/false).' });
            }
            if (id === req.usuario.id_usuario) {
                return res.status(400).json({ erro: 'Você não pode desativar o seu próprio perfil.' });
            }

            const alvo = await usuariosModel.buscarPorId(id);
            if (!alvo) return res.status(404).json({ erro: 'Usuário não encontrado.' });

            const papelAlvo = (alvo.tipo_usuario || '').toUpperCase();
            const papelLogado = (req.usuario.tipo_usuario || '').toUpperCase();
            const secretariaPodeGerir = ['PAI', 'PORTARIA', 'PORTEIRO', 'PROFESSOR'];
            if (papelLogado !== 'ADMIN' && !secretariaPodeGerir.includes(papelAlvo)) {
                return res.status(403).json({ erro: 'Você não tem permissão para alterar este tipo de perfil.' });
            }

            await usuariosModel.atualizarStatus(id, ativo ? '1' : '0');
            auditar(req, ativo ? 'PERFIL_ATIVADO' : 'PERFIL_DESATIVADO', { alvo_tipo: 'USUARIO', alvo_id: id, descricao: `${ativo ? 'Reativou' : 'Desativou'} o perfil de ${alvo.nome} (${papelAlvo})` });
            return res.json({
                mensagem: ativo ? `Perfil de ${alvo.nome} reativado.` : `Perfil de ${alvo.nome} desativado.`,
                ativo
            });
        } catch (error) {
            console.error('Erro ao alterar status do perfil:', error);
            return res.status(500).json({ erro: 'Erro ao alterar status do perfil.' });
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
            if (String(nome).length > 150 || String(nome_aluno).length > 150 || !emailValido(email) ||
                String(cpf).replace(/\D/g, '').length !== 11) {
                return res.status(400).json({ erro: 'Confira nome, CPF (11 dígitos) e e-mail.' });
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
                    auditar(req, 'RESPONSAVEL_VINCULADO', { alvo_tipo: 'ALUNO', alvo_id: aluno_id, descricao: `Vinculou ${nome_aluno} à conta de ${existente.nome}` });
                }

                let emailEnviado = true;
                try {
                    await enviarEmail({
                        to: email,
                        subject: 'Novo aluno vinculado à sua conta - Portaria Inteligente',
                        text: `Olá ${existente.nome}, o aluno ${nome_aluno} foi vinculado à sua conta existente. Use seu e-mail e senha de sempre para acessar.`,
                        html: montarEmailHtml({
                            titulo: 'Novo aluno vinculado à sua conta',
                            saudacao: `Olá, <strong>${escaparHtml(existente.nome)}</strong>.`,
                            paragrafos: [`O aluno <strong>${escaparHtml(nome_aluno)}</strong> foi vinculado à sua conta já existente no sistema.`],
                            rodape: 'Você já pode ver os dois filhos ao criar uma nova solicitação de saída, usando seu e-mail e senha de sempre.'
                        })
                    });
                } catch (erroEmail) {
                    console.error('Erro ao enviar e-mail de novo vínculo:', erroEmail);
                    emailEnviado = false;
                }

                return res.status(200).json({
                    aluno_id,
                    mensagem: jaVinculado
                        ? `Este aluno já estava vinculado à conta de ${existente.nome}.`
                        : (emailEnviado
                            ? `Aluno vinculado à conta já existente de ${existente.nome}. E-mail de aviso enviado.`
                            : `Aluno vinculado à conta já existente de ${existente.nome}, mas não foi possível enviar o e-mail de aviso.`)
                });
            }

            // Conta nova: confere se o e-mail informado existe antes de criar a conta
            // e mandar a senha temporária para ele.
            const checagemEmail = await verificarEmail(email);
            if (!checagemEmail.valido) {
                return res.status(400).json({ erro: checagemEmail.motivo, sugestao: checagemEmail.sugestao });
            }

            const senhaTemporaria = gerarSenhaAleatoria();
            const senhaHash = await bcrypt.hash(senhaTemporaria, 10);

            const usuario_id = await usuariosModel.cadastrar(
                String(nome).trim(), formatarCPF(cpf), String(email).trim().toLowerCase(), formatarTelefone(telefone), senhaHash, 'PAI', '1'
            );

            const aluno_id = await alunosModel.buscarOuCriar(nome_aluno, turma_id || null);
            await responsaveisAlunosModel.vincular(usuario_id, aluno_id, parentesco || 'Responsável');
            auditar(req, 'RESPONSAVEL_VINCULADO', { alvo_tipo: 'ALUNO', alvo_id: aluno_id, descricao: `Criou a conta de ${String(nome).trim()} e vinculou ao aluno ${nome_aluno}` });

            let emailEnviado = true;
            try {
                await enviarEmail({
                    to: email,
                    subject: 'Sua conta de acesso foi criada - Portaria Inteligente',
                    text: `Olá ${nome}, sua conta foi criada. E-mail: ${email} | Senha temporária: ${senhaTemporaria}`,
                    html: montarEmailHtml({
                        titulo: 'Bem-vindo ao Controle de Saídas',
                        saudacao: `Olá, <strong>${escaparHtml(nome)}</strong>.`,
                        paragrafos: [`Sua conta de responsável vinculada ao aluno <strong>${escaparHtml(nome_aluno)}</strong> foi cadastrada com sucesso.`],
                        destaque: `
                            <p style="margin: 0 0 6px 0; color: #2d3748; font-size: 13px;"><strong>E-mail de acesso:</strong> ${escaparHtml(email)}</p>
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
                aluno_id,
                mensagem: emailEnviado
                    ? `Conta criada e senha enviada por e-mail para ${email}.`
                    : `Conta criada, mas não foi possível enviar o e-mail. Informe a senha manualmente.`
            };

            if (!emailEnviado) {
                resposta.senha_temporaria = senhaTemporaria;
            }

            return res.status(201).json(resposta);
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'CPF ou e-mail já cadastrado.' });
            console.error('Erro ao criar conta do responsável:', error);
            return res.status(500).json({ erro: 'Erro ao criar conta do responsável.' });
        }
    }
};

module.exports = usuariosController;