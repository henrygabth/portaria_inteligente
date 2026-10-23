// Pré-verificação de esquema sem fazer alterações automáticas no banco.
// Detecta quando o SQL inicial ou as migrations ainda não foram aplicados.
const tabelasNecessarias = [
    'usuarios', 'turmas', 'alunos', 'pedidos_saida', 'historico_pedidos',
    'responsaveis_alunos', 'pedidos_recorrentes',
    'professores_turmas', 'comunicados_professores', 'alertas_email_envios'
];

async function verificarEstrutura(db) {
    const [tabelas] = await db.query(
        'SELECT TABLE_NAME AS nome FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
    );
    const disponiveis = new Set(tabelas.map(t => t.nome));
    const faltantes = tabelasNecessarias.filter(t => !disponiveis.has(t));
    if (faltantes.length) {
        throw new Error(`Banco incompleto: faltam ${faltantes.join(', ')}. ` +
            'No MySQL de teste vazio, execute database/instalar_banco_local.sql; ' +
            'em um banco já existente, aplique as migrations dos professores e alertas.');
    }
    const [colunas] = await db.query(`SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
        FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
          AND ((TABLE_NAME='usuarios' AND COLUMN_NAME='tipo_usuario')
            OR (TABLE_NAME='pedidos_saida' AND COLUMN_NAME='aviso_pais_atraso_enviado'))`);
    const perfil = colunas.find(c => c.TABLE_NAME === 'usuarios' && c.COLUMN_NAME === 'tipo_usuario');
    if (!perfil || !String(perfil.COLUMN_TYPE).toUpperCase().includes("'PROFESSOR'")) {
        throw new Error('O banco não reconhece o perfil PROFESSOR. Execute database/migration_professores_up.sql.');
    }
    if (!colunas.some(c => c.TABLE_NAME === 'pedidos_saida' && c.COLUMN_NAME === 'aviso_pais_atraso_enviado')) {
        throw new Error('Falta pedidos_saida.aviso_pais_atraso_enviado. No banco de teste, execute database/instalar_banco_local.sql; no banco existente, execute a migração normal.');
    }
    console.log('[banco] Estrutura necessária para a portaria e professores: OK.');
}

module.exports = { verificarEstrutura };
