/* Pagamentos por data — quanto falta pagar em cada dia (ou semana) de um período, e se o dinheiro dá. */
(function (App) {
  'use strict';
  const U = App.U, F = App.F, ui = App.ui, Ch = App.charts;
  let preset = 'mes', de = null, ate = null, agrupar = 'dia';

  const somaDias = (iso, n) => new Date(Date.parse(iso + 'T12:00:00') + n * 864e5).toISOString().slice(0, 10);
  const fimDoMes = (mes) => somaDias(U.mesAdd(mes, 1) + '-01', -1);
  const segunda = (iso) => { const d = new Date(iso + 'T12:00:00'); const w = (d.getDay() + 6) % 7; return somaDias(iso, -w); };
  const diaSemana = (iso) => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(iso + 'T12:00:00').getDay()];

  function periodo() {
    const hoje = U.hojeISO(), mes = U.mesAtual();
    if (preset === '7') return [hoje, somaDias(hoje, 6)];
    if (preset === '15') return [hoje, somaDias(hoje, 14)];
    if (preset === '30') return [hoje, somaDias(hoje, 29)];
    if (preset === 'mes') return [hoje, fimDoMes(mes)];
    if (preset === 'prox') return [U.mesAdd(mes, 1) + '-01', fimDoMes(U.mesAdd(mes, 1))];
    return [de || hoje, ate || fimDoMes(mes)];
  }

  /** Tudo que falta pagar (e receber) entre duas datas. Fatura de cartão = uma linha por cartão e mês. */
  function montar(ini, fim) {
    const st = App.store.state, hoje = U.hojeISO(), limiteVencidas = somaDias(hoje, -90);
    const pagar = [], receber = [], vencidas = [];
    const faturas = new Map();
    st.lancamentos.forEach((l) => {
      if (!l.data) return;
      if (l.tipo === 'receita') {
        if (l.data >= ini && l.data <= fim && l.situacao !== 'pago' && !(l.data <= hoje && l.situacaoPresumida !== false))
          receber.push({ data: l.data, descricao: l.descricao, valor: l.valor });
        return;
      }
      if (l.tipo !== 'despesa') return;
      const falta = U.round2(l.valor - F.valorPago(l));
      if (falta <= 0.004) return;
      const card = l.cartaoId && st.cartoes.find((c) => c.id === l.cartaoId);
      if (card && card.tipo !== 'emprestimo') {
        const k = card.id + '|' + l.mesRef;
        const f = faturas.get(k) || { chave: 'f:' + k, tipo: 'fatura', descricao: 'Fatura ' + card.nome, data: null, valor: 0, itens: [], grupo: 'cartao' };
        f.itens.push(l); f.valor = U.round2(f.valor + falta);
        // vencimento da fatura: o da linha da planilha; sem ela, o das compras (todas vencem no mesmo dia)
        if (l.origem === 'planilha') f.temPlanilha = true, f.data = l.data; else if (!f.temPlanilha && (!f.data || l.data < f.data)) f.data = l.data;
        faturas.set(k, f); return;
      }
      const item = { chave: 'l:' + l.id, tipo: 'lan', descricao: l.descricao, data: l.data, valor: falta, itens: [l], grupo: App.Categorias.grupoDe(l), parcial: F.valorPago(l) > 0.004 };
      if (item.data < hoje) { if (item.data >= limiteVencidas) vencidas.push(item); }
      else if (item.data >= ini && item.data <= fim) pagar.push(item);
    });
    faturas.forEach((f) => {
      if (f.itens.length > 1) f.descricao += ' · ' + f.itens.length + ' lançamentos';
      if (f.data < hoje) { if (f.data >= limiteVencidas) vencidas.push(f); } else if (f.data >= ini && f.data <= fim) pagar.push(f);
    });
    // dívidas do simulador
    U.mesRange(U.mesDeData(ini), U.mesDeData(fim)).forEach((m) => {
      F.contasDividasMes(m).forEach((r) => {
        if (r.pago || !(r.valor > 0)) return;
        const falta = U.round2(r.valor - (r.valorPago || 0)); if (falta <= 0.004) return;
        const item = { chave: 'd:' + r.divida.id + ':' + m, tipo: 'divida', descricao: 'Dívida: ' + r.divida.nome, data: r.data, valor: falta, itens: [], grupo: 'emprestimo' };
        if (r.data >= ini && r.data <= fim && r.data >= hoje) pagar.push(item);
      });
    });
    const ord = (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : b.valor - a.valor);
    return { pagar: pagar.sort(ord), receber: receber.sort(ord), vencidas: vencidas.sort(ord) };
  }
  App.agenda = { montar, periodo: () => periodo() };

  async function marcarPago(item) {
    if (item.tipo === 'divida') { location.hash = '#dividas'; return; }
    await App.store.putMany('lancamentos', item.itens.map((l) => Object.assign({}, l, { situacao: 'pago', situacaoPresumida: false })));
    ui.toast(item.descricao.split(' · ')[0] + ' marcada como paga.', 'good');
  }

  App.views.agenda = {
    render(view, acoes) {
      if (!App.store.state.lancamentos.length) { view.innerHTML = ui.semDados(); return; }
      acoes.innerHTML = '';
      const [ini, fim] = periodo();
      const { pagar, receber, vencidas } = montar(ini, fim);
      const totPagar = U.round2(U.sum(pagar, (x) => x.valor)), totVenc = U.round2(U.sum(vencidas, (x) => x.valor)), totRec = U.round2(U.sum(receber, (x) => x.valor));
      const disp = F.caixaMes(U.mesAtual()).disponivel;
      const saldoFim = U.round2(disp + totRec - totPagar - totVenc);
      const chave = (iso) => (agrupar === 'semana' ? segunda(iso) : iso);
      const grupos = new Map();
      pagar.forEach((x) => { const k = chave(x.data); const g = grupos.get(k) || { k, itens: [], total: 0, receitas: 0 }; g.itens.push(x); g.total = U.round2(g.total + x.valor); grupos.set(k, g); });
      receber.forEach((x) => { const k = chave(x.data); const g = grupos.get(k) || { k, itens: [], total: 0, receitas: 0 }; g.receitas = U.round2(g.receitas + x.valor); grupos.set(k, g); });
      const lista = [...grupos.values()].sort((a, b) => (a.k < b.k ? -1 : 1));
      let acum = 0, saldo = U.round2(disp - totVenc);
      lista.forEach((g) => { acum = U.round2(acum + g.total); saldo = U.round2(saldo + g.receitas - g.total); g.acum = acum; g.saldo = saldo; });
      const rotulo = (g) => (agrupar === 'semana' ? 'Semana de ' + U.dataBR(g.k) + ' a ' + U.dataBR(somaDias(g.k, 6)) : U.dataBR(g.k) + ' (' + diaSemana(g.k) + ')' + (g.k === U.hojeISO() ? ' · hoje' : ''));
      const presets = [['7', 'Próximos 7 dias'], ['15', 'Próximos 15 dias'], ['30', 'Próximos 30 dias'], ['mes', 'Até o fim do mês'], ['prox', 'Próximo mês'], ['livre', 'Escolher datas']];
      const linhaItem = (x) => '<div class="ag-item"><span class="dot g-' + (x.grupo || 'fixa') + '"></span><span class="ag-desc">' + U.esc(x.descricao) + (x.parcial ? ' <span class="pill warn">parcial</span>' : '') + '</span>' +
        '<span class="ag-val">' + U.brl(x.valor) + '</span>' + (x.tipo !== 'divida' ? '<button class="btn sm" data-pg="' + U.esc(x.chave) + '">' + ui.icon('check') + 'Paga</button>' : '<a class="btn sm" href="#dividas">Registrar</a>') + '</div>';

      view.innerHTML = App.avisosPlanilha() +
        '<section class="panel" style="padding:12px 16px"><div class="chips" role="group" aria-label="Período">' +
        presets.map((p) => '<button class="chip' + (preset === p[0] ? ' on' : '') + '" data-pre="' + p[0] + '">' + p[1] + '</button>').join('') + '</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:10px">' +
        '<label class="field" style="margin:0"><span>De</span><input type="date" id="agDe" value="' + ini + '"></label>' +
        '<label class="field" style="margin:0"><span>Até</span><input type="date" id="agAte" value="' + fim + '"></label>' +
        '<label class="field" style="margin:0"><span>Mostrar por</span>' + ui.select('agAgr', [{ v: 'dia', t: 'Dia' }, { v: 'semana', t: 'Semana' }], agrupar) + '</label></div></section>' +

        '<section class="kpis">' +
        ui.kpi({ rotulo: 'A pagar no período', valor: U.brl(totPagar), icone: 'calendar', sub: pagar.length + ' conta(s) de ' + U.dataBR(ini) + ' a ' + U.dataBR(fim) }) +
        ui.kpi({ rotulo: 'Vencidas sem pagar', valor: U.brl(totVenc), icone: 'alert', nivel: totVenc > 0 ? 'bad' : 'good', sub: totVenc > 0 ? vencidas.length + ' conta(s) dos últimos 90 dias' : 'nenhuma conta atrasada' }) +
        ui.kpi({ rotulo: 'A receber no período', valor: U.brl(totRec), icone: 'wallet', sub: receber.length ? receber.length + ' receita(s) ainda não recebida(s)' : 'nenhuma receita prevista' }) +
        ui.kpi({ rotulo: 'Sobra no fim do período', valor: U.brl(saldoFim), icone: 'cash', nivel: saldoFim < 0 ? 'bad' : 'good',
          sub: 'disponível agora ' + U.brl(disp) + ' + a receber − a pagar − vencidas', titulo: 'Disponível agora (recebido − pago no mês atual) + receitas ainda não recebidas no período − contas a pagar no período − contas vencidas.' }) +
        '</section>' +

        (vencidas.length ? '<section class="panel"><div class="panel-head"><h2 style="margin:0">Vencidas sem pagar</h2><span class="pill bad">' + U.brl(totVenc) + '</span></div>' +
          vencidas.map((x) => '<div class="ag-dia"><div class="ag-data">' + U.dataBR(x.data) + '</div>' + linhaItem(x) + '</div>').join('') + '</section>' : '') +

        '<div class="grid g-2-1"><section class="panel"><h2>Contas por ' + (agrupar === 'semana' ? 'semana' : 'data') + '</h2>' +
        (lista.length ? lista.map((g) => '<div class="ag-dia"><div class="ag-head"><b>' + rotulo(g) + '</b><span>' + (g.total ? '<b>' + U.brl(g.total) + '</b>' : '') +
          (g.receitas ? ' <span class="pos">+ ' + U.brl(g.receitas) + ' a receber</span>' : '') + '</span></div>' +
          g.itens.map(linhaItem).join('') +
          '<div class="ag-foot">acumulado ' + U.brl(g.acum) + ' · <span class="' + (g.saldo < 0 ? 'neg' : 'pos') + '">sobra depois: ' + U.brl(g.saldo) + '</span></div></div>').join('')
          : '<p class="muted">Nada a pagar neste período.</p>') + '</section>' +
        '<section class="panel"><h2>Quanto sai em cada ' + (agrupar === 'semana' ? 'semana' : 'data') + '</h2><div class="chart-box"><canvas id="chAg"></canvas></div>' +
        '<p class="hint">Barras: valor a pagar. Linha: quanto sobra depois de cada pagamento, partindo do disponível agora menos as vencidas.</p></section></div>';

      view.querySelectorAll('[data-pre]').forEach((b) => b.addEventListener('click', () => { preset = b.dataset.pre; if (preset === 'livre') { de = ini; ate = fim; } App.render(); }));
      const datas = () => { preset = 'livre'; de = view.querySelector('#agDe').value || ini; ate = view.querySelector('#agAte').value || fim; if (ate < de) ate = de; App.render(); };
      view.querySelector('#agDe').addEventListener('change', datas);
      view.querySelector('#agAte').addEventListener('change', datas);
      view.querySelector('[name=agAgr]').addEventListener('change', (e) => { agrupar = e.target.value; App.render(); });
      const todos = new Map(pagar.concat(vencidas).map((x) => [x.chave, x]));
      view.querySelectorAll('[data-pg]').forEach((b) => b.addEventListener('click', () => marcarPago(todos.get(b.dataset.pg))));
      if (lista.length) Ch.render('chAg', { type: 'bar', data: { labels: lista.map((g) => (agrupar === 'semana' ? U.dataBR(g.k).slice(0, 5) : U.dataBR(g.k).slice(0, 5))), datasets: [
        { type: 'bar', label: 'A pagar', data: lista.map((g) => g.total), backgroundColor: Ch.alpha(Ch.cor.bad() || '#c2412d', 0.75), order: 2 },
        { type: 'line', label: 'Sobra depois', data: lista.map((g) => g.saldo), borderColor: Ch.cor.accent(), backgroundColor: Ch.cor.accent(), tension: 0.25, pointRadius: 3, order: 1 }] } });
    },
  };
})(window.App = window.App || {});
