const API_URL = '/api';

function mostrarTela(idTela) {
    const telas = ['tela-inicio', 'tela-saidas', 'tela-retorno', 'tela-historico', 'tela-equipe'];
    telas.forEach(t => {
        const el = document.getElementById(t);
        if (el) el.style.display = 'none';
    });

    const telaAtiva = document.getElementById(idTela);
    if (telaAtiva) telaAtiva.style.display = 'block';

    if (typeof fecharMenuNoCelular === 'function') fecharMenuNoCelular();
    if (window.PIEquipe) window.PIEquipe.aoMudarTela(idTela);

    if (idTela === 'tela-saidas') {
        carregarSaidas();
    } else if (idTela === 'tela-retorno') {
        carregarEmSaida();
    } else if (idTela === 'tela-historico') {
        carregarHistoricoPortaria();
    }
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
    const casa = pedido.tipo === 'CASA' ? '<span class="etiqueta-casa">Ir para casa</span>' : '';
    // Foto 3x4 em destaque: é por ela que o porteiro identifica o aluno, sem pedir documento.
    const motivo = pedido.tipo === 'CASA' && pedido.motivo ? `<span class="aluno-motivo"><strong>Motivo:</strong> ${esc(pedido.motivo)}</span>` : '';
    const foto = window.PIFoto ? PIFoto.html(pedido.aluno_id, { tamanho: 'g', nome: pedido.nome_aluno }) : '';
    return `<div class="celula-aluno">${foto}<div class="aluno-info"><span>${esc(pedido.nome_aluno || 'Aluno')}${etiqueta}${casa}</span>${motivo}</div></div>`;
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
            pedidosAprovados.clear();
            dados.forEach(pedido => {
                pedidosAprovados.set(Number(pedido.pedidos_saida_id), pedido);
                const tr = document.createElement('tr');
                const autorizadoPor = pedido.secretario || pedido.aprovador;
                tr.innerHTML = `
                    <td>${celulaAluno(pedido)}</td>
                    <td>${esc(pedido.turma || '-')}</td>
                    <td>${esc(pedido.responsavel || '-')}</td>
                    <td>${formatarHorario(pedido.hora_prevista_saida)}</td>
                    <td>${pedido.tipo === 'CASA' ? 'Não volta' : formatarHorario(pedido.hora_prevista_retorno)}</td>
                    <td>
                        <span class="status status-aprovada">Autorizado</span>
                        ${autorizadoPor ? `<span class="situacao-detalhe">por ${esc(autorizadoPor)}</span>` : ''}
                    </td>
                    <td>
                        <div class="acoes-portaria">
                            <button class="btn-liberar" onclick="liberarSaida(${pedido.pedidos_saida_id}, ${pedido.tipo === 'CASA'})">
                                <i class="fas ${pedido.tipo === 'CASA' ? 'fa-house' : 'fa-door-open'}"></i> ${pedido.tipo === 'CASA' ? 'Liberar para casa' : 'Registrar Saída'}
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

// ------------------------------------------------------------------
// Conferência do rosto antes de liberar: foto 3x4 grande + dados do pedido.
// O porteiro só registra a saída depois de confirmar que é o aluno certo.
// ------------------------------------------------------------------
const pedidosAprovados = new Map();

function confirmarIdentidade(pedido, paraCasa) {
    return new Promise(resolve => {
        const anterior = document.activeElement;
        const fundo = document.createElement('div');
        fundo.className = 'conferir-fundo';
        fundo.innerHTML = `
            <div class="conferir-caixa" role="dialog" aria-modal="true" aria-labelledby="conferirTitulo" aria-describedby="conferirAjuda">
                <h2 id="conferirTitulo">Confira o aluno antes de liberar</h2>
                <p id="conferirAjuda" class="conferir-ajuda">Compare o rosto com a foto cadastrada pela secretaria.</p>
                <div class="conferir-corpo">
                    <div class="conferir-foto">${window.PIFoto ? PIFoto.html(pedido.aluno_id, { tamanho: 'g', nome: pedido.nome_aluno }) : ''}
                        <p class="conferir-sem-foto" hidden><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> Aluno sem foto cadastrada: confira um documento com foto.</p></div>
                    <dl class="conferir-dados">
                        <dt>Aluno</dt><dd><strong>${esc(pedido.nome_aluno || 'Aluno')}</strong></dd>
                        <dt>Turma</dt><dd>${esc(pedido.turma || '-')}</dd>
                        <dt>Responsável</dt><dd>${esc(pedido.responsavel || '-')}</dd>
                        <dt>Saída prevista</dt><dd>${formatarHorario(pedido.hora_prevista_saida)}</dd>
                        <dt>Retorno</dt><dd>${paraCasa ? 'Não volta hoje (vai para casa)' : formatarHorario(pedido.hora_prevista_retorno)}</dd>
                        <dt>Autorizado por</dt><dd>${esc(pedido.secretario || pedido.aprovador || 'Secretaria')}</dd>
                    </dl>
                </div>
                <div class="conferir-botoes">
                    <button type="button" class="conferir-nao"><i class="fas fa-user-xmark" aria-hidden="true"></i> Não é este aluno</button>
                    <button type="button" class="conferir-sim"><i class="fas fa-user-check" aria-hidden="true"></i> É o aluno: ${paraCasa ? 'liberar para casa' : 'registrar saída'}</button>
                </div>
                <button type="button" class="conferir-fechar" aria-label="Fechar sem liberar">&times;</button>
            </div>`;
        document.body.appendChild(fundo);
        const quadroFoto = fundo.querySelector('[data-foto-aluno]');
        // A foto chega depois; se o aluno não tiver foto, mostra o aviso de conferir documento.
        const checarFoto = () => { if (!quadroFoto || quadroFoto.classList.contains('sem-foto')) fundo.querySelector('.conferir-sem-foto').hidden = false; };
        setTimeout(checarFoto, 1200);
        if (!quadroFoto) checarFoto();
        const fechar = valor => { fundo.remove(); document.removeEventListener('keydown', tecla); if (anterior && anterior.focus) anterior.focus(); resolve(valor); };
        const tecla = e => { if (e.key === 'Escape') fechar('fechou'); };
        document.addEventListener('keydown', tecla);
        fundo.addEventListener('click', e => {
            if (e.target === fundo || e.target.closest('.conferir-fechar')) fechar('fechou');
            else if (e.target.closest('.conferir-sim')) fechar('sim');
            else if (e.target.closest('.conferir-nao')) fechar('nao');
        });
        fundo.querySelector('.conferir-sim').focus();
    });
}

async function liberarSaida(id, paraCasa = false) {
    const token = localStorage.getItem('token');
    const pedido = pedidosAprovados.get(Number(id)) || { pedidos_saida_id: id };
    const resposta = await confirmarIdentidade(pedido, paraCasa);
    if (resposta === 'nao') {
        // Fica registrado na auditoria e a secretaria é avisada pelo chat interno.
        fetch(`${API_URL}/auditoria/identificacao`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ pedido_id: Number(id) })
        }).catch(() => {});
        alert('Saída NÃO registrada. A secretaria foi avisada para conferir a situação.');
        return;
    }
    if (resposta !== 'sim') return;

    try {
        const resp = await fetch(`${API_URL}/pedidos/liberar/${id}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (resp.ok) {
            alert(paraCasa ? 'Aluno liberado para ir para casa!' : 'Saída registrada com sucesso!');
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
        if (pedido.tipo === 'CASA') {
            statusLabel = '<span class="status status-casa">Foi para casa</span>';
        } else if (pedido._comAtraso) {
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
            <td>${pedido.tipo === 'CASA' ? 'Sem retorno previsto' : (pedido._comAtraso ? 'Atrasado' : 'No horário')}</td>
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

    // Links da sidebar das telas avulsas (ex.: professores-admin.html -> secretaria.html?tela=tela-painel)
    const telaPedida = new URLSearchParams(window.location.search).get('tela');
    if (telaPedida && document.getElementById(telaPedida)) mostrarTela(telaPedida);

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

    // Tempo real: o que a secretaria aprova aparece na portaria na hora, sem esperar os 15 s.
    if (window.PITempoReal) {
        let espera;
        const recarregar = () => { clearTimeout(espera); espera = setTimeout(() => { carregarSaidas(); carregarEmSaida(); }, 300); };
        PITempoReal.on('pedido', recarregar);
        PITempoReal.on('reconectado', recarregar);
    }
});
