/* 2. Análise mensal — receitas, despesas, comparativos, contas pagas e pendentes, seis gráficos de evolução. */
(function (App) {
  'use strict';
  const U = App.U, F = App.F, ui = App.ui, Ch = App.charts;
  let periodo = '12';

  App.views.mensal = {
    render(view, acoes) {
      if (!App.store.state.lancamentos.length) { view.innerHTML = ui.semDados(); return; }
      const todos = F.mesesComDados();
      const anos = [...new Set([...todos, U.mesAtual()].map((m) => m.slice(0, 4)))].sort();
      const mes = App.sel.mes, p = U.mesParts(mes);
      acoes.innerHTML = '<select id="selMes" class="inp" aria-label="Mês">' + U.MESES.map((n, i) => '<option value="' + i + '"' + (i === p.m ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>' +
        '<select id="selAno" class="inp" aria-label="Ano">' + anos.map((a) => '<option' + (+a === p.y ? ' selected' : '') + '>' + a + '</option>').join('') + '</select>';
      const muda = () => { App.sel.mes = U.mesKey(+acoes.querySelector('#selAno').value, +acoes.querySelector('#selMes').value); App.render(); };
      acoes.querySelector('#selMes').addEventListener('change', muda); acoes.querySelector('#selAno').addEventListener('change', muda);

      const r = F.resumoMes(mes), ant = F.resumoMes(U.mesAdd(mes, -1)), cx = F.caixaMes(mes);
      const linhaConta = (l, paga) => '<tr><td>' + U.esc(l.descricao) + '<span class="sub">' + U.esc(l.categoria) + (l.diaVenc ? ' · vence ' + U.dataBR(l.data) : '') + '</span></td>' +
        '<td class="num">' + U.brl(l.valor) + '</td><td class="num"><button class="btn sm" data-toggle="' + l.id + '">' + (paga ? 'Desfazer' : ui.icon('check') + 'Paga') + '</button></td></tr>';
      view.innerHTML =
        '<section class="kpis">' +
        ui.kpi({ rotulo: 'Receitas', valor: U.brl(r.receitas), icone: 'wallet', sub: ui.delta(r.receitas, ant.receitas) }) +
        ui.kpi({ rotulo: 'Despesas', valor: U.brl(r.gastos), icone: 'cash', sub: ui.delta(r.gastos, ant.gastos, true) }) +
        ui.kpi({ rotulo: 'Cartões', valor: U.brl(r.cartao), icone: 'card', sub: ui.delta(r.cartao, ant.cartao, true) }) +
        ui.kpi({ rotulo: 'Despesas fixas', valor: U.brl(r.fixa), icone: 'house', sub: ui.delta(r.fixa, ant.fixa, true) }) +
        ui.kpi({ rotulo: 'Empréstimos e acordos', valor: U.brl(r.emprestimo), icone: 'debt', sub: ui.delta(r.emprestimo, ant.emprestimo, true) }) +
        ui.kpi({ rotulo: 'Disponível agora', valor: U.brl(cx.disponivel), icone: 'cash', nivel: cx.disponivel < 0 ? 'bad' : 'good', sub: 'recebido − contas pagas · falta pagar ' + U.brl0(cx.aPagar) }) +
        ui.kpi({ rotulo: 'Saldo previsto do mês', valor: U.brl(r.saldo), icone: 'wallet', nivel: r.saldo < 0 ? 'bad' : 'good', sub: ant.qtd ? 'mês anterior: ' + U.brl(ant.saldo) : 'sem mês anterior' }) +
        ui.kpi({ rotulo: 'Renda comprometida', valor: r.receitas ? U.pct(r.comprometimento) : '—', icone: 'pie', nivel: r.receitas ? ui.nivelPct(r.comprometimento) : '', barra: r.receitas ? r.comprometimento : null,
          sub: ant.receitas ? 'mês anterior: ' + U.pct(ant.comprometimento) : '' }) +
        '</section>' +
        '<section class="panel"><h2>Análise de ' + U.mesLongo(mes) + '</h2><div class="analysis">' + U.esc(F.textoMes(r, ant)) + '</div></section>' +
        '<div class="grid g2">' +
        '<section class="panel"><h2>Principais categorias de despesa</h2><div class="chart-box short"><canvas id="chCat"></canvas></div>' +
        '<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Categoria</th><th class="num">Valor</th><th class="num">% dos gastos</th></tr></thead><tbody>' +
        (r.porCategoria.length ? r.porCategoria.map((c) => '<tr><td>' + U.esc(c.categoria) + '</td><td class="num">' + U.brl(c.valor) + '</td><td class="num">' + U.pct(r.gastos ? c.valor / r.gastos : 0) + '</td></tr>').join('') : '<tr><td colspan="3" class="muted">Sem despesas.</td></tr>') +
        '</tbody></table></div></section>' +
        '<section class="panel"><h2>Contas do mês</h2>' +
        '<div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr))">' +
        ui.kpi({ rotulo: 'Já pago', valor: U.brl(cx.pago), icone: 'check', nivel: 'good', barra: cx.pctPago, sub: U.pct(cx.pctPago) + ' das contas' }) +
        ui.kpi({ rotulo: 'Falta pagar', valor: U.brl(cx.aPagar), icone: 'alert', nivel: cx.aPagar ? 'warn' : 'good', sub: r.pendentes.length + ' conta(s) pendente(s)' }) + '</div>' +
        '<p class="small muted" style="margin:12px 0">Para marcar contas como pagas e receitas como recebidas, use a seção Contas a pagar. O painel de lá se atualiza a cada conta marcada.</p>' +
        '<a class="btn primary" href="#contas">' + ui.icon('check') + 'Abrir Contas a pagar</a>' +
        '</section></div>' +
        '<section class="panel"><div class="panel-head"><h2>Evolução</h2><div class="seg" id="periodo">' +
        [['12', '12 meses até o mês escolhido'], ['futuro', '12 meses a partir dele'], ['todos', 'Todo o período']].map(([v, t]) => '<button data-p="' + v + '" class="' + (periodo === v ? 'on' : '') + '">' + t + '</button>').join('') +
        '</div></div><p class="hint" style="margin-top:-6px">Barras mais claras = meses futuros (previsão da planilha).</p>' +
        '<div class="grid g2">' +
        '<div><h2>1. Receitas</h2><div class="chart-box short"><canvas id="chRec"></canvas></div></div>' +
        '<div><h2>2. Despesas por tipo</h2><div class="chart-box short"><canvas id="chDesp"></canvas></div></div>' +
        '<div><h2>3. Receitas x despesas</h2><div class="chart-box short"><canvas id="chRxD"></canvas></div></div>' +
        '<div><h2>4. Gastos por categoria no período</h2><div class="chart-box short"><canvas id="chCatPer"></canvas></div></div>' +
        '<div><h2>5. Saldo mensal</h2><div class="chart-box short"><canvas id="chSaldo"></canvas></div></div>' +
        '<div><h2>6. Dívidas e cartões</h2><p class="hint" style="margin:-8px 0 4px">A linha começa no mês atual: é o que ainda falta pagar.</p><div class="chart-box short"><canvas id="chDiv"></canvas></div></div>' +
        '</div></section>';

      view.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
        const l = App.store.state.lancamentos.find((x) => x.id === b.dataset.toggle); if (!l) return;
        await App.store.put('lancamentos', Object.assign({}, l, { situacao: l.situacao === 'pago' ? 'pendente' : 'pago', situacaoPresumida: false, atualizadoEm: Date.now() }));
        ui.toast((l.situacao === 'pago' ? 'Voltou para pendente. ' : 'Conta paga. ') + 'Disponível agora: ' + U.brl(F.caixaMes(mes).disponivel), 'good');
      }));
      const pt = view.querySelector('#pagarTodas');
      if (pt) pt.addEventListener('click', async () => {
        if (!(await ui.confirmar('Marcar como pagas', 'Marcar as ' + r.pendentes.length + ' contas pendentes de ' + U.mesLongo(mes) + ' como pagas?', 'Marcar'))) return;
        await App.store.putMany('lancamentos', r.pendentes.map((l) => Object.assign({}, l, { situacao: 'pago', situacaoPresumida: false, atualizadoEm: Date.now() })));
      });
      view.querySelectorAll('#periodo button').forEach((b) => b.addEventListener('click', () => { periodo = b.dataset.p; App.render(); }));

      // Categorias do mês
      Ch.render('chCat', { type: 'doughnut', data: { labels: r.porCategoria.map((c) => c.categoria), datasets: [{ data: r.porCategoria.map((c) => c.valor), backgroundColor: Ch.paleta, borderWidth: 0 }] },
        options: { cutout: '58%', plugins: { legend: { position: 'right' } } } });

      // Período dos gráficos
      let meses;
      if (periodo === 'todos') meses = todos.length ? U.mesRange(todos[0], todos[todos.length - 1]) : [mes];
      else if (periodo === 'futuro') meses = U.mesRange(mes, U.mesAdd(mes, 11));
      else meses = U.mesRange(U.mesAdd(mes, -11), mes);
      const res = meses.map((m) => F.resumoMes(m));
      const hoje = U.mesAtual(); const fut = (m) => U.mesDiff(hoje, m) > 0;
      const cores = (c) => meses.map((m) => Ch.alpha(c, fut(m) ? .4 : .9));
      const labels = meses.map(U.mesLabel);
      Ch.render('chRec', { type: 'line', data: { labels, datasets: [{ label: 'Receitas', data: res.map((x) => (x.qtd ? x.receitas : null)), borderColor: Ch.cor.receita(), backgroundColor: Ch.alpha(Ch.cor.receita(), .12), fill: true, tension: .25,
        segment: { borderDash: (c) => (fut(meses[c.p1DataIndex]) ? [5, 4] : undefined) } }] } });
      Ch.render('chDesp', { type: 'bar', data: { labels, datasets: [['Fixas', 'fixa'], ['Cartões', 'cartao'], ['Empréstimos', 'emprestimo'], ['Variáveis', 'variavel']].map(([t, k]) =>
        ({ label: t, data: res.map((x) => x[k]), backgroundColor: cores(Ch.cor[k]()), stack: 's' })) }, options: { scales: { x: { stacked: true }, y: { stacked: true } } } });
      Ch.render('chRxD', { type: 'bar', data: { labels, datasets: [
        { label: 'Receitas', data: res.map((x) => x.receitas), backgroundColor: cores(Ch.cor.receita()) },
        { label: 'Despesas', data: res.map((x) => x.gastos), backgroundColor: cores(Ch.cor.bad()) }] } });
      const catPer = {}; res.forEach((x) => x.porCategoria.forEach((c) => { catPer[c.categoria] = (catPer[c.categoria] || 0) + c.valor; }));
      const cats = Object.keys(catPer).sort((a, b) => catPer[b] - catPer[a]);
      Ch.render('chCatPer', { type: 'doughnut', data: { labels: cats, datasets: [{ data: cats.map((c) => U.round2(catPer[c])), backgroundColor: Ch.paleta, borderWidth: 0 }] },
        options: { cutout: '58%', plugins: { legend: { position: 'right' } } } });
      Ch.render('chSaldo', { type: 'bar', data: { labels, datasets: [{ label: 'Saldo do mês', data: res.map((x) => x.saldo),
        backgroundColor: res.map((x, i) => Ch.alpha(x.saldo < 0 ? Ch.cor.bad() : Ch.cor.good(), fut(meses[i]) ? .4 : .85)) }] } });
      const proj = new Map(F.projecao({ inicio: meses[0], meses: meses.length }).map((x) => [x.mes, x.dividasRestantes]));
      Ch.render('chDiv', { type: 'bar', data: { labels, datasets: [
        { label: 'Faturas de cartão no mês', data: res.map((x) => x.cartao), backgroundColor: cores(Ch.cor.cartao()), stack: 'd' },
        { label: 'Empréstimos e acordos no mês', data: res.map((x) => x.emprestimo), backgroundColor: cores(Ch.cor.emprestimo()), stack: 'd' },
        { type: 'line', label: 'Dívida que fica para os meses seguintes', data: meses.map((m) => (U.mesDiff(hoje, m) >= 0 ? proj.get(m) || 0 : null)), borderColor: Ch.cor.bad(), backgroundColor: Ch.cor.bad(), pointRadius: 2, tension: .25, stack: 'linha' },
      ] }, options: { scales: { x: { stacked: true }, y: { stacked: true } } } });
    },
  };
})(window.App = window.App || {});
