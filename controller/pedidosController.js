// Pedidos controller
const pedidos = require('../model/pedidosModel');
const alunosModel = require('../model/alunosModel');
const responsaveisAlunosModel = require('../model/responsaveisAlunosModel');
const { enviarEmail } = require('../utils/email');
const { montarEmailHtml } = require('../utils/emailTemplate');
const { notificarResponsaveis } = require('../utils/emailsPais');

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
            saudacao: `Olá, <strong>${nomeResponsavel}</strong>.`,
            paragrafos: [`A solicitação de saída de <strong>${nomeAluno}</strong> foi ${acao}.`],
            destaque: `<p style="margin: 0; color: #2d3748; font-size: 13px;"><strong>Motivo:</strong> ${motivo}</p>`,
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
            const { aluno_id, hora_prevista_saida, hora_prevista_retorno, motivo, observacoes } = req.body;
            // O solicitante é sempre quem está logado: um responsável não pode criar pedido
            // em nome de outro. Só Secretaria/Admin podem informar outro solicitante.
            const papel = (req.usuario.tipo_usuario || '').toUpperCase();
            const podeEscolher = papel === 'SECRETARIA' || papel === 'ADMIN';
            const solicitante_id = (podeEscolher && req.body.solicitante_id) || req.usuario.id_usuario;

            if (!aluno_id || !hora_prevista_saida) {
                return res.status(400).json({ erro: "Campos obrigatórios não preenchidos" });
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
                aluno_id, aluno.nome, aluno.turma_id, solicitante_id, hora_prevista_saida, motivo || null, observacoes || null,
                hora_prevista_retorno || null
            );
            res.status(201).json({ mensagem: `Pedido ${pedido_id} criado com sucesso e enviado à secretaria`, id_pedido: pedido_id });
        } catch (error) {
            console.error('Erro ao cadastrar pedido:', error);
            res.status(500).json({ erro: "Erro ao cadastrar pedido", detalhe: error.message });
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

            if (!observacao || !observacao.trim()) {
                return res.status(400).json({ erro: "Informe o motivo da recusa." });
            }

            if (!(await exigirStatus(res, pedido_id, 'PENDENTE', "Este pedido já foi analisado. Atualize a lista de solicitações."))) return;
            const ok = await pedidos.atualizarStatus(pedido_id, 'RECUSADA', usuario_id, observacao);
            if (!ok) return res.status(404).json({ erro: "Pedido não encontrado" });

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
                    await enviarEmail({ to: dados.responsavel_email, subject, text, html });
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

    // 4. PORTARIA: Liberar aluno (registra horário de saída)
    liberar: async (req, res) => {
        try {
            const pedido_id = req.params.id;
            const usuario_id = req.usuario.id_usuario;
            if (!(await exigirStatus(res, pedido_id, 'APROVADA', "Só é possível liberar pedidos aprovados pela secretaria que ainda não saíram."))) return;
            const ok = await pedidos.atualizarStatus(pedido_id, 'EM_SAIDA', usuario_id);
            if (!ok) return res.status(404).json({ erro: "Pedido não encontrado" });

            // Avisa os responsáveis sem segurar a resposta da portaria
            notificarResponsaveis(pedido_id, 'SAIDA');

            res.json({ mensagem: "Aluno liberado na portaria com horário registrado. Os responsáveis serão avisados por e-mail." });
        } catch (error) {
            console.error('Erro ao liberar pedido:', error);
            res.status(error.status === 409 ? 409 : 500).json({ erro: "Erro ao liberar pedido" });
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

            // Retorno no prazo: mantém o e-mail existente.
            // Retorno atrasado: o agendador envia a TODOS via fila persistente
            // (inclusive aos responsáveis), sem duplicar o e-mail ao responsável.
            void (async () => {
                const dados = await pedidos.buscarParaNotificacao(pedido_id);
                if (!dados || !dados.hora_prevista_retorno || !dados.hora_retorno_real ||
                    new Date(dados.hora_retorno_real).getTime() <=
                        new Date(dados.hora_prevista_retorno).getTime() + 5 * 60 * 1000) {
                    await notificarResponsaveis(pedido_id, 'RETORNO', dados);
                }
            })().catch(e => console.error('[portaria] Falha ao preparar aviso de retorno:', e));

            res.json({ mensagem: "Retorno do aluno registrado com sucesso! Os responsáveis serão avisados por e-mail." });
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
                    await enviarEmail({ to: dados.responsavel_email, subject, text, html });
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
            const resultado = await pedidos.buscarHistoricoGeral(req.query.limite);
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
            const data = req.query.data || hojeLocal;
            const resultado = await pedidos.obterEstatisticas(data);
            res.json(resultado);
        } catch (error) {
            console.error('Erro ao gerar estatísticas:', error);
            res.status(500).json({ erro: "Erro ao gerar estatísticas" });
        }
    }
};

module.exports = pedidosController;
