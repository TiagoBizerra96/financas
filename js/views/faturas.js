/* Faturas — todas as compras de cada fatura de cada cartão: Open Finance, cadastradas aqui e o valor da planilha. */
(function (App) {
  'use strict';
  const U = App.U, F = App.F, ui = App.ui, Ch = App.charts;
  let cartaoSel = null, mesSel = null, busca = '';

  const ehCartao = (c) => c.tipo !== 'emprestimo';
  const doCartao = (cid) => App.store.state.lancamentos.filter((l) => l.cartaoId === cid && l.tipo === 'despesa');
  const OF = () => App.openfinance;

  /** Conta do Open Finance associada a este cartão (se houver). */
  function contaOF(cid) {
    const d = OF() && OF().dados(); if (!d) return null;
    const mapa = OF().mapa(); return (d.contas || []).find((c) => mapa[c.id] && mapa[c.id].cartaoId === cid) || null;
  }
  function dias(card) {
    const co = contaOF(card.id);
    const venc = card.diaVencimento || (co && co.vencimento ? +co.vencimento.slice(8, 10) : null);
    let fech = card.diaFechamento || (co && co.fechamento ? +co.fechamento.slice(8, 10) : null);
    if (!fech && venc) fech = ((venc - 8 + 30) % 30) || 30;
    return { venc, fech, fechInformado: !!(card.diaFechamento || (co && co.fechamento)) };
  }
  /** Datas de fechamento e vencimento da fatura do mês (mês = mês do vencimento). */
  function datasDaFatura(card, mes) {
    const d = dias(card);
    const venc = d.venc ? U.dataNoMes(mes, d.venc) : null;
    const fech = d.fech ? U.dataNoMes(d.venc && d.venc > d.fech ? mes : U.mesAdd(mes, -1), d.fech) : null;
    return { venc, fech, d };
  }
  function faturaAberta(card) {
    const d = dias(card); const hoje = U.hojeISO();
    if (!d.fech) return U.mesAtual();
    return OF() ? OF()._mesDaFatura(hoje, d) : U.mesAtual();
  }
  const dataCompraDe = (l) => {
    if (l.dataCompra) return l.dataCompra;
    if (l.ofData) return l.ofData;
    const m = /compra de .*? em (\d{2})\/(\d{2})\/(\d{4})/i.exec(l.observacoes || '') || /compra em (\d{2})\/(\d{2})\/(\d{4})/i.exec(l.observacoes || '');
    return m ? m[3] + '-' + m[2] + '-' + m[1] : null;
  };
  const origemDe = (l) => (l.origem === 'openfinance' ? (l.projetado ? 'Parcela prevista' : 'Open Finance') : l.origem === 'planilha' ? 'Planilha' : l.simCartaoId ? 'Empréstimo no cartão' : 'Cadastrada aqui');

  App.views.faturas = {
    render(view, acoes) {
      const st = App.store.state;
      const cartoes = st.cartoes.filter(ehCartao).filter((c) => doCartao(c.id).length).sort((a, b) => a.nome.localeCompare(b.nome));
      if (!cartoes.length) { view.innerHTML = ui.semDados(); return; }
      acoes.innerHTML = '<button class="btn primary" id="novaCompra">' + ui.icon('plus') + 'Nova compra</button>';
      acoes.querySelector('#novaCompra').addEventListener('click', () => App.editarLancamento(null));
      // cartão padrão: o primeiro ligado ao Open Finance, senão o de maior fatura no mês
      if (!cartaoSel || !cartoes.some((c) => c.id === cartaoSel)) {
        const comOF = cartoes.find((c) => contaOF(c.id));
        cartaoSel = (comOF || cartoes.slice().sort((a, b) => U.sum(doCartao(b.id).filter((l) => l.mesRef === App.sel.mes), (l) => l.valor) - U.sum(doCartao(a.id).filter((l) => l.mesRef === App.sel.mes), (l) => l.valor))[0]).id;
        mesSel = null;
      }
      const card = st.cartoes.find((c) => c.id === cartaoSel);
      const todos = doCartao(card.id);
      const meses = [...new Set(todos.map((l) => l.mesRef))].sort();
      const aberta = faturaAberta(card);
      if (!mesSel || !meses.includes(mesSel)) mesSel = meses.includes(aberta) ? aberta : (meses.find((m) => m >= U.mesAtual()) || meses[meses.length - 1]);
      const itens = todos.filter((l) => l.mesRef === mesSel);
      const { venc, fech, d } = datasDaFatura(card, mesSel);
      const hoje = U.hojeISO();
      const total = U.round2(U.sum(itens, (l) => l.valor));
      const pago = U.round2(U.sum(itens, (l) => F.valorPago(l)));
      const falta = U.round2(total - pago);
      const paga = itens.length && itens.every((l) => l.situacao === 'pago');
      const situacao = paga ? 'Paga' : fech && hoje < fech ? 'Aberta' : venc && hoje > venc ? 'Vencida' : 'Fechada';
      const nivelSit = { Paga: 'good', Aberta: '', Fechada: 'warn', Vencida: 'bad' }[situacao];
      const compras = itens.filter((l) => l.origem !== 'planilha');
      const planilha = itens.filter((l) => l.origem === 'planilha');
      const co = contaOF(card.id);
      const oficial = co && (co.faturas || []).find((f) => f.vencimento && U.mesDeData(f.vencimento) === mesSel);
      const limiteDisp = card.limite != null && card.limiteUsado != null ? U.round2(card.limite - card.limiteUsado) : null;
      const q = U.norm(busca);
      const lista = compras.filter((l) => !q || U.norm(l.descricao + ' ' + (l.observacoes || '')).indexOf(q) > -1)
        .sort((a, b) => ((dataCompraDe(b) || '') < (dataCompraDe(a) || '') ? -1 : 1));
      const idx = meses.indexOf(mesSel);

      view.innerHTML = App.avisosPlanilha() +
        '<section class="panel" style="padding:12px 16px"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
        '<label class="field" style="margin:0;min-width:220px;flex:1"><span>Cartão</span>' + ui.select('fCartao', cartoes.map((c) => ({ v: c.id, t: c.nome + (contaOF(c.id) ? ' · Open Finance' : '') })), card.id) + '</label>' +
        '<div style="display:flex;gap:6px;align-items:flex-end"><button class="icon-btn" id="mAnt" aria-label="Fatura anterior"' + (idx <= 0 ? ' disabled' : '') + '>‹</button>' +
        '<label class="field" style="margin:0"><span>Fatura com vencimento em</span>' + ui.select('fMes', meses.map((m) => ({ v: m, t: U.mesLongo(m) + (m === aberta ? ' (aberta)' : '') })), mesSel) + '</label>' +
        '<button class="icon-btn" id="mProx" aria-label="Próxima fatura"' + (idx >= meses.length - 1 ? ' disabled' : '') + '>›</button></div></div></section>' +

        '<section class="kpis">' +
        ui.kpi({ rotulo: 'Total da fatura', valor: U.brl(total), icone: 'card', sub: compras.length + ' compra(s)' + (planilha.length && U.sum(planilha, (l) => l.valor) > 0.004 ? ' + ' + U.brl(U.sum(planilha, (l) => l.valor)) + ' da planilha' : '') }) +
        ui.kpi({ rotulo: 'Situação', valor: situacao, icone: 'calendar', nivel: nivelSit, sub: (fech ? 'fecha ' + U.dataBR(fech) + (d.fechInformado ? '' : ' (estimado)') : 'sem dia de fechamento') + (venc ? ' · vence ' + U.dataBR(venc) : '') }) +
        ui.kpi({ rotulo: 'Já pago', valor: U.brl(pago), icone: 'check', nivel: paga ? 'good' : '', barra: total ? pago / total : 0, sub: falta > 0.004 ? 'falta ' + U.brl(falta) : 'nada a pagar' }) +
        (oficial && oficial.total != null ? ui.kpi({ rotulo: 'Valor oficial do banco', valor: U.brl(oficial.total), icone: 'check', nivel: Math.abs(oficial.total - total) <= 0.5 ? 'good' : 'warn', sub: Math.abs(oficial.total - total) <= 0.5 ? 'confere com o painel' : 'diferença de ' + U.brl(oficial.total - total) + ' (ajuste em Cartões)' })
          : ui.kpi({ rotulo: 'Limite disponível', valor: limiteDisp != null ? U.brl(limiteDisp) : '—', icone: 'wallet', sub: card.limite != null ? 'de ' + U.brl(card.limite) + (co ? ' · informado pelo banco' : '') : 'cadastre o limite em Cartões' })) +
        '</section>' +

        '<div class="grid g-2-1"><section class="panel"><div class="panel-head"><h2 style="margin:0">Compras da fatura</h2>' +
        '<input class="inp" id="fBusca" type="search" placeholder="Procurar compra…" value="' + U.esc(busca) + '" style="max-width:220px"></div>' +
        (lista.length ? '<div class="table-wrap"><table><thead><tr><th>Data da compra</th><th>Descrição</th><th>Origem</th><th class="num">Valor</th><th></th></tr></thead><tbody>' +
          lista.map((l) => '<tr><td>' + (dataCompraDe(l) ? U.dataBR(dataCompraDe(l)) : '—') + '</td><td>' + U.esc(l.descricao) + (l.situacao === 'pago' ? ' <span class="pill good">paga</span>' : F.situacaoDe(l) === 'parcial' ? ' <span class="pill warn">parcial</span>' : '') + '</td>' +
            '<td><span class="small ' + (l.projetado ? 'muted' : '') + '">' + origemDe(l) + '</span></td><td class="num">' + U.brl(l.valor) + '</td>' +
            '<td class="actions"><button class="btn sm" data-ed="' + l.id + '" aria-label="Editar">' + ui.icon('edit') + '</button></td></tr>').join('') +
          '</tbody><tfoot><tr><td colspan="3"><b>Total das compras' + (q ? ' (filtradas)' : '') + '</b></td><td class="num"><b>' + U.brl(U.sum(lista, (l) => l.valor)) + '</b></td><td></td></tr></tfoot></table></div>'
          : '<p class="muted">' + (q ? 'Nenhuma compra encontrada.' : 'Nenhuma compra lançada nesta fatura' + (co ? ' (o banco atualiza o Open Finance cerca de uma vez por dia).' : '. Ligue o Open Finance em Cartões ou use "Nova compra".')) + '</p>') +
        (planilha.length ? '<p class="hint">' + planilha.map((l) => 'Valor da planilha (' + U.esc(l.descricao) + '): ' + U.brl(l.valor) + (l.ofZerado != null ? ' — substituído pelo banco (era ' + U.brl(l.ofZerado) + ')' : '')).join(' · ') + '</p>' : '') +
        '<div class="actions" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap">' +
        (paga ? '<button class="btn" id="fDesfazer">Desfazer pagamento</button>' : '<button class="btn primary" id="fPagar">' + ui.icon('check') + 'Marcar fatura como paga (' + U.brl(falta) + ')</button><a class="btn" href="#contas">Pagamento parcial em Contas a pagar</a>') + '</div></section>' +
        '<section class="panel"><h2>Próximas faturas deste cartão</h2><div class="chart-box"><canvas id="chFat"></canvas></div><p class="hint">Parcelas já lançadas (Open Finance, cadastradas aqui e planilha).</p></section></div>';

      const q$ = (s) => view.querySelector(s);
      q$('[name=fCartao]').addEventListener('change', (e) => { cartaoSel = e.target.value; mesSel = null; App.render(); });
      q$('[name=fMes]').addEventListener('change', (e) => { mesSel = e.target.value; App.render(); });
      q$('#mAnt').addEventListener('click', () => { mesSel = meses[idx - 1]; App.render(); });
      q$('#mProx').addEventListener('click', () => { mesSel = meses[idx + 1]; App.render(); });
      let t = null; q$('#fBusca').addEventListener('input', (e) => { busca = e.target.value; clearTimeout(t); t = setTimeout(() => { App.render(); const b = document.getElementById('fBusca'); if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); } }, 250); });
      view.querySelectorAll('[data-ed]').forEach((b) => b.addEventListener('click', () => App.editarLancamento(st.lancamentos.find((l) => l.id === b.dataset.ed))));
      const pg = q$('#fPagar'); if (pg) pg.addEventListener('click', async () => {
        await App.store.putMany('lancamentos', itens.map((l) => Object.assign({}, l, { situacao: 'pago', situacaoPresumida: false })));
        ui.toast('Fatura de ' + U.mesLongo(mesSel) + ' paga. Disponível agora: ' + U.brl(F.caixaMes(mesSel).disponivel), 'good');
      });
      const dz = q$('#fDesfazer'); if (dz) dz.addEventListener('click', async () => {
        await App.store.putMany('lancamentos', itens.map((l) => Object.assign({}, l, { situacao: 'pendente', pagamentos: [], situacaoPresumida: false })));
        ui.toast('Fatura voltou para pendente.', 'good');
      });
      const prox = U.mesRange(aberta, U.mesAdd(aberta, 5));
      Ch.render('chFat', { type: 'bar', data: { labels: prox.map(U.mesLabel), datasets: [
        { label: 'Compras', data: prox.map((m) => U.sum(todos.filter((l) => l.mesRef === m && l.origem !== 'planilha'), (l) => l.valor)), backgroundColor: Ch.cor.accent(), stack: 'f' },
        { label: 'Planilha', data: prox.map((m) => U.sum(todos.filter((l) => l.mesRef === m && l.origem === 'planilha'), (l) => l.valor)), backgroundColor: Ch.alpha(Ch.cor.accent(), .35), stack: 'f' }] },
        options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: (v) => U.brl0(v) } } } } });
    },
  };
})(window.App = window.App || {});
