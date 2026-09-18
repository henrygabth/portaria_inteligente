// Ajustado para incluir o prefixo /api que está definido no index.js
const API_URL = 'http://localhost:3000/api';
let pedidoSelecionado = null;

// ==========================================
// 1. GERENCIAMENTO DE TELAS E FORMULÁRIOS
// ==========================================
function mostrarTela(idTela) {
<<<<<<< HEAD
    const telas = ['tela-inicio', 'tela-painel', 'tela-solicitacoes', 'tela-vincular', 'tela-alunos', 'tela-historico'];
=======
    const telas = ['tela-inicio', 'tela-solicitacoes', 'tela-vincular', 'tela-alunos', 'tela-historico'];
>>>>>>> 4f592c031e07562a0df70c9cabbe1e2474f1b4e7
    telas.forEach(id => {
        const el = document.getElementById(id);
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

<<<<<<< HEAD
    if (idTela === 'tela-painel') {
        carregarPainelEstatisticas();
    } else if (idTela === 'tela-solicitacoes') {
=======
    if (idTela === 'tela-solicitacoes') {
>>>>>>> 4f592c031e07562a0df70c9cabbe1e2474f1b4e7
        carregarPendentes();
    } else if (idTela === 'tela-vincular') {
        carregarTurmasVinculo();
    } else if (idTela === 'tela-alunos') {
        carregarGerenciarAlunos();
    } else if (idTela === 'tela-historico') {
        carregarHistoricoSecretaria();
    }
}

async function salvarVinculo(event) {
    event.preventDefault();
    const token = localStorage.getItem('token');

    const corpo = {
        nome: document.getElementById('nomeResponsavelVinculo').value.trim(),
        cpf: document.getElementById('cpfResponsavelVinculo').value.trim(),
        telefone: document.getElementById('telefoneResponsavelVinculo').value.trim(),
        email: document.getElementById('emailNovoResponsavel').value.trim(),
        nome_aluno: document.getElementById('nomeAlunoVinculo').value.trim(),
        turma_id: document.getElementById('turmaVinculo').value,
        parentesco: document.getElementById('parentescoVinculo').value
    };

    try {
        const resp = await fetch(`${API_URL}/usuarios/vincular-responsavel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(corpo)
        });

        const data = await resp.json();

        if (resp.ok) {
            let msg = data.mensagem;
            if (data.senha_temporaria) {
                msg += `\n\nSenha temporária (o e-mail não pôde ser enviado): ${data.senha_temporaria}`;
            }
            alert(msg);
            document.getElementById('formVincular').reset();
        } else {
            alert('Erro: ' + (data.erro || 'Falha ao criar a conta do responsável'));
        }
    } catch (err) {
        alert('Erro de conexão com o servidor');
    }
}

async function carregarTurmasVinculo() {
    const token = localStorage.getItem('token');
    const select = document.getElementById('turmaVinculo');
    if (!select) return;

    try {
        const resp = await fetch(`${API_URL}/turmas`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!resp.ok) throw new Error('Falha ao buscar turmas');

        const turmas = await resp.json();
        select.innerHTML = '<option value="" disabled selected>Selecione a turma</option>';
        turmas.forEach(turma => {
            const option = document.createElement('option');
            option.value = turma.id_turma;
            option.textContent = `${turma.sala_turma} (${turma.turno})`;
            select.appendChild(option);
        });
    } catch (err) {
        console.error('Erro ao carregar turmas:', err);
        select.innerHTML = '<option value="" disabled selected>Erro ao carregar turmas</option>';
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
// 3. REQUISIÇÕES DA SECRETARIA (API)
// ==========================================

// Carregar solicitações pendentes
async function carregarPendentes() {
    const token = localStorage.getItem('token');
    const tbody = document.getElementById('lista-pendentes');
    if (!tbody) return;

    try {
        const resp = await fetch(`${API_URL}/pedidos/listarPorStatus?status=PENDENTE`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!resp.ok) throw new Error('Falha ao buscar solicitações');

        const dados = await resp.json();
        tbody.innerHTML = '';

        if (dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">Nenhuma solicitação pendente.</td></tr>';
        } else {
            dados.forEach(pedido => {
                const tr = document.createElement('tr');
                const dataHora = pedido.data_criacao 
                    ? new Date(pedido.data_criacao).toLocaleString('pt-BR') 
                    : '-';

                tr.innerHTML = `
                    <td>${dataHora}</td>
                    <td>${pedido.nome_aluno || 'Aluno'}</td>
                    <td>${pedido.turma || '-'}</td>
                    <td>${pedido.motivo || '-'}</td>
                    <td>${pedido.observacoes || '-'}</td>
                    <td>
                        <button class="btn-action btn-accept" onclick="decidir(${pedido.pedidos_saida_id}, 'aceitar')">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn-action btn-deny" onclick="abrirModalNegar(${pedido.pedidos_saida_id})">
                            <i class="fas fa-times"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        const elemCount = document.getElementById('count-pendentes');
        if (elemCount) elemCount.textContent = dados.length;
    } catch (err) {
        console.error('Erro ao carregar pendentes:', err);
        tbody.innerHTML = '<tr><td colspan="6" style="color:red;">Erro ao carregar pendentes.</td></tr>';
    }
}

// Aprovar ou rejeitar pedido
async function decidir(id, acao, observacao = null) {
    if (acao === 'aceitar' && !confirm("Deseja realmente APROVAR esta saída?")) return;

    const token = localStorage.getItem('token');
    let url = '';
    if (acao === 'aceitar') url = `${API_URL}/pedidos/aprovar/${id}`;
    if (acao === 'negar') url = `${API_URL}/pedidos/rejeitar/${id}`;

    try {
        const resp = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: observacao ? JSON.stringify({ observacao }) : null
        });

        if (resp.ok) {
            alert(`Pedido ${acao === 'aceitar' ? 'aprovado' : 'negado'} com sucesso!`);
            carregarPendentes();
            carregarHistoricoSecretaria();
        } else {
            const erro = await resp.json();
            alert('Erro: ' + (erro.erro || 'Falha na operação'));
        }
    } catch (err) {
        alert('Erro de conexão com o servidor');
    }
}

// Controles do Modal de Recusa
function abrirModalNegar(id) {
    pedidoSelecionado = id;
    const modal = document.getElementById('modalNegar');
    if (modal) modal.style.display = 'flex';
}

function fecharModal() {
    const modal = document.getElementById('modalNegar');
    if (modal) modal.style.display = 'none';
    const campoMotivo = document.getElementById('motivoNegativa');
    if (campoMotivo) campoMotivo.value = '';
}

function confirmarNegativa() {
    const campoMotivo = document.getElementById('motivoNegativa');
    const motivo = campoMotivo ? campoMotivo.value.trim() : '';
    if (!motivo) {
        alert('Informe o motivo da negativa.');
        return;
    }
    decidir(pedidoSelecionado, 'negar', motivo);
    fecharModal();
}

// Carregar histórico de aprovações da secretaria
async function carregarHistoricoSecretaria() {
    const token = localStorage.getItem('token');
    const tbody = document.getElementById('tabelaHistoricoSecretariaBody');
    if (!tbody) return;

    try {
        const resp = await fetch(`${API_URL}/pedidos/listarPorStatus?status=APROVADA`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!resp.ok) throw new Error('Falha ao carregar histórico');

        const dados = await resp.json();
        tbody.innerHTML = '';

        if (dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">Nenhum registro encontrado.</td></tr>';
            return;
        }

        dados.forEach(pedido => {
            const tr = document.createElement('tr');
            const dataHora = pedido.data_criacao 
                ? new Date(pedido.data_criacao).toLocaleString('pt-BR') 
                : '-';

            tr.innerHTML = `
                <td>${dataHora}</td>
                <td>${pedido.nome_aluno || 'Aluno'}</td>
                <td>${pedido.turma || '-'}</td>
                <td><span class="status status-aprovado">Aprovado</span></td>
                <td>${pedido.aprovador || '-'}</td>
            `;
            tbody.appendChild(tr);
        });

        const elemCountHoje = document.getElementById('count-hoje');
        if (elemCountHoje) elemCountHoje.textContent = dados.length;
    } catch (err) {
        console.error('Erro ao carregar histórico:', err);
        tbody.innerHTML = '<tr><td colspan="5" style="color:red;">Erro ao carregar histórico.</td></tr>';
    }
}

// ==========================================
// 3b. GERENCIAR ALUNOS (troca de turma / status)
// ==========================================
let turmasCache = [];
let alunosCache = [];

async function carregarGerenciarAlunos() {
    const token = localStorage.getItem('token');
    const tbody = document.getElementById('tabelaGerenciarAlunosBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5">Carregando alunos...</td></tr>';

    try {
        const [respAlunos, respTurmas] = await Promise.all([
            fetch(`${API_URL}/alunos/buscarTodos`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_URL}/turmas`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        if (!respAlunos.ok || !respTurmas.ok) throw new Error('Falha ao buscar alunos/turmas');

        alunosCache = await respAlunos.json();
        turmasCache = await respTurmas.json();

        const selectFiltroTurma = document.getElementById('filtroAlunoTurma');
        if (selectFiltroTurma && selectFiltroTurma.options.length <= 1) {
            turmasCache.forEach(t => {
                const option = document.createElement('option');
                option.value = t.id_turma;
                option.textContent = `${t.sala_turma} (${t.turno})`;
                selectFiltroTurma.appendChild(option);
            });
        }

        renderizarGerenciarAlunos(alunosCache);
    } catch (err) {
        console.error('Erro ao carregar gerenciamento de alunos:', err);
        tbody.innerHTML = '<tr><td colspan="5" style="color:red;">Erro ao carregar alunos.</td></tr>';
    }
}

function renderizarGerenciarAlunos(alunos) {
    const tbody = document.getElementById('tabelaGerenciarAlunosBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (alunos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">Nenhum aluno encontrado para os filtros selecionados.</td></tr>';
        return;
    }

    const opcoesTurma = turmasCache
        .map(t => `<option value="${t.id_turma}">${t.sala_turma} (${t.turno})</option>`)
        .join('');

    alunos.forEach(aluno => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${aluno.nome}</td>
            <td>${aluno.matricula || '-'}</td>
            <td>
                <select class="select-turma-aluno" data-id="${aluno.aluno_id}">
                    <option value="" disabled>Selecione</option>
                    ${opcoesTurma}
                </select>
            </td>
            <td>
                <select class="select-status-aluno" data-id="${aluno.aluno_id}">
                    <option value="ATIVO">ATIVO</option>
                    <option value="INATIVO">INATIVO</option>
                </select>
            </td>
            <td>
                <button type="button" class="btn-action btn-accept btn-salvar-aluno" data-id="${aluno.aluno_id}">
                    <i class="fas fa-save"></i>
                </button>
            </td>
        `;
        tr.querySelector('.select-turma-aluno').value = aluno.turma_id || '';
        tr.querySelector('.select-status-aluno').value = (aluno.status || 'ATIVO').toUpperCase();
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-salvar-aluno').forEach(btn => {
        btn.addEventListener('click', () => salvarAlteracaoAluno(btn.dataset.id));
    });
}

function aplicarFiltrosAlunos() {
    const busca = (document.getElementById('filtroAlunoBusca')?.value || '').trim().toLowerCase();
    const turmaId = document.getElementById('filtroAlunoTurma')?.value || '';
    const status = document.getElementById('filtroAlunoStatus')?.value || '';

    const filtrados = alunosCache.filter(aluno => {
        const bateBusca = !busca
            || (aluno.nome || '').toLowerCase().includes(busca)
            || (aluno.matricula || '').toLowerCase().includes(busca);
        const bateTurma = !turmaId || String(aluno.turma_id) === String(turmaId);
        const bateStatus = !status || (aluno.status || '').toUpperCase() === status;
        return bateBusca && bateTurma && bateStatus;
    });

    renderizarGerenciarAlunos(filtrados);
}

['filtroAlunoTurma', 'filtroAlunoStatus'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', aplicarFiltrosAlunos);
});
const filtroAlunoBuscaInput = document.getElementById('filtroAlunoBusca');
if (filtroAlunoBuscaInput) filtroAlunoBuscaInput.addEventListener('input', aplicarFiltrosAlunos);

async function salvarAlteracaoAluno(aluno_id) {
    const token = localStorage.getItem('token');
    const selectTurma = document.querySelector(`.select-turma-aluno[data-id="${aluno_id}"]`);
    const selectStatus = document.querySelector(`.select-status-aluno[data-id="${aluno_id}"]`);

    const corpo = {
        turma_id: selectTurma ? selectTurma.value : null,
        status: selectStatus ? selectStatus.value : null
    };

    try {
        const resp = await fetch(`${API_URL}/alunos/turma-status/${aluno_id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(corpo)
        });

        const data = await resp.json();

        if (resp.ok) {
            alert('Aluno atualizado com sucesso!');
        } else {
            alert('Erro: ' + (data.erro || 'Falha ao atualizar aluno'));
        }
    } catch (err) {
        alert('Erro de conexão com o servidor');
    }
}

// ==========================================
<<<<<<< HEAD
// 3b. PAINEL DE ESTATÍSTICAS (dashboard)
// ==========================================
let ultimoPainelCarregado = null;

async function carregarPainelEstatisticas() {
    const token = localStorage.getItem('token');
    const inputData = document.getElementById('dataPainel');

    if (inputData && !inputData.value) {
        inputData.value = new Date().toISOString().slice(0, 10);
    }
    const data = inputData ? inputData.value : new Date().toISOString().slice(0, 10);

    try {
        const resp = await fetch(`${API_URL}/pedidos/estatisticas?data=${data}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!resp.ok) throw new Error('Falha ao buscar estatísticas');

        const stats = await resp.json();
        ultimoPainelCarregado = stats;
        renderizarPainelEstatisticas(stats);
    } catch (err) {
        console.error('Erro ao carregar painel de estatísticas:', err);
    }
}

function renderizarPainelEstatisticas(stats) {
    const setTexto = (id, valor) => {
        const el = document.getElementById(id);
        if (el) el.textContent = valor;
    };

    setTexto('painel-pendentes', stats.pendentes ?? 0);
    setTexto('painel-saidas', stats.saidasHoje ?? 0);
    setTexto('painel-emsaida', stats.emSaida ?? 0);
    setTexto('painel-atrasados', stats.atrasados ?? 0);
    setTexto('painel-tempo-medio', stats.tempoMedioRetornoMin !== null && stats.tempoMedioRetornoMin !== undefined ? stats.tempoMedioRetornoMin : '-');

    const cardAtrasados = document.getElementById('card-painel-atrasados');
    if (cardAtrasados) {
        cardAtrasados.classList.toggle('tem-atraso', (stats.atrasados ?? 0) > 0);
    }

    // Ranking de turmas
    const containerTurmas = document.getElementById('painel-turmas-ranking');
    if (containerTurmas) {
        if (!stats.turmasRanking || stats.turmasRanking.length === 0) {
            containerTurmas.innerHTML = '<p style="color:#666;">Nenhum pedido registrado nesse dia.</p>';
        } else {
            containerTurmas.innerHTML = stats.turmasRanking.map(t => `
                <div class="ranking-turma-linha">
                    <span>${t.turma || 'Sem turma'}</span>
                    <strong>${t.total} pedido(s)</strong>
                </div>
            `).join('');
        }
    }

    // Gráfico simples de horários de pico (barras horizontais por hora do dia)
    const containerHorarios = document.getElementById('painel-horarios-pico');
    if (containerHorarios) {
        if (!stats.horariosPico || stats.horariosPico.length === 0) {
            containerHorarios.innerHTML = '<p style="color:#666;">Nenhum pedido registrado nesse dia.</p>';
        } else {
            const maiorTotal = Math.max(...stats.horariosPico.map(h => h.total));
            containerHorarios.innerHTML = stats.horariosPico.map(h => {
                const largura = Math.max(8, Math.round((h.total / maiorTotal) * 100));
                const horaLabel = String(h.hora).padStart(2, '0') + 'h';
                return `
                    <div class="barra-horario-linha">
                        <span class="barra-horario-label">${horaLabel}</span>
                        <div class="barra-horario-trilho">
                            <div class="barra-horario-preenchida" style="width: ${largura}%;">${h.total}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

document.getElementById('dataPainel')?.addEventListener('change', carregarPainelEstatisticas);

document.getElementById('btnGerarRelatorio')?.addEventListener('click', async () => {
    if (!ultimoPainelCarregado) {
        alert('Aguarde o painel carregar antes de gerar o relatório.');
        return;
    }

    const btnRelatorio = document.getElementById('btnGerarRelatorio');
    const textoOriginalBtn = btnRelatorio.innerHTML;
    btnRelatorio.disabled = true;
    btnRelatorio.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

    try {
        const stats = ultimoPainelCarregado;
        const token = localStorage.getItem('token');
        const usuarioSalvo = JSON.parse(localStorage.getItem('usuario') || '{}');
        const dataFormatada = new Date(stats.data + 'T00:00:00').toLocaleDateString('pt-BR');
        const geradoEm = new Date().toLocaleString('pt-BR');

        // Busca as listas nominais (não só os números) para o relatório ficar
        // realmente útil pra secretaria imprimir e agir em cima dele.
        const [respAtrasados, respPendentes] = await Promise.all([
            fetch(`${API_URL}/pedidos/atrasados`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_URL}/pedidos/listarPorStatus?status=PENDENTE`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);
        const atrasadosLista = respAtrasados.ok ? await respAtrasados.json() : [];
        const pendentesLista = respPendentes.ok ? await respPendentes.json() : [];

        const linhasTurmas = (stats.turmasRanking || [])
            .map(t => `<tr><td>${t.turma || 'Sem turma'}</td><td>${t.total}</td></tr>`)
            .join('') || '<tr><td colspan="2" class="vazio">Nenhum pedido registrado.</td></tr>';

        const linhasHorarios = (stats.horariosPico || [])
            .map(h => `<tr><td>${String(h.hora).padStart(2, '0')}h</td><td>${h.total}</td></tr>`)
            .join('') || '<tr><td colspan="2" class="vazio">Nenhum pedido registrado.</td></tr>';

        const linhasAtrasados = atrasadosLista
            .map(p => `<tr><td>${p.nome_aluno}</td><td>${p.turma || '-'}</td><td>${p.hora_prevista_retorno ? new Date(p.hora_prevista_retorno).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}</td><td>${p.responsavel || '-'}</td></tr>`)
            .join('') || '<tr><td colspan="4" class="vazio">Nenhum aluno atrasado no momento.</td></tr>';

        const linhasPendentes = pendentesLista
            .map(p => `<tr><td>${p.nome_aluno}</td><td>${p.turma || '-'}</td><td>${p.hora_prevista_saida ? new Date(p.hora_prevista_saida).toLocaleString('pt-BR') : '-'}</td><td>${p.responsavel || '-'}</td></tr>`)
            .join('') || '<tr><td colspan="4" class="vazio">Nenhum pedido pendente no momento.</td></tr>';

        const html = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Relatório de Saídas - ${dataFormatada}</title>
            <style>
                * { box-sizing: border-box; }
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 36px; color: #1a202c; line-height: 1.4; }
                .cabecalho { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0052cc; padding-bottom: 14px; margin-bottom: 6px; }
                .cabecalho h1 { font-size: 21px; margin: 0; color: #0052cc; }
                .cabecalho .selo { font-size: 11px; color: #fff; background: #0052cc; padding: 4px 10px; border-radius: 20px; font-weight: 700; letter-spacing: .5px; }
                .meta { display: flex; justify-content: space-between; color: #718096; font-size: 12px; margin-bottom: 28px; }
                .grid { display: flex; gap: 14px; margin-bottom: 32px; flex-wrap: wrap; }
                .stat { flex: 1; min-width: 130px; border: 1px solid #e2e8f0; border-left: 4px solid #0052cc; border-radius: 8px; padding: 14px; text-align: center; }
                .stat.alerta { border-left-color: #E52207; }
                .stat h2 { font-size: 25px; margin: 0 0 4px 0; }
                .stat.alerta h2 { color: #E52207; }
                .stat p { margin: 0; font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: .3px; }
                section.bloco { margin-bottom: 30px; page-break-inside: avoid; }
                h3 { font-size: 14px; margin: 0 0 10px 0; color: #0052cc; border-left: 4px solid #0052cc; padding-left: 8px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #edf2f7; font-size: 12.5px; }
                th { background: #f4f6f8; font-size: 11px; text-transform: uppercase; color: #4a5568; }
                td.vazio { color: #a0aec0; font-style: italic; }
                .rodape { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 10.5px; color: #a0aec0; display: flex; justify-content: space-between; }
                @media print {
                    body { padding: 14px; }
                    .stat:hover { transform: none; }
                }
            </style>
        </head>
        <body>
            <div class="cabecalho">
                <h1>Portaria Inteligente — Relatório de Saídas Antecipadas</h1>
                <span class="selo">Data de referência: ${dataFormatada}</span>
            </div>
            <div class="meta">
                <span>Gerado por: ${usuarioSalvo.nome || 'Secretaria'}</span>
                <span>Gerado em: ${geradoEm}</span>
            </div>

            <div class="grid">
                <div class="stat"><h2>${stats.pendentes ?? 0}</h2><p>Pendentes agora</p></div>
                <div class="stat"><h2>${stats.saidasHoje ?? 0}</h2><p>Saídas no dia</p></div>
                <div class="stat"><h2>${stats.emSaida ?? 0}</h2><p>Ainda não voltaram</p></div>
                <div class="stat alerta"><h2>${stats.atrasados ?? 0}</h2><p>Atrasados agora</p></div>
                <div class="stat"><h2>${stats.tempoMedioRetornoMin ?? '-'}</h2><p>Tempo médio de retorno (min)</p></div>
            </div>

            <section class="bloco">
                <h3>Alunos atrasados no momento</h3>
                <table>
                    <thead><tr><th>Aluno</th><th>Turma</th><th>Retorno previsto</th><th>Responsável</th></tr></thead>
                    <tbody>${linhasAtrasados}</tbody>
                </table>
            </section>

            <section class="bloco">
                <h3>Pedidos pendentes de aprovação</h3>
                <table>
                    <thead><tr><th>Aluno</th><th>Turma</th><th>Saída prevista</th><th>Responsável</th></tr></thead>
                    <tbody>${linhasPendentes}</tbody>
                </table>
            </section>

            <section class="bloco">
                <h3>Turmas que mais pediram saída</h3>
                <table>
                    <thead><tr><th>Turma</th><th>Pedidos</th></tr></thead>
                    <tbody>${linhasTurmas}</tbody>
                </table>
            </section>

            <section class="bloco">
                <h3>Horários de pico</h3>
                <table>
                    <thead><tr><th>Hora</th><th>Pedidos</th></tr></thead>
                    <tbody>${linhasHorarios}</tbody>
                </table>
            </section>

            <div class="rodape">
                <span>Sistema Portaria Inteligente</span>
                <span>Documento gerado automaticamente — sem necessidade de assinatura</span>
            </div>

            <script>window.onload = () => window.print();<\/script>
        </body>
        </html>
        `;

        const janela = window.open('', '_blank');
        if (!janela) {
            alert('Não foi possível abrir o relatório. Verifique se o navegador está bloqueando pop-ups.');
            return;
        }
        janela.document.write(html);
        janela.document.close();
    } catch (err) {
        console.error('Erro ao gerar relatório:', err);
        alert('Erro ao gerar relatório.');
    } finally {
        btnRelatorio.disabled = false;
        btnRelatorio.innerHTML = textoOriginalBtn;
    }
});

// ==========================================
=======
>>>>>>> 4f592c031e07562a0df70c9cabbe1e2474f1b4e7
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

    carregarPendentes();
    carregarHistoricoSecretaria();
});