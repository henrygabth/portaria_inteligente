// relatorio.js — tela "Relatórios" da secretaria (secretaria.html#tela-painel).
// Fonte única: GET /api/relatorios?inicio&fim&turma. Gráficos em SVG/HTML feitos aqui mesmo
// (sem biblioteca externa), com dica ao passar o mouse, versão para imprimir/PDF e planilha CSV.
(function () {
    const $ = id => document.getElementById(id);
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pad = n => String(n).padStart(2, '0');
    const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const num = n => Number(n || 0).toLocaleString('pt-BR');
    const dataBR = s => { const [a, m, d] = String(s).split('-'); return `${d}/${m}/${a}`; };
    const diaCurto = s => { const [, m, d] = String(s).split('-'); return `${d}/${m}`; };
    const hora = v => v ? new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '–';
    const dataHora = v => v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
    function duracao(min) {
        if (min === null || min === undefined) return '–';
        if (min < 60) return `${min} min`;
        const h = Math.floor(min / 60), m = min % 60;
        return m ? `${h} h ${m} min` : `${h} h`;
    }
    const STATUS = {
        PENDENTE: ['Pendente', 'pendente'], APROVADA: ['Aprovada', 'aprovada'], RECUSADA: ['Recusada', 'recusada'],
        EM_SAIDA: ['Fora da escola', 'fora'], CONCLUIDA: ['Retornou', 'concluida'], CANCELADA: ['Cancelada', 'cancelada']
    };
    function situacaoTexto(p) {
        switch (p.situacao) {
            case 'no_prazo': return ['<i class="fas fa-circle-check"></i> No prazo', 'bom'];
            case 'atrasado': return [`<i class="fas fa-triangle-exclamation"></i> Voltou ${duracao(p.atraso_min)} atrasado`, 'critico'];
            case 'fora_atrasado': return [`<i class="fas fa-triangle-exclamation"></i> Atrasado ${duracao(p.atraso_min)} (ainda fora)`, 'critico'];
            case 'fora': return ['<i class="fas fa-person-walking-arrow-right"></i> Fora, no prazo', 'neutro'];
            case 'sem_retorno': return [p.tipo === 'CASA' ? '<i class="fas fa-house"></i> Foi para casa' : 'Sem horário de volta', 'neutro'];
            default: return ['<span class="rel-mudo">Não saiu</span>', ''];
        }
    }

    let estado = { inicio: null, fim: null, turma: '', preset: 'hoje' };
    let dados = null, ligado = false, carregando = 0, turmasCarregadas = false;

    // ------------------------------------------------------------ período
    function aplicarPreset(p) {
        const hoje = new Date();
        let ini = new Date(hoje), fim = new Date(hoje);
        if (p === 'ontem') { ini.setDate(ini.getDate() - 1); fim = new Date(ini); }
        else if (p === '7') ini.setDate(ini.getDate() - 6);
        else if (p === '30') ini.setDate(ini.getDate() - 29);
        else if (p === 'mes') ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        estado.inicio = iso(ini); estado.fim = iso(fim); estado.preset = p;
        $('relInicio').value = estado.inicio; $('relFim').value = estado.fim;
        marcarPreset();
    }
    function marcarPreset() {
        document.querySelectorAll('#relPresets button').forEach(b => b.classList.toggle('ativo', b.dataset.preset === estado.preset));
    }

    async function carregarTurmas() {
        if (turmasCarregadas) return;
        try {
            const r = await fetch('/api/turmas', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
            if (!r.ok) return;
            const turmas = await r.json();
            const sel = $('relTurma');
            turmas.forEach(t => { const o = document.createElement('option'); o.value = t.id_turma; o.textContent = `${t.sala_turma}${t.turno ? ' · ' + t.turno : ''}`; sel.appendChild(o); });
            turmasCarregadas = true;
        } catch (_) { /* filtro de turma é opcional */ }
    }

    function ligar() {
        if (ligado) return;
        ligado = true;
        document.querySelectorAll('#relPresets button').forEach(b => b.addEventListener('click', () => { aplicarPreset(b.dataset.preset); carregar(); }));
        ['relInicio', 'relFim'].forEach(id => $(id).addEventListener('change', () => {
            let ini = $('relInicio').value, fim = $('relFim').value;
            if (!ini || !fim) return;
            if (ini > fim) { [ini, fim] = [fim, ini]; $('relInicio').value = ini; $('relFim').value = fim; }
            estado.inicio = ini; estado.fim = fim; estado.preset = null; marcarPreset(); carregar();
        }));
        $('relTurma').addEventListener('change', () => { estado.turma = $('relTurma').value; carregar(); });
        $('relCsv').addEventListener('click', baixarCsv);
        $('relImprimir').addEventListener('click', imprimir);
        document.querySelector('#tela-painel [data-ir]')?.addEventListener('click', e => {
            if (typeof window.mostrarTela === 'function') window.mostrarTela(e.currentTarget.dataset.ir);
        });
        let espera;
        window.addEventListener('resize', () => { clearTimeout(espera); espera = setTimeout(() => { if (dados && visivel()) desenharGraficos(); }, 150); });
        if (window.PITempoReal) {
            // Mudou algum pedido: atualiza a "Situação agora" (e o relatório, se inclui hoje).
            let atraso;
            const recarregar = () => { clearTimeout(atraso); atraso = setTimeout(() => { if (visivel()) carregar(true); }, 1500); };
            ['pedido', 'reconectado'].forEach(ev => PITempoReal.on(ev, recarregar));
        }
    }
    const visivel = () => { const t = $('tela-painel'); return t && t.style.display !== 'none'; };

    // ------------------------------------------------------------ dados
    async function carregar(silencioso = false) {
        const minha = ++carregando;
        if (!silencioso) $('relConteudo').innerHTML = '<div class="card rel-carregando"><i class="fas fa-spinner fa-spin"></i> Montando o relatório...</div>';
        const q = new URLSearchParams({ inicio: estado.inicio, fim: estado.fim });
        if (estado.turma) q.set('turma', estado.turma);
        try {
            const r = await fetch(`/api/relatorios?${q}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
            const corpo = await r.json().catch(() => ({}));
            if (minha !== carregando) return;
            if (!r.ok) throw new Error(corpo.erro || 'Não foi possível gerar o relatório.');
            dados = corpo;
            desenharAgora(corpo.agora);
            desenhar();
        } catch (err) {
            if (minha !== carregando) return;
            $('relConteudo').innerHTML = `<div class="card rel-erro"><i class="fas fa-circle-exclamation"></i> ${esc(err.message)} <button type="button" class="rel-btn" id="relTentar">Tentar de novo</button></div>`;
            $('relTentar').addEventListener('click', () => carregar());
            $('relCsv').disabled = $('relImprimir').disabled = true;
        }
    }

    function desenharAgora(a) {
        if (!a) return;
        $('agPendentes').textContent = num(a.pendentes);
        $('agAprovadas').textContent = num(a.aguardandoSaida);
        $('agFora').textContent = num(a.foraDaEscola);
        $('agAtrasados').textContent = num(a.atrasados);
        $('agAtrasadosCaixa').classList.toggle('ativo', a.atrasados > 0);
        $('relAtualizado').textContent = `atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }

    function textoPeriodo() {
        const { inicio, fim } = dados.periodo;
        const turma = estado.turma ? ` · Turma ${$('relTurma').selectedOptions[0]?.textContent || ''}` : ' · Todas as turmas';
        return (inicio === fim ? `Dia ${dataBR(inicio)}` : `De ${dataBR(inicio)} a ${dataBR(fim)} (${dados.periodo.dias} dias)`) + turma;
    }

    // ------------------------------------------------------------ montagem da tela
    function kpi(icone, valor, rotulo, detalhe = '', classe = '') {
        return `<div class="rel-kpi ${classe}"><i class="fas ${icone}"></i><div><strong>${valor}</strong><span>${rotulo}</span>${detalhe ? `<small>${detalhe}</small>` : ''}</div></div>`;
    }

    function desenhar() {
        const d = dados, r = d.resumo;
        $('relSubtitulo').textContent = textoPeriodo();
        $('relCsv').disabled = $('relImprimir').disabled = !d.detalhes.length;
        if (!r.pedidos) {
            $('relConteudo').innerHTML = `<div class="card rel-vazio"><i class="fas fa-chart-simple"></i><h3>Nenhuma saída neste período</h3>
                <p>Não há pedidos de saída com data entre ${dataBR(d.periodo.inicio)} e ${dataBR(d.periodo.fim)}${estado.turma ? ' para esta turma' : ''}. Tente um período maior.</p></div>`;
            return;
        }
        const retornosAvaliados = r.retornosNoPrazo + r.retornosAtrasados;
        $('relConteudo').innerHTML = `
            <div class="rel-print-cabecalho"><img src="./img/logo_pi.png" alt="" onerror="this.remove()"><div><strong>Portaria Inteligente — Relatório de saídas</strong><span>${esc(textoPeriodo())} · gerado em ${new Date().toLocaleString('pt-BR')}</span></div></div>
            <div class="rel-kpis">
                ${kpi('fa-file-lines', num(r.pedidos), 'pedidos de saída', `${num(d.status.RECUSADA)} recusados · ${num(d.status.CANCELADA)} cancelados`)}
                ${kpi('fa-door-open', num(r.saidas), 'saídas realizadas', `${num(r.paraCasa)} para casa${d.periodo.dias > 1 ? ` · ${String(r.mediaSaidasPorDia).replace('.', ',')} por dia` : ''}`)}
                ${kpi('fa-clock-rotate-left', r.pontualidade === null ? '–' : `${String(r.pontualidade).replace('.', ',')}%`, 'voltaram no horário',
                    retornosAvaliados ? `${num(r.retornosNoPrazo)} de ${num(retornosAvaliados)} retornos` : 'nenhum retorno com horário', r.pontualidade !== null && r.pontualidade < 80 ? 'alerta' : '')}
                ${kpi('fa-triangle-exclamation', num(r.retornosAtrasados + r.aindaForaAtrasados), 'atrasos', r.atrasoMedioMin !== null ? `atraso médio de ${duracao(r.atrasoMedioMin)}` : 'nenhum atraso', (r.retornosAtrasados + r.aindaForaAtrasados) ? 'alerta' : '')}
                ${kpi('fa-stopwatch', duracao(r.tempoMedioForaMin), 'tempo médio fora', r.tempoMedianoForaMin !== null ? `metade volta em até ${duracao(r.tempoMedianoForaMin)}` : '')}
                ${kpi('fa-reply', duracao(r.tempoMedioRespostaMin), 'para a secretaria responder', r.taxaAprovacao !== null ? `${String(r.taxaAprovacao).replace('.', ',')}% aprovados` : '')}
            </div>

            <div class="rel-grade">
                ${d.periodo.dias > 1 ? `<div class="card rel-grafico rel-largo"><div class="rel-card-topo"><h2>Saídas por dia</h2>
                    <div class="rel-legenda"><span><i class="s1"></i>Sem atraso</span><span><i class="s2"></i>Com atraso</span></div></div>
                    <div class="rel-svg" id="grafDias"></div></div>` : ''}
                <div class="card rel-grafico"><div class="rel-card-topo"><h2>Horário das saídas</h2><small>quando os alunos passaram pela portaria</small></div>
                    <div class="rel-svg" id="grafHoras"></div></div>
                <div class="card rel-grafico"><div class="rel-card-topo"><h2>Retornos</h2><small>tolerância de ${d.toleranciaMin} min</small></div>
                    ${blocoRetornos(r)}</div>
                <div class="card rel-grafico"><div class="rel-card-topo"><h2>Saídas por turma</h2></div>${barrasH(d.porTurma.slice(0, 8).map(t => ({
                    rotulo: t.turma, valor: t.saidas, extra: t.atrasos ? `<em class="rel-tag-critico">${t.atrasos} ${t.atrasos === 1 ? 'atraso' : 'atrasos'}</em>` : '' })), 'saídas')}</div>
                <div class="card rel-grafico"><div class="rel-card-topo"><h2>Motivos mais comuns</h2></div>${barrasH(d.porMotivo.map(m => ({ rotulo: m.motivo, valor: m.total })), 'pedidos')}</div>
                <div class="card rel-grafico rel-largo"><div class="rel-card-topo"><h2>Alunos com mais saídas</h2><small>ajuda a perceber quem sai com frequência ou costuma atrasar</small></div>
                    ${tabelaAlunos(d.alunosFrequentes)}</div>
            </div>

            <div class="card rel-detalhes">
                <div class="rel-card-topo"><h2>Todos os pedidos do período <span class="rel-contagem" id="relContagem"></span></h2>
                    <div class="rel-det-filtros">
                        <input type="search" id="relBusca" placeholder="Buscar aluno, turma ou motivo" aria-label="Buscar nos pedidos">
                        <select id="relFiltroSit" aria-label="Filtrar pedidos">
                            <option value="">Todos</option><option value="saiu">Só quem saiu</option><option value="atraso">Só atrasos</option>
                            <option value="PENDENTE">Pendentes</option><option value="RECUSADA">Recusados</option><option value="CANCELADA">Cancelados</option>
                        </select>
                    </div></div>
                <div class="rel-tabela-caixa"><table class="rel-tabela" id="relTabela">
                    <thead><tr><th>Dia</th><th>Aluno</th><th>Turma</th><th>Motivo</th><th>Pedido</th><th>Saída</th><th>Retorno</th><th>Situação</th></tr></thead>
                    <tbody></tbody></table></div>
                <button type="button" class="rel-btn rel-mais" id="relMais" hidden>Mostrar mais</button>
                ${d.truncado ? '<p class="rel-aviso">Período muito grande: mostrando só os primeiros pedidos. Escolha um intervalo menor.</p>' : ''}
            </div>`;
        desenharGraficos();
        ligarTabela();
    }

    // ------------------------------------------------------------ peças em HTML
    function barrasH(itens, unidade) {
        if (!itens.length || !itens.some(i => i.valor)) return '<p class="rel-sem-dados">Sem dados no período.</p>';
        const max = Math.max(...itens.map(i => i.valor), 1);
        return `<ul class="rel-barras">${itens.map(i => `
            <li title="${esc(i.rotulo)}: ${num(i.valor)} ${unidade}">
                <span class="rel-barras-rotulo">${esc(i.rotulo)}</span>
                <span class="rel-barras-trilho"><span style="width:${Math.max(i.valor ? 2 : 0, i.valor / max * 100)}%"></span></span>
                <span class="rel-barras-valor">${num(i.valor)}${i.extra || ''}</span>
            </li>`).join('')}</ul>`;
    }

    function blocoRetornos(r) {
        const partes = [
            ['bom', r.retornosNoPrazo, 'Voltaram no prazo', 'fa-circle-check'],
            ['critico', r.retornosAtrasados, 'Voltaram atrasados', 'fa-triangle-exclamation'],
            ['serio', r.aindaForaAtrasados, 'Ainda fora e atrasados', 'fa-person-walking-arrow-right']
        ];
        const total = partes.reduce((s, p) => s + p[1], 0);
        if (!total) return '<p class="rel-sem-dados">Nenhum retorno com horário marcado neste período.</p>';
        return `<div class="rel-proporcao" role="img" aria-label="${partes.map(p => `${p[2]}: ${p[1]}`).join(', ')}">
                ${partes.filter(p => p[1]).map(p => `<span class="${p[0]}" style="flex:${p[1]}" title="${p[2]}: ${p[1]}"></span>`).join('')}
            </div>
            <ul class="rel-proporcao-lista">${partes.map(p => `<li><i class="fas ${p[3]} ${p[0]}"></i><span>${p[2]}</span><strong>${num(p[1])}</strong><small>${Math.round(p[1] / total * 100)}%</small></li>`).join('')}</ul>`;
    }

    function tabelaAlunos(lista) {
        if (!lista.length) return '<p class="rel-sem-dados">Nenhum aluno saiu neste período.</p>';
        return `<div class="rel-tabela-caixa"><table class="rel-tabela rel-tabela-compacta"><thead><tr><th>Aluno</th><th>Turma</th><th class="n">Saídas</th><th class="n">Atrasos</th></tr></thead><tbody>
            ${lista.map(a => `<tr><td>${esc(a.aluno)}</td><td>${esc(a.turma)}</td><td class="n">${num(a.saidas)}</td>
                <td class="n">${a.atrasos ? `<em class="rel-tag-critico">${a.atrasos}</em>` : '<span class="rel-mudo">0</span>'}</td></tr>`).join('')}
        </tbody></table></div>`;
    }

    // ------------------------------------------------------------ gráficos SVG (colunas)
    const dica = (() => {
        let el = null;
        return {
            mostrar(html, x, y) {
                if (!el) { el = document.createElement('div'); el.className = 'rel-dica'; el.setAttribute('role', 'tooltip'); document.body.appendChild(el); }
                el.innerHTML = html; el.hidden = false;
                const w = el.offsetWidth, h = el.offsetHeight;
                el.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, x - w / 2)) + 'px';
                el.style.top = Math.max(8, y - h - 12) + 'px';
            },
            esconder() { if (el) el.hidden = true; }
        };
    })();

    function escalaBonita(max) {
        if (max <= 4) return { topo: max <= 2 ? 2 : 4, passo: 1 };
        const bruto = max / 4, mag = Math.pow(10, Math.floor(Math.log10(bruto)));
        const passo = [1, 2, 5, 10].map(m => m * mag).find(p => p >= bruto);
        return { topo: Math.ceil(max / passo) * passo, passo };
    }

    // series: [{ nome, classe, valores[] }] empilhadas de baixo para cima.
    function colunas(alvo, categorias, series, rotuloCategoria) {
        if (!alvo) return;
        const L = Math.max(280, alvo.clientWidth || 600), A = 220;
        const m = { t: 12, r: 8, b: 26, l: 34 };
        const totais = categorias.map((_, i) => series.reduce((s, se) => s + (se.valores[i] || 0), 0));
        const { topo, passo } = escalaBonita(Math.max(...totais, 0));
        const lp = L - m.l - m.r, ap = A - m.t - m.b;
        const banda = lp / categorias.length;
        const larg = Math.max(2, Math.min(40, banda * 0.68));
        const y = v => m.t + ap - v / topo * ap;
        const passoRotulo = Math.ceil(categorias.length / Math.floor(lp / 44));

        let svg = `<svg viewBox="0 0 ${L} ${A}" width="100%" height="${A}" role="img" aria-label="${esc(rotuloCategoria)}">`;
        for (let v = 0; v <= topo; v += passo) {
            svg += `<line class="rel-grade-linha${v === 0 ? ' base' : ''}" x1="${m.l}" x2="${L - m.r}" y1="${y(v)}" y2="${y(v)}"></line>
                    <text class="rel-eixo" x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${num(v)}</text>`;
        }
        categorias.forEach((c, i) => {
            const x = m.l + banda * i + (banda - larg) / 2;
            let base = 0;
            const ativas = series.map((s, k) => ({ s, k, v: s.valores[i] || 0 })).filter(o => o.v > 0);
            ativas.forEach((o, n) => {
                const y0 = y(base), y1 = y(base + o.v);
                const ultimo = n === ativas.length - 1;
                const altura = Math.max(1, y0 - y1 - (ultimo ? 0 : 2)); // 2px de respiro entre segmentos
                const topoY = y0 - altura, r = ultimo ? Math.min(4, larg / 2, altura) : 0;
                svg += `<path class="rel-marca ${o.s.classe}" d="M${x},${y0} V${topoY + r} Q${x},${topoY} ${x + r},${topoY} H${x + larg - r} Q${x + larg},${topoY} ${x + larg},${topoY + r} V${y0} Z"></path>`;
                base += o.v;
            });
            if (i % passoRotulo === 0) svg += `<text class="rel-eixo" x="${m.l + banda * i + banda / 2}" y="${A - 8}" text-anchor="middle">${esc(c)}</text>`;
            svg += `<rect class="rel-alvo" x="${m.l + banda * i}" y="${m.t}" width="${banda}" height="${ap}" data-i="${i}"></rect>`;
        });
        svg += '</svg>';
        alvo.innerHTML = svg;
        alvo.querySelectorAll('.rel-alvo').forEach(rect => {
            const i = Number(rect.dataset.i);
            const mostrar = () => {
                const b = rect.getBoundingClientRect();
                dica.mostrar(`<strong>${esc(rotuloCategoria === 'dia' ? dataBR(dados.porDia[i].dia) : categorias[i])}</strong>`
                    + series.map(s => `<span><i class="${s.classe}"></i>${esc(s.nome)}: <b>${num(s.valores[i] || 0)}</b></span>`).join(''),
                    b.left + b.width / 2, b.top + (y(totais[i]) - m.t) * (b.height / ap));
                rect.classList.add('foco');
            };
            rect.addEventListener('mouseenter', mostrar);
            rect.addEventListener('mouseleave', () => { dica.esconder(); rect.classList.remove('foco'); });
        });
    }

    function desenharGraficos() {
        const d = dados;
        if (d.periodo.dias > 1) {
            colunas($('grafDias'), d.porDia.map(x => diaCurto(x.dia)), [
                { nome: 'Sem atraso', classe: 's1', valores: d.porDia.map(x => Math.max(0, x.saidas - x.atrasos)) },
                { nome: 'Com atraso', classe: 's2', valores: d.porDia.map(x => x.atrasos) }
            ], 'dia');
        }
        const horas = d.porHora.length ? d.porHora : [];
        const alvoHoras = $('grafHoras');
        if (!horas.length) { alvoHoras.innerHTML = '<p class="rel-sem-dados">Nenhum aluno saiu neste período.</p>'; return; }
        const ini = Math.min(...horas.map(h => h.hora)), fim = Math.max(...horas.map(h => h.hora));
        const cats = [], vals = [];
        for (let h = Math.max(0, ini - 1); h <= Math.min(23, fim + 1); h++) { cats.push(`${pad(h)}h`); vals.push(horas.find(x => x.hora === h)?.total || 0); }
        colunas(alvoHoras, cats, [{ nome: 'Saídas', classe: 's1', valores: vals }], 'hora');
    }

    // ------------------------------------------------------------ tabela detalhada
    let visiveis = 50;
    function filtrados() {
        const termo = ($('relBusca')?.value || '').trim().toLowerCase();
        const f = $('relFiltroSit')?.value || '';
        return dados.detalhes.filter(p => {
            if (termo && !`${p.aluno} ${p.turma} ${p.motivo}`.toLowerCase().includes(termo)) return false;
            if (f === 'saiu') return !!p.saida_real;
            if (f === 'atraso') return p.situacao === 'atrasado' || p.situacao === 'fora_atrasado';
            if (f) return p.status === f;
            return true;
        });
    }
    function linha(p) {
        const [st, cl] = STATUS[p.status] || [p.status, ''];
        const [sit, sitCl] = situacaoTexto(p);
        const dia = new Date(p.saida_prevista);
        return `<tr>
            <td>${pad(dia.getDate())}/${pad(dia.getMonth() + 1)}</td>
            <td><strong>${esc(p.aluno)}</strong></td>
            <td>${esc(p.turma)}</td>
            <td>${esc(p.motivo)}${p.tipo === 'CASA' ? ' <em class="rel-tag">casa</em>' : ''}</td>
            <td><span class="rel-status ${cl}">${st}</span></td>
            <td>${p.saida_real ? `<b>${hora(p.saida_real)}</b><small>previsto ${hora(p.saida_prevista)}</small>` : `<span class="rel-mudo">previsto ${hora(p.saida_prevista)}</span>`}</td>
            <td>${p.retorno_real ? `<b>${hora(p.retorno_real)}</b>` : ''}${p.retorno_previsto ? `<small>previsto ${hora(p.retorno_previsto)}</small>` : (p.retorno_real ? '' : '<span class="rel-mudo">–</span>')}</td>
            <td class="rel-sit ${sitCl}">${sit}</td></tr>`;
    }
    function desenharTabela() {
        const lista = filtrados();
        const corpo = $('relTabela').querySelector('tbody');
        corpo.innerHTML = lista.length
            ? lista.map((p, i) => linha(p).replace('<tr>', i >= visiveis ? '<tr class="rel-so-impressao">' : '<tr>')).join('')
            : '<tr><td colspan="8" class="rel-sem-dados">Nenhum pedido com esse filtro.</td></tr>';
        $('relContagem').textContent = `${num(lista.length)} ${lista.length === 1 ? 'pedido' : 'pedidos'}`;
        const mais = $('relMais');
        mais.hidden = lista.length <= visiveis;
        mais.textContent = `Mostrar mais (${num(lista.length - visiveis)} restantes)`;
    }
    function ligarTabela() {
        visiveis = 50;
        let espera;
        $('relBusca').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { visiveis = 50; desenharTabela(); }, 200); });
        $('relFiltroSit').addEventListener('change', () => { visiveis = 50; desenharTabela(); });
        $('relMais').addEventListener('click', () => { visiveis += 100; desenharTabela(); });
        desenharTabela();
    }

    // ------------------------------------------------------------ exportar
    function baixarCsv() {
        if (!dados) return;
        const cel = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
        const sitTexto = p => situacaoTexto(p)[0].replace(/<[^>]+>/g, '').trim();
        const cab = ['Pedido', 'Aluno', 'Turma', 'Tipo', 'Motivo', 'Situação do pedido', 'Saída prevista', 'Saída real', 'Retorno previsto', 'Retorno real', 'Retorno', 'Atraso (min)'];
        const linhas = filtrados().map(p => [p.id, p.aluno, p.turma, p.tipo === 'CASA' ? 'Para casa' : 'Volta à escola', p.motivo, (STATUS[p.status] || [p.status])[0],
            dataHora(p.saida_prevista), dataHora(p.saida_real), dataHora(p.retorno_previsto), dataHora(p.retorno_real), sitTexto(p), p.atraso_min ?? ''].map(cel).join(';'));
        // BOM + ponto e vírgula: abre certo no Excel em português.
        const blob = new Blob(['﻿' + [cab.join(';'), ...linhas].join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `relatorio-saidas_${dados.periodo.inicio}_a_${dados.periodo.fim}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    function imprimir() {
        document.body.classList.add('rel-imprimindo');
        // Gráficos no tamanho da folha A4 antes de abrir a impressão.
        desenharGraficos();
        setTimeout(() => {
            window.print();
            document.body.classList.remove('rel-imprimindo');
            desenharGraficos();
        }, 60);
    }

    window.PIRelatorio = {
        abrir() {
            ligar();
            carregarTurmas();
            if (!estado.inicio) aplicarPreset('hoje');
            carregar();
        },
        // Para testes: a lógica de escala dos gráficos.
        _escalaBonita: escalaBonita
    };
})();
