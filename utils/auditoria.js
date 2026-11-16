// utils/auditoria.js — registro de "quem fez o quê e quando".
// Grava em segundo plano e NUNCA lança erro: a auditoria não pode travar a operação da escola.
const ROTULOS = {
    LOGIN: 'Entrou no sistema', LOGIN_FALHOU: 'Tentativa de login recusada', LOGIN_2FA_ENVIADO: 'Código de acesso enviado',
    LOGIN_2FA_FALHOU: 'Código de acesso incorreto', SENHA_TROCADA: 'Senha alterada', SENHA_REDEFINIDA: 'Senha redefinida pelo link',
    CONTA_ATUALIZADA: 'Dados da conta alterados', USUARIO_CRIADO: 'Usuário cadastrado', RESPONSAVEL_VINCULADO: 'Responsável vinculado a aluno',
    PERFIL_ATIVADO: 'Perfil reativado', PERFIL_DESATIVADO: 'Perfil desativado',
    PEDIDO_APROVADO: 'Saída aprovada', PEDIDO_RECUSADO: 'Saída recusada', PEDIDO_CANCELADO: 'Saída cancelada',
    SAIDA_REGISTRADA: 'Saída registrada na portaria', RETORNO_REGISTRADO: 'Retorno registrado na portaria',
    IDENTIFICACAO_NAO_CONFERE: 'Portaria: aluno não confere com a foto',
    ALUNO_CRIADO: 'Aluno cadastrado', ALUNO_ALTERADO: 'Aluno alterado', ALUNO_APAGADO: 'Aluno apagado', FOTO_ALUNO: 'Foto do aluno enviada',
    ALUNOS_IMPORTADOS: 'Alunos importados por planilha',
    BACKUP_BAIXADO: 'Backup do banco baixado', BACKUP_GERADO: 'Backup automático gerado',
    TERMOS_ACEITOS: 'Termo e política de privacidade aceitos', DADOS_EXPORTADOS: 'Titular baixou os próprios dados', CONTA_EXCLUIDA: 'Conta excluída a pedido do titular'
};

function registrar(req, acao, { alvo_tipo = null, alvo_id = null, descricao = null, usuario = null } = {}) {
    const quem = usuario || (req && req.usuario) || {};
    const linha = {
        usuario_id: quem.id_usuario || null,
        usuario_nome: quem.nome ? String(quem.nome).slice(0, 150) : null,
        papel: quem.tipo_usuario ? String(quem.tipo_usuario).toUpperCase().slice(0, 20) : null,
        acao: String(acao).slice(0, 60),
        alvo_tipo: alvo_tipo ? String(alvo_tipo).slice(0, 30) : null,
        alvo_id: Number.isInteger(Number(alvo_id)) && alvo_id !== null ? Number(alvo_id) : null,
        descricao: String(descricao || ROTULOS[acao] || acao).slice(0, 500),
        ip: req ? String(req.ip || req.headers?.['x-forwarded-for'] || '').split(',')[0].trim().slice(0, 45) || null : null
    };
    setImmediate(() => {
        require('../model/auditoriaModel').inserir(linha)
            .catch(err => console.error(`[auditoria] Falha ao registrar ${acao}:`, err.message));
    });
    return linha;
}

module.exports = { registrar, ROTULOS };
