// Pedidos controller
const pedidos = require('../model/pedidosModel');
const alunosModel = require('../model/alunosModel');
const responsaveisAlunosModel = require('../model/responsaveisAlunosModel');
const { enviarEmail } = require('../utils/email');
const { montarEmailHtml } = require('../utils/emailTemplate');
const { avisarTodos, retornouAtrasado } = require('../utils/alertasEmail');
const ocorrenciasModel = require('../model/ocorrenciasModel');
const { escaparHtml, idPositivo } = require('../utils/seguranca');
const { registrar: auditar } = require('../utils/auditoria');

// Data/hora vinda do navegador ("2026-11-14T12:30" ou "2026-11-14 12:30[:00]").
function dataHoraValida(valor) {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(valor.trim())) return null;
    const d = new Date(valor.trim().replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? null : d;
}

// Garante que o pedido está no status esperado antes de seguir para a próxima etapa
// (Pai -> Secretaria -> Portaria). Sem isso, a portaria conseguia liberar um pedido
// que a secretaria ainda não aprovou, ou liberar duas vezes o mesmo aluno.
// Retorna true se pode seguir; senão já responde ao cliente e retorna false.
async function exigirStatus(res, pedido_id, esperado, mensagemErro) {
    const atual = await pedidos.obterStatus(pedido_id);
    if (!atual) {
        res.status(404).json({ erro: "Pedido não encontrado" });
        return false;
    }
    if (atual !== esperado) {
        res.status(409).json({ erro: mensagemErro });
        return false;
    }
    return true;
}

// Monta o e-mail de aviso ao responsável quando um pedido é recusado ou cancelado
function montarEmailNegativa({ nomeAluno, nomeResponsavel, motivo, quem }) {
    const cancelada = quem === 'CANCELAMENTO';
    const acao = cancelada ? 'cancelada pela secretaria' : 'recusada pela secretaria';
    return {
        subject: `Solicitação de saída ${cancelada ? 'cancelada' : 'recusada'} - ${nomeAluno}`,
        text: `Olá ${nomeResponsavel}, a solicitação de saída de ${nomeAluno} foi ${acao}. Motivo: ${motivo}`,
        html: montarEmailHtml({
            titulo: `Solicitação de saída ${cancelada ? 'cancelada' : 'recusada'}`,
            saudacao: `Olá, <strong>${escaparHtml(nomeResponsavel)}</strong>.`,
            paragrafos: [`A solicitação de saída de <strong>${escaparHtml(nomeAluno)}</strong> foi ${acao}.`],
            destaque: `<p style="margin: 0; color: #2d3748; font-size: 13px;"><strong>Motivo:</strong> ${escaparHtml(motivo)}</p>`,
            cor: 'vermelho'
        })
    };
}

