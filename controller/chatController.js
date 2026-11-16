const chat = require('../model/chatModel');
const equipe = require('../model/chatEquipeModel');
const tempoReal = require('../utils/tempoReal');
const avisosPush = require('../utils/avisosPush');

const MAX_TEXTO = 1000;
const MAX_POR_MINUTO = 15;

function tratarErro(res, err) {
    if (err.status) return res.status(err.status).json({ erro: err.message });
    console.error('[chat] Erro:', err);
    return res.status(500).json({ erro: 'Não foi possível processar a mensagem.' });
}

// Identificador gerado pelo navegador (só para não duplicar). Formato restrito.
function validarUuid(valor) {
    return typeof valor === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(valor) ? valor : null;
}

// Avisa em tempo real: o responsável dono da conversa (todas as abas) e toda a secretaria.
// Chamado só depois de a mensagem estar gravada no MySQL.
function emitir(mensagem) {
    try {
        tempoReal.publicarParaUsuario(mensagem.responsavel_id, 'chat:mensagem', { mensagem });
        tempoReal.publicarParaPapeis(['SECRETARIA', 'ADMIN'], 'chat:mensagem', { mensagem });
    } catch (err) { console.error('[chat] Falha ao emitir em tempo real:', err.message); }
}

function emitirLida(responsavelId, leitor) {
    try {
        const dados = { responsavel_id: responsavelId, leitor };
        if (leitor === 'RESPONSAVEL') tempoReal.publicarParaPapeis(['SECRETARIA', 'ADMIN'], 'chat:lida', dados);
        else { tempoReal.publicarParaUsuario(responsavelId, 'chat:lida', dados); tempoReal.publicarParaPapeis(['SECRETARIA', 'ADMIN'], 'chat:lida', dados); }
    } catch (err) { console.error('[chat] Falha ao emitir leitura:', err.message); }
}

function validarTexto(valor) {
    if (typeof valor !== 'string') return null;
    const texto = valor.replace(/\r\n/g, '\n').trim();
    return texto && texto.length <= MAX_TEXTO ? texto : null;
}

async function gravar(res, responsavelId, remetenteId, de, corpo) {
    const texto = validarTexto(corpo?.texto);
    if (!texto) return res.status(400).json({ erro: `Escreva uma mensagem de até ${MAX_TEXTO} caracteres.` });
    if (await chat.enviadasUltimoMinuto(remetenteId) >= MAX_POR_MINUTO) {
        return res.status(429).json({ erro: 'Muitas mensagens em pouco tempo. Aguarde um instante.' });
    }
    const uuid = validarUuid(corpo?.client_uuid);
    const { id, duplicada } = await chat.enviar(responsavelId, remetenteId, de, texto, uuid);
    const mensagem = await chat.buscarMensagem(id);
    // Mensagem repetida (mesmo client_uuid) não é emitida de novo.
    if (mensagem && !duplicada) { emitir(mensagem); avisosPush.avisarMensagem(mensagem); }
    return res.status(duplicada ? 200 : 201).json({ mensagem_id: id, duplicada, mensagem });
}

const PAPEIS_EQUIPE = ['SECRETARIA', 'ADMIN', 'PORTARIA', 'PORTEIRO'];

