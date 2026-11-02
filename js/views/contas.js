/* Contas a pagar — por mês: marcar contas como pagas e receitas como recebidas, com painel que se atualiza na hora.
 * Integra empréstimos (valor recebido como receita, parcelas como contas) e as dívidas do Simulador de dívidas. */
(function (App) {
  'use strict';
  const U = App.U, F = App.F, ui = App.ui, Ch = App.charts;
  let filtro = 'pendentes';
  const GRUPO_TXT = { fixa: 'Despesa fixa', cartao: 'Cartão de crédito', emprestimo: 'Empréstimo / acordo', variavel: 'Despesa variável', reserva: 'Reserva', divida: 'Dívida do simulador' };

  /** Junta lançamentos de despesa do mês e pagamentos de dívidas do simulador numa lista única. */
  function contasDoMes(mes) {
    const hoje = U.hojeISO();
    const ls = F.lancamentosDoMes(mes).filter((l) => l.tipo === 'despesa').map((l) => ({ chave: 'l:' + l.id, tipo: 'lan', l, descricao: l.descricao, valor: l.valor, data: l.data, temDia: !!l.diaVenc || l.origem !== 'planilha',
      grupo: App.Categorias.grupoDe(l), categoria: l.categoria, pago: l.situacao === 'pago', valorPago: F.valorPago(l), parcial: F.situacaoDe(l) === 'parcial', pagamentos: l.pagamentos || [], obs: l.observacoes, origem: l.origem === 'planilha' ? 'planilha' : l.simCartaoId ? 'empréstimo no cartão' : l.origem === 'simulacao' ? 'simulação' : 'cadastrado aqui' }));
    const ds = F.contasDividasMes(mes).map((x) => ({ chave: 'd:' + x.divida.id, tipo: 'div', d: x.divida, descricao: x.divida.nome + (x.divida.modalidade === 'parcelado' ? ' (parcela)' : ' (pagamento do mês)'), valor: x.valor, data: x.data, temDia: true,
      grupo: 'divida', categoria: 'Simulador de dívidas', pago: x.pago, valorPago: x.valorPago || 0, parcial: !!x.parcial, pagamentos: (x.divida.pagamentos || []).filter((p) => U.mesDeData(p.data) === mes), origem: 'simulador de dívidas' }));
    return ls.concat(ds).map((c) => Object.assign(c, { vencida: !c.pago && c.temDia && c.data < hoje }))
      .sort((a, b) => (a.data === b.data ? a.descricao.localeCompare(b.descricao) : a.data < b.data ? -1 : 1));
  }

  /** Registra quanto foi pago agora (pagamento parcial ou o restante). */
  function pagarParcial(c, mes) {
    const falta = U.round2(c.valor - c.valorPago);
    ui.modal({ titulo: 'Pagamento · ' + c.descricao, corpo:
      '<div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))">' + ui.kpi({ rotulo: 'Valor da conta', valor: U.brl(c.valor) }) + ui.kpi({ rotulo: 'Já pago', valor: U.brl(c.valorPago), nivel: c.valorPago ? 'good' : '' }) +
      ui.kpi({ rotulo: 'Falta pagar', valor: U.brl(falta), nivel: 'warn' }) + '</div>' +
      '<div class="form-grid">' + ui.field('Quanto você pagou agora', ui.moneyInput('valor', falta), 'Pode ser só uma parte') + ui.field('Data do pagamento', ui.input('data', mes === U.mesAtual() ? U.hojeISO() : c.data, 'type="date"')) + '</div>' +
      (c.pagamentos.length ? '<div class="small muted">Pagamentos já registrados: ' + c.pagamentos.map((p) => U.dataBR(p.data) + ' ' + U.brl(p.valor)).join(' · ') + '</div>' : ''),
    botoes: [{ texto: 'Cancelar' }, { texto: 'Registrar pagamento', classe: 'primary', acao: async (m) => {
      const v = ui.lerForm(m.body); ui.limparErros(m.body);
      let valor = U.round2(U.parseValor(v.valor));
      if (!(valor > 0)) { ui.erro(m.body, 'valor', 'Informe um valor maior que zero.'); return false; }
      if (!v.data) { ui.erro(m.body, 'data', 'Informe a data.'); return false; }
      if (c.tipo === 'lan' && valor > falta + 0.004) { ui.erro(m.body, 'valor', 'Maior que o que falta (' + U.brl(falta) + ').'); return false; }
      const pg = { id: U.uid(), data: v.data, valor, registradoEm: Date.now() };
      if (c.tipo === 'lan') {
        const pagamentos = (c.l.pagamentos || []).concat([pg]);
        const total = U.sum(pagamentos, (p) => p.valor);
        await App.store.put('lancamentos', Object.assign({}, c.l, { pagamentos, situacao: total >= c.valor - 0.004 ? 'pago' : 'pendente', situacaoPresumida: false, atualizadoEm: Date.now() }));
      } else {
        await App.store.put('dividas', Object.assign({}, c.d, { pagamentos: (c.d.pagamentos || []).concat([Object.assign(pg, { tipo: 'normal', obs: 'Contas a pagar' })]), atualizadoEm: Date.now() }));
      }
      const cx = F.caixaMes(mes);
      ui.toast('Pagamento de ' + U.brl(valor) + ' registrado' + (valor < falta - 0.004 ? ' (faltam ' + U.brl(falta - valor) + ')' : ' · conta quitada') + '. Disponível agora: ' + U.brl(cx.disponivel), 'good', 6000);
    } }] });
  }

  async function alternar(c, mes) {
    const desfazer = c.pago || c.parcial;
    if (c.tipo === 'lan') {
      await App.store.put('lancamentos', Object.assign({}, c.l, { situacao: c.pago ? 'pendente' : 'pago', pagamentos: c.pago ? [] : c.l.pagamentos, situacaoPresumida: false, atualizadoEm: Date.now() }));
    } else if (c.parcial) { // dívida com pagamento parcial: completa o que falta
      await App.store.put('dividas', Object.assign({}, c.d, { pagamentos: (c.d.pagamentos || []).concat([{ id: U.uid(), data: mes === U.mesAtual() ? U.hojeISO() : c.data, valor: U.round2(c.valor - c.valorPago), tipo: 'normal', obs: 'Contas a pagar', registradoEm: Date.now() }]), atualizadoEm: Date.now() }));
    } else {
      const d = c.d;
      const pagamentos = c.pago ? (d.pagamentos || []).filter((p) => U.mesDeData(p.data) !== mes)
        : (d.pagamentos || []).concat([{ id: U.uid(), data: mes === U.mesAtual() ? U.hojeISO() : c.data, valor: c.valor, tipo: 'normal', obs: 'Marcado em Contas a pagar', registradoEm: Date.now() }]);
      await App.store.put('dividas', Object.assign({}, d, { pagamentos, atualizadoEm: Date.now() }));
    }
    const cx = F.caixaMes(mes);
    void desfazer;
    ui.toast((c.pago ? 'Voltou para pendente. ' : 'Conta paga. ') + 'Disponível agora: ' + U.brl(cx.disponivel) + ' · falta pagar: ' + U.brl(cx.aPagar), 'good');
  }

  App.views.contas = {
    render(view, acoes) {
      if (!App.store.state.lancamentos.length) { view.innerHTML = ui.semDados(); return; }
      App.mesNav(acoes);
      const mes = App.sel.mes;
      const cx = F.caixaMes(mes), r = F.resumoMes(mes);
      const contas = contasDoMes(mes);
      const receitas = F.lancamentosDoMes(mes).filter((l) => l.tipo === 'receita').sort((a, b) => (a.data < b.data ? -1 : 1));
      const vencidas = contas.filter((c) => c.vencida);
      const lista = contas.filter((c) => (filtro === 'pendentes' ? !c.pago : filtro === 'pagas' ? c.pago : filtro === 'vencidas' ? c.vencida : true));
      const parcelasEmp = contas.filter((c) => c.grupo === 'emprestimo' || c.grupo === 'divida' || (c.l && c.l.simCartaoId));
      const nivelDisp = cx.disponivel < 0 ? 'bad' : 'good';

      const linha = (c) => '<div class="list-item"><span class="stripe ' + (c.pago ? 'good' : c.vencida ? 'bad' : 'warn') + '"></span><div><div class="t">' + U.esc(c.descricao) + (c.parcial ? ' <span class="pill warn">parcial</span>' : '') + '</div><div class="s">' +
        U.esc(GRUPO_TXT[c.grupo] || c.categoria) + ' · ' + (c.temDia ? 'vence ' + U.dataBR(c.data) : 'sem dia de vencimento') + ' · ' + c.origem + (c.vencida ? ' · <span class="neg">vencida</span>' : '') +
        (c.parcial ? '<br><span class="pos">pago ' + U.brl(c.valorPago) + '</span> · <span class="wrn">falta ' + U.brl(c.valor - c.valorPago) + '</span>' + (c.pagamentos.length ? ' · ' + c.pagamentos.map((p) => U.dataBR(p.data) + ' ' + U.brl(p.valor)).join(', ') : '') : '') + '</div></div>' +
        '<div class="actions" style="align-items:center;flex-wrap:wrap;justify-content:flex-end"><span class="v" style="margin-right:8px">' + U.brl(c.valor) + '</span>' +
        (c.pago ? '<span class="pill good">paga</span><button class="btn sm" data-c="' + c.chave + '">Desfazer</button>'
          : '<button class="btn sm primary" data-c="' + c.chave + '" title="Pagar o valor ' + (c.parcial ? 'que falta' : 'inteiro') + '">' + ui.icon('check') + (c.parcial ? 'Pagar o resto' : 'Paga') + '</button>' +
            '<button class="btn sm" data-p="' + c.chave + '" title="Informar um valor pago">Parcial</button>' + (c.parcial ? '<button class="btn sm" data-z="' + c.chave + '" title="Apagar os pagamentos deste mês">Desfazer</button>' : '')) +
        (c.tipo === 'lan' ? '<button class="btn sm" data-ed="' + c.l.id + '" aria-label="Editar">' + ui.icon('edit') + '</button>' : '') + '</div></div>';

      view.innerHTML = App.avisosPlanilha() +
        (vencidas.length ? '<div class="banner bad">' + ui.icon('alert') + '<div><b>' + vencidas.length + ' conta(s) vencida(s) sem pagamento</b>' + vencidas.map((c) => U.esc(c.descricao) + ' (' + U.brl(c.valor) + ')').join(', ') + '.</div></div>' : '') +
        '<section class="kpis" aria-label="Resumo do mês">' +
        ui.kpi({ rotulo: 'Receitas do mês', valor: U.brl(cx.receitas), icone: 'wallet', sub: cx.emprestimos ? 'inclui ' + U.brl(cx.emprestimos) + ' de empréstimo' : 'salários e outras entradas' }) +
        ui.kpi({ rotulo: 'Já recebido', valor: U.brl(cx.recebido), icone: 'check', nivel: cx.aReceber ? '' : 'good', sub: cx.aReceber ? 'a receber: ' + U.brl(cx.aReceber) : 'tudo recebido' }) +
        ui.kpi({ rotulo: 'Despesas do mês', valor: U.brl(cx.despesas), icone: 'cash', sub: contas.length + ' contas' + (cx.dividas.length ? ' (inclui dívidas do simulador)' : '') }) +
        ui.kpi({ rotulo: 'Já pago', valor: U.brl(cx.pago), icone: 'check', nivel: 'good', barra: cx.pctPago, sub: U.pct(cx.pctPago) + ' do total · ' + contas.filter((c) => c.pago).length + ' de ' + contas.length + ' quitadas' + (contas.some((c) => c.parcial) ? ' · ' + contas.filter((c) => c.parcial).length + ' parcial(is)' : '') }) +
        ui.kpi({ rotulo: 'Falta pagar', valor: U.brl(cx.aPagar), icone: 'alert', nivel: cx.aPagar ? 'warn' : 'good', sub: contas.filter((c) => !c.pago).length + ' conta(s)' + (vencidas.length ? ' · ' + vencidas.length + ' vencida(s)' : '') }) +
        ui.kpi({ rotulo: 'Disponível agora', valor: U.brl(cx.disponivel), icone: 'wallet', nivel: nivelDisp, sub: 'já recebido − já pago' }) +
        ui.kpi({ rotulo: 'Saldo previsto no fim do mês', valor: U.brl(cx.previsto), icone: 'trend', nivel: cx.previsto < 0 ? 'bad' : 'good', sub: cx.previsto < 0 ? 'faltam ' + U.brl(-cx.previsto) + ' para pagar tudo' : 'sobra depois de pagar tudo' }) +
        ui.kpi({ rotulo: 'Empréstimos e parcelas', valor: U.brl(U.sum(parcelasEmp, (c) => c.valor)), icone: 'debt', sub: 'pago ' + U.brl0(U.sum(parcelasEmp.filter((c) => c.pago), (c) => c.valor)) + ' · empréstimos recebidos ' + U.brl0(cx.emprestimos) }) +
        '</section>' +
        '<div class="grid g-2-1">' +
        '<section class="panel"><div class="panel-head"><h2 style="margin:0">Contas de ' + U.mesLongo(mes) + '</h2><div class="seg" id="filtro">' +
        [['pendentes', 'A pagar'], ['vencidas', 'Vencidas'], ['pagas', 'Pagas'], ['todas', 'Todas']].map(([v, t]) => '<button data-f="' + v + '" class="' + (filtro === v ? 'on' : '') + '">' + t + ' (' +
          contas.filter((c) => (v === 'pendentes' ? !c.pago : v === 'pagas' ? c.pago : v === 'vencidas' ? c.vencida : true)).length + ')</button>').join('') + '</div></div>' +
        '<div class="list">' + (lista.map(linha).join('') || '<p class="muted">' + (filtro === 'pendentes' ? 'Nenhuma conta a pagar neste mês.' : 'Nada aqui.') + '</p>') + '</div>' +
        '<div class="actions" style="justify-content:space-between;margin-top:12px;flex-wrap:wrap"><button class="btn sm" id="novaConta">' + ui.icon('plus') + 'Nova conta ou compra</button>' +
        (contas.some((c) => !c.pago && c.tipo === 'lan') ? '<button class="btn sm" id="pagarTodas">Marcar todas como pagas</button>' : '') + '</div></section>' +
        '<div style="display:flex;flex-direction:column;gap:16px">' +
        '<section class="panel"><h2>Andamento do mês</h2><div class="chart-box short"><canvas id="chAnd"></canvas></div></section>' +
        '<section class="panel"><h2>Receitas do mês</h2><div class="list">' + (receitas.map((l) => { const ok = F.recebida(l);
          return '<div class="list-item"><span class="stripe ' + (ok ? 'good' : '') + '"></span><div><div class="t">' + U.esc(l.descricao) + '</div><div class="s">' + U.esc(l.categoria) + ' · ' + U.dataBR(l.data) + '</div></div>' +
            '<div class="actions" style="align-items:center"><span class="v pos" style="margin-right:8px">' + U.brl(l.valor) + '</span><button class="chip ' + (ok ? 'on' : 'off') + '" data-r="' + l.id + '">' + (ok ? 'recebido' : 'a receber') + '</button></div></div>'; }).join('') || '<p class="muted">Sem receitas neste mês.</p>') +
        '</div><p class="hint">Receitas contam como recebidas quando você marca, ou quando a data delas chega. Empréstimos efetivados no Simulador de cartão aparecem aqui como "Empréstimo recebido".</p></section></div></div>' +
        '<section class="panel"><h2>Despesas por tipo: pago e a pagar</h2><div class="chart-box"><canvas id="chGrp"></canvas></div></section>';

      view.querySelectorAll('#filtro button').forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.f; App.render(); }));
      view.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { const c = contas.find((x) => x.chave === b.dataset.c); if (c) alternar(c, mes); }));
      view.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { const c = contas.find((x) => x.chave === b.dataset.p); if (c) pagarParcial(c, mes); }));
      view.querySelectorAll('[data-z]').forEach((b) => b.addEventListener('click', async () => { const c = contas.find((x) => x.chave === b.dataset.z); if (!c) return;
        if (!(await ui.confirmar('Desfazer pagamentos', 'Apagar os pagamentos parciais de "' + U.esc(c.descricao) + '" (' + U.brl(c.valorPago) + ')?', 'Apagar', true))) return;
        if (c.tipo === 'lan') await App.store.put('lancamentos', Object.assign({}, c.l, { pagamentos: [], situacao: 'pendente', atualizadoEm: Date.now() }));
        else await App.store.put('dividas', Object.assign({}, c.d, { pagamentos: (c.d.pagamentos || []).filter((p) => U.mesDeData(p.data) !== mes), atualizadoEm: Date.now() }));
      }));
      view.querySelectorAll('[data-ed]').forEach((b) => b.addEventListener('click', () => App.editarLancamento(App.store.state.lancamentos.find((l) => l.id === b.dataset.ed))));
      view.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', async () => {
        const l = App.store.state.lancamentos.find((x) => x.id === b.dataset.r); const ok = F.recebida(l);
        await App.store.put('lancamentos', Object.assign({}, l, { situacao: ok ? 'pendente' : 'pago', situacaoPresumida: false, atualizadoEm: Date.now() }));
        ui.toast((ok ? 'Marcado como a receber. ' : 'Recebido. ') + 'Disponível agora: ' + U.brl(F.caixaMes(mes).disponivel), 'good');
      }));
      view.querySelector('#novaConta').addEventListener('click', () => App.editarLancamento(null));
      const pt = view.querySelector('#pagarTodas');
      if (pt) pt.addEventListener('click', async () => {
        const pend = contas.filter((c) => !c.pago && c.tipo === 'lan');
        if (!(await ui.confirmar('Marcar todas como pagas', 'Marcar as ' + pend.length + ' contas pendentes de ' + U.mesLongo(mes) + ' (' + U.brl(U.sum(pend, (c) => c.valor)) + ') como pagas?' +
          (contas.some((c) => !c.pago && c.tipo === 'div') ? '<br>As dívidas do simulador ficam de fora: marque uma a uma para registrar o pagamento.' : ''), 'Marcar'))) return;
        await App.store.putMany('lancamentos', pend.map((c) => Object.assign({}, c.l, { situacao: 'pago', situacaoPresumida: false, atualizadoEm: Date.now() })));
      });

      Ch.render('chAnd', { type: 'doughnut', data: { labels: ['Já pago', 'Falta pagar', 'Disponível'], datasets: [{ data: [cx.pago, cx.aPagar, Math.max(0, cx.disponivel)],
        backgroundColor: [Ch.cor.good(), Ch.cor.warn(), Ch.alpha(Ch.cor.accent(), .35)], borderWidth: 0 }] }, options: { cutout: '62%' } });
      const grupos = ['fixa', 'cartao', 'emprestimo', 'variavel', 'divida', 'reserva'].filter((g) => contas.some((c) => c.grupo === g));
      Ch.render('chGrp', { type: 'bar', data: { labels: grupos.map((g) => GRUPO_TXT[g]), datasets: [
        { label: 'Pago', data: grupos.map((g) => U.sum(contas.filter((c) => c.grupo === g), (c) => (c.pago ? c.valor : c.valorPago))), backgroundColor: Ch.cor.good(), stack: 's' },
        { label: 'A pagar', data: grupos.map((g) => U.sum(contas.filter((c) => c.grupo === g && !c.pago), (c) => c.valor - c.valorPago)), backgroundColor: Ch.cor.warn(), stack: 's' }] },
        options: { indexAxis: 'y', scales: { x: { stacked: true, ticks: { callback: (v) => U.brl0(v) } }, y: { stacked: true, grid: { display: false }, ticks: { callback: function (v) { return this.getLabelForValue(v); } } } } } });
    },
  };
})(window.App = window.App || {});
