// Avisos por e-mail de TUDO o que acontece com a saída do aluno, em envios individuais:
//   SAIDA            -> o aluno saiu da escola
//   RETORNO          -> o aluno voltou dentro do horário
//   ATRASADO         -> passou 5 min do horário previsto e ele não voltou
//   NAO_RETORNOU     -> passou 15 min do horário previsto e ele não voltou
//   CHEGOU_ATRASADO  -> o aluno voltou, mas depois da tolerância
// Cada evento vai para TODOS os grupos: responsáveis, secretaria, portaria e professores da turma.
// Usa o mesmo serviço Brevo/SMTP já existente; falhas não bloqueiam a portaria.
const { enviarEmail } = require('./email');
const { montarEmailHtml } = require('./emailTemplate');
const pedidos = require('../model/pedidosModel');
const alertas = require('../model/alertasEmailModel');
const ocorrencias = require('../model/ocorrenciasModel');

const TOLERANCIA_MIN = 5; // mesma tolerância usada em toda a aplicação

// Eventos de movimentação normal: continuam valendo mesmo que o aluno já tenha voltado
// quando o e-mail for finalmente entregue (ex.: Brevo ficou fora do ar por alguns minutos).
const TIPOS_INFORMATIVOS = ['SAIDA', 'RETORNO', 'CHEGOU_ATRASADO'];

function escapar(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function hora(data) {
    return data ? new Date(data).toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
    }) : 'não informado';
}
function dia(data) {
    return data ? new Date(data).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
}
function horaEData(data) {
    return data ? `${hora(data)} de ${dia(data)}` : 'não informado';
}

// Frase final de cada e-mail, conforme quem está lendo.
const CONTEXTO_POR_GRUPO = {
    RESPONSAVEL: 'Você recebe este aviso por ser responsável pelo aluno. Em caso de dúvida, procure a secretaria da escola.',
    PROFESSOR: 'Você recebe este aviso por ser professor(a) de uma turma do aluno.',
    SECRETARIA: 'Aviso enviado à secretaria para acompanhamento.',
    PORTARIA: 'Aviso enviado à portaria para conferência dos registros.'
};

function linha(rotulo, valor) {
    return `<p style="margin:0 0 5px 0"><strong>${rotulo}:</strong> ${valor}</p>`;
}

function mensagem(tipo, pedido, categoria = 'RESPONSAVEL') {
    const nome = escapar(pedido.nome_aluno);
    const turma = pedido.turma ? ` (turma ${escapar(pedido.turma)})` : '';

    const destaques = [];
    if (tipo === 'SAIDA') {
        destaques.push(linha('Saída registrada', horaEData(pedido.hora_saida_real || new Date())));
        if (pedido.hora_prevista_retorno) destaques.push(linha('Retorno previsto', hora(pedido.hora_prevista_retorno)));
    } else if (tipo === 'RETORNO') {
        destaques.push(linha('Retorno registrado', horaEData(pedido.hora_retorno_real || new Date())));
        if (pedido.hora_prevista_retorno) destaques.push(linha('Retorno previsto', hora(pedido.hora_prevista_retorno)));
        if (pedido.hora_saida_real) destaques.push(linha('Saída registrada', hora(pedido.hora_saida_real)));
    } else {
        destaques.push(linha('Retorno previsto', hora(pedido.hora_prevista_retorno)));
        if (pedido.hora_saida_real) destaques.push(linha('Saída registrada', hora(pedido.hora_saida_real)));
        if (tipo === 'CHEGOU_ATRASADO') destaques.push(linha('Retorno registrado', hora(pedido.hora_retorno_real)));
    }

    const infos = {
        SAIDA: {
            titulo: 'Saída do aluno registrada',
            assunto: `Saída registrada - ${pedido.nome_aluno}`,
            descricao: `O aluno <strong>${nome}</strong>${turma} foi liberado pela portaria e <strong>saiu da escola</strong>.`,
            cor: 'azul',
            simples: true
        },
        RETORNO: {
            titulo: 'Retorno do aluno registrado',
            assunto: `Retorno registrado - ${pedido.nome_aluno}`,
            descricao: `O aluno <strong>${nome}</strong>${turma} <strong>voltou à escola</strong> dentro do horário previsto e o retorno foi registrado pela portaria.`,
            cor: 'azul',
            simples: true
        },
        ATRASADO: {
            titulo: 'Atenção: atraso no retorno',
            assunto: `Atraso no retorno - ${pedido.nome_aluno}`,
            descricao: `O aluno <strong>${nome}</strong>${turma} está com o retorno atrasado e ainda não consta como tendo retornado à escola.`,
            cor: 'vermelho'
        },
        NAO_RETORNOU: {
            titulo: 'Atenção: aluno ainda não retornou',
            assunto: `Aluno não retornou - ${pedido.nome_aluno}`,
            descricao: `O aluno <strong>${nome}</strong>${turma} continua sem registro de retorno, mais de 15 minutos após o horário previsto.`,
            cor: 'vermelho'
        },
        CHEGOU_ATRASADO: {
            titulo: 'Retorno registrado com atraso',
            assunto: `Aluno retornou com atraso - ${pedido.nome_aluno}`,
            descricao: `O aluno <strong>${nome}</strong>${turma} <strong>retornou à escola</strong>, mas depois do horário previsto.`,
            cor: 'vermelho'
        }
    };
    const info = infos[tipo];
    if (!info) throw new Error('Tipo de alerta desconhecido.');

    const paragrafos = [info.descricao];
    if (!info.simples) {
        paragrafos.push(
            'O sistema registrou esta ocorrência e avisou os grupos responsáveis pelo acompanhamento.',
            'Fluxo operacional: a secretaria coordena o acompanhamento conforme o protocolo interno; a portaria confere os registros de saída/retorno; o professor acompanha a turma; os responsáveis são comunicados.',
            'Este aviso não substitui o procedimento interno definido pela escola.'
        );
    }
    if (CONTEXTO_POR_GRUPO[categoria]) paragrafos.push(CONTEXTO_POR_GRUPO[categoria]);

    return {
        subject: info.assunto,
        text: info.descricao.replace(/<[^>]*>/g, '') + ` Retorno previsto: ${hora(pedido.hora_prevista_retorno)}.`,
        html: montarEmailHtml({
            titulo: info.titulo,
            saudacao: 'Comunicado automático do Portaria Inteligente:',
            paragrafos,
            destaque: destaques.join(''),
            cor: info.cor
        })
    };
}

