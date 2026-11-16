// Acessibilidade (cores, texto, Libras) e aplicativo instalável (PWA).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pub = path.join(__dirname, '..', 'public');
const ler = f => fs.readFileSync(path.join(pub, f), 'utf8');
const paginas = fs.readdirSync(pub).filter(f => f.endsWith('.html'));

test('toda tela carrega o menu de acessibilidade no <head>, sem defer', () => {
    for (const p of paginas) {
        const head = ler(p).split('</head>')[0];
        assert.match(head, /<script src="\/js\/general\/acessibilidade\.js"><\/script>/, p);
        assert.match(head, /css\/acessibilidade\.css/, p);
        assert.match(head, /name="viewport"/, p);
        assert.match(ler(p), /<html lang="pt-BR"/i, p);
    }
});

test('toda tela (menos a offline) é instalável: manifest, ícone e pwa.js', () => {
    for (const p of paginas.filter(p => p !== 'offline.html')) {
        const head = ler(p).split('</head>')[0];
        assert.match(head, /rel="manifest" href="\/manifest\.webmanifest"/, p);
        assert.match(head, /apple-touch-icon/, p);
        assert.match(head, /js\/general\/pwa\.js/, p);
    }
});

test('login pergunta na primeira visita como a pessoa quer ver o sistema', () => {
    for (const p of ['login.html', 'index.html']) assert.match(ler(p), /<body[^>]*data-a11y-boas-vindas/, p);
});

test('menu tem as opções de cor, tamanho de texto e Libras', () => {
    const js = ler('js/general/acessibilidade.js');
    for (const c of ['originais', 'saturadas', 'sepia', 'invertidas', 'daltonico', 'contraste']) assert.match(js, new RegExp(`'${c}'`), c);
    for (const t of [100, 110, 120]) assert.match(js, new RegExp(`\\b${t}\\b`));
    assert.match(js, /vlibras\.gov\.br\/app\/vlibras-plugin\.js/);
    const css = ler('css/acessibilidade.css');
    for (const c of ['saturadas', 'sepia', 'invertidas', 'daltonico', 'contraste']) assert.match(css, new RegExp(`a11y-cor-${c}`), c);
});

test('manifest válido com ícones que existem', () => {
    const m = JSON.parse(ler('manifest.webmanifest'));
    assert.equal(m.display, 'standalone');
    assert.equal(m.lang, 'pt-BR');
    assert(m.icons.some(i => i.purpose === 'maskable'));
    for (const i of m.icons) assert(fs.existsSync(path.join(pub, i.src)), i.src);
});

test('service worker nunca guarda a API em cache', () => {
    const sw = ler('sw.js');
    assert.match(sw, /startsWith\('\/api\/'\)\) return/);
    assert.match(sw, /offline\.html/);
});

test('CSP libera o VLibras e o service worker', () => {
    const { cabecalhosSeguranca } = require('../utils/seguranca.js');
    const h = {};
    cabecalhosSeguranca({ path: '/', headers: {} }, { setHeader: (k, v) => { h[k] = v; } }, () => {});
    const csp = h['Content-Security-Policy'];
    assert.match(csp, /script-src[^;]*vlibras\.gov\.br/);
    assert.match(csp, /connect-src[^;]*vlibras\.gov\.br/);
    assert.match(csp, /worker-src 'self' blob:/);
    assert.match(csp, /frame-ancestors 'none'/);
});
