// URL base ajustada com o prefixo /api
const API_URL = 'http://localhost:3000/api';

// Elemento de Loading Global
const loadingDiv = document.createElement('div');
loadingDiv.id = 'loading';
loadingDiv.className = 'loading';
loadingDiv.innerHTML = '<div>Carregando...</div>';
loadingDiv.style.display = 'none';
document.body.appendChild(loadingDiv);

// ==========================================
// 1. VALIDAÇÃO DE CAMPOS E ESTADO DE BOTÕES
// ==========================================

function validateEmail(email) {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) || email.trim().length >= 3;
}

function onChangeEmail() {
    const emailEl = document.getElementById('email');
    if (!emailEl) return;

    const email = emailEl.value;
    const emailReqError = document.getElementById('email-required-error');
    const emailInvError = document.getElementById('email-invalid-error');

    if (emailReqError) emailReqError.style.display = email ? 'none' : 'block';
    if (emailInvError && email) {
        emailInvError.style.display = validateEmail(email) ? 'none' : 'block';
    }
    updateButtonState();
}

function onChangePassword() {
    const passwordEl = document.getElementById('password');
    if (!passwordEl) return;

    const password = passwordEl.value;
    const passwordReqError = document.getElementById('password-required-error');
    const minLenError = document.getElementById('password-min-length-error');

    if (passwordReqError) passwordReqError.style.display = password ? 'none' : 'block';
    if (minLenError) minLenError.style.display = (password.length >= 6 || !password) ? 'none' : 'block';

    const confirmPass = document.getElementById('confirmPassword');
    const confirmError = document.getElementById('password-doesnt-match-error');
    if (confirmPass && confirmError) {
        confirmError.style.display = password === confirmPass.value ? 'none' : 'block';
    }
    updateButtonState();
}

function onChangeConfirmPassword() {
    onChangePassword();
}

function updateButtonState() {
    const email = document.getElementById('email')?.value || '';
    const password = document.getElementById('password')?.value || '';
    const btn = document.getElementById('login-button') || document.getElementById('register-button');
    if (!btn) return;

    const validEmail = validateEmail(email);
    const validPass = password.length >= 6;

    if (btn.id === 'login-button') {
        btn.disabled = !(validEmail && validPass);
    } else {
        const nome = (document.getElementById('nome') || document.getElementById('nome_completo'))?.value?.trim() || '';
        const cpf = document.getElementById('cpf')?.value?.trim() || '';
        const telefone = document.getElementById('telefone')?.value?.trim() || '';
        const tipo = document.getElementById('tipo_usuario')?.value || '';

        btn.disabled = !(validEmail && validPass && nome && cpf && telefone && tipo);

        ['nome', 'cpf', 'telefone'].forEach(id => {
            const field = document.getElementById(id);
            const error = document.getElementById(id + '-required-error');
            if (field && error) {
                error.style.display = field.value.trim() ? 'none' : 'block';
            }
        });
    }
}

// ==========================================
// 2. REQUISIÇÕES DE AUTENTICAÇÃO (API)
// ==========================================

async function login(event) {
    if (event) event.preventDefault();

    const email = document.getElementById('email')?.value?.trim();
    const senha = document.getElementById('password')?.value;

    if (!email || !senha) return;

    loadingDiv.style.display = 'flex';

    try {
        const response = await fetch(`${API_URL}/usuarios/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.token);
            if (data.usuario) {
                localStorage.setItem('usuario', JSON.stringify(data.usuario));
            }

            const destino = data.redirecionarPara || (
                data.usuario?.tipo_usuario === 'SECRETARIA' ? 'secretaria.html' :
                data.usuario?.tipo_usuario === 'PORTEIRO' || data.usuario?.tipo_usuario === 'PORTARIA' ? 'portaria.html' : 'home.html'
            );

            window.location.href = destino;
        } else {
            alert('Erro no login: ' + (data.erro || 'Credenciais inválidas'));
        }
    } catch (err) {
        alert('Erro de conexão com o servidor.');
    } finally {
        loadingDiv.style.display = 'none';
    }
}

async function register(event) {
    if (event) event.preventDefault();

    const campoNome = document.getElementById('nome') || document.getElementById('nome_completo');
    if (!campoNome) {
        window.location.href = 'register.html';
        return;
    }

    const nome = campoNome.value.trim();
    const cpf = document.getElementById('cpf')?.value?.trim();
    const email = document.getElementById('email')?.value?.trim();
    const telefone = document.getElementById('telefone')?.value?.trim();
    const senha = document.getElementById('password')?.value;
    const tipo_usuario = document.getElementById('tipo_usuario')?.value;

    if (!nome || !cpf || !email || !telefone || senha.length < 6 || !tipo_usuario) {
        alert('Preencha todos os campos corretamente!');
        return;
    }

    loadingDiv.style.display = 'flex';
    try {
        const response = await fetch(`${API_URL}/usuarios/cadastrar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nome,
                cpf,
                email,
                telefone,
                senha,
                tipo_usuario,
                status: '1'
            })
        });

        const data = await response.json();
        if (response.ok) {
            if (data.token) localStorage.setItem('token', data.token);
            if (data.usuario) localStorage.setItem('usuario', JSON.stringify(data.usuario));
            alert('Cadastro efetuado com sucesso!');
            window.location.href = 'home.html';
        } else {
            alert('Erro no cadastro: ' + (data.erro || data.detalhes || 'Falha no cadastro'));
        }
    } catch (err) {
        alert('Erro de conexão com o servidor');
    } finally {
        loadingDiv.style.display = 'none';
    }
}

async function recoverPassword(event) {
    if (event) event.preventDefault();

    const email = document.getElementById('email')?.value?.trim();
    if (!validateEmail(email)) {
        alert('Digite um e-mail válido.');
        return;
    }

    const btn = document.getElementById('recover-password-button') || document.getElementById('recover-button');
    if (btn) btn.disabled = true;

    loadingDiv.style.display = 'flex';
    try {
        const response = await fetch(`${API_URL}/usuarios/recuperar-senha`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (response.ok) {
            alert(data.mensagem || 'Instruções enviadas para o seu e-mail!');
        } else {
            alert('Erro: ' + (data.erro || 'Falha ao processar solicitação.'));
        }
    } catch (err) {
        alert('Erro de conexão com o servidor.');
    } finally {
        loadingDiv.style.display = 'none';
        if (btn) btn.disabled = false;
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = 'login.html';
}

function checkAuth() {
    const paginasProtegidas = ['home.html', 'secretaria.html', 'portaria.html'];
    const paginaAtual = window.location.pathname.split('/').pop();

    if (paginasProtegidas.includes(paginaAtual) && !localStorage.getItem('token')) {
        window.location.href = 'login.html';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', login);
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', register);
    }
});