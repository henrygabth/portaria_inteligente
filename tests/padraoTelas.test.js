// Padrão visual: todas as telas têm o fundo de pontinhos e as telas logadas têm a mesma sidebar/menu.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pub = path.join(__dirname, '..', 'public');
const paginas = fs.readdirSync(pub).filter(f => f.endsWith('.html'));
const ler = f => fs.readFileSync(path.join(pub, f), 'utf8');

test('toda tela carrega o particulas.js e nenhuma carrega a biblioteca direto', () => {
    assert(paginas.length >= 12);
    for (const p of paginas) {
        const html = ler(p);
        assert.match(html, /js\/general\/particulas\.js/, `${p} sem particulas.js`);
        assert.doesNotMatch(html, /particles\.min\.js/, `${p} carrega a biblioteca por conta própria`);
    }
});

test('telas de login/cadastro usam pontinhos claros sobre o degradê', () => {
    for (const p of ['login.html', 'index.html', 'register.html', 'recover_password.html', 'reset_password.html']) {
        assert.match(ler(p), /data-fundo="gradiente"/, p);
    }
    assert.match(fs.readFileSync(path.join(pub, 'css/style.css'), 'utf8'), /#particles-js\s*\{[^}]*position:\s*fixed/);
});

test('telas logadas têm navbar, sidebar e menu que empurra o conteúdo', () => {
    const logadas = ['home.html', 'secretaria.html', 'portaria.html', 'professor.html', 'professores-admin.html', 'conta.html'];
    for (const p of logadas) {
        const html = ler(p);
        assert.match(html, /id="menuToggle"/, p);
        assert.match(html, /id="sidebar"/, p);
        assert.match(html, /id="mainContent"/, p);
        assert.match(html, /id="themeToggle"/, p);
    }
    for (const p of ['professor.html', 'professores-admin.html', 'conta.html']) {
        assert.match(ler(p), /js\/general\/layout\.js/, p);
    }
    for (const p of ['professores-admin.html', 'conta.html']) {
        assert.match(ler(p), /data-sidebar-auto/, p);
    }
});

test('só particulas.js inicia as partículas (sem cópias locais)', () => {
    const dir = path.join(pub, 'js/general');
    for (const f of fs.readdirSync(dir)) {
        if (f === 'particulas.js') continue;
        assert.doesNotMatch(fs.readFileSync(path.join(dir, f), 'utf8'), /function iniciarParticulas|particlesJS\(/, f);
    }
});

test('o professor não usa o painel de ADMIN e o admin não cai numa tela que a API recusa', () => {
    const js = fs.readFileSync(path.join(pub, 'js/general/professor.js'), 'utf8');
    assert.match(js, /ADMIN'\) \{ location\.href = 'selecionar-painel\.html'/);
});
