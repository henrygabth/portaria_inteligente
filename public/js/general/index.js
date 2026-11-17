// URL base ajustada com o prefixo /api
const API_URL = '/api';

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
        let dispositivo = null;
        try { dispositivo = localStorage.getItem('pi-dispositivo'); } catch (_) { /* sem storage */ }
        const response = await fetch(`${API_URL}/usuarios/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha, dispositivo })
        });

        const data = await response.json();

        if (response.ok && data.doisFatores) {
            pedirCodigo(data);
        } else if (response.ok) {
            await concluirEntrada(data);
        } else {
            PIDialogo.avisar('Erro no login: ' + (data.erro || 'Credenciais inválidas'));
        }
    } catch (err) {
        PIDialogo.avisar('Erro de conexão com o servidor.');
    } finally {
        loadingDiv.style.display = 'none';
    }
}

// Depois do login (com ou sem código): guarda a sessão, pede o aceite da LGPD se faltar e
// leva para a tela certa.
async function concluirEntrada(data) {
    localStorage.setItem('token', data.token);
    if (data.usuario) localStorage.setItem('usuario', JSON.stringify(data.usuario));
    if (data.dispositivo) { try { localStorage.setItem('pi-dispositivo', data.dispositivo); } catch (_) { /* sem storage */ } }
    localStorage.removeItem('sugerirTrocaSenha');

    const tipoUsuario = (data.usuario?.tipo_usuario || '').toUpperCase();
    // Primeiro acesso: a troca de senha já inclui o aceite do termo e da política.
    if (data.aceitarTermos && !data.trocarSenha) await pedirAceiteTermos(data.versaoTermos);

    // O ADMIN tem acesso aos três painéis, então em vez de já cair
    // direto em um deles, ele escolhe qual quer acessar.
    // Primeiro acesso: troca de senha obrigatória antes de qualquer outra tela.
    const destino = data.trocarSenha
        ? `trocar-senha.html?depois=${encodeURIComponent(tipoUsuario === 'ADMIN' ? 'selecionar-painel.html' : data.redirecionarPara || 'home.html')}`
        : tipoUsuario === 'ADMIN'
        ? 'selecionar-painel.html'
        : (data.redirecionarPara || (
            tipoUsuario === 'SECRETARIA' ? 'secretaria.html' :
            tipoUsuario === 'PORTEIRO' || tipoUsuario === 'PORTARIA' ? 'portaria.html' : tipoUsuario === 'PROFESSOR' ? 'professor.html' : 'home.html'
        ));

    window.location.href = destino;
}

// Caixa de diálogo simples e acessível usada pelo código de acesso e pelo aceite da LGPD.
function abrirDialogo(html, rotulo) {
    const fundo = document.createElement('div');
    fundo.className = 'modal-recurso';
    fundo.innerHTML = `<div class="modal-recurso-caixa" role="dialog" aria-modal="true" aria-labelledby="${rotulo}">${html}</div>`;
    document.body.appendChild(fundo);
    return fundo;
}

// 2ª etapa (secretaria/administração): código de 6 números enviado por e-mail.
function pedirCodigo(dados) {
    const fundo = abrirDialogo(`
        <button type="button" class="modal-recurso-fechar" aria-label="Cancelar e voltar">&times;</button>
        <h2 id="codTitulo"><i class="fas fa-shield-halved" aria-hidden="true"></i> Confirme que é você</h2>
        <p class="tela-intro">Enviamos um código de 6 números para <strong>${String(dados.email || 'o seu e-mail').replace(/</g, '&lt;')}</strong>. Ele vale por ${dados.validadeMin || 10} minutos.</p>
        <div id="codForm" class="codigo-form">
            <label for="codCampo">Código de acesso</label>
            <input id="codCampo" class="codigo-campo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required aria-describedby="codErro">
            <label class="importar-check"><input type="checkbox" id="codConfiar"> Confiar neste aparelho por 30 dias (não use em computador compartilhado)</label>
            <p id="codErro" class="erro-texto" role="alert"></p>
            <button type="button" class="btn-importar codigo-entrar">Entrar</button>
            <p class="codigo-ajuda">Não chegou? Confira o spam ou feche e entre com a senha de novo para receber outro.</p>
        </div>`, 'codTitulo');
    const campo = fundo.querySelector('#codCampo');
    const erro = fundo.querySelector('#codErro');
    campo.addEventListener('input', () => { campo.value = campo.value.replace(/\D/g, '').slice(0, 6); if (campo.value.length === 6) enviar(); });
    campo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); enviar(); } });
    fundo.querySelector('.modal-recurso-fechar').addEventListener('click', () => fundo.remove());
    fundo.querySelector('.codigo-entrar').addEventListener('click', () => enviar());
    async function enviar() {
        if (enviar.ocupado) return;
        if (!/^\d{6}$/.test(campo.value)) { erro.textContent = 'Digite os 6 números.'; campo.focus(); return; }
        const botao = fundo.querySelector('.codigo-entrar'); botao.disabled = true; erro.textContent = ''; enviar.ocupado = true;
        try {
            const r = await fetch(`${API_URL}/usuarios/login/codigo`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ desafio: dados.desafio, codigo: campo.value, confiar: fundo.querySelector('#codConfiar').checked })
            });
            const d = await r.json();
            if (!r.ok) {
                erro.textContent = d.erro || 'Código incorreto.';
                campo.value = ''; campo.focus(); botao.disabled = false; enviar.ocupado = false;
                if (d.expirado) setTimeout(() => fundo.remove(), 2500);
                return;
            }
            fundo.remove();
            await concluirEntrada(d);
        } catch (_) { erro.textContent = 'Erro de conexão com o servidor.'; botao.disabled = false; enviar.ocupado = false; }
    }
    campo.focus();
}

// LGPD: quem ainda não aceitou a versão atual do termo/política aceita antes de entrar.
function pedirAceiteTermos(versao) {
    loadingDiv.style.display = 'none';
    return new Promise(resolve => {
        const fundo = abrirDialogo(`
            <h2 id="lgpdTitulo"><i class="fas fa-user-shield" aria-hidden="true"></i> Privacidade dos seus dados</h2>
            <p class="tela-intro">Para usar o sistema, precisamos do seu aceite. Explicamos quais dados guardamos, para quê, por quanto tempo e como você pode baixar ou apagar os seus dados.</p>
            <p><a href="politica-privacidade.html" target="_blank" rel="noopener">Ler o termo de uso e a política de privacidade <span class="sr-only">(abre em nova aba)</span></a></p>
            <label class="importar-check"><input type="checkbox" id="lgpdAceito"> Li e aceito o termo de uso e a política de privacidade.</label>
            <p id="lgpdErro" class="erro-texto" role="alert"></p>
            <div class="importar-botoes"><button type="button" class="btn-filtro secundario" id="lgpdSair">Sair</button><button type="button" class="btn-importar" id="lgpdOk">Aceitar e continuar</button></div>`, 'lgpdTitulo');
        fundo.querySelector('#lgpdSair').addEventListener('click', () => { localStorage.removeItem('token'); localStorage.removeItem('usuario'); location.reload(); });
        fundo.querySelector('#lgpdOk').addEventListener('click', async () => {
            const erro = fundo.querySelector('#lgpdErro');
            if (!fundo.querySelector('#lgpdAceito').checked) { erro.textContent = 'Marque a caixa para continuar.'; return; }
            try {
                const r = await fetch(`${API_URL}/usuarios/aceitar-termos`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                    body: JSON.stringify({ aceito: true, versao })
                });
                const d = await r.json();
                if (!r.ok) { erro.textContent = d.erro || 'Não foi possível registrar.'; return; }
                fundo.remove(); resolve();
            } catch (_) { erro.textContent = 'Erro de conexão com o servidor.'; }
        });
        fundo.querySelector('#lgpdAceito').focus();
    });
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
        PIDialogo.avisar('Preencha todos os campos corretamente!');
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
            await PIDialogo.avisar('Cadastro efetuado com sucesso!');
            window.location.href = 'home.html';
        } else {
            PIDialogo.avisar('Erro no cadastro: ' + (data.erro || data.detalhes || 'Falha no cadastro'));
        }
    } catch (err) {
        PIDialogo.avisar('Erro de conexão com o servidor');
    } finally {
        loadingDiv.style.display = 'none';
    }
}

async function recoverPassword(event) {
    if (event) event.preventDefault();

    const email = document.getElementById('email')?.value?.trim();
    if (!validateEmail(email)) {
        PIDialogo.avisar('Digite um e-mail válido.');
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
            PIDialogo.avisar(data.mensagem || 'Instruções enviadas para o seu e-mail!');
        } else {
            PIDialogo.avisar('Erro: ' + (data.erro || 'Falha ao processar solicitação.'));
        }
    } catch (err) {
        PIDialogo.avisar('Erro de conexão com o servidor.');
    } finally {
        loadingDiv.style.display = 'none';
        if (btn) btn.disabled = false;
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    localStorage.removeItem('sugerirTrocaSenha');
    window.location.href = 'login.html';
}

function checkAuth() {
    const paginasProtegidas = ['home.html', 'secretaria.html', 'portaria.html', 'professor.html', 'professores-admin.html', 'selecionar-painel.html'];
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