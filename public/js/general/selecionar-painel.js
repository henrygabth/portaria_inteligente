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
    if (tipo === 'PROFESSOR') {
        window.location.href = 'professor.html';
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
