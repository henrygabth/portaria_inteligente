// ==========================================================
// Script para criar uma conta direto no banco (uso único/manual)
// Use isso para criar a PRIMEIRA conta de Secretaria/Admin,
// já que o cadastro pelo site agora exige login de secretaria.
//
// Como usar:
//   1. Edite os dados na seção "DADOS DO USUÁRIO" abaixo
//   2. Rode no terminal, dentro da pasta do projeto: node criar_usuario.js
// ==========================================================

require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('./config/banco');

// ---------- DADOS DO USUÁRIO (edite aqui) ----------
const nome = 'Ivone';
const cpf = '12345678912';
const email = 'ivone@email.com';
const telefone = '1993453411';
const senha = '@secretaria2026';       // senha normal (será criptografada abaixo)
const tipo_usuario = 'SECRETARIA';     // PAI, SECRETARIA, PORTARIA ou ADMIN
// -----------------------------------------------------

(async () => {
    try {
        // Verifica se já existe alguém com esse e-mail
        const [existente] = await db.query('SELECT id_usuario FROM usuarios WHERE email = ?', [email]);
        if (existente.length > 0) {
            console.log(`❌ Já existe uma conta com o e-mail ${email}. Nada foi criado.`);
            process.exit(0);
        }

        const senhaHash = await bcrypt.hash(senha, 10);

        const [resultado] = await db.query(
            'INSERT INTO usuarios (nome, cpf, email, telefone, senha, tipo_usuario, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [nome, cpf, email, telefone, senhaHash, tipo_usuario, '1']
        );

        console.log('✅ Usuário criado com sucesso!');
        console.log(`   id_usuario: ${resultado.insertId}`);
        console.log(`   nome: ${nome}`);
        console.log(`   email: ${email}`);
        console.log(`   tipo_usuario: ${tipo_usuario}`);
        console.log(`   senha para login: ${senha}  (guarde/anote, não é possível ver de novo)`);
    } catch (erro) {
        console.error('Erro ao criar usuário:', erro.message);
    } finally {
        process.exit(0);
    }
})();
