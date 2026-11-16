const jwt = require('jsonwebtoken');

// Sem valor padrão embutido: se JWT_SECRET não estiver no .env, o servidor
// falha ao iniciar em vez de assinar/validar tokens com uma senha fixa que
// está no código-fonte (e portanto pode vazar/ser conhecida por qualquer um
// que tenha acesso a este repositório).
const SEGREDO = process.env.JWT_SECRET;
if (!SEGREDO) {
    throw new Error('Configuração incompleta: defina JWT_SECRET no .env antes de iniciar o servidor.');
}

const auth = async (req, res, next) => {
    const tokenHeader = req.headers['authorization'];
    
    if (!tokenHeader) {
        return res.status(401).json({ erro: 'Acesso negado. Token não fornecido.' });
    }

    const token = tokenHeader.startsWith('Bearer ')
        ? tokenHeader.split(' ')[1]
        : tokenHeader;

    try {
        const decoded = jwt.verify(token, SEGREDO, { algorithms: ['HS256'] });
        // Token com finalidade específica (ex.: link de redefinir senha que vai por e-mail)
        // não vale como login.
        if (decoded.proposito || !decoded.id_usuario) throw new Error('Token sem finalidade de sessão.');
        req.usuario = decoded; // Armazena os dados do usuário logado na requisição
    } catch (error) {
        return res.status(401).json({ erro: 'Token inválido ou expirado.' });
    }

    // Perfil desativado pela secretaria perde o acesso na hora, mesmo que o token
    // (válido por 8h) ainda não tenha expirado.
    try {
        const usuariosModel = require('../model/usuariosModel');
        const registro = await usuariosModel.buscarStatusPorId(req.usuario.id_usuario);
        if (!registro) {
            return res.status(401).json({ erro: 'Usuário não encontrado. Faça login novamente.' });
        }
        if (!usuariosModel.estaAtivo(registro)) {
            return res.status(403).json({ erro: 'Este perfil está desativado. Procure a secretaria da escola.', perfilDesativado: true });
        }
        // Troca/redefinição de senha aumenta token_versao: sessões antigas (inclusive um
        // token roubado) deixam de valer na hora.
        if (Number(registro.token_versao || 0) !== Number(req.usuario.tv || 0)) {
            return res.status(401).json({ erro: 'Sua sessão expirou. Faça login novamente.', sessaoExpirada: true });
        }
        // Primeiro acesso: a conta foi criada por outra pessoa (senha temporária). Até trocar a
        // senha, o usuário só pode ver os próprios dados e definir a senha nova.
        if (Number(registro.primeiro_acesso) === 1 && !rotaLiberadaNoPrimeiroAcesso(req)) {
            return res.status(403).json({ erro: 'Defina uma nova senha para continuar.', trocarSenha: true });
        }
        // O papel vigente vem do banco, para tokens antigos não manterem permissões revogadas.
        req.usuario.tipo_usuario = registro.tipo_usuario;
    } catch (error) {
        console.error('Erro ao conferir status do usuário:', error);
        return res.status(500).json({ erro: 'Erro ao validar o acesso do usuário.' });
    }

    next();
};

 

// Restringe uma rota a determinados papéis (ex: apenas SECRETARIA ou ADMIN)
 
const exigirPapel = (...papeisPermitidos) => {
    return (req, res, next) => {
        const papel = (req.usuario?.tipo_usuario || '').toUpperCase();
        if (!papeisPermitidos.map(p => p.toUpperCase()).includes(papel)) {
            return res.status(403).json({ erro: 'Você não tem permissão para realizar esta ação.' });
        }
        next();
    };
};

function rotaLiberadaNoPrimeiroAcesso(req) {
    const rota = (req.baseUrl || '') + (req.path || '');
    return rota === '/api/usuarios/primeira-senha' || (rota === '/api/usuarios/conta' && req.method === 'GET');
}

// Único lugar que gera token de sessão (login): assim todos levam a versão atual.
function gerarTokenSessao(usuario) {
    return jwt.sign(
        { id_usuario: usuario.id_usuario, tipo_usuario: usuario.tipo_usuario, nome: usuario.nome, tv: Number(usuario.token_versao || 0) },
        SEGREDO,
        { expiresIn: '8h', algorithm: 'HS256' }
    );
}

module.exports = { auth, SEGREDO, exigirPapel, gerarTokenSessao };