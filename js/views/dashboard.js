/* 1. Dashboard — visão geral da saúde financeira do mês. */
(function (App) {
  'use strict';
  const U = App.U, F = App.F, ui = App.ui, Ch = App.charts;

  function mesNav(acoes) {
    const meses = [...new Set([...F.mesesComDados(), U.mesAtual()])].sort();
    acoes.innerHTML = '<div class="month-nav"><button class="icon-btn" id="mPrev" aria-label="Mês anterior">' + ui.icon('left') + '</button>' +
      ui.selectMes('mSel', meses, App.sel.mes) + '<button class="icon-btn" id="mNext" aria-label="Próximo mês">' + ui.icon('right') + '</button></div>';
    acoes.querySelector('#mSel').addEventListener('change', (e) => { App.sel.mes = e.target.value; App.render(); });
    acoes.querySelector('#mPrev').addEventListener('click', () => { App.sel.mes = U.mesAdd(App.sel.mes, -1); App.render(); });
    acoes.querySelector('#mNext').addEventListener('click', () => { App.sel.mes = U.mesAdd(App.sel.mes, 1); App.render(); });
  }
  App.mesNav = mesNav;

  App.views.dashboard = {
    render(view, acoes) {
      if (!App.store.state.lancamentos.length) { view.innerHTML = ui.semDados(); return; }
      mesNav(acoes);
      const mes = App.sel.mes;
      const r = F.resumoMes(mes), ant = F.resumoMes(U.mesAdd(mes, -1));
      const div = F.dividasEmAberto(), eco = F.economizado(), cx = F.caixaMes(mes);
      const nivel = r.receitas || r.gastos ? F.nivel(r) : 'info';
      const futuro = U.mesDiff(U.mesAtual(), mes) > 0;
      const varPrev = +App.store.getMeta('gastoVariavelPrevisto', 0) || 0;

      let banner;
      if (!r.qtd) banner = ['info', 'Sem lançamentos em ' + U.mesLongo(mes), 'Escolha outro mês ou cadastre contas em "Contas e despesas".'];
      else if (r.saldo < 0) banner = ['bad', 'Neste mês vocês gastam mais do que recebem', 'Faltam ' + U.brl(-r.saldo) + ' para fechar ' + U.mesLongo(mes) + '. ' + (futuro ? 'É uma previsão com base na planilha.' : '')];
      else if (nivel === 'warn') banner = ['warn', 'Atenção: a renda está bem comprometida', U.pct(r.comprometimento) + ' da renda já tem destino. Sobram ' + U.brl(r.saldo) + '.'];
      else banner = ['good', 'As contas cabem na renda', 'Sobram ' + U.brl(r.saldo) + ' (' + U.pct(r.receitas ? r.saldo / r.receitas : 0) + ' da renda).'];

      const evo = F.variacao(r.saldo, ant.saldo);
      view.innerHTML = App.avisosPlanilha() +
        '<div class="banner ' + banner[0] + '">' + ui.icon(banner[0] === 'good' ? 'check' : banner[0] === 'info' ? 'info' : 'alert') + '<div><b>' + banner[1] + '</b>' + banner[2] + '</div></div>' +
        (r.variavel === 0 && !varPrev ? '<div class="banner warn">' + ui.icon('info') + '<div><b>Faltam os gastos do dia a dia</b>A planilha não tem mercado, transporte, farmácia e lazer, então a sobra aparece maior do que é. Lance esses gastos em "Contas e despesas" ou informe uma previsão mensal em <a href="#config">Configurações</a>.</div></div>' : '') +
        '<section class="kpis" aria-label="Indicadores do mês">' +
        ui.kpi({ rotulo: 'Receita do mês', valor: U.brl(r.receitas), icone: 'wallet', sub: ui.delta(r.receitas, ant.receitas) }) +
        ui.kpi({ rotulo: 'Despesas fixas', valor: U.brl(r.fixa), icone: 'house', sub: U.pct(r.receitas ? r.fixa / r.receitas : 0) + ' da renda' }) +
        ui.kpi({ rotulo: 'Cartões de crédito', valor: U.brl(r.cartao), icone: 'card', sub: U.pct(r.receitas ? r.cartao / r.receitas : 0) + ' da renda' }) +
        ui.kpi({ rotulo: 'Empréstimos e parcelamentos', valor: U.brl(r.emprestimo), icone: 'debt', sub: U.pct(r.receitas ? r.emprestimo / r.receitas : 0) + ' da renda' }) +
        ui.kpi({ rotulo: 'Total de gastos', valor: U.brl(r.gastos), icone: 'cash', sub: ui.delta(r.gastos, ant.gastos, true) + (r.variavel ? '' : '') }) +
        ui.kpi({ rotulo: 'Disponível agora', valor: U.brl(cx.disponivel), icone: 'cash', nivel: cx.disponivel < 0 ? 'bad' : 'good',
          sub: 'recebido ' + U.brl0(cx.recebido) + ' − pago ' + U.brl0(cx.pago) + '<br>falta pagar ' + U.brl0(cx.aPagar) + (cx.aReceber ? ' · a receber ' + U.brl0(cx.aReceber) : ''),
          titulo: 'Dinheiro que já entrou no mês menos as contas já pagas. Diminui quando você marca uma conta como paga ou lança uma compra no Pix, débito ou dinheiro.' }) +
        ui.kpi({ rotulo: 'Saldo previsto do mês', valor: U.brl(r.saldo), icone: 'wallet', nivel: r.saldo < 0 ? 'bad' : r.saldo === 0 ? 'warn' : 'good', sub: 'todas as receitas − todas as contas do mês' + (r.reserva ? ' − reserva' : '') }) +
        ui.kpi({ rotulo: 'Renda comprometida', valor: r.receitas ? U.pct(r.comprometimento) : '—', icone: 'pie', nivel: r.receitas ? ui.nivelPct(r.comprometimento) : '', barra: r.receitas ? r.comprometimento : null,
          sub: 'verde até 70%, amarelo até 90%' }) +
        ui.kpi({ rotulo: 'Dívidas em aberto', valor: U.brl(div.total), icone: 'alert', nivel: div.total > 0 ? 'warn' : 'good',
          sub: 'faturas e parcelas a partir deste mês' + (div.simulador ? ' + ' + U.brl0(div.simulador) + ' no simulador' : ''),
          titulo: 'Soma das faturas e parcelas pendentes da planilha a partir do mês atual, mais o saldo das dívidas cadastradas no simulador.' }) +
        ui.kpi({ rotulo: 'Dinheiro guardado', valor: U.brl(eco.total), icone: 'piggy', nivel: eco.total > 0 ? 'good' : '',
          sub: eco.total ? 'reserva informada + lançamentos de reserva' : 'informe sua reserva em <a href="#config">Configurações</a>' }) +
        ui.kpi({ rotulo: 'Evolução do saldo', valor: ant.qtd ? (r.saldo - ant.saldo > 0 ? '+' : '') + U.brl(r.saldo - ant.saldo) : '—', icone: 'trend',
          nivel: ant.qtd ? (r.saldo >= ant.saldo ? 'good' : 'bad') : '', sub: ant.qtd ? 'em relação a ' + U.mesLongo(ant.mes) + (evo != null ? ' (' + (evo >= 0 ? '+' : '') + U.pct(evo) + ')' : '') : 'sem mês anterior' }) +
        '</section>' +
        '<div class="grid g-2-1">' +
        '<section class="panel"><div class="panel-head"><h2>Receitas e despesas <small>6 meses antes e 5 depois</small></h2></div><div class="chart-box"><canvas id="chEvo"></canvas></div></section>' +
        '<section class="panel"><h2>Para onde vai o dinheiro</h2><div class="chart-box"><canvas id="chGrupos"></canvas></div></section>' +
        '</div>' +
        '<div class="grid g2">' +
        '<section class="panel"><h2>Resumo do mês</h2><div class="analysis">' + U.esc(F.textoMes(r, ant)) + '</div></section>' +
        '<section class="panel"><div class="panel-head"><h2>Próximos vencimentos</h2><a class="btn sm" href="#lancamentos">Ver todas</a></div><div class="list" id="proxVenc"></div></section>' +
        '</div>';

      // Gráfico de evolução
      const meses = U.mesRange(U.mesAdd(mes, -6), U.mesAdd(mes, 5));
      const res = meses.map((m) => F.resumoMes(m));
      const hoje = U.mesAtual();
      Ch.render('chEvo', { type: 'bar', data: { labels: meses.map(U.mesLabel), datasets: [
        { type: 'line', label: 'Receitas', data: res.map((x) => (x.qtd ? x.receitas : null)), spanGaps: false, borderColor: Ch.cor.receita(), backgroundColor: Ch.cor.receita(), tension: .25, pointRadius: 3, order: 0, stack: 'linha' },
        { label: 'Despesas fixas', data: res.map((x) => x.fixa), backgroundColor: meses.map((m) => Ch.alpha(Ch.cor.fixa(), U.mesDiff(hoje, m) > 0 ? .45 : .9)), stack: 'g', order: 1 },
        { label: 'Cartões', data: res.map((x) => x.cartao), backgroundColor: meses.map((m) => Ch.alpha(Ch.cor.cartao(), U.mesDiff(hoje, m) > 0 ? .45 : .9)), stack: 'g', order: 1 },
        { label: 'Empréstimos', data: res.map((x) => x.emprestimo), backgroundColor: meses.map((m) => Ch.alpha(Ch.cor.emprestimo(), U.mesDiff(hoje, m) > 0 ? .45 : .9)), stack: 'g', order: 1 },
        { label: 'Variáveis', data: res.map((x) => x.variavel), backgroundColor: meses.map((m) => Ch.alpha(Ch.cor.variavel(), U.mesDiff(hoje, m) > 0 ? .45 : .9)), stack: 'g', order: 1 },
      ] }, options: { scales: { x: { stacked: true }, y: { stacked: true } } } });

      const grupos = [['Despesas fixas', r.fixa, Ch.cor.fixa()], ['Cartões', r.cartao, Ch.cor.cartao()], ['Empréstimos', r.emprestimo, Ch.cor.emprestimo()], ['Variáveis', r.variavel, Ch.cor.variavel()],
        ['Reserva', r.reserva, Ch.cor.reserva()], ['Sobra', Math.max(0, r.saldo), Ch.alpha(Ch.cor.receita(), .35)]].filter((g) => g[1] > 0);
      Ch.render('chGrupos', { type: 'doughnut', data: { labels: grupos.map((g) => g[0]), datasets: [{ data: grupos.map((g) => g[1]), backgroundColor: grupos.map((g) => g[2]), borderWidth: 0 }] },
        options: { cutout: '62%' } });

      // Próximos vencimentos: pendentes deste mês em diante
      const pend = App.store.state.lancamentos.filter((l) => l.tipo === 'despesa' && l.situacao !== 'pago' && U.mesDiff(mes, l.mesRef) >= 0)
        .sort((a, b) => (a.data < b.data ? -1 : 1)).slice(0, 7);
      const hojeISO = U.hojeISO();
      view.querySelector('#proxVenc').innerHTML = pend.length ? pend.map((l) => {
        const atrasada = !!l.diaVenc && l.data < hojeISO; const proxima = !atrasada && l.data <= U.dataNoMes(U.mesAtual(), new Date().getDate() + 5);
        return '<div class="list-item"><span class="stripe ' + (atrasada ? 'bad' : proxima ? 'warn' : '') + '"></span><div><div class="t">' + U.esc(l.descricao) + '</div><div class="s">' +
          (l.diaVenc ? 'vence ' + U.dataBR(l.data) : U.mesLongo(l.mesRef) + ' · sem dia de vencimento') + (atrasada ? ' · <span class="neg">vencida</span>' : '') + '</div></div><div class="v">' + U.brl(l.valor) + '</div></div>';
      }).join('') : '<p class="muted">Nenhuma conta pendente a partir deste mês.</p>';
    },
  };
})(window.App = window.App || {});
