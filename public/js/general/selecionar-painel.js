// ==========================================
// TELA DE SELEÇÃO DE PAINEL (uso exclusivo do ADMIN)
// ==========================================

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = 'login.html';
}

function iniciarParticulas(theme) {
    if (window.pJSDom && window.pJSDom.length > 0) {
        window.pJSDom.forEach(dom => dom.pJS.fn.vendors.destroypJS());
        window.pJSDom = [];
    }

    const corLinha = theme === 'dark' ? '#FFFFFF' : '#0A192F';

    if (typeof particlesJS !== 'undefined') {
        particlesJS("particles-js", {
            "particles": {
                "number": { "value": 150, "density": { "enable": true, "value_area": 800 } },
                "color": { "value": "#0052cc" },
                "shape": { "type": "circle" },
                "opacity": { "value": 0.5 },
                "size": { "value": 3, "random": true },
                "line_linked": {
                    "enable": true,
                    "distance": 150,
                    "color": corLinha,
                    "opacity": 0.2,
                    "width": 1
                },
                "move": { "enable": true, "speed": 2 }
            },
            "retina_detect": true
        });
    }
}

function aplicarTema(theme) {
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = themeToggle ? themeToggle.querySelector('i') : null;

    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (themeIcon) {
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        }
    } else {
        document.documentElement.removeAttribute('data-theme');
        if (themeIcon) {
            themeIcon.classList.remove('fa-sun');
            themeIcon.classList.add('fa-moon');
        }
    }
    iniciarParticulas(theme);
}

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Esta tela é exclusiva de quem tem mais de um painel disponível (ADMIN).
    // Qualquer outro tipo de usuário é enviado direto para o seu painel.
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    const tipo = (usuario.tipo_usuario || '').toUpperCase();

    if (tipo === 'SECRETARIA') {
        window.location.href = 'secretaria.html';
        return;
    }
    if (tipo === 'PORTARIA' || tipo === 'PORTEIRO') {
        window.location.href = 'portaria.html';
        return;
    }
    if (tipo === 'PAI' || tipo === 'RESPONSAVEL') {
        window.location.href = 'home.html';
        return;
    }

    const boasVindas = document.getElementById('boasVindas');
    if (boasVindas && usuario.nome) {
        boasVindas.textContent = `Olá, ${usuario.nome}! Escolha uma das opções abaixo para continuar.`;
    }

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
