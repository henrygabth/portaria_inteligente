const jwt = require('jsonwebtoken');

// Sem valor padrão embutido: se JWT_SECRET não estiver no .env, o servidor
// falha ao iniciar em vez de assinar/validar tokens com uma senha fixa que
// está no código-fonte (e portanto pode vazar/ser conhecida por qualquer um
// que tenha acesso a este repositório).
const SEGREDO = process.env.JWT_SECRET;
if (!SEGREDO) {
    throw new Error('Configuração incompleta: defina JWT_SECRET no .env antes de iniciar o servidor.');
}

const auth = (req, res, next) => {
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

        next();
    } catch (error) {
        return res.status(401).json({ erro: 'Token inválido ou expirado.' });
    }
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