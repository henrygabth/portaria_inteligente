const API_URL = 'http://localhost:3000/api';

function mostrarTela(idTela) {
    const telas = ['tela-inicio', 'tela-saidas', 'tela-retorno', 'tela-historico'];
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

    if (idTela === 'tela-saidas') {
        carregarSaidas();
    } else if (idTela === 'tela-retorno') {
        carregarEmSaida();
    } else if (idTela === 'tela-historico') {
        carregarHistoricoPortaria();
    }
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
<<<<<<< HEAD
                "color": { "value": "#0052cc" },
=======
            "color": { "value": "#0052cc" },
>>>>>>> 4f592c031e07562a0df70c9cabbe1e2474f1b4e7
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

// ==========================================
// 1. SAÍDAS AUTORIZADAS (status = APROVADA) -> Liberar aluno
// ==========================================
async function carregarSaidas() {
    const token = localStorage.getItem('token');
    const tbody = document.getElementById('lista-saidas');
    if (!tbody) return;

    try {
        const resp = await fetch(`${API_URL}/pedidos/listarPorStatus?status=APROVADA`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!resp.ok) throw new Error('Falha ao buscar saídas autorizadas');

        const dados = await resp.json();
        tbody.innerHTML = '';

        if (dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">Nenhuma saída pendente de liberação.</td></tr>';
        } else {
            dados.forEach(pedido => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${pedido.nome_aluno || 'Aluno'}</td>
                    <td>${pedido.turma || '-'}</td>
                    <td>${pedido.responsavel || '-'}</td>
                    <td>${pedido.aprovador || '-'}</td>
                    <td>
                        <div class="acoes-portaria">
                            <button class="btn-liberar" onclick="liberarSaida(${pedido.pedidos_saida_id})">
                                <i class="fas fa-check-circle"></i> Liberar
                            </button>
                            <button class="btn-cancelar" onclick="abrirModalCancelar(${pedido.pedidos_saida_id})">
                                <i class="fas fa-times-circle"></i> Cancelar
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        const elemQtd = document.getElementById('qtd-aguardando');
        if (elemQtd) elemQtd.textContent = dados.length;
    } catch (err) {
        console.error('Erro ao carregar saídas:', err);
        tbody.innerHTML = '<tr><td colspan="5" style="color:red;">Erro ao carregar saídas autorizadas.</td></tr>';
    }
}

async function liberarSaida(id) {
    const token = localStorage.getItem('token');
    if (!confirm('Confirmar liberação do aluno?')) return;

    try {
        const resp = await fetch(`${API_URL}/pedidos/liberar/${id}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (resp.ok) {
            alert('Aluno liberado com sucesso!');
            carregarSaidas();
            carregarEmSaida();
            carregarHistoricoPortaria();
        } else {
            const erro = await resp.json();
            alert('Erro: ' + (erro.erro || 'Falha ao liberar'));
        }
    } catch (err) {
        alert('Erro de conexão com o servidor');
    }
}

// ==========================================
// 1b. CANCELAR PEDIDO NA PORTARIA (motivo obrigatório, notifica por e-mail)
// ==========================================
let pedidoParaCancelar = null;

function abrirModalCancelar(id) {
    pedidoParaCancelar = id;
    const modal = document.getElementById('modalCancelar');
    if (modal) modal.style.display = 'flex';
}

function fecharModalCancelar() {
    const modal = document.getElementById('modalCancelar');
    if (modal) modal.style.display = 'none';
    const campoMotivo = document.getElementById('motivoCancelamento');
    if (campoMotivo) campoMotivo.value = '';
}

async function confirmarCancelamento() {
    const campoMotivo = document.getElementById('motivoCancelamento');
    const motivo = campoMotivo ? campoMotivo.value.trim() : '';
    if (!motivo) {
        alert('Informe o motivo do cancelamento.');
        return;
    }

    const token = localStorage.getItem('token');
    try {
        const resp = await fetch(`${API_URL}/pedidos/cancelar/${pedidoParaCancelar}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ observacao: motivo })
        });

        const data = await resp.json();

        if (resp.ok) {
            alert(data.mensagem || 'Pedido cancelado.');
            carregarSaidas();
            carregarHistoricoPortaria();
        } else {
            alert('Erro: ' + (data.erro || 'Falha ao cancelar'));
        }
    } catch (err) {
        alert('Erro de conexão com o servidor');
    } finally {
        fecharModalCancelar();
    }
}