// Um aluno retornou "atrasado" quando passou da tolerância depois do horário previsto.
function retornouAtrasado(pedido) {
    if (!pedido || !pedido.hora_prevista_retorno || !pedido.hora_retorno_real) return false;
    return new Date(pedido.hora_retorno_real).getTime() >
        new Date(pedido.hora_prevista_retorno).getTime() + TOLERANCIA_MIN * 60 * 1000;
}

let processando = false;
let reprocessar = false;

async function processarAlertas() {
    // Se já está enviando, pede uma nova rodada ao terminar (evento chegou no meio do envio).
    if (processando) { reprocessar = true; return; }
    processando = true;
    try {
        do {
            reprocessar = false;
            await rodarFila();
        } while (reprocessar);
    } finally {
        processando = false;
    }
}

async function rodarFila() {
    // A coleta de eventos e o envio são independentes: uma falha não perde fila.
    const eventos = await alertas.listarEventosRecentes();
    for (const ev of eventos) {
        // Auditoria é complementar: nunca pode impedir os avisos operacionais.
        try {
            await ocorrencias.registrar(ev.pedido_id, ev.tipo);
        } catch (erro) {
            console.error(`[ocorrencias] Falha ao registrar ${ev.tipo} do pedido ${ev.pedido_id}:`, erro.message);
        }
        try {
            await alertas.enfileirar(ev.pedido_id, ev.tipo);
        } catch (erro) {
            console.error(`[alertas] Falha ao preparar ${ev.tipo} do pedido ${ev.pedido_id}:`, erro.message);
        }
    }
    const pendentes = await alertas.listarEnviosPendentes();
    for (const item of pendentes) {
        if (!(await alertas.reservarEnvio(item.envio_id))) continue;
        try {
            const pedido = await pedidos.buscarParaNotificacao(item.pedido_id);
            if (!pedido) throw new Error('Pedido não encontrado ao enviar alerta.');
            // Aviso de atraso/não retorno não faz sentido depois que o aluno já voltou.
            if (!TIPOS_INFORMATIVOS.includes(item.tipo_evento) && pedido.status !== 'EM_SAIDA') {
                await alertas.descartarEnvio(item.envio_id, 'Aluno já retornou à escola.');
                continue;
            }
            if (!(await alertas.destinatarioAindaAutorizado(item, pedido))) {
                await alertas.descartarEnvio(item.envio_id, 'Professor não está mais vinculado à turma.');
                continue;
            }
            await enviarEmail({ to: item.email_destino, ...mensagem(item.tipo_evento, pedido, item.categoria) });
            await alertas.concluirEnvio(item.envio_id);
        } catch (erro) {
            console.error(`[alertas] Envio ${item.envio_id} falhou:`, erro.message);
            try { await alertas.falharEnvio(item.envio_id, erro); }
            catch (erroBanco) { console.error('[alertas] Falha ao registrar tentativa:', erroBanco.message); }
        }
    }
}

// Chamado pelo controller no momento do evento (saída/retorno): grava a fila no banco e
// dispara o envio na hora, sem segurar a resposta da portaria. Nunca lança erro.
async function avisarTodos(pedidoId, tipo) {
    try {
        await alertas.enfileirar(pedidoId, tipo);
    } catch (erro) {
        console.error(`[alertas] Falha ao preparar aviso ${tipo} do pedido ${pedidoId}:`, erro.message);
        return;
    }
    setImmediate(() => {
        processarAlertas().catch(erro => console.error('[alertas] Falha ao enviar avisos:', erro.message));
    });
}

module.exports = { processarAlertas, mensagem, avisarTodos, retornouAtrasado, TOLERANCIA_MIN };
