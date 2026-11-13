//turmasmodel
const banco = require('../config/banco');
const { buscarPorTurma } = require('./alunosModel');

const turmas = {
    cadastrar: async (sala_turma, turno) => {
        // Corrigido: Se são 2 colunas, use apenas 2 interrogações
        const sql = `
            INSERT INTO turmas (sala_turma, turno) 
            VALUES (?, ?)
        `;

        // O array deve conter exatamente os valores para os ? acima
        const [resultado] = await banco.query(sql, [sala_turma, turno]);

        return resultado.insertId;
    },
    buscarPorTurma: async (sala_turma) => {
        const sql = `SELECT * FROM turmas WHERE sala_turma = ? LIMIT 1`;
        const [rows] = await banco.query(sql, [sala_turma]);
        return rows[0];
    },
    buscarPorTurno: async (turno) => {
        // Removemos o LIMIT 1 para trazer a lista completa
        const sql = `SELECT * FROM turmas WHERE turno = ? ORDER BY sala_turma ASC`;

        // Passamos o turno como parâmetro para evitar SQL Injection
        const [rows] = await banco.query(sql, [turno]);

        // Retornamos o array completo de turmas
        return rows;
    },
    listarTodas: async () => {
        const sql = `SELECT id_turma, sala_turma, turno FROM turmas ORDER BY sala_turma ASC`;
        const [rows] = await banco.query(sql);
        return rows;
    }

};

module.exports = turmas;