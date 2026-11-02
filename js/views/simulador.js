/* 5. Simulador financeiro — cenários de orçamento que não alteram os dados até serem efetivados. */
(function (App) {
  'use strict';
  const U = App.U, F = App.F, ui = App.ui, Ch = App.charts;
  const TIPOS = {
    renda: { t: 'Nova renda', d: 'Valor que entra todo mês' },
    salario: { t: 'Alteração no salário', d: 'Diferença por mês (use valor negativo para redução)' },
    despesa: { t: 'Despesa adicional', d: 'Valor que sai todo mês' },
    parcelada: { t: 'Compra parcelada', d: 'Valor total dividido em parcelas' },
    emprestimo: { t: 'Novo empréstimo', d: 'Entra o valor no mês e saem as parcelas nos meses seguintes' },
    extraordinario: { t: 'Gasto extraordinário', d: 'Uma vez só, no mês escolhido' },
  };
  let rascunho = null; // cenário em edição (não salvo)

  const novo = () => ({ id: 'sim-' + U.uid(), nome: 'Novo cenário', itens: [], incluirProjecao: false, criadoEm: Date.now() });

  function formItem(it) {
    it = it || { tipo: 'despesa', inicio: U.mesAtual() };
    return '<div class="form-grid">' +
      ui.field('Tipo', ui.select('tipo', Object.keys(TIPOS).map((k) => ({ v: k, t: TIPOS[k].t })), it.tipo), '', 'full') +
      ui.field('Descrição', ui.input('descricao', it.descricao, 'placeholder="ex.: Plano de saúde"'), '', 'full') +
      ui.field('Valor (R$)', ui.input('valor', it.valor != null ? U.num2(it.valor) : '', 'inputmode="decimal"'), '<span id="dicaValor"></span>') +
      ui.field('Começa em', ui.input('inicio', it.inicio || U.mesAtual(), 'type="month"')) +
      ui.field('Duração (meses)', ui.input('meses', it.meses, 'type="number" min="0" placeholder="vazio = sem fim"'), 'Para renda, salário e despesa', 'f-meses') +
      ui.field('Parcelas', ui.input('parcelas', it.parcelas, 'type="number" min="1"'), '', 'f-parc') +
      ui.field('Juros (% ao mês)', ui.input('taxa', it.taxa != null ? String(it.taxa).replace('.', ',') : '', 'inputmode="decimal" placeholder="0"'), '0 = sem juros', 'f-parc') +
      ui.field('Tipo da despesa', ui.select('grupo', [{ v: 'fixa', t: 'Despesa fixa' }, { v: 'variavel', t: 'Despesa variável' }], it.grupo || 'fixa'), '', 'f-grupo') + '</div>';
  }
  function editarItem(sim, idx) {
    const it = idx != null ? sim.itens[idx] : null;
    ui.modal({ titulo: it ? 'Editar item' : 'Adicionar ao cenário', corpo: formItem(it), aoAbrir: (m) => {
      const ajusta = () => { const t = m.body.querySelector('[name=tipo]').value;
        m.body.querySelectorAll('.f-meses').forEach((e) => { e.style.display = ['renda', 'salario', 'despesa'].includes(t) ? '' : 'none'; });
        m.body.querySelectorAll('.f-parc').forEach((e) => { e.style.display = ['parcelada', 'emprestimo'].includes(t) ? '' : 'none'; });
        m.body.querySelectorAll('.f-grupo').forEach((e) => { e.style.display = t === 'despesa' ? '' : 'none'; });
        m.body.querySelector('#dicaValor').textContent = TIPOS[t].d; };
      m.body.querySelector('[name=tipo]').addEventListener('change', ajusta); ajusta();
    }, botoes: [{ texto: 'Cancelar' }, { texto: it ? 'Salvar' : 'Adicionar', classe: 'primary', acao: (m) => {
      const v = ui.lerForm(m.body); ui.limparErros(m.body);
      const o = { tipo: v.tipo, descricao: v.descricao.trim(), valor: U.parseValor(v.valor), inicio: v.inicio, meses: v.meses ? +v.meses : null,
        parcelas: v.parcelas ? +v.parcelas : null, taxa: v.taxa ? U.parseValor(v.taxa) : 0, grupo: v.grupo };
      let ok = true;
      if (isNaN(o.valor) || o.valor === 0 || (o.tipo !== 'salario' && o.valor < 0)) { ui.erro(m.body, 'valor', o.tipo === 'salario' ? 'Informe a diferença (pode ser negativa).' : 'Informe um valor maior que zero.'); ok = false; }
      if (!o.inicio) { ui.erro(m.body, 'inicio', 'Informe o mês.'); ok = false; }
      if (['parcelada', 'emprestimo'].includes(o.tipo) && !(o.parcelas >= 1)) { ui.erro(m.body, 'parcelas', 'Informe as parcelas.'); ok = false; }
      if (isNaN(o.taxa) || o.taxa < 0) { ui.erro(m.body, 'taxa', 'Taxa inválida.'); ok = false; }
      if (!ok) return false;
      o.valor = U.round2(o.valor);
      if (idx != null) sim.itens[idx] = o; else sim.itens.push(o);
      App.render();
    } }] });
  }

  function descItem(it) {
    const per = it.meses ? ' por ' + it.meses + ' meses' : '';
    if (it.tipo === 'parcelada') return U.brl(it.valor) + ' em ' + it.parcelas + '× de ' + U.brl(F.pmt(it.valor, (it.taxa || 0) / 100, it.parcelas)) + (it.taxa ? ' (' + U.num2(it.taxa) + '% a.m.)' : ' sem juros') + ' a partir de ' + U.mesLabel(it.inicio);
    if (it.tipo === 'emprestimo') return 'recebe ' + U.brl(it.valor) + ' em ' + U.mesLabel(it.inicio) + ' e paga ' + it.parcelas + '× de ' + U.brl(F.pmt(it.valor, (it.taxa || 0) / 100, it.parcelas));
    if (it.tipo === 'extraordinario') return U.brl(it.valor) + ' em ' + U.mesLabel(it.inicio);
    return (it.valor >= 0 ? '+' : '−') + ' ' + U.brl(Math.abs(it.valor)) + '/mês a partir de ' + U.mesLabel(it.inicio) + per;
  }

  async function efetivar(sim) {
    const meses = U.mesRange(U.mesAtual(), U.mesAdd(U.mesAtual(), 11));
    const linhas = F.itensSimulacao(sim, meses);
    const novos = [];
    meses.forEach((m) => (linhas[m] || []).forEach((x) => {
      const cat = x.tipo === 'receita' ? (/empr/i.test(x.descricao) ? 'Empréstimo recebido' : 'Outras receitas') : ({ fixa: 'Outras despesas fixas', variavel: 'Outras despesas', cartao: 'Cartão de crédito', emprestimo: 'Empréstimos e acordos' }[x.grupo]);
      novos.push({ id: 'lan-' + U.uid(), origem: 'simulacao', simulacaoId: sim.id, descricao: x.descricao, tipo: x.tipo, categoria: cat, grupo: x.grupo, valor: x.valor, mesRef: m,
        data: U.dataNoMes(m, 10), diaVenc: null, formaPagamento: x.grupo === 'cartao' ? 'Cartão de crédito' : '', cartaoId: null, situacao: 'pendente', observacoes: 'Criado pelo cenário "' + sim.nome + '"', criadoEm: Date.now(), atualizadoEm: Date.now() });
    }));
    if (!novos.length) { ui.toast('Este cenário não gera lançamentos nos próximos 12 meses.'); return; }
    if (!(await ui.confirmar('Efetivar cenário', 'Isto cria <b>' + novos.length + ' lançamentos</b> em "Contas e despesas" para os próximos 12 meses (' + U.mesLabel(meses[0]) + ' a ' + U.mesLabel(meses[11]) +
      '). Itens sem fim são lançados só até ' + U.mesLabel(meses[11]) + '. Você pode editar ou excluir depois.', 'Criar lançamentos'))) return;
    await App.store.putMany('lancamentos', novos);
    if (sim.incluirProjecao) await App.store.put('simulacoes', Object.assign({}, sim, { incluirProjecao: false, efetivadoEm: Date.now() }));
    else if (App.store.state.simulacoes.some((s) => s.id === sim.id)) await App.store.put('simulacoes', Object.assign({}, sim, { efetivadoEm: Date.now() }));
    ui.toast(novos.length + ' lançamentos criados.', 'good');
  }

  App.views.simulador = {
    render(view, acoes) {
      const st = App.store.state;
      if (!st.lancamentos.length) { view.innerHTML = ui.semDados(); return; }
      if (!rascunho) rascunho = st.simulacoes[0] ? U.clone(st.simulacoes[0]) : novo();
      const salvo = st.simulacoes.find((s) => s.id === rascunho.id);
      const alterado = !salvo || JSON.stringify(salvo) !== JSON.stringify(rascunho);
      acoes.innerHTML = '<button class="btn" id="novoCen">' + ui.icon('plus') + 'Novo cenário</button>';
      acoes.querySelector('#novoCen').addEventListener('click', () => { rascunho = novo(); App.render(); });

      const base = F.projecao({ meses: 12 });
      const sim = F.projecao({ meses: 12, simulacoes: [rascunho] });
      const marcos = [3, 6, 12].map((n) => {
        const b = base.slice(0, n), s = sim.slice(0, n);
        return { n, sobraMedia: U.round2(U.sum(s, (x) => x.saldo) / n), acum: U.sum(s, (x) => x.saldo), acumBase: U.sum(b, (x) => x.saldo), deficit: s.filter((x) => x.saldo < 0).length,
          comp: U.sum(s, (x) => x.despesas) / Math.max(1, U.sum(s, (x) => x.receitas)) };
      });
      const m0 = sim[0], b0 = base[0];
      view.innerHTML =
        '<div class="banner info">' + ui.icon('info') + '<div><b>As simulações não mudam seus dados</b>Monte um cenário e veja o efeito nos próximos 12 meses. Os lançamentos só são criados se você clicar em "Efetivar".</div></div>' +
        '<div class="split"><div class="side-list">' + st.simulacoes.map((s) => '<button data-sim="' + s.id + '" class="' + (s.id === rascunho.id ? 'on' : '') + '"><span class="t">' + U.esc(s.nome) + '</span><span class="s">' + s.itens.length + ' item(ns)' +
          (s.incluirProjecao ? ' · na projeção' : '') + (s.efetivadoEm ? ' · efetivado' : '') + '</span></button>').join('') + (!salvo ? '<button class="on"><span class="t">' + U.esc(rascunho.nome) + '</span><span class="s">não salvo</span></button>' : '') + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:16px;min-width:0">' +
        '<section class="panel"><div class="panel-head"><input id="simNome" class="inp" value="' + U.esc(rascunho.nome) + '" aria-label="Nome do cenário" style="font-weight:700;font-size:15px;min-width:220px">' +
        '<div class="actions" style="flex-wrap:wrap"><button class="btn" id="addItem">' + ui.icon('plus') + 'Adicionar</button>' +
        '<button class="btn primary" id="salvar"' + (alterado ? '' : ' disabled') + '>Salvar cenário</button>' +
        '<button class="btn" id="efetivar"' + (rascunho.itens.length ? '' : ' disabled') + '>' + ui.icon('check') + 'Efetivar</button>' +
        (salvo ? '<button class="btn danger" id="excluir">' + ui.icon('trash') + '</button>' : '') + '</div></div>' +
        '<label class="check" style="margin-bottom:10px"><input type="checkbox" id="naProj"' + (rascunho.incluirProjecao ? ' checked' : '') + '> Mostrar este cenário na Projeção anual</label>' +
        (rascunho.itens.length ? '<div class="list">' + rascunho.itens.map((it, i) => '<div class="list-item"><span class="stripe ' + (['renda'].includes(it.tipo) || (it.tipo === 'salario' && it.valor > 0) ? 'good' : 'bad') + '"></span><div><div class="t">' +
          U.esc(it.descricao || TIPOS[it.tipo].t) + ' <span class="pill">' + TIPOS[it.tipo].t + '</span></div><div class="s">' + descItem(it) + '</div></div><div class="actions"><button class="btn sm" data-ed="' + i + '">' + ui.icon('edit') + '</button><button class="btn sm danger" data-rm="' + i + '">' + ui.icon('trash') + '</button></div></div>').join('') + '</div>'
          : '<p class="muted">Adicione uma nova renda, despesa, compra parcelada, empréstimo, mudança de salário ou gasto extraordinário.</p>') +
        '</section>' +
        '<section class="kpis">' +
        ui.kpi({ rotulo: 'Sobra em ' + U.mesLabel(m0.mes), valor: U.brl(m0.saldo), icone: 'wallet', nivel: m0.saldo < 0 ? 'bad' : 'good', sub: 'sem o cenário: ' + U.brl(b0.saldo) }) +
        ui.kpi({ rotulo: 'Renda comprometida em ' + U.mesLabel(m0.mes), valor: m0.receitas ? U.pct(m0.comprometimento) : '—', icone: 'pie', nivel: m0.receitas ? ui.nivelPct(m0.comprometimento) : '', barra: m0.receitas ? m0.comprometimento : null, sub: 'sem o cenário: ' + (b0.receitas ? U.pct(b0.comprometimento) : '—') }) +
        marcos.map((x) => ui.kpi({ rotulo: 'Em ' + x.n + ' meses', valor: U.brl(x.acum), icone: 'calendar', nivel: x.acum < 0 ? 'bad' : x.deficit ? 'warn' : 'good',
          sub: 'saldo acumulado · sem o cenário ' + U.brl0(x.acumBase) + '<br>' + (x.deficit ? '<span class="neg">' + x.deficit + ' mês(es) com déficit</span>' : 'nenhum mês com déficit') + ' · comprometimento médio ' + U.pct(x.comp) })).join('') +
        '</section>' +
        '<section class="panel"><h2>Sobra mês a mês: com e sem o cenário</h2><div class="chart-box"><canvas id="chSim"></canvas></div></section>' +
        '<section class="panel"><h2>Orçamento dos próximos 12 meses com o cenário</h2><div class="table-wrap"><table><thead><tr><th>Mês</th><th class="num">Receitas</th><th class="num">Despesas</th><th class="num">Comprometimento</th><th class="num">Sobra</th><th class="num">Sobra sem o cenário</th><th class="num">Diferença</th></tr></thead><tbody>' +
        sim.map((x, i) => '<tr><td>' + U.mesLabel(x.mes) + (x.estimado ? ' <span class="pill" title="Repete receitas e despesas fixas do último mês com dados">estimado</span>' : '') + '</td><td class="num">' + U.brl(x.receitas) + '</td><td class="num">' + U.brl(x.despesas) + '</td>' +
          '<td class="num heat-' + ui.nivelPct(x.comprometimento) + '">' + (x.receitas ? U.pct(x.comprometimento) : '—') + '</td><td class="num ' + (x.saldo < 0 ? 'neg' : 'pos') + '">' + U.brl(x.saldo) + '</td><td class="num">' + U.brl(base[i].saldo) + '</td>' +
          '<td class="num ' + (x.saldo - base[i].saldo < 0 ? 'neg' : x.saldo - base[i].saldo > 0 ? 'pos' : '') + '">' + U.brl(x.saldo - base[i].saldo) + '</td></tr>').join('') +
        '</tbody></table></div></section></div></div>';

      view.querySelectorAll('[data-sim]').forEach((b) => b.addEventListener('click', async () => {
        if (alterado && rascunho.itens.length && !(await ui.confirmar('Descartar alterações', 'O cenário atual tem alterações não salvas. Descartar?', 'Descartar', true))) return;
        rascunho = U.clone(st.simulacoes.find((s) => s.id === b.dataset.sim)); App.render(); }));
      view.querySelector('#simNome').addEventListener('change', (e) => { rascunho.nome = e.target.value.trim() || 'Cenário'; App.render(); });
      view.querySelector('#naProj').addEventListener('change', (e) => { rascunho.incluirProjecao = e.target.checked; App.render(); });
      view.querySelector('#addItem').addEventListener('click', () => editarItem(rascunho, null));
      view.querySelectorAll('[data-ed]').forEach((b) => b.addEventListener('click', () => editarItem(rascunho, +b.dataset.ed)));
      view.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { rascunho.itens.splice(+b.dataset.rm, 1); App.render(); }));
      view.querySelector('#salvar').addEventListener('click', async () => { rascunho.atualizadoEm = Date.now(); await App.store.put('simulacoes', U.clone(rascunho)); ui.toast('Cenário salvo.', 'good'); });
      view.querySelector('#efetivar').addEventListener('click', () => efetivar(rascunho));
      const ex = view.querySelector('#excluir');
      if (ex) ex.addEventListener('click', async () => { if (await ui.confirmar('Excluir cenário', 'Excluir o cenário "' + U.esc(rascunho.nome) + '"? Lançamentos já efetivados continuam.', 'Excluir', true)) { const id = rascunho.id; rascunho = null; await App.store.remove('simulacoes', id); } });

      Ch.render('chSim', { type: 'bar', data: { labels: sim.map((x) => U.mesLabel(x.mes)), datasets: [
        { label: 'Sobra sem o cenário', data: base.map((x) => x.saldo), backgroundColor: Ch.alpha(Ch.cor.muted(), .35) },
        { label: 'Sobra com o cenário', data: sim.map((x) => x.saldo), backgroundColor: sim.map((x) => (x.saldo < 0 ? Ch.cor.bad() : Ch.cor.good())) },
        { type: 'line', label: 'Acumulado com o cenário', data: sim.map((x) => x.acumulado), borderColor: Ch.cor.accent(), backgroundColor: Ch.cor.accent(), pointRadius: 2, tension: .2 }] } });
    },
  };
})(window.App = window.App || {});
