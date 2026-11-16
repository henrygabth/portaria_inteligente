// ==========================================
// TELA DE SELEÇÃO DE PAINEL (uso exclusivo do ADMIN)
// ==========================================

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = 'login.html';
}

// As partículas de fundo vêm do js/general/particulas.js (igual em todas as telas).
function aplicarTema(theme) {
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = themeToggle ? themeToggle.querySelector('i') : null;

    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (themeIcon) { themeIcon.classList.remove('fa-moon'); themeIcon.classList.add('fa-sun'); }
    } else {
        document.documentElement.removeAttribute('data-theme');
        if (themeIcon) { themeIcon.classList.remove('fa-sun'); themeIcon.classList.add('fa-moon'); }
    }
    iniciarParticulas(theme);
}

function saudacaoDoHorario() {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
}

function iniciais(nome) {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return 'PI';
    return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

function preencherCabecalho(usuario) {
    const primeiroNome = String(usuario.nome || '').trim().split(/\s+/)[0] || '';
    document.getElementById('saudacao').textContent = primeiroNome
        ? `${saudacaoDoHorario()}, ${primeiroNome}!`
        : `${saudacaoDoHorario()}!`;
    document.getElementById('dataHoje').textContent = new Date().toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    document.getElementById('nomeUsuario').textContent = usuario.nome || 'Administrador';
    document.getElementById('avatarIniciais').textContent = iniciais(usuario.nome);
}

// Marca o último painel usado, para o admin voltar rápido para onde estava.
function marcarUltimoPainel() {
    let ultimo = null;
    try { ultimo = localStorage.getItem('adminUltimoPainel'); } catch (_) { /* sem storage */ }
    document.querySelectorAll('.selecao-card').forEach(card => {
        card.addEventListener('click', () => {
            try { localStorage.setItem('adminUltimoPainel', card.dataset.painel); } catch (_) { /* sem storage */ }
        });
        if (card.dataset.painel === ultimo) {
            const selo = document.createElement('span');
            selo.className = 'selecao-ultimo';
            selo.textContent = 'Último acesso';
            card.appendChild(selo);
        }
    });
}

function definirValor(id, valor, alerta = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.querySelector('[data-valor]').textContent = valor;
    el.classList.toggle('alerta', !!alerta);
}

// Números do momento. Se alguma consulta falhar, o card mostra "–" e a tela continua usável.
async function carregarSituacao() {
    const token = localStorage.getItem('token');
    const cab = { headers: { 'Authorization': `Bearer ${token}` } };
    const [estat] = await Promise.allSettled([
        fetch('/api/pedidos/estatisticas', cab).then(r => r.ok ? r.json() : Promise.reject())
    ]);
    if (estat.status === 'fulfilled') {
        const e = estat.value;
        definirValor('statPendentes', e.pendentes ?? 0);
        definirValor('statFora', e.emSaida ?? 0);
        definirValor('statAtrasados', e.atrasados ?? 0, Number(e.atrasados) > 0);
        definirValor('statSaidasHoje', e.saidasHoje ?? 0);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Esta tela é exclusiva de quem tem mais de um painel disponível (ADMIN).
    // Qualquer outro tipo de usuário é enviado direto para o seu painel.
    let usuario = {};
    try { usuario = JSON.parse(localStorage.getItem('usuario') || '{}'); } catch (_) { usuario = {}; }
    const tipo = (usuario.tipo_usuario || '').toUpperCase();
    const destinos = { SECRETARIA: 'secretaria.html', PORTARIA: 'portaria.html', PORTEIRO: 'portaria.html', PROFESSOR: 'professor.html', PAI: 'home.html', RESPONSAVEL: 'home.html' };
    if (destinos[tipo]) {
        window.location.href = destinos[tipo];
        return;
    }

    preencherCabecalho(usuario);
    marcarUltimoPainel();
    carregarSituacao();
    setInterval(() => { if (!document.hidden) carregarSituacao(); }, 30000);

    // Atalhos 1-4 (ignora quando o foco está num campo de texto).
    const cards = [...document.querySelectorAll('.selecao-card')];
    document.addEventListener('keydown', e => {
        if (e.ctrlKey || e.metaKey || e.altKey || /input|textarea|select/i.test(e.target.tagName)) return;
        const n = Number(e.key);
        if (n >= 1 && n <= cards.length) cards[n - 1].click();
    });

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            aplicarTema(newTheme);
            localStorage.setItem('theme', newTheme);
        });
    }

    const savedTheme = localStorage.getItem('theme') || 'light';
    aplicarTema(savedTheme);
});