module.exports = {
    // ----- chat interno: secretaria <-> portaria -----
    equipeListar: async (req, res) => {
        try {
            const lado = equipe.ladoDoPapel(req.usuario.tipo_usuario);
            const avancou = await equipe.marcarLido(req.usuario.id_usuario);
            const [mensagens, vistoAte] = await Promise.all([equipe.listar(), equipe.vistoPeloOutroLado(lado)]);
            if (avancou) { try { tempoReal.publicarParaPapeis(PAPEIS_EQUIPE, 'equipe:lida', { lado }); } catch (_) { /* tempo real é opcional */ } }
            res.json({ mensagens, vistoAte, meuLado: lado, meuId: req.usuario.id_usuario });
        } catch (err) { tratarErro(res, err); }
    },
    equipeEnviar: async (req, res) => {
        try {
            const lado = equipe.ladoDoPapel(req.usuario.tipo_usuario);
            const texto = validarTexto(req.body?.texto);
            if (!texto) return res.status(400).json({ erro: `Escreva uma mensagem de até ${MAX_TEXTO} caracteres.` });
            if (await equipe.enviadasUltimoMinuto(req.usuario.id_usuario) >= MAX_POR_MINUTO) {
                return res.status(429).json({ erro: 'Muitas mensagens em pouco tempo. Aguarde um instante.' });
            }
            const { id, duplicada } = await equipe.enviar(req.usuario.id_usuario, lado, texto, validarUuid(req.body?.client_uuid));
            await equipe.marcarLido(req.usuario.id_usuario);
            const mensagem = await equipe.buscar(id);
            if (mensagem && !duplicada) {
                try { tempoReal.publicarParaPapeis(PAPEIS_EQUIPE, 'equipe:mensagem', { mensagem }); }
                catch (e) { console.error('[chat] Falha ao emitir (equipe):', e.message); }
            }
            res.status(duplicada ? 200 : 201).json({ mensagem_id: id, duplicada, mensagem });
        } catch (err) { tratarErro(res, err); }
    },
    equipeNaoLidas: async (req, res) => {
        try {
            const lado = equipe.ladoDoPapel(req.usuario.tipo_usuario);
            res.json({ naoLidas: await equipe.naoLidas(req.usuario.id_usuario, lado) });
        } catch (err) { tratarErro(res, err); }
    },

    // ----- responsável: sempre a PRÓPRIA conversa (id vem do token, nunca da URL) -----
    minhaConversa: async (req, res) => {
        try {
            const id = req.usuario.id_usuario;
            await chat.marcarLidas(id, 'RESPONSAVEL');
            emitirLida(id, 'RESPONSAVEL');
            res.json({ mensagens: await chat.listarConversa(id) });
        } catch (err) { tratarErro(res, err); }
    },
    enviarResponsavel: async (req, res) => {
        try { await gravar(res, req.usuario.id_usuario, req.usuario.id_usuario, 'RESPONSAVEL', req.body); }
        catch (err) { tratarErro(res, err); }
    },
    // ----- secretaria / admin -----
    conversas: async (req, res) => {
        try { res.json(await chat.listarConversas()); }
        catch (err) { tratarErro(res, err); }
    },
    buscarResponsaveis: async (req, res) => {
        try { res.json(await chat.buscarResponsaveis(req.query.busca)); }
        catch (err) { tratarErro(res, err); }
    },
    conversaDoResponsavel: async (req, res) => {
        try {
            const id = chat.inteiro(req.params.id);
            if (!id || !(await chat.responsavelExiste(id))) return res.status(404).json({ erro: 'Responsável não encontrado.' });
            await chat.marcarLidas(id, 'SECRETARIA');
            emitirLida(id, 'SECRETARIA');
            res.json({ mensagens: await chat.listarConversa(id) });
        } catch (err) { tratarErro(res, err); }
    },
    responder: async (req, res) => {
        try {
            const id = chat.inteiro(req.params.id);
            if (!id || !(await chat.responsavelExiste(id))) return res.status(404).json({ erro: 'Responsável não encontrado.' });
            if (!(await chat.podeConversar(id))) return res.status(403).json({ erro: 'Não é possível iniciar conversa com este responsável (inativo ou sem aluno vinculado).' });
            await gravar(res, id, req.usuario.id_usuario, 'SECRETARIA', req.body);
        } catch (err) { tratarErro(res, err); }
    },
    // Contador do menu (bolinha vermelha) para os dois lados.
    naoLidas: async (req, res) => {
        try {
            const papel = (req.usuario.tipo_usuario || '').toUpperCase();
            const total = papel === 'PAI'
                ? await chat.naoLidasResponsavel(req.usuario.id_usuario)
                : await chat.naoLidasSecretaria();
            res.json({ naoLidas: Number(total) || 0 });
        } catch (err) { tratarErro(res, err); }
    }
};
