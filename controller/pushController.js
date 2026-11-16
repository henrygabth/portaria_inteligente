// Notificações no celular: o navegador pede a chave pública, cria a inscrição e manda para cá.
const push = require('../utils/push');
const pushModel = require('../model/pushModel');

const b64 = /^[A-Za-z0-9_-]+={0,2}$/;
function inscricaoValida(c) {
    if (!c || typeof c.endpoint !== 'string' || !c.keys) return false;
    let url; try { url = new URL(c.endpoint); } catch (_) { return false; }
    if (url.protocol !== 'https:' || c.endpoint.length > 1000) return false;
    const { p256dh, auth } = c.keys;
    return typeof p256dh === 'string' && b64.test(p256dh) && Buffer.from(p256dh, 'base64url').length === 65 &&
        typeof auth === 'string' && b64.test(auth) && Buffer.from(auth, 'base64url').length >= 16;
}

module.exports = {
    chave: async (req, res) => {
        try { res.json({ chave: (await push.obterChaves()).publica }); }
        catch (err) { console.error('[push] chave:', err.message); res.status(503).json({ erro: 'Notificações indisponíveis no momento.' }); }
    },
    inscrever: async (req, res) => {
        try {
            const inscricao = req.body?.inscricao;
            if (!inscricaoValida(inscricao)) return res.status(400).json({ erro: 'Inscrição de notificação inválida.' });
            const aparelho = typeof req.body.aparelho === 'string' ? req.body.aparelho.slice(0, 120) : null;
            await pushModel.salvar(req.usuario.id_usuario, inscricao, aparelho);
            res.status(201).json({ mensagem: 'Pronto! Você vai receber os avisos neste aparelho.' });
        } catch (err) { console.error('[push] inscrever:', err.message); res.status(500).json({ erro: 'Não foi possível ativar as notificações.' }); }
    },
    cancelar: async (req, res) => {
        try {
            if (typeof req.body?.endpoint !== 'string') return res.status(400).json({ erro: 'Aparelho não informado.' });
            await pushModel.remover(req.usuario.id_usuario, req.body.endpoint);
            res.json({ mensagem: 'Notificações desligadas neste aparelho.' });
        } catch (err) { console.error('[push] cancelar:', err.message); res.status(500).json({ erro: 'Não foi possível desligar as notificações.' }); }
    },
    testar: async (req, res) => {
        try {
            const n = await push.enviarParaUsuarios([req.usuario.id_usuario], {
                titulo: 'Portaria Inteligente', corpo: 'Tudo certo! As notificações estão funcionando neste aparelho.', tag: 'teste', url: '/'
            });
            if (!n) return res.status(404).json({ erro: 'Nenhum aparelho com notificações ativas foi encontrado.' });
            res.json({ mensagem: `Notificação de teste enviada para ${n} aparelho(s).` });
        } catch (err) { console.error('[push] testar:', err.message); res.status(500).json({ erro: 'Falha ao enviar o teste.' }); }
    },
    _inscricaoValida: inscricaoValida
};
