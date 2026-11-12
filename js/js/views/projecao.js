/* 7. Projeção anual — previsão dos próximos 12 meses com receitas, despesas, comprometimento, saldo e dívidas. */
(function (App) {
  'use strict';
  const U = App.U, F = App.F, ui = App.ui, Ch = App.charts;
  let inicio = null, comDividas = true;

  App.views.projecao = {
    render(view, acoes) {
      const st = App.store.state;
      if (!st.lancamentos.length) { view.innerHTML = ui.semDados(); return; }
      if (!inicio) inicio = U.mesAtual();
      const opts = []; for (let i = -6; i <= 12; i++) opts.push(U.mesAdd(U.mesAtual(), i));
      acoes.innerHTML = '<label class="small muted" for="pIni">A partir de</label>' + ui.selectMes('pIni', opts, inicio);
      acoes.querySelector('#pIni').addEventListener('change', (e) => { inicio = e.target.value; App.render(); });
      const sims = st.simulacoes.filter((s) => s.incluirProjecao);
      const p = F.projecao({ inicio, meses: 12, simulacoes: sims, semDividas: !comDividas });
      const varPrev = +App.store.getMeta('gastoVariavelPrevisto', 0) || 0;
      const piores = p.slice().filter((x) => x.receitas || x.despesas).sort((a, b) => b.comprometimento - a.comprometimento).slice(0, 3);
      const deficit = p.filter((x) => x.saldo < 0);
      const tot = { receitas: U.sum(p, (x) => x.receitas), despesas: U.sum(p, (x) => x.despesas) };
      const estimados = p.filter((x) => x.estimado).length;

      view.innerHTML =
        (deficit.length ? '<div class="banner bad">' + ui.icon('alert') + '<div><b>' + deficit.length + ' mês(es) com déficit previsto</b>' + deficit.map((x) => U.mesLabel(x.mes) + ' (' + U.brl(x.saldo) + ')').join(', ') + '. Esses são os meses para se preparar com antecedência.</div></div>'
          : '<div class="banner good">' + ui.icon('check') + '<div><b>Nenhum mês com déficit previsto</b>Pelos dados atuais, a renda cobre as despesas nos 12 meses.</div></div>') +
        '<div class="banner info">' + ui.icon('info') + '<div><b>Como a projeção é montada</b>Usa os lançamentos já existentes de cada mês (planilha e cadastrados aqui).' +
        (estimados ? ' Em ' + estimados + ' mês(es) sem dados, repete as receitas e despesas fixas do último mês com salário (marcados como "estimado").' : '') +
        (varPrev ? ' Soma ' + U.brl(varPrev) + ' de gasto variável previsto em meses sem gastos variáveis lançados.' : ' <a href="#config">Informe o gasto variável previsto</a> (mercado, transporte…) para uma projeção mais realista.') +
        (sims.length ? ' Inclui os cenários: ' + sims.map((s) => '"' + U.esc(s.nome) + '"').join(', ') + '.' : '') + '</div></div>' +
        '<section class="kpis">' +
        ui.kpi({ rotulo: 'Receitas em 12 meses', valor: U.brl0(tot.receitas), icone: 'wallet' }) +
        ui.kpi({ rotulo: 'Despesas em 12 meses', valor: U.brl0(tot.despesas), icone: 'cash' }) +
        ui.kpi({ rotulo: 'Saldo acumulado', valor: U.brl0(p[p.length - 1].acumulado), icone: 'trend', nivel: p[p.length - 1].acumulado < 0 ? 'bad' : 'good', sub: 'soma das sobras e faltas' }) +
        piores.map((x, i) => ui.kpi({ rotulo: (i === 0 ? 'Mês mais apertado' : (i + 1) + 'º mais apertado') + ': ' + U.mesLabel(x.mes), valor: x.receitas ? U.pct(x.comprometimento) : '—', icone: 'alert',
          nivel: x.receitas ? ui.nivelPct(x.comprometimento) : 'bad', barra: x.receitas ? x.comprometimento : null, sub: 'da renda comprometida · sobra ' + U.brl(x.saldo) })).join('') + '</section>' +
        '<section class="panel"><div class="panel-head"><h2 style="margin:0">Previsão mês a mês</h2><label class="check"><input type="checkbox" id="pDiv"' + (comDividas ? ' checked' : '') + '> Incluir dívidas do simulador</label></div>' +
        '<div class="table-wrap"><table><thead><tr><th>Mês</th><th class="num">Receitas</th><th class="num">Fixas</th><th class="num">Cartões</th><th class="num">Empréstimos</th><th class="num">Variáveis</th><th class="num">Total de despesas</th>' +
        '<th class="num">Comprometimento</th><th class="num">Saldo previsto</th><th class="num">Acumulado</th><th class="num">Dívidas restantes</th></tr></thead><tbody>' +
        p.map((x) => '<tr><td>' + U.mesLabel(x.mes) + (x.estimado ? ' <span class="pill" title="Sem dados na planilha: repete o último mês">estimado</span>' : '') + '</td><td class="num">' + U.brl(x.receitas) + '</td><td class="num">' + U.brl(x.fixa) + '</td>' +
          '<td class="num">' + U.brl(x.cartao) + '</td><td class="num">' + U.brl(x.emprestimo) + '</td><td class="num">' + U.brl(x.variavel) + '</td><td class="num"><b>' + U.brl(x.despesas) + '</b></td>' +
          '<td class="num heat-' + (x.receitas ? ui.nivelPct(x.comprometimento) : 'bad') + '">' + (x.receitas ? U.pct(x.comprometimento) : 'sem renda') + '</td><td class="num ' + (x.saldo < 0 ? 'neg' : 'pos') + '">' + U.brl(x.saldo) + '</td>' +
          '<td class="num ' + (x.acumulado < 0 ? 'neg' : '') + '">' + U.brl(x.acumulado) + '</td><td class="num">' + U.brl(x.dividasRestantes) + '</td></tr>').join('') +
        '<tr class="total"><td>Total</td><td class="num">' + U.brl(tot.receitas) + '</td><td class="num">' + U.brl(U.sum(p, (x) => x.fixa)) + '</td><td class="num">' + U.brl(U.sum(p, (x) => x.cartao)) + '</td><td class="num">' + U.brl(U.sum(p, (x) => x.emprestimo)) + '</td>' +
        '<td class="num">' + U.brl(U.sum(p, (x) => x.variavel)) + '</td><td class="num">' + U.brl(tot.despesas) + '</td><td class="num">' + (tot.receitas ? U.pct(tot.despesas / tot.receitas) : '—') + '</td><td class="num">' + U.brl(tot.receitas - tot.despesas) + '</td><td></td><td></td></tr>' +
        '</tbody></table></div><p class="hint">Dívidas restantes = faturas e parcelas pendentes que ainda aparecem nos meses seguintes + saldo das dívidas do simulador ao fim do mês.</p></section>' +
        '<div class="grid g2"><section class="panel"><h2>Receitas e despesas previstas</h2><div class="chart-box tall"><canvas id="chProj"></canvas></div></section>' +
        '<section class="panel"><h2>Comprometimento da renda e dívidas restantes</h2><div class="chart-box tall"><canvas id="chComp"></canvas></div></section></div>';
      view.querySelector('#pDiv').addEventListener('change', (e) => { comDividas = e.target.checked; App.render(); });
      const labels = p.map((x) => U.mesLabel(x.mes));
      Ch.render('chProj', { type: 'bar', data: { labels, datasets: [['Fixas', 'fixa'], ['Cartões', 'cartao'], ['Empréstimos', 'emprestimo'], ['Variáveis', 'variavel']].map(([t, k]) => ({ label: t, data: p.map((x) => x[k]), backgroundColor: Ch.cor[k](), stack: 's' }))
        .concat([{ type: 'line', label: 'Receitas', data: p.map((x) => x.receitas), borderColor: Ch.cor.receita(), backgroundColor: Ch.cor.receita(), pointRadius: 3, stack: 'r' }]) },
        options: { scales: { x: { stacked: true }, y: { stacked: true } } } });
      Ch.render('chComp', { type: 'bar', data: { labels, datasets: [
        { type: 'line', label: 'Renda comprometida', data: p.map((x) => (isFinite(x.comprometimento) ? x.comprometimento : null)), borderColor: Ch.cor.bad(), backgroundColor: Ch.cor.bad(), yAxisID: 'y1', formato: 'pct', pointRadius: 3 },
        { label: 'Dívidas restantes', data: p.map((x) => x.dividasRestantes), backgroundColor: Ch.alpha(Ch.cor.emprestimo(), .5), yAxisID: 'y' }] },
        options: { scales: { y1: { position: 'right', grid: { display: false }, ticks: { callback: (v) => Math.round(v * 100) + '%', color: getComputedStyle(document.documentElement).getPropertyValue('--muted') } } } } });
    },
  };
})(window.App = window.App || {});
