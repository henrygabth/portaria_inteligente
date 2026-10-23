const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { faltamCredenciais, salvarConfiguracao } = require('../utils/configurarPrimeiraExecucao');

test('detecta .env ausente e senhas de exemplo em vez de iniciar com elas', () => {
    assert.equal(faltamCredenciais({}), true);
    assert.equal(faltamCredenciais({
        DB_HOST: '10.87.100.6', DB_USER: 'root', DB_PASSWORD: 'COLOQUE_A_SENHA_DO_MYSQL',
        DB_NAME: 'projetocodemasters_novo', JWT_SECRET: 'SUBSTITUA_POR_UMA_CHAVE'
    }), true);
    assert.equal(faltamCredenciais({
        DB_HOST: '10.87.100.6', DB_USER: 'root', DB_PASSWORD: 'senha-local',
        DB_NAME: 'projetocodemasters_novo', JWT_SECRET: 'segredo-gerado'
    }), false);
});

test('salva configurações no .env sem apagar outras variáveis', () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'portaria-env-'));
    try {
        const arquivo = path.join(pasta, '.env');
        fs.writeFileSync(arquivo, '# Comentário\nEMAIL_FROM=teste@example.invalid\nDB_HOST=127.0.0.1\n');
        salvarConfiguracao(arquivo, { DB_HOST: '10.87.100.6', DB_NAME: 'projetocodemasters_novo' });
        const conteudo = fs.readFileSync(arquivo, 'utf8');
        assert.match(conteudo, /DB_HOST=10\.87\.100\.6/);
        assert.match(conteudo, /DB_NAME=projetocodemasters_novo/);
        assert.match(conteudo, /EMAIL_FROM=teste@example\.invalid/);
        assert.doesNotMatch(conteudo, /DB_HOST=127\.0\.0\.1/);
    } finally {
        fs.rmSync(pasta, {recursive:true, force:true});
    }
});
