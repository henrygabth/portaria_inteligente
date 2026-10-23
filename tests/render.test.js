const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = path.resolve(__dirname, '..');
const ler = (nome) => fs.readFileSync(path.join(base, nome), 'utf8');

test('Render usa PORT, escuta 0.0.0.0 e expõe rota de saúde', () => {
  const s = ler('index.js');
  assert.match(s, /process\.env\.PORT \|\| process\.env\.PORTA/);
  assert.match(s, /app\.listen\(PORT, '0\.0\.0\.0'\)/);
  assert.match(s, /app\.get\('\/api\/saude'/);
});

test('Render não inicia configuração interativa nem aceita modo teste local', () => {
  assert.match(ler('utils/configurarPrimeiraExecucao.js'), /process\.env\.RENDER === 'true'/);
  assert.match(ler('index.js'), /process\.env\.RENDER === 'true' && MODO_TESTE_LOCAL/);
});

test('homologação desativa agendador e simula emails salvo opt-in explícito', () => {
  assert.match(ler('index.js'), /!MODO_TESTE_LOCAL && !modoHomologacao\(\)/);
  assert.match(ler('utils/email.js'), /process\.env\.AMBIENTE === 'homologacao'/);
  assert.match(ler('utils/email.js'), /process\.env\.EMAILS_REAIS_NO_TESTE !== '1'/);
});

test('migrations não rodam por padrão, configuração do Render sem segredos', () => {
  const s = ler('index.js');
  assert.match(s, /: false; \/\/ DDL automático desligado/);
  const y = ler('render.yaml');
  assert.match(y, /healthCheckPath: \/api\/saude/);
  assert.match(y, /buildCommand: npm ci/);
  assert.match(y, /startCommand: npm start/);
  assert.match(y, /key: DB_PASSWORD\s+sync: false/);
  assert.doesNotMatch(y, /Senai1234|DB_PASSWORD: ['"]?[a-z0-9]{8,}/i);
});

test('Render utiliza URL própria para recuperação de senha', () => {
  assert.match(ler('controller/usuariosController.js'), /process\.env\.RENDER_EXTERNAL_URL/);
  assert.match(ler('utils/emailTemplate.js'), /process\.env\.RENDER_EXTERNAL_URL/);
});