const pedidosController = {
    // 1. PAI: Criar solicitação
    // O aluno agora vem do vínculo já cadastrado pela secretaria (aluno_id),
    // não mais de texto livre digitado pelo Pai — assim ele só consegue criar
    // pedidos para os próprios filhos, e nome/turma vêm sempre corretos do banco.
    cadastrar: async (req, res) => {
        try {
            const { aluno_id, hora_prevista_saida, motivo, observacoes } = req.body;
            // ALMOCO: o aluno sai e volta. CASA: o aluno vai embora e não volta hoje.
            const tipo = String(req.body.tipo || 'ALMOCO').toUpperCase();
            if (!['ALMOCO', 'CASA'].includes(tipo)) {
                return res.status(400).json({ erro: "Tipo de saída inválido." });
            }
            const hora_prevista_retorno = tipo === 'CASA' ? null : req.body.hora_prevista_retorno;
            // O solicitante é sempre quem está logado: um responsável não pode criar pedido
            // em nome de outro. Só Secretaria/Admin podem informar outro solicitante.
            const papel = (req.usuario.tipo_usuario || '').toUpperCase();
            const podeEscolher = papel === 'SECRETARIA' || papel === 'ADMIN';
            const solicitante_id = (podeEscolher && req.body.solicitante_id) || req.usuario.id_usuario;

            if (!aluno_id || !hora_prevista_saida) {
                return res.status(400).json({ erro: "Campos obrigatórios não preenchidos" });
            }
            if (!idPositivo(aluno_id) || !idPositivo(solicitante_id)) {
                return res.status(400).json({ erro: "Aluno inválido." });
            }
            const saida = dataHoraValida(hora_prevista_saida);
            if (!saida) return res.status(400).json({ erro: "Horário de saída inválido." });
            // Tolerância de 10 min para relógio do celular um pouco atrasado.
            if (saida.getTime() < Date.now() - 10 * 60 * 1000) {
                return res.status(400).json({ erro: "O horário de saída já passou. Informe um horário futuro." });
            }
            if (saida.getTime() > Date.now() + 60 * 24 * 60 * 60 * 1000) {
                return res.status(400).json({ erro: "Só é possível agendar saídas para os próximos 60 dias." });
            }
            if (hora_prevista_retorno) {
                const retorno = dataHoraValida(hora_prevista_retorno);
                if (!retorno) return res.status(400).json({ erro: "Horário de retorno inválido." });
                if (retorno.getTime() - saida.getTime() > 12 * 60 * 60 * 1000) {
                    return res.status(400).json({ erro: "O retorno deve ser no mesmo dia da saída." });
                }
            }
            if (observacoes && String(observacoes).length > 500) {
                return res.status(400).json({ erro: "As observações devem ter no máximo 500 caracteres." });
            }

            // Liberação para casa: o motivo da saída é obrigatório (a secretaria e a portaria o veem).
            const motivoTexto = typeof motivo === 'string' ? motivo.trim() : '';
            if (tipo === 'CASA' && motivoTexto.length < 3) {
                return res.status(400).json({ erro: "Informe o motivo da saída do aluno (mínimo 3 caracteres)." });
            }
            if (motivoTexto.length > 255) {
                return res.status(400).json({ erro: "O motivo deve ter no máximo 255 caracteres." });
            }

            if (hora_prevista_retorno && new Date(hora_prevista_retorno) <= new Date(hora_prevista_saida)) {
                return res.status(400).json({ erro: "O horário de retorno deve ser depois do horário de saída." });
            }

            const vinculado = await responsaveisAlunosModel.pertence(solicitante_id, aluno_id);
            if (!vinculado) {
                return res.status(403).json({ erro: "Este aluno não está vinculado à sua conta." });
            }

            const [aluno] = await alunosModel.buscarPorId(aluno_id);
            if (!aluno) {
                return res.status(404).json({ erro: "Aluno não encontrado." });
            }

            const pedido_id = await pedidos.cadastrar(
                aluno_id, aluno.nome, aluno.turma_id, solicitante_id, hora_prevista_saida,
                motivoTexto || (tipo === 'CASA' ? 'Liberação para ir para casa' : null), observacoes || null,
                hora_prevista_retorno || null, null, tipo
            );
            res.status(201).json({ mensagem: `Pedido ${pedido_id} criado com sucesso e enviado à secretaria`, id_pedido: pedido_id });
        } catch (error) {
            console.error('Erro ao cadastrar pedido:', error);
            res.status(500).json({ erro: "Erro ao cadastrar pedido" });
        }
    },

    // 2. SECRETARIA: Aprovar solicitação -> envia para a portaria
    aprovar: async (req, res) => {
        try {
            const pedido_id = req.params.id;
            const usuario_id = req.usuario.id_usuario;
            if (!(await exigirStatus(res, pedido_id, 'PENDENTE', "Este pedido já foi analisado. Atualize a lista de solicitações."))) return;
            const ok = await pedidos.atualizarStatus(pedido_id, 'APROVADA', usuario_id);
            if (!ok) return res.status(404).json({ erro: "Pedido não encontrado" });
            auditar(req, 'PEDIDO_APROVADO', { alvo_tipo: 'PEDIDO', alvo_id: pedido_id, descricao: `Aprovou a saída do pedido #${pedido_id}` });
            res.json({ mensagem: "Pedido aprovado com sucesso e enviado para a portaria" });
        } catch (error) {
            console.error('Erro ao aprovar pedido:', error);
            res.status(error.status === 409 ? 409 : 500).json({ erro: "Erro ao aprovar pedido" });
        }
    },

    // 3. SECRETARIA: Rejeitar solicitação (motivo obrigatório, notifica por e-mail)
    rejeitar: async (req, res) => {
        try {
            const pedido_id = req.params.id;
            const usuario_id = req.usuario.id_usuario;
            const { observacao } = req.body;

            if (typeof observacao !== 'string' || !observacao.trim() || observacao.trim().length > 500) {
                return res.status(400).json({ erro: "Informe o motivo da recusa (até 500 caracteres)." });
            }

            if (!(await exigirStatus(res, pedido_id, 'PENDENTE', "Este pedido já foi analisado. Atualize a lista de solicitações."))) return;
            const ok = await pedidos.atualizarStatus(pedido_id, 'RECUSADA', usuario_id, observacao);
            if (!ok) return res.status(404).json({ erro: "Pedido não encontrado" });
            auditar(req, 'PEDIDO_RECUSADO', { alvo_tipo: 'PEDIDO', alvo_id: pedido_id, descricao: `Recusou o pedido #${pedido_id}. Motivo: ${observacao.trim()}` });

            let emailEnviado = true;
            try {
                const dados = await pedidos.buscarParaNotificacao(pedido_id);
                if (dados && dados.responsavel_email) {
                    const { subject, text, html } = montarEmailNegativa({
                        nomeAluno: dados.nome_aluno,
                        nomeResponsavel: dados.responsavel_nome,
                        motivo: observacao,
                        quem: 'SECRETARIA'
                    });
                    await enviarEmail({ to: dados.responsavel_email, subject, text, html, tag: 'pedido-negado', tentativas: 2 });
                }
            } catch (erroEmail) {
                console.error('Erro ao enviar e-mail de recusa:', erroEmail);
                emailEnviado = false;
            }

            res.json({
                mensagem: emailEnviado
                    ? "Pedido rejeitado e responsável notificado por e-mail."
                    : "Pedido rejeitado, mas não foi possível enviar o e-mail ao responsável."
            });
        } catch (error) {
            console.error('Erro ao rejeitar pedido:', error);
            res.status(error.status === 409 ? 409 : 500).json({ erro: "Erro ao rejeitar pedido" });
        }
    },

    // 4. PORTARIA: Registrar saída (a autorização já foi decidida pela secretaria)
    liberar: async (req, res) => {
        try {
            const pedido_id = req.params.id;
            const usuario_id = req.usuario.id_usuario;
            if (!(await exigirStatus(res, pedido_id, 'APROVADA', "A portaria só pode registrar a saída de pedidos já aprovados pela secretaria e que ainda não saíram."))) return;
            const ok = await pedidos.atualizarStatus(pedido_id, 'EM_SAIDA', usuario_id);
            if (!ok) return res.status(404).json({ erro: "Pedido não encontrado" });
            auditar(req, 'SAIDA_REGISTRADA', { alvo_tipo: 'PEDIDO', alvo_id: pedido_id, descricao: `Registrou a saída do pedido #${pedido_id} (identidade conferida pela foto)` });

            // Avisa responsáveis, secretaria, portaria e professores da turma, sem segurar a resposta da portaria
            let paraCasa = false;
            try { paraCasa = (await pedidos.buscarParaNotificacao(pedido_id))?.tipo === 'CASA'; } catch (_) { /* segue como saída comum */ }
            if (paraCasa) avisarTodos(pedido_id, 'CASA');
            else avisarTodos(pedido_id, 'SAIDA');

            if (paraCasa) return res.json({ mensagem: "Aluno liberado para ir para casa. Responsáveis, secretaria, portaria e professores da turma serão avisados." });
            res.json({ mensagem: "Saída registrada pela portaria. Responsáveis, secretaria, portaria e professores da turma serão avisados por e-mail. A autorização permanece vinculada à decisão da secretaria." });
        } catch (error) {
            console.error('Erro ao registrar saída:', error);
            res.status(error.status === 409 ? 409 : 500).json({ erro: "Erro ao registrar saída" });
        }
    },

    // 5. PORTARIA: Registrar retorno do aluno (registra horário de volta)
    retorno: async (req, res) => {
        try {
            const pedido_id = req.params.id;
            const usuario_id = req.usuario.id_usuario;
            if (!(await exigirStatus(res, pedido_id, 'EM_SAIDA', "Só é possível registrar o retorno de alunos que estão fora da escola."))) return;
            const ok = await pedidos.atualizarStatus(pedido_id, 'CONCLUIDA', usuario_id);
            if (!ok) return res.status(404).json({ erro: "Pedido não encontrado" });
            auditar(req, 'RETORNO_REGISTRADO', { alvo_tipo: 'PEDIDO', alvo_id: pedido_id, descricao: `Registrou o retorno do pedido #${pedido_id}` });

            // Retorno no prazo ou com atraso: todos os grupos recebem o aviso correspondente.
            void (async () => {
                const dados = await pedidos.buscarParaNotificacao(pedido_id);
                await avisarTodos(pedido_id, retornouAtrasado(dados) ? 'CHEGOU_ATRASADO' : 'RETORNO');
            })().catch(e => console.error('[portaria] Falha ao preparar aviso de retorno:', e));

            res.json({ mensagem: "Retorno do aluno registrado com sucesso! Responsáveis, secretaria, portaria e professores da turma serão avisados por e-mail." });
        } catch (error) {
            console.error('Erro ao registrar retorno do aluno:', error);
            res.status(error.status === 409 ? 409 : 500).json({ erro: "Erro ao registrar retorno do aluno" });
        }
    },

    // 5b. SECRETARIA: Cancelar um pedido já aprovado (motivo obrigatório, notifica por e-mail)
    // Só pode cancelar enquanto o pedido está APROVADA (aguardando liberação);
    // depois que o aluno já saiu (EM_SAIDA), o fluxo correto é registrar o retorno.
    cancelarSecretaria: async (req, res) => {
        try {
            const pedido_id = req.params.id;
            const usuario_id = req.usuario.id_usuario;
            const { observacao } = req.body;

            if (typeof observacao !== 'string' || !observacao.trim() || observacao.trim().length > 500) {
                return res.status(400).json({ erro: "Informe o motivo do cancelamento (até 500 caracteres)." });
            }

            const statusAtual = await pedidos.obterStatus(pedido_id);
            if (!statusAtual) {
                return res.status(404).json({ erro: "Pedido não encontrado" });
            }
            if (statusAtual !== 'APROVADA') {
                return res.status(400).json({ erro: "Só é possível cancelar pedidos aprovados que ainda não saíram." });
            }

            await pedidos.atualizarStatus(pedido_id, 'CANCELADA', usuario_id, observacao);
            auditar(req, 'PEDIDO_CANCELADO', { alvo_tipo: 'PEDIDO', alvo_id: pedido_id, descricao: `Cancelou o pedido #${pedido_id}. Motivo: ${observacao.trim()}` });

            let emailEnviado = true;
            try {
                const dados = await pedidos.buscarParaNotificacao(pedido_id);
                if (dados && dados.responsavel_email) {
                    const { subject, text, html } = montarEmailNegativa({
                        nomeAluno: dados.nome_aluno,
                        nomeResponsavel: dados.responsavel_nome,
                        motivo: observacao,
                        quem: 'CANCELAMENTO'
                    });
                    await enviarEmail({ to: dados.responsavel_email, subject, text, html, tag: 'pedido-negado', tentativas: 2 });
                }
            } catch (erroEmail) {
                console.error('Erro ao enviar e-mail de cancelamento:', erroEmail);
                emailEnviado = false;
            }

            res.json({
                mensagem: emailEnviado
                    ? "Pedido cancelado pela secretaria e responsável notificado por e-mail."
                    : "Pedido cancelado, mas não foi possível enviar o e-mail ao responsável."
            });
        } catch (error) {
            console.error('Erro ao cancelar pedido na secretaria:', error);
            res.status(error.status === 409 ? 409 : 500).json({ erro: "Erro ao cancelar pedido" });
        }
    },

    // 6. LISTAR: Por status (ex: ?status=PENDENTE, ?status=APROVADA, ?status=EM_SAIDA, ?status=CONCLUIDA)
    listarPorStatus: async (req, res) => {
        try {
            const { status } = req.query;
            const papel = (req.usuario.tipo_usuario || '').toUpperCase();
            const portaria = ['PORTEIRO', 'PORTARIA'].includes(papel);
            // Escopo imposto pelo backend, não apenas por uma lista no navegador.
            const permitidos = ['APROVADA', 'EM_SAIDA', 'CONCLUIDA'];
            if (portaria && !permitidos.includes(status)) {
                return res.status(403).json({ erro: 'A portaria só consulta saídas aprovadas, em andamento ou concluídas.' });
            }
            const resultado = await pedidos.buscarPorStatus(status);
            res.json(resultado);
        } catch (error) {
            console.error('Erro ao buscar pedidos:', error);
            res.status(500).json({ erro: "Erro ao buscar pedidos" });
        }
    },

    // 6b. SECRETARIA: histórico geral (tudo que já foi decidido ou seguiu para a portaria)
    historicoGeral: async (req, res) => {
        try {
            const limite = Math.min(Math.max(Number(req.query.limite) || 300, 1), 1000);
            const resultado = await pedidos.buscarHistoricoGeral(limite);
            res.json(resultado);
        } catch (error) {
            console.error('Erro ao buscar histórico geral:', error);
            res.status(500).json({ erro: "Erro ao buscar histórico geral" });
        }
    },

    // 7. HISTÓRICO: Buscar pedidos feitos por um solicitante (Pai)
    buscarPorSolicitante: async (req, res) => {
        try {
            const { id } = req.params;
            if (!id) {
                return res.status(400).json({ erro: "Solicitante não informado" });
            }
            const papel = (req.usuario.tipo_usuario || '').toUpperCase();
            const equipe = ['SECRETARIA', 'PORTEIRO', 'PORTARIA', 'ADMIN'].includes(papel);
            if (!equipe && String(id) !== String(req.usuario.id_usuario)) {
                return res.status(403).json({ erro: "Você só pode ver as suas próprias solicitações." });
            }
            if (['PORTARIA', 'PORTEIRO'].includes(papel)) {
                return res.status(403).json({ erro: 'Consulte somente o painel operacional da portaria.' });
            }
            const resultado = await pedidos.buscarPorSolicitante(id);
            res.json(resultado);
        } catch (error) {
            console.error('Erro ao buscar pedidos por solicitante:', error);
            res.status(500).json({ erro: "Erro ao buscar pedidos por solicitante" });
        }
    },

    // 8. AUDITORIA: Linha do tempo completa de um pedido (histórico imutável)
    buscarHistorico: async (req, res) => {
        try {
            const { id } = req.params;
            if (['PORTARIA', 'PORTEIRO'].includes((req.usuario.tipo_usuario || '').toUpperCase())) {
                const status = await pedidos.obterStatus(id);
                if (!['APROVADA', 'EM_SAIDA', 'CONCLUIDA'].includes(status)) {
                    return res.status(404).json({ erro: 'Histórico não encontrado.' });
                }
            }
            const resultado = await pedidos.buscarHistorico(id);
            res.json(resultado);
        } catch (error) {
            console.error('Erro ao buscar histórico do pedido:', error);
            res.status(500).json({ erro: "Erro ao buscar histórico do pedido" });
        }
    },

    // 8b. SECRETARIA/ADMIN: auditoria das ocorrências automáticas e dos avisos enviados.
    // Ajuda a escola a comprovar quando o atraso/não retorno foi detectado e quais
    // grupos foram notificados, sem transformar a portaria em responsável pela autorização.
    ocorrencias: async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isInteger(id) || id <= 0) {
                return res.status(400).json({ erro: 'Pedido inválido.' });
            }
            const status = await pedidos.obterStatus(id);
            if (!status) return res.status(404).json({ erro: 'Pedido não encontrado.' });
            res.json(await ocorrenciasModel.listarAuditoria(id));
        } catch (error) {
            console.error('Erro ao buscar ocorrências do pedido:', error);
            res.status(500).json({ erro: 'Erro ao buscar ocorrências e alertas do pedido.' });
        }
    },

    // 9. SECRETARIA/PORTARIA: lista pedidos atualmente atrasados (aluno em
    // saída há mais de 5 minutos do horário previsto de retorno).
    listarAtrasados: async (req, res) => {
        try {
            const resultado = await pedidos.buscarAtrasados();
            res.json(resultado);
        } catch (error) {
            console.error('Erro ao buscar pedidos atrasados:', error);
            res.status(500).json({ erro: "Erro ao buscar pedidos atrasados" });
        }
    },

    // 10. SECRETARIA: painel de estatísticas do dia (ou de uma data específica)
    estatisticas: async (req, res) => {
        try {
            const hoje = new Date();
            const hojeLocal = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
            const data = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.data || '')) ? req.query.data : hojeLocal;
            const resultado = await pedidos.obterEstatisticas(data);
            res.json(resultado);
        } catch (error) {
            console.error('Erro ao gerar estatísticas:', error);
            res.status(500).json({ erro: "Erro ao gerar estatísticas" });
        }
    }
};

module.exports = pedidosController;
