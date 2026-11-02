/* 4. Simulador de dívidas — juros compostos sobre o saldo devedor, parcelas fixas, registro de pagamentos e comparação de cenários. */
(function (App) {
  'use strict';
  const U = App.U, F = App.F, ui = App.ui, Ch = App.charts;
  let selecionada = null;
  let cenarioCfg = { valores: '500, 700, 1000', taxa: '', extraMensal: '', extraValor: '', extraMes: '' };

  const pctTxt = (v) => (v == null || v === '' ? '' : String(v).replace('.', ','));

  function formDivida(d) {
    const st = App.store.state;
    d = d || { modalidade: 'rotativo', primeiroPagamento: U.dataNoMes(U.mesAdd(U.mesAtual(), 1), 10), incluirProjecao: true, extrasPlanejados: [] };
    const extras = (d.extrasPlanejados || []).map((e, i) => linhaExtra(e, i)).join('');
    return '<div class="radio-cards">' +
      '<label><input type="radio" name="modalidade" value="rotativo"' + (d.modalidade !== 'parcelado' ? ' checked' : '') + '><span><b>Dívida rotativa</b><small>Juros sobre o saldo devedor todo mês. Você escolhe quanto paga; se pagar menos que os juros, a dívida cresce. Ex.: rotativo do cartão, cheque especial, fatura em atraso.</small></span></label>' +
      '<label><input type="radio" name="modalidade" value="parcelado"' + (d.modalidade === 'parcelado' ? ' checked' : '') + '><span><b>Compra ou fatura parcelada</b><small>Número de parcelas e valor fixo definidos no início (tabela Price). Pagar parcelas antes reduz os juros.</small></span></label></div>' +
      '<div class="form-grid">' +
      ui.field('Nome da dívida', ui.input('nome', d.nome, 'required'), '', 'full') +
      ui.field('Cartão ou conta (opcional)', ui.select('cartaoId', [{ v: '', t: '— nenhum —' }].concat(st.cartoes.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map((c) => ({ v: c.id, t: c.nome }))), d.cartaoId || '')) +
      ui.field('Valor utilizado do limite / valor da dívida', ui.moneyInput('valorInicial', d.valorInicial)) +
      ui.field('Taxa de juros (% ao mês)', ui.input('taxa', pctTxt(d.taxa), 'inputmode="decimal" placeholder="ex.: 9,6"'), 'Use 0 para parcelado sem juros') +
      ui.field('Quantidade de parcelas', ui.input('parcelas', d.parcelas, 'type="number" min="1" max="600"'), 'Obrigatório no parcelado; no rotativo, calcula quanto pagar para quitar nesse prazo') +
      ui.field('Data do primeiro pagamento', ui.input('primeiroPagamento', d.primeiroPagamento, 'type="date"')) +
      ui.field('Quanto pretendo pagar por mês', ui.moneyInput('pagamentoMensal', d.pagamentoMensal), 'Só no rotativo; no parcelado vale a parcela') +
      '<div class="full"><div class="small" style="font-weight:600;color:var(--muted);margin-bottom:6px">Pagamentos extras planejados</div><div id="extras">' + extras + '</div>' +
      '<button type="button" class="btn sm" id="addExtra">' + ui.icon('plus') + 'Adicionar pagamento extra</button></div>' +
      '<label class="check full"><input type="checkbox" name="incluirProjecao"' + (d.incluirProjecao !== false ? ' checked' : '') + '> Somar os pagamentos desta dívida na projeção e no dashboard</label>' +
      '<p class="hint full">Se esta dívida já aparece na planilha como fatura do cartão, desmarque a opção acima para não contar duas vezes.</p>' +
      ui.field('Observações', '<textarea name="observacoes">' + U.esc(d.observacoes || '') + '</textarea>', '', 'full') + '</div>';
  }
  function linhaExtra(e, i) {
    return '<div class="toolbar extra-row" style="margin-bottom:6px">' + ui.field('Mês', '<input type="month" class="ex-mes" value="' + (e.mes || '') + '">') +
      ui.field('Valor', '<input class="ex-val" inputmode="decimal" value="' + (e.valor ? U.num2(e.valor) : '') + '">') +
      '<button type="button" class="btn sm danger ex-del" aria-label="Remover">' + ui.icon('trash') + '</button></div>';
  }
  function ligarExtras(m) {
    const box = m.body.querySelector('#extras');
    const ligar = () => box.querySelectorAll('.ex-del').forEach((b) => { b.onclick = () => b.closest('.extra-row').remove(); });
    m.body.querySelector('#addExtra').addEventListener('click', () => { box.insertAdjacentHTML('beforeend', linhaExtra({}, 0)); ui.hydrateIcons(box); ligar(); });
    ligar();
  }
  function lerDivida(m, base) {
    const v = ui.lerForm(m.body); ui.limparErros(m.body);
    const o = Object.assign({}, base, { nome: (v.nome || '').trim(), cartaoId: v.cartaoId || null, modalidade: v.modalidade, valorInicial: U.round2(U.parseValor(v.valorInicial)),
      taxa: v.taxa === '' ? 0 : U.parseValor(v.taxa), parcelas: v.parcelas ? Math.round(+v.parcelas) : null, primeiroPagamento: v.primeiroPagamento,
      pagamentoMensal: v.pagamentoMensal ? U.round2(U.parseValor(v.pagamentoMensal)) : null, incluirProjecao: v.incluirProjecao, observacoes: v.observacoes, atualizadoEm: Date.now() });
    o.extrasPlanejados = [...m.body.querySelectorAll('.extra-row')].map((r) => ({ mes: r.querySelector('.ex-mes').value, valor: U.round2(U.parseValor(r.querySelector('.ex-val').value)) }))
      .filter((e) => e.mes && e.valor > 0);
    let ok = true;
    if (!o.nome) { ui.erro(m.body, 'nome', 'Informe um nome.'); ok = false; }
    if (!(o.valorInicial > 0)) { ui.erro(m.body, 'valorInicial', 'Informe um valor maior que zero.'); ok = false; }
    if (isNaN(o.taxa) || o.taxa < 0 || o.taxa > 100) { ui.erro(m.body, 'taxa', 'Taxa entre 0 e 100% ao mês.'); ok = false; }
    if (!o.primeiroPagamento) { ui.erro(m.body, 'primeiroPagamento', 'Informe a data.'); ok = false; }
    if (o.modalidade === 'parcelado' && !(o.parcelas >= 1)) { ui.erro(m.body, 'parcelas', 'Informe o número de parcelas.'); ok = false; }
    if (o.modalidade === 'rotativo' && !(o.pagamentoMensal > 0) && !(o.parcelas >= 1)) { ui.erro(m.body, 'pagamentoMensal', 'Informe quanto pretende pagar por mês (ou o número de parcelas).'); ok = false; }
    if (ok && o.modalidade === 'rotativo' && !(o.pagamentoMensal > 0)) o.pagamentoMensal = F.pmt(o.valorInicial, o.taxa / 100, o.parcelas);
    return ok ? o : null;
  }
  function editar(d, pre) {
    ui.modal({ titulo: d ? 'Editar dívida' : 'Nova dívida', largo: true, corpo: formDivida(d || pre), aoAbrir: ligarExtras, botoes: [{ texto: 'Cancelar' },
      { texto: 'Salvar', classe: 'primary', acao: async (m) => {
        const o = lerDivida(m, d || { id: 'div-' + U.uid(), pagamentos: [], criadoEm: Date.now() }); if (!o) return false;
        selecionada = o.id; await App.store.put('dividas', o); ui.toast('Dívida salva.', 'good');
      } }] });
  }

  /** Quanto falta para zerar a dívida num mês (saldo com os juros do mês, menos o que já foi pago nele). */
  function valorQuitacao(d, dataISO) {
    const k = U.mesDeData(dataISO); const c = F.calcularDivida(d);
    if (U.mesDiff(c.mes0, k) < 0) return U.round2(+d.valorInicial);
    const l = c.linhas.find((x) => x.mes === k);
    if (!l) return 0;
    return U.round2(l.saldoAtualizado - (l.origem === 'registrado' ? l.pago : 0));
  }

  function registrarPagamento(d, c) {
    const sugest = c.parcela || c.planejado || 0;
    ui.modal({ titulo: 'Registrar pagamento · ' + d.nome, corpo:
      '<div class="radio-cards" style="grid-template-columns:repeat(3,1fr)">' +
      '<label><input type="radio" name="tipo" value="normal" checked><span><b>Pagamento do mês</b><small>Parcela ou valor pago na fatura (pode ser parcial)</small></span></label>' +
      '<label><input type="radio" name="tipo" value="extra"><span><b>Pagamento extra</b><small>Valor a mais para abater o saldo</small></span></label>' +
      '<label><input type="radio" name="tipo" value="quitacao"><span><b>Quitar a dívida</b><small>Paga todo o saldo devedor</small></span></label></div>' +
      '<div class="form-grid">' + ui.field('Data do pagamento', ui.input('data', U.hojeISO(), 'type="date"')) + ui.field('Valor pago', ui.moneyInput('valor', sugest)) +
      ui.field('Observação', ui.input('obs', ''), '', 'full') + '</div><div class="banner info" id="pgInfo"></div>',
      aoAbrir: (m) => {
        const info = () => {
          const v = ui.lerForm(m.body); const q = valorQuitacao(d, v.data || U.hojeISO());
          if (v.tipo === 'quitacao') m.body.querySelector('[name=valor]').value = U.num2(q);
          m.body.querySelector('#pgInfo').innerHTML = ui.icon('info') + '<div>Saldo para quitar em ' + U.mesLongo(U.mesDeData(v.data || U.hojeISO())) + ': <b style="display:inline">' + U.brl(q) + '</b> (já com os juros do mês).</div>';
          ui.hydrateIcons(m.body);
        };
        m.body.querySelectorAll('[name=tipo], [name=data]').forEach((el) => el.addEventListener('change', info)); info();
      },
      botoes: [{ texto: 'Cancelar' }, { texto: 'Registrar', classe: 'primary', acao: async (m) => {
        const v = ui.lerForm(m.body); ui.limparErros(m.body);
        let valor = U.round2(U.parseValor(v.valor));
        if (!v.data) { ui.erro(m.body, 'data', 'Informe a data.'); return false; }
        if (!(valor > 0)) { ui.erro(m.body, 'valor', 'Informe um valor maior que zero.'); return false; }
        const q = valorQuitacao(d, v.data);
        if (q <= 0) { ui.erro(m.body, 'valor', 'A dívida já está quitada nesse mês.'); return false; }
        let aviso = '';
        if (valor > q + 0.004) { aviso = 'O valor passava do saldo devedor; registrei ' + U.brl(q) + ', que quita a dívida.'; valor = q; }
        const nova = Object.assign({}, d, { pagamentos: (d.pagamentos || []).concat([{ id: U.uid(), data: v.data, valor, tipo: v.tipo, obs: v.obs, registradoEm: Date.now() }]), atualizadoEm: Date.now() });
        await App.store.put('dividas', nova);
        const c2 = F.calcularDivida(nova);
        const linha = c2.linhas.find((x) => x.mes === U.mesDeData(v.data));
        let msg = 'Pagamento registrado. Saldo devedor: ' + U.brl(linha ? linha.novoSaldo : c2.saldoAtual) + '.';
        if (linha && linha.aumentou) msg = 'Pagamento registrado, mas foi menor que os juros do mês (' + U.brl(linha.juros) + '): a dívida aumentou para ' + U.brl(linha.novoSaldo) + '.';
        if (aviso) msg = aviso + ' ' + msg;
        ui.toast(msg, linha && linha.aumentou ? 'bad' : 'good', 7000);
      } }] });
  }

  function detalhe(d) {
    const c = F.calcularDivida(d);
    const card = App.store.state.cartoes.find((x) => x.id === d.cartaoId);
    const parc = d.modalidade === 'parcelado';
    const avisos = [];
    if (c.naoQuita) avisos.push(['bad', 'Com ' + U.brl(c.planejado) + ' por mês a dívida não diminui', 'Os juros do próximo mês são ' + U.brl(c.jurosProximoMes) + '. É preciso pagar mais do que isso para o saldo começar a cair.']);
    c.linhas.filter((l) => l.semPagamento).forEach((l) => avisos.push(['bad', 'Sem pagamento registrado em ' + U.mesLongo(l.mes), 'A dívida aumentou ' + U.brl(l.juros) + ' de juros nesse mês. Registre o pagamento se ele foi feito.']));
    c.linhas.filter((l) => !l.semPagamento && l.aumentou && l.origem === 'registrado').forEach((l) => avisos.push(['warn', 'Pagamento abaixo dos juros em ' + U.mesLongo(l.mes), 'Pago ' + U.brl(l.pago) + ', juros ' + U.brl(l.juros) + ': o saldo subiu para ' + U.brl(l.novoSaldo) + '.']));
    c.linhas.filter((l) => l.parcialParcela && !l.aumentou && !l.semPagamento).forEach((l) => avisos.push(['warn', 'Parcela paga só em parte em ' + U.mesLongo(l.mes), 'Pago ' + U.brl(l.pago) + ' de ' + U.brl(c.parcela) + '. O restante continua no saldo com juros.']));
    if (c.quitada) avisos.unshift(['good', 'Dívida quitada', 'Total pago: ' + U.brl(c.totalPago) + ', dos quais ' + U.brl(c.totalJuros) + ' de juros.']);
    const pmtN = !parc && d.parcelas ? F.pmt(c.saldoAtual, c.taxaPct / 100, d.parcelas) : null;
    const hist = (d.pagamentos || []).slice().sort((a, b) => (a.data < b.data ? 1 : -1));
    return '<section class="panel"><div class="panel-head"><div><h2 style="margin:0">' + U.esc(d.nome) + ' <span class="pill ' + (parc ? 'info' : 'warn') + '">' + (parc ? 'parcelado · parcelas fixas' : 'rotativo · juros sobre o saldo') + '</span></h2>' +
      '<div class="small muted">' + (card ? U.esc(card.nome) + ' · ' : '') + U.num2(c.taxaPct) + '% ao mês · 1º pagamento em ' + U.dataBR(d.primeiroPagamento) + (d.incluirProjecao === false ? ' · fora da projeção' : '') + '</div></div>' +
      '<div class="actions"><button class="btn primary" id="btnPagar"' + (c.quitada ? ' disabled' : '') + '>' + ui.icon('check') + 'Registrar pagamento</button><button class="btn" id="btnEditar">' + ui.icon('edit') + 'Editar</button><button class="btn danger" id="btnExcluir">' + ui.icon('trash') + '</button></div></div>' +
      avisos.map((a) => '<div class="banner ' + a[0] + '" style="margin-bottom:8px">' + ui.icon(a[0] === 'good' ? 'check' : 'alert') + '<div><b>' + a[1] + '</b>' + a[2] + '</div></div>').join('') +
      '<div class="kpis">' +
      ui.kpi({ rotulo: 'Valor inicial da dívida', valor: U.brl(d.valorInicial), icone: 'debt' }) +
      ui.kpi({ rotulo: 'Saldo devedor atual', valor: U.brl(c.saldoAtual), icone: 'wallet', nivel: c.saldoAtual > +d.valorInicial ? 'bad' : c.saldoAtual > 0 ? 'warn' : 'good', sub: 'depois dos pagamentos registrados' }) +
      ui.kpi({ rotulo: 'Juros do próximo mês', valor: U.brl(c.jurosProximoMes), icone: 'trend', sub: 'mínimo para a dívida não crescer' }) +
      ui.kpi({ rotulo: parc ? 'Valor da parcela' : 'Pagamento mensal previsto', valor: U.brl(parc ? c.parcela : c.planejado), icone: 'cash',
        sub: parc ? d.parcelas + ' parcelas fixas' : (pmtN ? 'para quitar em ' + d.parcelas + ' meses: ' + U.brl(pmtN) + '/mês' : 'você define') }) +
      ui.kpi({ rotulo: 'Tempo para quitar', valor: c.quitada ? 'quitada' : c.naoQuita ? 'não quita' : c.mesesRestantes + (c.mesesRestantes === 1 ? ' mês' : ' meses'), icone: 'calendar', nivel: c.naoQuita ? 'bad' : '',
        sub: c.quitacao && !c.naoQuita ? 'última parcela em ' + U.mesLongo(c.quitacao) : '' }) +
      ui.kpi({ rotulo: 'Total de juros', valor: U.brl(c.totalJuros), icone: 'alert', nivel: 'warn', sub: U.brl(c.jurosRestantes) + ' ainda por pagar' + (c.naoQuita ? ' (até o limite simulado)' : '') }) +
      ui.kpi({ rotulo: 'Total pago até quitar', valor: c.naoQuita ? '—' : U.brl(c.totalPago), icone: 'cash', sub: 'já registrado: ' + U.brl(c.totalRegistrado) }) +
      ui.kpi({ rotulo: 'Para quitar hoje', valor: U.brl(c.valorParaQuitarHoje), icone: 'check', nivel: 'good', sub: c.economiaQuitandoHoje > 0 ? 'economiza ' + U.brl(c.economiaQuitandoHoje) + ' de juros' : '' }) +
      '</div></section>' +
      '<div class="grid g2"><section class="panel"><h2>Saldo devedor mês a mês</h2><div class="chart-box"><canvas id="chSaldoDiv"></canvas></div></section>' +
      '<section class="panel"><h2>Histórico de pagamentos <small>' + hist.length + '</small></h2><div class="table-wrap" style="max-height:260px;overflow:auto"><table><thead><tr><th>Data</th><th>Tipo</th><th class="num">Valor</th><th></th></tr></thead><tbody>' +
      (hist.map((p) => '<tr><td>' + U.dataBR(p.data) + (p.obs ? '<span class="sub">' + U.esc(p.obs) + '</span>' : '') + '</td><td>' + ({ normal: 'Pagamento', extra: 'Extra', quitacao: 'Quitação' }[p.tipo] || 'Pagamento') + '</td><td class="num">' + U.brl(p.valor) +
        '</td><td class="actions"><button class="btn sm danger" data-delpg="' + p.id + '" aria-label="Excluir pagamento">' + ui.icon('trash') + '</button></td></tr>').join('') || '<tr><td colspan="4" class="muted">Nenhum pagamento registrado ainda.</td></tr>') +
      '</tbody></table></div></section></div>' +
      '<section class="panel" id="cenarios"></section>' +
      '<section class="panel"><details class="box" open><summary>Tabela de amortização (' + c.linhas.length + ' meses)</summary><div class="table-wrap" style="margin-top:10px;max-height:420px;overflow:auto"><table><thead><tr><th>Mês</th><th class="num">Saldo inicial</th><th class="num">Juros</th><th class="num">Saldo atualizado</th><th class="num">Pagamento</th><th class="num">Novo saldo</th><th></th></tr></thead><tbody>' +
      c.linhas.map((l) => '<tr class="' + (l.origem === 'previsto' ? 'future' : '') + '"><td>' + U.mesLabel(l.mes) + '</td><td class="num">' + U.brl(l.saldoInicial) + '</td><td class="num">' + U.brl(l.juros) + '</td><td class="num">' + U.brl(l.saldoAtualizado) + '</td><td class="num">' + U.brl(l.pago) + '</td>' +
        '<td class="num ' + (l.aumentou ? 'neg' : '') + '">' + U.brl(l.novoSaldo) + (l.aumentou ? ' ▲' : '') + '</td><td>' + (l.origem === 'registrado' ? '<span class="pill good">registrado</span>' : '<span class="pill">previsto</span>') + '</td></tr>').join('') +
      '</tbody></table></div></details></section>';
  }

  function renderCenarios(box, d) {
    const parc = d.modalidade === 'parcelado';
    const atual = F.calcularDivida(d);
    if (atual.quitada || atual.saldoAtual <= 0.004) { box.innerHTML = '<h2>Comparar cenários</h2><p class="muted">A dívida está quitada: não há saldo para comparar cenários.</p>'; return; }
    const valores = cenarioCfg.valores.split(/[;\s]+|,(?=\s)|,(?=\d{3}\b)/).join(' ').split(/\s+/).map((s) => U.parseValor(s)).filter((v) => v > 0);
    const lista = [{ nome: parc ? 'Manter as parcelas (' + U.brl(atual.parcela) + ')' : 'Plano atual (' + U.brl(atual.planejado) + '/mês)', ov: {} }];
    valores.forEach((v) => { if (Math.abs(v - atual.planejado) > 0.004) lista.push({ nome: 'Pagar ' + U.brl(v) + ' por mês', ov: { pagamento: v } }); });
    const tx = U.parseValor(cenarioCfg.taxa); if (tx >= 0 && cenarioCfg.taxa !== '') lista.push({ nome: 'Taxa de ' + U.num2(tx) + '% ao mês (renegociação ou portabilidade)', ov: { taxa: tx } });
    const em = U.parseValor(cenarioCfg.extraMensal); if (em > 0) lista.push({ nome: 'Plano atual + ' + U.brl(em) + ' extra todo mês', ov: { extraMensal: em } });
    const ev = U.parseValor(cenarioCfg.extraValor); if (ev > 0 && cenarioCfg.extraMes) lista.push({ nome: 'Extra de ' + U.brl(ev) + ' em ' + U.mesLabel(cenarioCfg.extraMes), ov: { extras: (d.extrasPlanejados || []).concat([{ mes: cenarioCfg.extraMes, valor: ev }]) } });
    lista.push({ nome: 'Quitar tudo neste mês', ov: { pagamento: 1e12 } });
    const res = lista.map((s) => { const c = F.calcularDivida(d, s.ov); return Object.assign({}, s, { c, juros: c.jurosRestantes, total: U.sum(c.linhas.filter((l) => l.origem === 'previsto'), (l) => l.pago), meses: c.mesesRestantes }); });
    const validos = res.filter((r) => !r.c.naoQuita);
    const minJ = Math.min(...validos.map((r) => r.juros)), minM = Math.min(...validos.map((r) => r.meses));
    const realistas = validos.filter((r) => r.ov.pagamento !== 1e12);
    const melhor = realistas.length ? realistas.reduce((a, b) => (b.juros < a.juros ? b : a)) : null;
    box.innerHTML = '<div class="panel-head"><h2 style="margin:0">Comparar cenários</h2><span class="small muted">Tudo a partir do saldo de hoje (' + U.brl(atual.saldoAtual) + '). Nada é gravado.</span></div>' +
      '<div class="toolbar" style="margin-bottom:12px">' +
      ui.field('Pagamentos mensais a testar', '<input id="cvValores" value="' + U.esc(cenarioCfg.valores) + '" style="width:200px">', 'separe por espaço ou vírgula') +
      ui.field('Outra taxa (% ao mês)', '<input id="cvTaxa" value="' + U.esc(cenarioCfg.taxa) + '" inputmode="decimal" style="width:110px">') +
      ui.field('Extra todo mês', '<input id="cvExtraM" value="' + U.esc(cenarioCfg.extraMensal) + '" inputmode="decimal" style="width:110px">') +
      ui.field('Extra único', '<input id="cvExtraV" value="' + U.esc(cenarioCfg.extraValor) + '" inputmode="decimal" style="width:110px">') +
      ui.field('no mês', '<input id="cvExtraMes" type="month" value="' + U.esc(cenarioCfg.extraMes) + '">') +
      '<button class="btn" id="cvAplicar">' + ui.icon('refresh') + 'Comparar</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Cenário</th><th class="num">Meses até quitar</th><th>Quitação</th><th class="num">Juros a pagar</th><th class="num">Total a pagar</th><th class="num">Economia vs. atual</th></tr></thead><tbody>' +
      res.map((r, i) => '<tr class="' + (melhor && r === melhor ? 'sel' : '') + '"><td>' + U.esc(r.nome) + (r === melhor ? ' <span class="pill good">menos juros</span>' : '') + (!r.c.naoQuita && r.meses === minM && r.ov.pagamento !== 1e12 && realistas.every((x) => x.meses >= r.meses) ? ' <span class="pill info">mais rápido</span>' : '') + '</td>' +
        '<td class="num">' + (r.c.naoQuita ? '<span class="neg">não quita</span>' : r.meses) + '</td><td>' + (r.c.naoQuita ? '—' : U.mesLabel(r.c.quitacao)) + '</td>' +
        '<td class="num ' + (r.juros === minJ ? 'pos' : '') + '">' + (r.c.naoQuita ? '—' : U.brl(r.juros)) + '</td><td class="num">' + (r.c.naoQuita ? '—' : U.brl(r.total)) + '</td>' +
        '<td class="num">' + (i === 0 || r.c.naoQuita || res[0].c.naoQuita ? '—' : '<span class="' + (res[0].juros - r.juros >= 0 ? 'pos' : 'neg') + '">' + U.brl(res[0].juros - r.juros) + '</span>') + '</td></tr>').join('') +
      '</tbody></table></div>' + (parc ? '<p class="hint">No parcelado, pagar mais que a parcela equivale a antecipar parcelas: os juros das parcelas antecipadas deixam de ser cobrados (direito garantido pelo Código de Defesa do Consumidor, art. 52 §2º).</p>' : '') +
      '<div class="chart-box" style="margin-top:12px"><canvas id="chCen"></canvas></div>';
    box.querySelector('#cvAplicar').addEventListener('click', () => {
      cenarioCfg = { valores: box.querySelector('#cvValores').value, taxa: box.querySelector('#cvTaxa').value, extraMensal: box.querySelector('#cvExtraM').value,
        extraValor: box.querySelector('#cvExtraV').value, extraMes: box.querySelector('#cvExtraMes').value };
      renderCenarios(box, d); ui.hydrateIcons(box);
    });
    const mesesAll = [...new Set(res.flatMap((r) => r.c.linhas.filter((l) => l.origem === 'previsto').map((l) => l.mes)))].sort().slice(0, 60);
    Ch.render('chCen', { type: 'line', data: { labels: mesesAll.map(U.mesLabel), datasets: res.filter((r) => r.ov.pagamento !== 1e12).map((r, i) => {
      const mp = new Map(r.c.linhas.map((l) => [l.mes, l.novoSaldo]));
      return { label: r.nome, data: mesesAll.map((m) => (mp.has(m) ? mp.get(m) : (U.mesDiff(r.c.quitacao || m, m) > 0 ? 0 : null))), borderColor: Ch.paleta[i % Ch.paleta.length], backgroundColor: Ch.paleta[i % Ch.paleta.length], pointRadius: 0, tension: .2, spanGaps: true };
    }) } });
  }

  App.views.dividas = {
    render(view, acoes) {
      const st = App.store.state;
      acoes.innerHTML = '<button class="btn primary" id="novaDiv">' + ui.icon('plus') + 'Nova dívida</button>';
      acoes.querySelector('#novaDiv').addEventListener('click', () => editar(null));
      if (App.novaDividaDe) {
        const card = st.cartoes.find((c) => c.id === App.novaDividaDe); App.novaDividaDe = null;
        const r = card ? F.resumoCartao(card) : null;
        setTimeout(() => editar(null, { nome: card ? card.nome : '', cartaoId: card ? card.id : '', modalidade: 'rotativo', valorInicial: r && r.faturaAtual ? r.faturaAtual : null,
          taxa: card && card.taxaJuros != null ? card.taxaJuros : null, primeiroPagamento: U.dataNoMes(U.mesAdd(U.mesAtual(), 1), card && card.diaVencimento), incluirProjecao: false, extrasPlanejados: [] }), 0);
      }
      const explic = '<section class="panel"><h2>Dois tipos de dívida, dois cálculos</h2><div class="grid g2 small">' +
        '<div><span class="pill warn">rotativo</span><p>Os juros incidem todo mês sobre o saldo devedor. Exemplo: dívida de R$ 5.000,00 a 5% ao mês. No 1º mês, os juros são R$ 250,00 e o saldo vai a R$ 5.250,00; pagando R$ 700,00, sobram R$ 4.550,00. No mês seguinte, os juros são calculados sobre R$ 4.550,00. Se o pagamento for menor que os juros, a dívida cresce.</p></div>' +
        '<div><span class="pill info">parcelado</span><p>O valor é dividido em parcelas fixas, já com os juros embutidos (tabela Price). Uma compra de R$ 1.000,00 em 12× a 2% ao mês tem parcela de R$ 94,56. Pagar parcelas antes do prazo reduz os juros; pagar menos que a parcela deixa saldo em atraso.</p></div></div></section>';
      if (!st.dividas.length) { view.innerHTML = explic + ui.vazio('Nenhuma dívida cadastrada', 'Cadastre uma dívida para ver juros, prazo de quitação e comparar cenários de pagamento.', '<button class="btn primary" id="primeira">' + ui.icon('plus') + 'Cadastrar dívida</button>');
        view.querySelector('#primeira').addEventListener('click', () => editar(null)); return; }
      if (!selecionada || !st.dividas.some((d) => d.id === selecionada)) selecionada = st.dividas[0].id;
      const d = st.dividas.find((x) => x.id === selecionada);
      view.innerHTML = '<div class="split"><div class="side-list">' + st.dividas.map((x) => { const c = F.calcularDivida(x);
        return '<button data-sel="' + x.id + '" class="' + (x.id === selecionada ? 'on' : '') + '"><span class="t">' + U.esc(x.nome) + '</span><span class="s">' + (c.quitada ? 'quitada' : 'saldo ' + U.brl(c.saldoAtual) + (c.naoQuita ? ' · não quita' : ' · ' + c.mesesRestantes + ' meses')) + '</span></button>'; }).join('') +
        '</div><div style="display:flex;flex-direction:column;gap:16px;min-width:0">' + detalhe(d) + '</div></div>' + explic;
      view.querySelectorAll('[data-sel]').forEach((b) => b.addEventListener('click', () => { selecionada = b.dataset.sel; App.render(); }));
      const c = F.calcularDivida(d);
      view.querySelector('#btnPagar').addEventListener('click', () => registrarPagamento(d, c));
      view.querySelector('#btnEditar').addEventListener('click', () => editar(d));
      view.querySelector('#btnExcluir').addEventListener('click', async () => { if (await ui.confirmar('Excluir dívida', 'Excluir "' + U.esc(d.nome) + '" e o histórico de pagamentos?', 'Excluir', true)) { selecionada = null; await App.store.remove('dividas', d.id); } });
      view.querySelectorAll('[data-delpg]').forEach((b) => b.addEventListener('click', async () => {
        if (!(await ui.confirmar('Excluir pagamento', 'Excluir este pagamento do histórico? O saldo será recalculado.', 'Excluir', true))) return;
        await App.store.put('dividas', Object.assign({}, d, { pagamentos: d.pagamentos.filter((p) => p.id !== b.dataset.delpg) }));
      }));
      Ch.render('chSaldoDiv', { type: 'bar', data: { labels: c.linhas.slice(0, 120).map((l) => U.mesLabel(l.mes)), datasets: [
        { label: 'Saldo devedor', data: c.linhas.slice(0, 120).map((l) => l.novoSaldo), backgroundColor: c.linhas.slice(0, 120).map((l) => Ch.alpha(l.aumentou ? Ch.cor.bad() : Ch.cor.accent(), l.origem === 'previsto' ? .4 : .9)) },
        { type: 'line', label: 'Juros do mês', data: c.linhas.slice(0, 120).map((l) => l.juros), borderColor: Ch.cor.warn(), backgroundColor: Ch.cor.warn(), pointRadius: 0 }] } });
      renderCenarios(view.querySelector('#cenarios'), d);
    },
  };
})(window.App = window.App || {});
