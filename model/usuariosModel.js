const db = require('../config/banco');

const usuariosModel = {
    buscarPorEmail: async (email) => {
        const [rows] = await db.query('SELECT * FROM usuarios WHERE email = ?', [email]);
        return rows[0] || null;
    },

    buscarPorNome: async (nome) => {
        // Nunca devolve a coluna `senha` (nem cpf) — este endpoint é usado só
        // pra localizar um usuário por nome, não é um "perfil completo".
        const [rows] = await db.query(
            'SELECT id_usuario, nome, email, telefone, tipo_usuario, status FROM usuarios WHERE nome LIKE ?',
            [`%${nome}%`]
        );
        return rows[0] || null;
    },

    buscarPorId: async (id) => {
        const [rows] = await db.query(
            'SELECT id_usuario, nome, email, telefone, tipo_usuario, status FROM usuarios WHERE id_usuario = ?',
            [id]
        );
        return rows[0] || null;
    },

    buscarContaPorId: async (id) => {
        const [rows] = await db.query(
            'SELECT id_usuario, nome, cpf, email, telefone, tipo_usuario FROM usuarios WHERE id_usuario = ?',
            [id]
        );
        return rows[0] || null;
    },

    // Usado para conferir a senha atual antes de permitir a troca (atualizarConta)
    buscarSenhaHashPorId: async (id) => {
        const [rows] = await db.query(
            'SELECT senha FROM usuarios WHERE id_usuario = ?',
            [id]
        );
        return rows[0] ? rows[0].senha : null;
    },

    cadastrar: async (nome, cpf, email, telefone, senhaHash, tipo_usuario, status) => {
        const [result] = await db.query(
            'INSERT INTO usuarios (nome, cpf, email, telefone, senha, tipo_usuario, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [nome, cpf, email, telefone, senhaHash, tipo_usuario, status]
        );
        return result.insertId;
    },

    // Usada para migrar silenciosamente uma senha antiga em texto puro para bcrypt
    // assim que o usuário faz login com sucesso (ver usuariosController.login).
    atualizarSenha: async (id, senhaHash) => {
        await db.query('UPDATE usuarios SET senha = ? WHERE id_usuario = ?', [senhaHash, id]);
    },

    // Troca de senha "de verdade" (Minha Conta / link de redefinição): além de gravar o hash,
    // aumenta token_versao, o que derruba todas as sessões abertas e invalida links de
    // redefinição já usados.
    trocarSenha: async (id, senhaHash) => {
        await db.query(
            'UPDATE usuarios SET senha = ?, primeiro_acesso = 0, token_versao = COALESCE(token_versao, 0) + 1 WHERE id_usuario = ?',
            [senhaHash, id]
        );
    },

    buscarEmailDeOutro: async (email, idIgnorado) => {
        const [rows] = await db.query('SELECT id_usuario FROM usuarios WHERE email = ? AND id_usuario <> ? LIMIT 1', [email, idIgnorado]);
        return rows[0] || null;
    },

    atualizarConta: async (id, nome, email, telefone, novaSenhaHash) => {
        if (novaSenhaHash) {
            await db.query(
                'UPDATE usuarios SET nome = COALESCE(?, nome), email = COALESCE(?, email), telefone = COALESCE(?, telefone), senha = ?, primeiro_acesso = 0 WHERE id_usuario = ?',
                [nome, email, telefone, novaSenhaHash, id]
            );
        } else {
            await db.query(
                'UPDATE usuarios SET nome = COALESCE(?, nome), email = COALESCE(?, email), telefone = COALESCE(?, telefone) WHERE id_usuario = ?',
                [nome, email, telefone, id]
            );
        }
    },

    // Perfil ativo = status diferente de '0'/'INATIVO' (usuários antigos podem ter NULL).
    estaAtivo: (usuario) => {
        const st = String(usuario?.status ?? '1').trim().toUpperCase();
        return st !== '0' && st !== 'INATIVO' && st !== 'DESATIVADO';
    },

    // Lista perfis para a tela "Gerenciar Perfis" (nunca devolve senha).
    listarPerfis: async (tipos) => {
        const placeholders = tipos.map(() => '?').join(',');
        const [rows] = await db.query(
            `SELECT u.id_usuario, u.nome, u.email, u.telefone, u.tipo_usuario, u.status,
                    (SELECT GROUP_CONCAT(a.nome SEPARATOR ', ')
                       FROM responsaveis_alunos ra JOIN alunos a ON a.aluno_id = ra.aluno_id
                      WHERE ra.usuario_id = u.id_usuario) AS alunos
               FROM usuarios u
              WHERE u.tipo_usuario IN (${placeholders})
              ORDER BY u.nome`,
            tipos
        );
        return rows;
    },

    atualizarStatus: async (id, status) => {
        await db.query('UPDATE usuarios SET status = ? WHERE id_usuario = ?', [status, id]);
    },

    // Marca que o usuário já fez o primeiro login (o aviso de troca de senha só aparece uma vez).
    marcarPrimeiroAcessoConcluido: async (id) => {
        await db.query('UPDATE usuarios SET primeiro_acesso = 0 WHERE id_usuario = ?', [id]);
    },

    buscarStatusPorId: async (id) => {
        // SELECT * para não quebrar caso a coluna token_versao ainda não tenha sido criada
        // (a migração roda logo depois que o servidor sobe).
        const [rows] = await db.query('SELECT * FROM usuarios WHERE id_usuario = ?', [id]);
        if (!rows[0]) return null;
        const { status, tipo_usuario, token_versao, primeiro_acesso } = rows[0];
        return { status, tipo_usuario, token_versao: token_versao || 0, primeiro_acesso: Number(primeiro_acesso) || 0 };
    },

    // LGPD: guarda quando e qual versão do termo/política a pessoa aceitou.
    registrarAceiteTermos: async (id, versao) => {
        await db.query('UPDATE usuarios SET termos_versao = ?, termos_aceitos_em = NOW() WHERE id_usuario = ?', [versao, id]);
    },

    // LGPD (direito de acesso/portabilidade): tudo o que o sistema guarda sobre o titular.
    exportarDados: async (id) => {
        const q = async (sql, p) => { try { const [r] = await db.query(sql, p); return r; } catch (_) { return []; } };
        const [conta] = await q(`SELECT id_usuario, nome, cpf, email, telefone, tipo_usuario, status, data_criacao,
            termos_versao, termos_aceitos_em FROM usuarios WHERE id_usuario = ?`, [id]);
        return {
            conta: conta || null,
            alunos_vinculados: await q(`SELECT a.nome, t.sala_turma AS turma, ra.parentesco, ra.data_vinculo
                FROM responsaveis_alunos ra JOIN alunos a ON a.aluno_id = ra.aluno_id LEFT JOIN turmas t ON t.id_turma = a.turma_id
                WHERE ra.usuario_id = ?`, [id]),
            solicitacoes_de_saida: await q(`SELECT pedidos_saida_id AS pedido, nome_aluno AS aluno, motivo, tipo, status,
                hora_prevista_saida, hora_prevista_retorno, hora_saida_real, hora_retorno_real, data_criacao
                FROM pedidos_saida WHERE solicitante_id = ? ORDER BY data_criacao DESC`, [id]),
            horarios_fixos: await q(`SELECT dia_semana, hora_saida, hora_retorno, motivo, ativo FROM pedidos_recorrentes WHERE usuario_id = ?`, [id]),
            mensagens_com_a_secretaria: await q(`SELECT de, texto, criado_em FROM chat_mensagens WHERE responsavel_id = ? ORDER BY criado_em`, [id]),
            aparelhos_com_notificacao: await q('SELECT aparelho, criado_em, ultimo_envio FROM push_inscricoes WHERE usuario_id = ?', [id]),
            registro_de_acessos_e_acoes: await q(`SELECT criado_em, acao, descricao, ip FROM auditoria WHERE usuario_id = ? ORDER BY auditoria_id DESC LIMIT 1000`, [id])
        };
    },

    pedidosEmAndamento: async (id) => {
        const [[r]] = await db.query(`SELECT COUNT(*) AS n FROM pedidos_saida WHERE solicitante_id = ? AND status IN ('PENDENTE','APROVADA','EM_SAIDA')`, [id]);
        return Number(r.n);
    },

    // LGPD (direito de eliminação): apaga os dados pessoais da conta. O histórico de saídas dos
    // alunos fica, sem identificar o responsável, porque a escola precisa dele (segurança do aluno).
    anonimizar: async (id, senhaAleatoriaHash) => {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(`UPDATE usuarios SET nome = 'Titular removido', cpf = ?, email = ?, telefone = NULL, senha = ?,
                status = '0', excluido_em = NOW(), token_versao = COALESCE(token_versao, 0) + 1 WHERE id_usuario = ?`,
            [`REM-${id}`, `removido-${id}@removido.invalid`, senhaAleatoriaHash, id]);
            for (const sql of [
                'DELETE FROM responsaveis_alunos WHERE usuario_id = ?',
                'DELETE FROM pedidos_recorrentes WHERE usuario_id = ?',
                'DELETE FROM chat_mensagens WHERE responsavel_id = ?',
                'DELETE FROM push_inscricoes WHERE usuario_id = ?',
                'DELETE FROM dispositivos_confiaveis WHERE usuario_id = ?',
                'DELETE FROM login_codigos WHERE usuario_id = ?'
            ]) { try { await conn.query(sql, [id]); } catch (e) { if (e.code !== 'ER_NO_SUCH_TABLE') throw e; } }
            await conn.query("UPDATE pedidos_saida SET observacoes = NULL WHERE solicitante_id = ?", [id]);
            await conn.commit();
        } catch (err) { await conn.rollback(); throw err; }
        finally { conn.release(); }
    },

    // Usado pelo alerta de atraso: lista os e-mails de quem deve ser avisado
    // (Secretaria e Portaria) quando um aluno não retorna no horário previsto.
    listarEmailsPorPapel: async (...papeis) => {
        const placeholders = papeis.map(() => '?').join(',');
        const sql = `SELECT nome, email FROM usuarios WHERE tipo_usuario IN (${placeholders}) AND email IS NOT NULL AND email != ''`;
        const [rows] = await db.query(sql, papeis);
        return rows;
    }
};

module.exports = usuariosModel;