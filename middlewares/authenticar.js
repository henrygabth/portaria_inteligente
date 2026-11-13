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
        const decoded = jwt.verify(token, SEGREDO);

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

module.exports = { auth, SEGREDO, exigirPapel };