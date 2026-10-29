const API_URL = '/api';

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

// ==========================================
// 0. FUNÇÕES AUXILIARES (iguais nas duas telas)
// ==========================================
function esc(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function mesmoDia(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Mostra só a hora quando é hoje; quando é outro dia, mostra dia/mês + hora.
function formatarHorario(valor) {
    if (!valor) return '-';
    const d = new Date(valor);
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (mesmoDia(d, new Date())) return hora;
    return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`;
}

function estaAtrasado(pedido) {
    return pedido.atrasado === 1 || pedido.atrasado === true || pedido.atrasado === '1';
}

function mensagemVazia(tbody, texto) {
    tbody.innerHTML = `<tr><td colspan="7">${texto}</td></tr>`;
}

function mensagemErro(tbody, texto) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:red;">${texto}</td></tr>`;
}

function celulaAluno(pedido) {
    const etiqueta = pedido.recorrente_id ? '<span class="etiqueta-aluno">Horário fixo</span>' : '';
    return `${esc(pedido.nome_aluno || 'Aluno')}${etiqueta}`;
}

// ==========================================
// 1. SAÍDAS APROVADAS PELA SECRETARIA -> Portaria apenas registra a saída
// ==========================================
async function carregarSaidas() {
    const token = localStorage.getItem('token');
    const tbody = document.getElementById('lista-saidas');
    if (!tbody) return;

    try {
        const resp = await fetch(`${API_URL}/pedidos/listarPorStatus?status=APROVADA`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!resp.ok) throw new Error('Falha ao buscar saídas aprovadas');

        const dados = await resp.json();
        tbody.innerHTML = '';

        if (dados.length === 0) {
            mensagemVazia(tbody, 'Nenhuma saída aprovada aguardando registro.');
        } else {
            dados.forEach(pedido => {
                const tr = document.createElement('tr');
                const autorizadoPor = pedido.secretario || pedido.aprovador;
                tr.innerHTML = `
                    <td>${celulaAluno(pedido)}</td>
                    <td>${esc(pedido.turma || '-')}</td>
                    <td>${esc(pedido.responsavel || '-')}</td>
                    <td>${formatarHorario(pedido.hora_prevista_saida)}</td>
                    <td>${formatarHorario(pedido.hora_prevista_retorno)}</td>
                    <td>
                        <span class="status status-aprovada">Autorizado</span>
                        ${autorizadoPor ? `<span class="situacao-detalhe">por ${esc(autorizadoPor)}</span>` : ''}
                    </td>
                    <td>
                        <div class="acoes-portaria">
                            <button class="btn-liberar" onclick="liberarSaida(${pedido.pedidos_saida_id})">
                                <i class="fas fa-door-open"></i> Registrar Saída
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
        mensagemErro(tbody, 'Erro ao carregar saídas aprovadas.');
    }
}

async function liberarSaida(id) {
    const token = localStorage.getItem('token');
    if (!confirm('Confirmar o registro da saída deste aluno? A autorização já foi dada pela secretaria.')) return;

    try {
        const resp = await fetch(`${API_URL}/pedidos/liberar/${id}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (resp.ok) {
            alert('Saída registrada com sucesso!');
            carregarSaidas();
            carregarEmSaida();
            carregarHistoricoPortaria();
        } else {
            const erro = await resp.json();
            alert('Erro: ' + (erro.erro || 'Falha ao registrar a saída'));
        }
    } catch (err) {
        alert('Erro de conexão com o servidor');
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
            mensagemVazia(tbody, 'Nenhum aluno aguardando retorno no momento.');
        } else {
            dados.forEach(pedido => {
                const tr = document.createElement('tr');
                const atrasado = estaAtrasado(pedido);
                if (atrasado) tr.classList.add('linha-atrasada');

                tr.innerHTML = `
                    <td>${celulaAluno(pedido)}</td>
                    <td>${esc(pedido.turma || '-')}</td>
                    <td>${esc(pedido.responsavel || '-')}</td>
                    <td>${formatarHorario(pedido.hora_saida_real)}</td>
                    <td>${formatarHorario(pedido.hora_prevista_retorno)}</td>
                    <td>
                        ${atrasado
                            ? '<span class="status status-atrasado">Atrasado</span>'
                            : '<span class="status status-em_saida">Fora da escola</span>'}
                    </td>
                    <td>
                        <div class="acoes-portaria">
                            <button class="btn-retorno" onclick="registrarRetorno(${pedido.pedidos_saida_id})">
                                <i class="fas fa-undo"></i> Registrar Retorno
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        const elemQtdFora = document.getElementById('qtd-fora');
        if (elemQtdFora) elemQtdFora.textContent = dados.length;
    } catch (err) {
        console.error('Erro ao carregar alunos fora da escola:', err);
        mensagemErro(tbody, 'Erro ao carregar alunos fora da escola.');
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
// 3. HISTÓRICO (somente saídas concluídas)
// ==========================================
let historicoPortariaCache = [];

function dentroDoPeriodo(valor, periodo) {
    if (periodo === 'todos' || !valor) return true;
    const d = new Date(valor);
    const agora = new Date();
    if (periodo === 'semana') {
        const inicio = new Date(agora);
        inicio.setHours(0, 0, 0, 0);
        inicio.setDate(inicio.getDate() - 6);
        return d >= inicio;
    }
    if (periodo === 'mes') return d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth();
    if (periodo === 'ano') return d.getFullYear() === agora.getFullYear();
    return true;
}

function renderizarHistoricoPortaria() {
    const tbody = document.getElementById('tabelaHistoricoPortariaBody');
    if (!tbody) return;

    const periodo = document.getElementById('filtroPortaria')?.value || 'todos';
    const dados = historicoPortariaCache.filter(p =>
        dentroDoPeriodo(p.hora_retorno_real || p.hora_saida_real || p.data_criacao, periodo)
    );

    tbody.innerHTML = '';

    if (dados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">Nenhum histórico de saída registrado.</td></tr>';
        return;
    }

    dados.forEach(pedido => {
        const tr = document.createElement('tr');
        const horaSaida = pedido.hora_saida_real ? new Date(pedido.hora_saida_real).toLocaleString('pt-BR') : '-';
        const horaRetorno = pedido.hora_retorno_real ? new Date(pedido.hora_retorno_real).toLocaleString('pt-BR') : '-';

        let statusLabel;
        if (pedido._comAtraso) {
            statusLabel = '<span class="status status-atrasado">Voltou com atraso</span>';
        } else {
            statusLabel = '<span class="status status-aprovada">Concluído</span>';
        }


        tr.innerHTML = `
            <td>${celulaAluno(pedido)}</td>
            <td>${esc(pedido.turma || '-')}</td>
            <td>${horaSaida}</td>
            <td>${horaRetorno}</td>
            <td>${esc(pedido.responsavel || '-')}</td>
            <td>${statusLabel}</td>
            <td>${pedido._comAtraso ? 'Atrasado' : 'No horário'}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function carregarHistoricoPortaria() {
    const token = localStorage.getItem('token');
    const tbody = document.getElementById('tabelaHistoricoPortariaBody');
    if (!tbody) return;

    try {
        const respConcluidas = await fetch(`${API_URL}/pedidos/listarPorStatus?status=CONCLUIDA`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!respConcluidas.ok) throw new Error('Falha ao carregar histórico');

        // Mesma tolerância de 5 minutos usada no alerta de atraso
        const concluidas = (await respConcluidas.json()).map(p => ({
            ...p,
            _situacao: 'CONCLUIDA',
            _comAtraso: !!(p.hora_prevista_retorno && p.hora_retorno_real &&
                new Date(p.hora_retorno_real) - new Date(p.hora_prevista_retorno) > 5 * 60000)
        }));

        const momento = p => new Date(p.hora_retorno_real || p.hora_saida_real || p.data_criacao || 0).getTime();
        historicoPortariaCache = concluidas.sort((a, b) => momento(b) - momento(a));

        renderizarHistoricoPortaria();
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

    const usuarioLogado = JSON.parse(localStorage.getItem('usuario') || '{}');
    if ((usuarioLogado.tipo_usuario || '').toUpperCase() === 'ADMIN') {
        const linkTrocarPainel = document.getElementById('linkTrocarPainel');
        if (linkTrocarPainel) linkTrocarPainel.style.display = 'block';
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

    document.getElementById('filtroPortaria')?.addEventListener('change', renderizarHistoricoPortaria);

    carregarSaidas();
    carregarEmSaida();
    carregarHistoricoPortaria();

    // Atualização automática: pedidos que a secretaria aprova aparecem na portaria
    // sem precisar recarregar a página (e o contrário também).
    setInterval(() => {
        if (document.hidden) return;
        carregarSaidas();
        carregarEmSaida();
    }, 15000);
});
