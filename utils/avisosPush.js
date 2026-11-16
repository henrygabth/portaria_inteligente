// utils/avisosPush.js — transforma os acontecimentos do sistema em notificações curtas no celular.
// Nada aqui pode atrapalhar a operação: tudo roda em segundo plano e nunca lança erro.
const push = require('./push');
const tempoReal = require('./tempoReal');

const hora = d => d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: process.env.TZ || 'America/Sao_Paulo' }) : '';
const primeiroNome = n => String(n || 'O aluno').trim().split(/\s+/)[0];
const EQUIPE = ['SECRETARIA', 'ADMIN'];

// Texto de cada evento para a família e para a equipe da escola.
function textos(tipo, p) {
    const nome = p.nome_aluno || 'O aluno';
    const turma = p.turma ? ` (${p.turma})` : '';
    const previsto = hora(p.hora_prevista_retorno);
    switch (tipo) {
        case 'APROVADA': return { familia: ['Saída aprovada', `A saída de ${nome} foi aprovada pela secretaria.`] };
        case 'RECUSADA': return { familia: ['Saída recusada', `A solicitação de ${nome} foi recusada. Abra o app para ver o motivo.`] };
        case 'CANCELADA': return { familia: ['Saída cancelada', `A saída de ${nome} foi cancelada pela secretaria.`] };
        case 'SAIDA': return { familia: [`${primeiroNome(nome)} saiu da escola`, `${nome} saiu às ${hora(p.hora_saida_real) || hora(new Date())}.${previsto ? ` Retorno previsto: ${previsto}.` : ''}`] };
        case 'CASA': return { familia: [`${primeiroNome(nome)} foi liberado(a) para casa`, `${nome} saiu da escola às ${hora(p.hora_saida_real) || hora(new Date())}.`] };
        case 'RETORNO': return { familia: [`${primeiroNome(nome)} voltou para a escola`, `Retorno registrado às ${hora(p.hora_retorno_real) || hora(new Date())}.`] };
        case 'CHEGOU_ATRASADO': return {
            familia: [`${primeiroNome(nome)} voltou com atraso`, `Retorno às ${hora(p.hora_retorno_real)} (previsto ${previsto}).`],
            equipe: ['Retorno com atraso', `${nome}${turma} voltou às ${hora(p.hora_retorno_real)} (previsto ${previsto}).`] };
        case 'ATRASADO': return {
            familia: [`${primeiroNome(nome)} ainda não voltou`, `O retorno estava previsto para ${previsto}. Se puder, entre em contato com a escola.`],
            equipe: ['Atraso no retorno', `${nome}${turma} ainda não voltou. Previsto: ${previsto}.`] };
        case 'NAO_RETORNOU': return {
            familia: [`Atenção: ${primeiroNome(nome)} não retornou`, `Já passaram mais de 15 minutos do horário previsto (${previsto}). Entre em contato com a escola.`],
            equipe: ['Aluno não retornou', `${nome}${turma} está há mais de 15 min sem retorno. Previsto: ${previsto}.`] };
        default: return {};
    }
}

const URL_FAMILIA = '/home.html?tela=tela-historico';
const URL_EQUIPE = '/secretaria.html?tela=tela-painel';
const URGENTES = ['ATRASADO', 'NAO_RETORNOU'];

// Chamado quando o status do pedido muda ou quando um alerta de horário é gerado.
async function avisarPedido(pedidoId, tipo) {
    try {
        const pushModel = require('../model/pushModel');
        if (!(await pushModel.marcarAvisado(pedidoId, tipo))) return; // já avisado antes
        const pedido = await require('../model/pedidosModel').buscarParaNotificacao(pedidoId);
        if (!pedido) return;
        const t = textos(tipo, pedido);
        const tag = `pedido-${pedidoId}`;
        if (t.familia) {
            await push.enviarParaUsuarios(await pushModel.responsaveisDoPedido(pedidoId),
                { titulo: t.familia[0], corpo: t.familia[1], url: URL_FAMILIA, tag, urgente: URGENTES.includes(tipo) });
        }
        if (t.equipe) {
            const dados = { pedido_id: Number(pedidoId), tipo, titulo: t.equipe[0], texto: t.equipe[1] };
            // Na tela aberta: aviso imediato (sino, som e janela) para secretaria e portaria.
            try { tempoReal.publicarParaPapeis([...EQUIPE, 'PORTARIA', 'PORTEIRO'], 'alerta:atraso', dados); } catch (_) { /* opcional */ }
            await push.enviarParaPapeis(EQUIPE, { titulo: t.equipe[0], corpo: t.equipe[1], url: URL_EQUIPE, tag: `atraso-${pedidoId}`, urgente: true });
        }
    } catch (err) {
        console.error(`[push] Falha no aviso ${tipo} do pedido ${pedidoId}:`, err.message);
    }
}

// Nova solicitação: avisa a secretaria (quem precisa decidir).
async function avisarNovoPedido(pedidoId, nomeAluno) {
    try {
        await push.enviarParaPapeis(EQUIPE, { titulo: 'Nova solicitação de saída', corpo: `${nomeAluno || 'Um aluno'} aguarda a sua aprovação.`, url: '/secretaria.html?tela=tela-solicitacoes', tag: `novo-${pedidoId}` });
    } catch (err) { console.error('[push] Falha no aviso de novo pedido:', err.message); }
}

// Mensagem do chat responsável <-> secretaria.
async function avisarMensagem(mensagem) {
    try {
        const texto = String(mensagem.texto || '').slice(0, 120);
        if (String(mensagem.de || '').toUpperCase() === 'RESPONSAVEL') {
            await push.enviarParaPapeis(EQUIPE, { titulo: `Mensagem de ${mensagem.remetente || 'um responsável'}`, corpo: texto, url: '/secretaria.html?tela=tela-mensagens', tag: `chat-${mensagem.responsavel_id}` });
        } else if (mensagem.responsavel_id) {
            await push.enviarParaUsuarios([mensagem.responsavel_id], { titulo: 'Nova mensagem da secretaria', corpo: texto, url: '/home.html?tela=tela-mensagens', tag: 'chat-secretaria' });
        }
    } catch (err) { console.error('[push] Falha no aviso de mensagem:', err.message); }
}

const emSegundoPlano = fn => (...args) => { setImmediate(() => { fn(...args).catch(() => {}); }); };

module.exports = {
    textos,
    avisarPedido: emSegundoPlano(avisarPedido),
    avisarNovoPedido: emSegundoPlano(avisarNovoPedido),
    avisarMensagem: emSegundoPlano(avisarMensagem),
    _avisarPedido: avisarPedido
};
