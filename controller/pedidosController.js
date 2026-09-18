// Pedidos controller
const pedidos = require('../model/pedidosModel');
const alunosModel = require('../model/alunosModel');
const responsaveisAlunosModel = require('../model/responsaveisAlunosModel');
const { enviarEmail } = require('../utils/email');
const { montarEmailHtml } = require('../utils/emailTemplate');

// Monta o e-mail de aviso ao responsável quando um pedido é recusado ou cancelado
function montarEmailNegativa({ nomeAluno, nomeResponsavel, motivo, quem }) {
    const acao = quem === 'PORTARIA' ? 'cancelada pela portaria' : 'recusada pela secretaria';
    return {
        subject: `Solicitação de saída ${quem === 'PORTARIA' ? 'cancelada' : 'recusada'} - ${nomeAluno}`,
        text: `Olá ${nomeResponsavel}, a solicitação de saída de ${nomeAluno} foi ${acao}. Motivo: ${motivo}`,
        html: montarEmailHtml({
            titulo: `Solicitação de saída ${quem === 'PORTARIA' ? 'cancelada' : 'recusada'}`,
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
            const solicitante_id = req.body.solicitante_id || req.usuario.id_usuario;

            if (!aluno_id || !hora_prevista_saida) {
                return res.status(400).json({ erro: "Campos obrigatórios não preenchidos" });
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
            const ok = await pedidos.atualizarStatus(pedido_id, 'APROVADA', usuario_id);
            if (!ok) return res.status(404).json({ erro: "Pedido não encontrado" });
            res.json({ mensagem: "Pedido aprovado com sucesso e enviado para a portaria" });
        } catch (error) {
            console.error('Erro ao aprovar pedido:', error);
            res.status(500).json({ erro: "Erro ao aprovar pedido" });
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
            res.status(500).json({ erro: "Erro ao rejeitar pedido" });
        }
    },

    // 4. PORTARIA: Liberar aluno (registra horário de saída)
    liberar: async (req, res) => {
        try {
            const pedido_id = req.params.id;
            const usuario_id = req.usuario.id_usuario;
            const ok = await pedidos.atualizarStatus(pedido_id, 'EM_SAIDA', usuario_id);
            if (!ok) return res.status(404).json({ erro: "Pedido não encontrado" });
            res.json({ mensagem: "Aluno liberado na portaria com horário registrado" });
        } catch (error) {
            console.error('Erro ao liberar pedido:', error);
            res.status(500).json({ erro: "Erro ao liberar pedido" });
        }
    },

    // 5. PORTARIA: Registrar retorno do aluno (registra horário de volta)
    retorno: async (req, res) => {
        try {
            const pedido_id = req.params.id;
            const usuario_id = req.usuario.id_usuario;
            const ok = await pedidos.atualizarStatus(pedido_id, 'CONCLUIDA', usuario_id);
            if (!ok) return res.status(404).json({ erro: "Pedido não encontrado" });
            res.json({ mensagem: "Retorno do aluno registrado com sucesso! Processo concluído." });
        } catch (error) {
            console.error('Erro ao registrar retorno do aluno:', error);
            res.status(500).json({ erro: "Erro ao registrar retorno do aluno" });
        }
    },

    // 5b. PORTARIA: Cancelar um pedido já aprovado (motivo obrigatório, notifica por e-mail)
    // Só pode cancelar enquanto o pedido está APROVADA (aguardando liberação);
    // depois que o aluno já saiu (EM_SAIDA), o fluxo correto é registrar o retorno.
    cancelarPortaria: async (req, res) => {
        try {
            const pedido_id = req.params.id;
            const usuario_id = req.usuario.id_usuario;
            const { observacao } = req.body;

            if (!observacao || !observacao.trim()) {
                return res.status(400).json({ erro: "Informe o motivo do cancelamento." });
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
                        quem: 'PORTARIA'
                    });
                    await enviarEmail({ to: dados.responsavel_email, subject, text, html });
                }
            } catch (erroEmail) {
                console.error('Erro ao enviar e-mail de cancelamento:', erroEmail);
                emailEnviado = false;
            }

            res.json({
                mensagem: emailEnviado
                    ? "Pedido cancelado na portaria e responsável notificado por e-mail."
                    : "Pedido cancelado, mas não foi possível enviar o e-mail ao responsável."
            });
        } catch (error) {
            console.error('Erro ao cancelar pedido na portaria:', error);
            res.status(500).json({ erro: "Erro ao cancelar pedido" });
        }
    },

    // 6. LISTAR: Por status (ex: ?status=PENDENTE, ?status=APROVADA, ?status=EM_SAIDA, ?status=CONCLUIDA)
    listarPorStatus: async (req, res) => {
        try {
            const { status } = req.query;
            const resultado = await pedidos.buscarPorStatus(status);
            res.json(resultado);
        } catch (error) {
            console.error('Erro ao buscar pedidos:', error);
            res.status(500).json({ erro: "Erro ao buscar pedidos" });
        }
    },

    // 7. HISTÓRICO: Buscar pedidos feitos por um solicitante (Pai)
    buscarPorSolicitante: async (req, res) => {
        try {
            const { id } = req.params;
            if (!id) {
                return res.status(400).json({ erro: "Solicitante não informado" });
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
            const data = req.query.data || new Date().toISOString().slice(0, 10);
            const resultado = await pedidos.obterEstatisticas(data);
            res.json(resultado);
        } catch (error) {
            console.error('Erro ao gerar estatísticas:', error);
            res.status(500).json({ erro: "Erro ao gerar estatísticas" });
        }
    }
};

module.exports = pedidosController;
