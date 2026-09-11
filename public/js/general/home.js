const API_URL = 'http://localhost:3000/api';

// ==========================================
// 1. GERENCIAMENTO DE NAVEGAÇÃO E INTERFACE
// ==========================================
function mostrarTela(idTela) {
    const telas = ['tela-inicio', 'tela-criar', 'tela-historico', 'tela-conta'];
    telas.forEach(t => {
        const el = document.getElementById(t);
        if (el) el.style.display = 'none';
    });

    const telaAtiva = document.getElementById(idTela);
    if (telaAtiva) telaAtiva.style.display = 'block';

    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.getElementById('menuToggle');
    if (window.innerWidth <= 768 && sidebar) {
        sidebar.classList.remove('open');
        if (menuToggle) menuToggle.classList.remove('active');
    }

    if (idTela === 'tela-historico') {
        carregarHistorico();
    }
}

// ==========================================
// 2. CONFIGURAÇÃO DE TEMA E PARTÍCULAS
// ==========================================
function iniciarParticulas(theme) {
    if (window.pJSDom && window.pJSDom.length > 0) {
        window.pJSDom.forEach(dom => dom.pJS.fn.vendors.destroypJS());
        window.pJSDom = [];
    }

    const corLinha = theme === 'dark' ? '#FFFFFF' : '#0A192F';

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

// ==========================================
// 3. CARREGAMENTO DE DADOS (API / BACKEND)
// ==========================================
async function carregarMeusAlunos() {
    const selectAluno = document.getElementById('alunoId');
    if (!selectAluno) return;

    try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`${API_URL}/responsaveis/meus-alunos`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!resp.ok) throw new Error('Falha ao buscar alunos vinculados');

        const alunos = await resp.json();
        selectAluno.innerHTML = '';

        if (alunos.length === 0) {
            selectAluno.innerHTML = '<option value="" disabled selected>Nenhum aluno vinculado à sua conta</option>';
            return;
        }

        selectAluno.innerHTML = '<option value="" disabled selected>Selecione o aluno</option>';
        alunos.forEach(aluno => {
            const option = document.createElement('option');
            option.value = aluno.aluno_id;
            option.textContent = aluno.turma ? `${aluno.nome} (${aluno.turma})` : aluno.nome;
            selectAluno.appendChild(option);
        });
    } catch (err) {
        console.error('Erro ao carregar alunos vinculados:', err);
        selectAluno.innerHTML = '<option value="" disabled selected>Erro ao carregar alunos</option>';
    }
}

async function carregarHistorico() {
    const token = localStorage.getItem('token');
    const usuarioSalvo = JSON.parse(localStorage.getItem('usuario') || '{}');
    const tbody = document.getElementById('tabelaHistoricoBody');

    if (!token || !usuarioSalvo.id_usuario || !tbody) return;

    try {
        const resp = await fetch(`${API_URL}/pedidos/solicitante/${usuarioSalvo.id_usuario}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!resp.ok) throw new Error('Falha ao buscar histórico');

        const pedidos = await resp.json();
        tbody.innerHTML = '';

        if (pedidos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">Nenhuma solicitação encontrada.</td></tr>';
            return;
        }

        pedidos.forEach(pedido => {
            const tr = document.createElement('tr');
            const dataHora = pedido.hora_prevista_saida 
                ? new Date(pedido.hora_prevista_saida).toLocaleString('pt-BR') 
                : '-';
            
            const statusClass = (pedido.status || 'PENDENTE').toLowerCase();
            const mostraMotivo = pedido.status === 'RECUSADA' || pedido.status === 'CANCELADA';
            const motivo = mostraMotivo ? (pedido.observacao || '-') : '-';

            tr.innerHTML = `
                <td>${pedido.nome_aluno || 'Aluno'}</td>
                <td>${pedido.turma || '-'}</td>
                <td>${dataHora}</td>
                <td><span class="status status-${statusClass}">${pedido.status}</span></td>
                <td>${motivo}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Erro ao carregar histórico:', err);
        tbody.innerHTML = '<tr><td colspan="5" style="color:red;">Erro ao carregar histórico.</td></tr>';
    }
}

async function preencherDadosConta() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const resp = await fetch(`${API_URL}/usuarios/conta`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!resp.ok) throw new Error('Falha ao buscar dados da conta');

        const usuario = await resp.json();

        if (document.getElementById('nomeResponsavel')) document.getElementById('nomeResponsavel').value = usuario.nome || '';
        if (document.getElementById('cpfResponsavel')) document.getElementById('cpfResponsavel').value = usuario.cpf || '';
        if (document.getElementById('telefoneResponsavel')) document.getElementById('telefoneResponsavel').value = usuario.telefone || '';
        if (document.getElementById('emailResponsavel')) document.getElementById('emailResponsavel').value = usuario.email || '';
    } catch (err) {
        console.error('Erro ao carregar dados da conta:', err);
    }
}

// ==========================================
// 4. SUBMISSÃO DE FORMULÁRIOS
// ==========================================
const formSolicitacao = document.getElementById('formSolicitacao');
if (formSolicitacao) {
    formSolicitacao.addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('token');
        const usuarioSalvo = JSON.parse(localStorage.getItem('usuario') || '{}');

        const dataSaida = document.getElementById('dataSaida').value;
        const horaSaida = document.getElementById('horaSaida').value;
        const horaPrevistaSaida = `${dataSaida}T${horaSaida}:00`;

        const corpo = {
            aluno_id: document.getElementById('alunoId').value,
            hora_prevista_saida: horaPrevistaSaida,
            motivo: 'Saída para Almoço'
        };

        try {
            const resp = await fetch(`${API_URL}/pedidos/cadastrar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(corpo)
            });

            const data = await resp.json();

            if (resp.ok) {
                alert('Solicitação de saída para almoço enviada com sucesso!');
                formSolicitacao.reset();
                mostrarTela('tela-historico');
            } else {
                alert('Erro: ' + (data.erro || 'Falha ao enviar solicitação'));
            }
        } catch (err) {
            alert('Erro de conexão com o servidor');
        }
    });
}

const formConta = document.getElementById('formConta');
if (formConta) {
    formConta.addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('token');

        const corpo = {
            nome: document.getElementById('nomeResponsavel').value.trim(),
            telefone: document.getElementById('telefoneResponsavel').value.trim(),
            email: document.getElementById('emailResponsavel').value.trim(),
            senhaAtual: document.getElementById('senhaAtual').value,
            novaSenha: document.getElementById('novaSenha').value
        };

        if (!corpo.novaSenha) {
            delete corpo.novaSenha;
            delete corpo.senhaAtual;
        }

        try {
            const resp = await fetch(`${API_URL}/usuarios/conta`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(corpo)
            });

            const data = await resp.json();

            if (resp.ok) {
                alert('Dados atualizados com sucesso!');
                document.getElementById('senhaAtual').value = '';
                document.getElementById('novaSenha').value = '';
                preencherDadosConta();
            } else {
                alert('Erro: ' + (data.erro || 'Falha ao atualizar conta'));
            }
        } catch (err) {
            alert('Erro de conexão com o servidor');
        }
    });
}

// ==========================================
// 5. AUTENTICAÇÃO E INICIALIZAÇÃO
// ==========================================
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('token')) {
        window.location.href = 'login.html';
        return;
    }

    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');

    if (menuToggle && sidebar && mainContent) {
        menuToggle.addEventListener('click', () => {
            menuToggle.classList.toggle('active');
            sidebar.classList.toggle('open');
            mainContent.classList.toggle('shifted');
        });
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

    carregarMeusAlunos();
    preencherDadosConta();
    carregarHistorico();
});