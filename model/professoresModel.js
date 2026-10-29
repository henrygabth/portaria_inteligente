const db = require('../config/banco');

const TIPOS = ['APROVADA', 'SAIDA', 'RETORNO', 'ATRASADO', 'NAO_RETORNOU'];
const inteiro = valor => Number.isSafeInteger(Number(valor)) && Number(valor) > 0 ? Number(valor) : null;

// Usado na mesma transação que altera o pedido: não perde evento se o Node reiniciar.
async function registrarEvento(conn, pedidoId, tipo) {
    if (!TIPOS.includes(tipo)) throw new Error('Tipo de comunicado inválido.');
    const textos = {
        APROVADA: 'Solicitação de saída aprovada pela secretaria',
        SAIDA: 'Aluno saiu para o almoço',
        RETORNO: 'Aluno retornou à escola',
        ATRASADO: 'Aluno com retorno atrasado',
        NAO_RETORNOU: 'Aluno ainda não retornou à escola'
    };
    const colunaHora = { APROVADA: 'p.data_atualizacao', SAIDA: 'p.hora_saida_real', RETORNO: 'p.hora_retorno_real' }[tipo];
    // A turma é a que constava no pedido, mesmo se o aluno mudar de turma depois.
    const sql = `INSERT IGNORE INTO comunicados_professores
       (professor_id, aluno_id, turma_id, pedido_id, tipo, mensagem, data_evento)
       SELECT pt.professor_id, p.aluno_id, p.turma_id, p.pedidos_saida_id, ?,
              CONCAT(LEFT(p.nome_aluno, 150), ': ', ?), ${colunaHora || 'NOW()'}
       FROM pedidos_saida p
       JOIN professores_turmas pt ON pt.turma_id = p.turma_id
       JOIN usuarios u ON u.id_usuario = pt.professor_id
         AND u.tipo_usuario = 'PROFESSOR' AND (u.status IS NULL OR u.status NOT IN ('0','INATIVO','DESATIVADO'))
       WHERE p.pedidos_saida_id = ? AND p.turma_id IS NOT NULL`;
    await conn.query(sql, [tipo, textos[tipo], pedidoId]);
}

async function minhasTurmas(professorId) {
    const [rows] = await db.query(`SELECT t.id_turma, t.sala_turma, t.turno FROM professores_turmas pt
      JOIN turmas t ON t.id_turma = pt.turma_id WHERE pt.professor_id = ? ORDER BY t.sala_turma`, [professorId]);
    return rows;
}

async function painel(professorId) {
    // Uma linha por aluno, cada um associado SOMENTE às turmas vinculadas ao docente.
    // O estado em tempo real prevalece sobre avisos históricos e pedidos futuros.
    const [rows] = await db.query(`SELECT a.aluno_id, a.nome, a.matricula, t.id_turma,
      t.sala_turma AS turma, p.pedidos_saida_id AS pedido_id, p.status AS status_pedido,
      p.hora_saida_real, p.hora_retorno_real, p.hora_prevista_retorno,
      CASE
        WHEN p.status = 'EM_SAIDA' AND p.hora_prevista_retorno IS NOT NULL
          AND NOW() > DATE_ADD(p.hora_prevista_retorno, INTERVAL 15 MINUTE) THEN 'NAO_RETORNOU'
        WHEN p.status = 'EM_SAIDA' AND p.hora_prevista_retorno IS NOT NULL
          AND NOW() > DATE_ADD(p.hora_prevista_retorno, INTERVAL 5 MINUTE) THEN 'ATRASADO'
        WHEN p.status = 'EM_SAIDA' THEN 'SAIU'
        ELSE 'DENTRO'
      END AS situacao
      FROM alunos a JOIN turmas t ON t.id_turma = a.turma_id
      JOIN professores_turmas pt ON pt.turma_id = t.id_turma AND pt.professor_id = ?
      LEFT JOIN pedidos_saida p ON p.pedidos_saida_id = (
        SELECT p2.pedidos_saida_id FROM pedidos_saida p2
        WHERE p2.aluno_id = a.aluno_id
          AND (p2.status = 'EM_SAIDA' OR (p2.status = 'CONCLUIDA' AND DATE(p2.hora_saida_real) = CURDATE()))
        ORDER BY (p2.status = 'EM_SAIDA') DESC, p2.hora_saida_real DESC, p2.pedidos_saida_id DESC LIMIT 1
      )
      WHERE (a.status IS NULL OR UPPER(a.status) = 'ATIVO') ORDER BY t.sala_turma, a.nome`, [professorId]);
    return rows;
}