// ==========================================
// 2. ALUNOS FORA DA ESCOLA (status = EM_SAIDA) -> Registrar retorno
// ==========================================
async function carregarEmSaida() {
    const token = localStorage.getItem('token');
    const tbody = document.getElementById('lista-retorno');
    if (!tbody) return;

    try {
        const resp = await fetch(`${API_URL}/pedidos/listarPorStatus?status=EM_SAIDA`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!resp.ok) throw new Error('Falha ao buscar alunos fora da escola');

        const dados = await resp.json();
        tbody.innerHTML = '';

        if (dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">Nenhum aluno aguardando retorno no momento.</td></tr>';
        } else {
            dados.forEach(pedido => {
                const tr = document.createElement('tr');
                const horaSaida = pedido.hora_saida_real
                    ? new Date(pedido.hora_saida_real).toLocaleString('pt-BR')
                    : '-';
<<<<<<< HEAD
                const atrasado = pedido.atrasado === 1 || pedido.atrasado === true;
                if (atrasado) tr.style.backgroundColor = '#fff5f5';

                const badgeAtraso = atrasado
                    ? '<span style="display:inline-block; margin-left:6px; padding:2px 8px; border-radius:10px; background:#E52207; color:#fff; font-size:11px; font-weight:700;">ATRASADO</span>'
                    : '';

                tr.innerHTML = `
                    <td>${pedido.nome_aluno || 'Aluno'}${badgeAtraso}</td>
=======

                tr.innerHTML = `
                    <td>${pedido.nome_aluno || 'Aluno'}</td>
>>>>>>> 4f592c031e07562a0df70c9cabbe1e2474f1b4e7
                    <td>${pedido.turma || '-'}</td>
                    <td>${pedido.responsavel || '-'}</td>
                    <td>${horaSaida}</td>
                    <td>
                        <button class="btn-liberar" onclick="registrarRetorno(${pedido.pedidos_saida_id})" style="background: var(--senai-red, #E52207); color: white; padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer;">
                            <i class="fas fa-undo"></i> Registrar Retorno
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        const elemQtdFora = document.getElementById('qtd-fora');
        if (elemQtdFora) elemQtdFora.textContent = dados.length;
    } catch (err) {
        console.error('Erro ao carregar alunos fora da escola:', err);
        tbody.innerHTML = '<tr><td colspan="5" style="color:red;">Erro ao carregar alunos fora da escola.</td></tr>';
    }
}

async function registrarRetorno(id) {
    const token = localStorage.getItem('token');
    if (!confirm('Confirmar o retorno do aluno à escola?')) return;

    try {
        const resp = await fetch(`${API_URL}/pedidos/retorno/${id}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (resp.ok) {
            alert('Retorno do aluno registrado com sucesso!');
            carregarEmSaida();
            carregarHistoricoPortaria();
        } else {
            const erro = await resp.json();
            alert('Erro: ' + (erro.erro || 'Falha ao registrar retorno'));
        }
    } catch (err) {
        alert('Erro de conexão com o servidor');
    }
}

// ==========================================
// 3. HISTÓRICO (status = CONCLUIDA ou CANCELADA)
// ==========================================
async function carregarHistoricoPortaria() {
    const token = localStorage.getItem('token');
    const tbody = document.getElementById('tabelaHistoricoPortariaBody');
    if (!tbody) return;

    try {
        const [respConcluidas, respCanceladas] = await Promise.all([
            fetch(`${API_URL}/pedidos/listarPorStatus?status=CONCLUIDA`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch(`${API_URL}/pedidos/listarPorStatus?status=CANCELADA`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]);

        if (!respConcluidas.ok || !respCanceladas.ok) throw new Error('Falha ao carregar histórico');

        const concluidas = (await respConcluidas.json()).map(p => ({ ...p, _situacao: 'CONCLUIDA' }));
        const canceladas = (await respCanceladas.json()).map(p => ({ ...p, _situacao: 'CANCELADA' }));

        const dados = [...concluidas, ...canceladas];
        tbody.innerHTML = '';

        if (dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7">Nenhum histórico de saída registrado.</td></tr>';
            return;
        }

        dados.forEach(pedido => {
            const tr = document.createElement('tr');
            const horaSaida = pedido.hora_saida_real
                ? new Date(pedido.hora_saida_real).toLocaleString('pt-BR')
                : '-';
            const horaRetorno = pedido.hora_retorno_real
                ? new Date(pedido.hora_retorno_real).toLocaleString('pt-BR')
                : '-';
            const statusLabel = pedido._situacao === 'CANCELADA'
                ? '<span style="color: var(--senai-red, #E52207); font-weight: bold;">Cancelado</span>'
                : '<span style="color: green; font-weight: bold;">Concluído</span>';
            const motivo = pedido._situacao === 'CANCELADA' ? (pedido.observacao || '-') : '-';

            tr.innerHTML = `
                <td>${pedido.nome_aluno || 'Aluno'}</td>
                <td>${pedido.turma || '-'}</td>
                <td>${horaSaida}</td>
                <td>${horaRetorno}</td>
                <td>${pedido.responsavel || '-'}</td>
                <td>${statusLabel}</td>
                <td>${motivo}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Erro ao carregar histórico:', err);
        tbody.innerHTML = '<tr><td colspan="7" style="color:red;">Erro ao carregar histórico de saídas.</td></tr>';
    }
}

// ==========================================
// 4. AUTENTICAÇÃO E INICIALIZAÇÃO
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

<<<<<<< HEAD
    const usuarioLogado = JSON.parse(localStorage.getItem('usuario') || '{}');
    if ((usuarioLogado.tipo_usuario || '').toUpperCase() === 'ADMIN') {
        const linkTrocarPainel = document.getElementById('linkTrocarPainel');
        if (linkTrocarPainel) linkTrocarPainel.style.display = 'block';
    }

=======
>>>>>>> 4f592c031e07562a0df70c9cabbe1e2474f1b4e7
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

    carregarSaidas();
    carregarEmSaida();
    carregarHistoricoPortaria();
});