async function comunicados(professorId, filtros) {
    let where = 'WHERE c.professor_id = ? AND pt.professor_id IS NOT NULL';
    const params = [professorId];
    const opcoes = [
        ['turma_id','c.turma_id', inteiro],
        ['aluno_id','c.aluno_id', inteiro],
        ['tipo','c.tipo', v => TIPOS.includes(v) ? v : null],
        ['data','DATE(c.data_evento)', v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null]
    ];
    for (const [chave, coluna, validar] of opcoes) {
        if (filtros[chave] !== undefined && filtros[chave] !== '') {
            const valor = validar(filtros[chave]);
            if (!valor) { const e = new Error(`Filtro inválido: ${chave}`); e.status = 400; throw e; }
            where += ` AND ${coluna} = ?`;
            params.push(valor);
        }
    }
    const pagina = Number(filtros.pagina || 1);
    if (!Number.isInteger(pagina) || pagina < 1 || pagina > 100000) {
        const e = new Error('Página inválida.'); e.status = 400; throw e;
    }
    const limite = 50;
    const [rows] = await db.query(`SELECT c.comunicado_id, c.tipo, c.mensagem, c.data_evento,
       c.lido, c.lido_em, c.aluno_id, c.turma_id, c.pedido_id, a.nome AS aluno,
       t.sala_turma AS turma, p.hora_saida_real, p.hora_retorno_real, p.hora_prevista_retorno
       FROM comunicados_professores c
       JOIN professores_turmas pt ON pt.turma_id = c.turma_id AND pt.professor_id = c.professor_id
       JOIN turmas t ON t.id_turma = c.turma_id
       LEFT JOIN alunos a ON a.aluno_id = c.aluno_id
       JOIN pedidos_saida p ON p.pedidos_saida_id = c.pedido_id
       ${where} ORDER BY c.data_evento DESC, c.comunicado_id DESC LIMIT ? OFFSET ?`, [...params, limite + 1, (pagina - 1) * limite]);
    return { itens: rows.slice(0, limite), temMais: rows.length > limite, pagina };
}

async function naoLidos(professorId) {
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM comunicados_professores c
      JOIN professores_turmas pt ON pt.professor_id = c.professor_id AND pt.turma_id = c.turma_id
      WHERE c.professor_id = ? AND c.lido = 0`, [professorId]);
    return total;
}

async function marcarLido(professorId, id) {
    const [result] = await db.query(`UPDATE comunicados_professores c
      JOIN professores_turmas pt ON pt.professor_id = c.professor_id AND pt.turma_id = c.turma_id
      SET c.lido = 1, c.lido_em = COALESCE(c.lido_em, NOW())
      WHERE c.professor_id = ? AND c.comunicado_id = ?`, [professorId, id]);
    return result.affectedRows > 0;
}

async function listarCadastro() {
    const [rows] = await db.query(`SELECT u.id_usuario, u.nome, u.email, u.status,
      GROUP_CONCAT(pt.turma_id ORDER BY pt.turma_id) AS turmas_ids
      FROM usuarios u LEFT JOIN professores_turmas pt ON pt.professor_id = u.id_usuario
      WHERE u.tipo_usuario = 'PROFESSOR' GROUP BY u.id_usuario ORDER BY u.nome`);
    return rows.map(r => ({ ...r, turmas_ids: r.turmas_ids ? r.turmas_ids.split(',').map(Number) : [] }));
}

async function salvarVinculos(professorId, turmasIds) {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [prof] = await conn.query("SELECT id_usuario FROM usuarios WHERE id_usuario = ? AND tipo_usuario = 'PROFESSOR' FOR UPDATE", [professorId]);
        if (!prof.length) { const e = new Error('Professor não encontrado.'); e.status = 404; throw e; }
        if (turmasIds.length) {
            const [salas] = await conn.query(`SELECT id_turma FROM turmas WHERE id_turma IN (${turmasIds.map(() => '?').join(',')})`, turmasIds);
            if (salas.length !== turmasIds.length) { const e = new Error('Uma das turmas não existe.'); e.status = 400; throw e; }
        }
        await conn.query('DELETE FROM professores_turmas WHERE professor_id = ?', [professorId]);
        for (const turmaId of turmasIds) {
            await conn.query('INSERT INTO professores_turmas (professor_id, turma_id) VALUES (?, ?)', [professorId, turmaId]);
        }
        await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
}

module.exports = { registrarEvento, minhasTurmas, painel, comunicados, naoLidos, marcarLido, listarCadastro, salvarVinculos, inteiro };
