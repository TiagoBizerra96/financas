/* Simulador de cartão de crédito — empréstimo feito no cartão: o valor entra na conta e as parcelas
 * são somadas às faturas do cartão escolhido. Mostra cada fatura antes e depois e o efeito no orçamento. */
(function (App) {
  'use strict';
  const U = App.U, F = App.F, ui = App.ui, Ch = App.charts;
  let cfg = null;

  function padrao() {
    const st = App.store.state;
    const ativos = st.cartoes.filter((c) => c.tipo !== 'emprestimo').map((c) => ({ c, r: F.resumoCartao(c) })).sort((a, b) => b.r.saldoPrevisto - a.r.saldoPrevisto);
    const c0 = ativos[0] ? ativos[0].c : null;
    return { modo: 'operadora', cartaoId: c0 ? c0.id : '', totalPagar: '', recebido: '', descontoPct: '', valor: '', parcelas: '', taxa: c0 && c0.taxaJuros != null ? String(c0.taxaJuros).replace('.', ',') : '', tarifa: '',
      mesRecebe: U.mesAtual(), primeiraParcela: U.mesAdd(U.mesAtual(), 1), entraComoReceita: true, descricao: '' };
  }

  /** Calcula a simulação: parcelas, faturas do cartão antes/depois e orçamento com/sem. */
  function calcular(c) {
    const st = App.store.state;
    const n = Math.max(1, Math.round(+c.parcelas || 1));
    let valor, parcela, total, taxa = 0, tarifa = 0, parcelas;
    if (c.modo === 'operadora') {
      // Como a operadora mostra: você paga "total" em n parcelas iguais e recebe "recebido" (o desconto sai na hora).
      total = U.round2(+c.totalPagar || 0);
      valor = U.round2(+c.recebido || 0);
      parcela = U.round2(total / n);
      parcelas = Array.from({ length: n }, (_, i) => (i < n - 1 ? parcela : U.round2(total - parcela * (n - 1))));
    } else {
      valor = U.round2(+c.valor || 0);
      taxa = (U.parseValor(c.taxa === '' ? '0' : c.taxa) || 0) / 100; tarifa = (U.parseValor(c.tarifa === '' ? '0' : c.tarifa) || 0) / 100;
      parcela = F.pmt(U.round2(valor * (1 + tarifa)), taxa, n);
      total = U.round2(parcela * n);
      parcelas = Array.from({ length: n }, () => parcela);
    }
    const financiado = total;
    const ultima = U.mesAdd(c.primeiraParcela, n - 1);
    const inicio = U.mesDiff(c.mesRecebe, U.mesAtual()) > 0 ? c.mesRecebe : U.mesAtual();
    const fim = U.mesDiff(ultima, U.mesAdd(inicio, 11)) > 0 ? U.mesAdd(inicio, 11) : ultima;
    const meses = U.mesRange(inicio, fim);
    const parcDe = (m) => { const i = U.mesDiff(c.primeiraParcela, m); return i >= 0 && i < n ? parcelas[i] : 0; };
    // faturas do cartão (lançamentos ligados a ele)
    const faturaBase = (m) => U.sum(st.lancamentos.filter((l) => l.cartaoId === c.cartaoId && l.tipo === 'despesa' && l.mesRef === m), (l) => l.valor);
    const proj = F.projecao({ inicio, meses: meses.length });
    const linhas = meses.map((m, i) => {
      const p = proj[i], parc = parcDe(m), rec = c.entraComoReceita && m === c.mesRecebe ? valor : 0;
      const receitas = U.round2(p.receitas + rec), despesas = U.round2(p.despesas + parc);
      const fb = faturaBase(m);
      return { mes: m, faturaBase: fb, parcela: parc, faturaNova: U.round2(fb + parc), numParcela: parc ? U.mesDiff(c.primeiraParcela, m) + 1 : null,
        saldoBase: p.saldo, saldo: U.round2(receitas - despesas - p.reserva), recebido: rec, receitas, despesas,
        compBase: p.comprometimento, comp: receitas > 0 ? despesas / receitas : (despesas > 0 ? Infinity : 0), estimado: p.estimado };
    });
    const efet = F.taxaEfetiva(valor, parcela, n);
    return { valor, n, taxa, tarifa, financiado, parcela, parcelas, total, juros: U.round2(total - valor), desconto: total > 0 ? (total - valor) / total : 0, ultima, linhas,
      cetAno: efet ? Math.pow(1 + efet, 12) - 1 : 0, taxaEfetivaMes: efet };
  }

  async function efetivar(c, r) {
    const card = App.store.state.cartoes.find((x) => x.id === c.cartaoId);
    const sid = 'simc-' + U.uid(); const agora = Date.now();
    const desc = (c.descricao || '').trim() || 'Empréstimo no ' + card.nome;
    const novos = [];
    if (c.entraComoReceita) novos.push({ id: 'lan-' + U.uid(), origem: 'simulacao', simCartaoId: sid, descricao: desc + ' (valor recebido)', tipo: 'receita', categoria: 'Empréstimo recebido', grupo: 'receita',
      valor: r.valor, mesRef: c.mesRecebe, data: c.mesRecebe === U.mesAtual() ? U.hojeISO() : U.dataNoMes(c.mesRecebe, 1), formaPagamento: 'Conta bancária', cartaoId: null,
      situacao: c.mesRecebe === U.mesAtual() ? 'pago' : 'pendente', observacoes: 'Pago ' + U.brl(r.total) + ' em ' + r.n + ' parcelas; recebido ' + U.brl(r.valor), criadoEm: agora, atualizadoEm: agora });
    for (let i = 0; i < r.n; i++) {
      const m = U.mesAdd(c.primeiraParcela, i);
      novos.push({ id: 'lan-' + U.uid(), origem: 'simulacao', simCartaoId: sid, descricao: desc + ' (' + (i + 1) + '/' + r.n + ')', tipo: 'despesa', categoria: 'Cartão de crédito', grupo: 'cartao',
        valor: r.parcelas[i], mesRef: m, data: U.dataNoMes(m, card.diaVencimento), diaVenc: card.diaVencimento || null, formaPagamento: 'Fatura do cartão', cartaoId: card.id, situacao: 'pendente',
        observacoes: 'Recebido ' + U.brl(r.valor) + ', a pagar ' + U.brl(r.total) + ' em ' + r.n + '× de ' + U.brl(r.parcela), criadoEm: agora, atualizadoEm: agora });
    }
    if (!(await ui.confirmar('Efetivar empréstimo no cartão', 'Isto lança <b>' + r.n + ' parcelas de ' + U.brl(r.parcela) + '</b> nas faturas do <b>' + U.esc(card.nome) + '</b> (' + U.mesLabel(c.primeiraParcela) + ' a ' + U.mesLabel(r.ultima) + ')' +
      (c.entraComoReceita ? ' e ' + U.brl(r.valor) + ' como receita em ' + U.mesLabel(c.mesRecebe) : '') + '. Dashboard, cartões e projeção passam a considerar esses valores. Dá para desfazer nesta tela.', 'Efetivar'))) return;
    await App.store.putMany('lancamentos', novos);
    ui.toast('Parcelas lançadas nas faturas do ' + card.nome + '.', 'good');
  }

  App.views.simcartao = {
    render(view) {
      const st = App.store.state;
      const cartoes = st.cartoes.filter((c) => c.tipo !== 'emprestimo').sort((a, b) => a.nome.localeCompare(b.nome));
      if (!cartoes.length) { view.innerHTML = ui.semDados(); return; }
      if (!cfg || !cartoes.some((c) => c.id === cfg.cartaoId)) cfg = Object.assign(padrao(), cfg && cartoes.some((c) => c.id === cfg.cartaoId) ? cfg : {});
      const card = st.cartoes.find((c) => c.id === cfg.cartaoId);
      const rc = F.resumoCartao(card);
      const r = calcular(cfg); const r0 = r;
      const preenchido = cfg.modo === 'operadora' ? (r.total > 0 && +cfg.parcelas >= 1) : (r.valor > 0 && +cfg.parcelas >= 1);
      const dispInformado = rc.disponivel != null;
      const passaLimite = dispInformado && r.valor > rc.disponivel + 0.004;
      const maior = r.linhas.reduce((a, b) => (b.faturaNova > a.faturaNova ? b : a), r.linhas[0]);
      const deficits = r.linhas.filter((l) => l.saldo < 0);
      const deficitsBase = r.linhas.filter((l) => l.saldoBase < 0);
      const efetivados = U.groupBy(st.lancamentos.filter((l) => l.simCartaoId), (l) => l.simCartaoId);
      const mesesOpt = []; for (let i = 0; i <= 12; i++) mesesOpt.push(U.mesAdd(U.mesAtual(), i));

      view.innerHTML =
        '<div class="banner info">' + ui.icon('info') + '<div><b>Empréstimo no cartão de crédito</b>O valor recebido entra como receita e as parcelas são cobradas nas faturas do cartão escolhido. Aqui você vê cada fatura com a parcela somada e o efeito no orçamento. Nada é gravado até você clicar em "Efetivar".</div></div>' +
        '<section class="panel"><h2>Dados do empréstimo</h2>' +
        '<div class="radio-cards" style="margin-bottom:12px"><label><input type="radio" name="scModo" value="operadora"' + (cfg.modo === 'operadora' ? ' checked' : '') + '><span><b>Como a operadora mostra</b><small>Valor total que você paga, número de parcelas e valor que você recebe. Use os números do app do banco.</small></span></label>' +
        '<label><input type="radio" name="scModo" value="juros"' + (cfg.modo !== 'operadora' ? ' checked' : '') + '><span><b>Calcular pela taxa de juros</b><small>Você recebe o valor pedido e paga parcelas com juros mensais (tabela Price).</small></span></label></div>' +
        '<div class="form-grid" id="scForm" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">' +
        ui.field('Cartão', ui.select('cartaoId', cartoes.map((c) => ({ v: c.id, t: c.nome })), cfg.cartaoId)) +
        (cfg.modo === 'operadora'
          ? ui.field('Valor total a pagar', ui.moneyInput('totalPagar', cfg.totalPagar), 'Soma das parcelas (sai do limite)') +
            ui.field('Parcelas', ui.input('parcelas', cfg.parcelas, 'type="number" min="1" max="48"'), r0.total > 0 && +cfg.parcelas >= 1 ? 'Parcela: ' + U.brl(r0.parcela) : '') +
            ui.field('Taxa da operadora (%)', ui.input('descontoPct', cfg.descontoPct, 'inputmode="decimal" placeholder="ex.: 7,57"'), 'Descontada do total na hora') +
            ui.field('Valor que você recebe', ui.moneyInput('recebido', cfg.recebido), 'Preencha este ou a taxa; um calcula o outro')
          : ui.field('Valor do empréstimo', ui.moneyInput('valor', cfg.valor)) +
            ui.field('Parcelas', ui.input('parcelas', cfg.parcelas, 'type="number" min="1" max="48"')) +
            ui.field('Juros (% ao mês)', ui.input('taxa', cfg.taxa, 'inputmode="decimal" placeholder="ex.: 6,99"'), card.taxaJuros != null ? 'Cadastrado no cartão: ' + U.num2(card.taxaJuros) + '%' : 'Veja a taxa no app do banco') +
            ui.field('Tarifa / IOF na contratação (%)', ui.input('tarifa', cfg.tarifa, 'inputmode="decimal" placeholder="0"'), 'Somado ao valor financiado')) +
        ui.field('Dinheiro entra em', ui.select('mesRecebe', mesesOpt.map((m) => ({ v: m, t: U.mesLongo(m) })), cfg.mesRecebe)) +
        ui.field('1ª parcela na fatura de', ui.select('primeiraParcela', mesesOpt.map((m) => ({ v: m, t: U.mesLongo(m) })), cfg.primeiraParcela)) +
        ui.field('Descrição (opcional)', ui.input('descricao', cfg.descricao, 'placeholder="Empréstimo no ' + U.esc(card.nome) + '"')) +
        '</div><label class="check" style="margin-top:10px"><input type="checkbox" name="entraComoReceita" id="scRec"' + (cfg.entraComoReceita ? ' checked' : '') + '> Somar o valor recebido como receita no mês em que entra</label>' +
        '<p class="hint">Desmarque se o dinheiro for direto para pagar outra dívida que já está na planilha.</p></section>' +
        (!preenchido ? '<div class="panel empty"><h2>Preencha os dados do empréstimo</h2><p>' + (cfg.modo === 'operadora' ? 'Informe o valor total a pagar, as parcelas e o valor que você recebe (ou a taxa da operadora).' : 'Informe o valor, as parcelas e os juros.') + ' A simulação aparece aqui.</p></div>' : '') +
        (!preenchido ? '' : (passaLimite ? '<div class="banner bad">' + ui.icon('alert') + '<div><b>O valor passa do limite disponível</b>Limite disponível cadastrado no ' + U.esc(card.nome) + ': ' + U.brl(rc.disponivel) + '. O banco pode recusar ou liberar um valor menor.</div></div>' : '') +
        (!dispInformado ? '<div class="banner warn">' + ui.icon('info') + '<div><b>Limite do ' + U.esc(card.nome) + ' não informado</b>Cadastre o limite total e o usado em <a href="#cartoes">Cartões</a> para o sistema avisar se o empréstimo cabe.</div></div>' : '') +
        (cfg.modo === 'operadora' && !(r.valor > 0) ? '<div class="banner warn">' + ui.icon('info') + '<div><b>Falta o valor que você recebe</b>Informe o valor recebido ou a taxa da operadora para ver o custo e lançar a receita.</div></div>' : '') +
        (cfg.modo === 'operadora' && r.valor > r.total ? '<div class="banner bad">' + ui.icon('alert') + '<div><b>Valor recebido maior que o total a pagar</b>Confira os números do app do banco.</div></div>' : '') +
        (cfg.modo !== 'operadora' && !(U.parseValor(cfg.taxa) > 0) ? '<div class="banner warn">' + ui.icon('info') + '<div><b>Juros em branco</b>Sem a taxa, a simulação considera parcelas sem juros. Empréstimos no cartão costumam ter juros: preencha com a taxa que o banco mostrar.</div></div>' : '') +
        '<section class="kpis">' +
        ui.kpi({ rotulo: 'Valor da parcela', valor: U.brl(r.parcela), icone: 'card', sub: r.n + '× de ' + U.mesLabel(cfg.primeiraParcela) + ' a ' + U.mesLabel(r.ultima) }) +
        ui.kpi({ rotulo: 'Você recebe (vira receita)', valor: U.brl(r.valor), icone: 'wallet', nivel: 'good', sub: cfg.entraComoReceita ? 'em ' + U.mesLongo(cfg.mesRecebe) : 'não somado como receita' }) +
        ui.kpi({ rotulo: 'Total a pagar', valor: U.brl(r.total), icone: 'cash', sub: r.n + ' parcelas no cartão' }) +
        ui.kpi({ rotulo: 'Custo do empréstimo', valor: U.brl(r.juros), icone: 'alert', nivel: r.juros > 0 ? 'warn' : 'good',
          sub: r.juros > 0 ? (cfg.modo === 'operadora' ? U.pct(r.desconto) + ' do total · ' : '') + 'juros efetivos ≈ ' + U.pct(r.taxaEfetivaMes) + ' ao mês (' + U.pct(r.cetAno) + ' ao ano)' : 'sem juros' }) +
        ui.kpi({ rotulo: 'Maior fatura do cartão', valor: U.brl(maior.faturaNova), icone: 'card', nivel: 'warn', sub: U.mesLabel(maior.mes) + (maior.parcela ? ', com a parcela' : '') }) +
        ui.kpi({ rotulo: 'Meses com déficit', valor: String(deficits.length), icone: 'calendar', nivel: deficits.length ? 'bad' : 'good',
          sub: 'sem o empréstimo: ' + deficitsBase.length + (deficits.length ? ' · ' + deficits.map((l) => U.mesLabel(l.mes)).join(', ') : '') }) +
        '</section>' +
        '<section class="panel"><div class="panel-head"><h2 style="margin:0">Faturas do ' + U.esc(card.nome) + ' com o empréstimo</h2><button class="btn primary" id="scEfetivar"' + (r.valor > 0 ? '' : ' disabled') + '>' + ui.icon('check') + 'Efetivar</button></div>' +
        '<div class="table-wrap"><table><thead><tr><th>Mês</th><th class="num">Fatura na planilha</th><th class="num">Parcela do empréstimo</th><th class="num">Nova fatura</th>' +
        '<th class="num">Sobra do mês sem</th><th class="num">Sobra do mês com</th><th class="num">Comprometimento com</th></tr></thead><tbody>' +
        r.linhas.map((l) => '<tr><td>' + U.mesLabel(l.mes) + (l.estimado ? ' <span class="pill" title="Mês sem dados na planilha: repete o último mês">estimado</span>' : '') + '</td><td class="num">' + U.brl(l.faturaBase) + '</td>' +
          '<td class="num">' + (l.parcela ? U.brl(l.parcela) + '<span class="sub">' + l.numParcela + '/' + r.n + '</span>' : '—') + '</td><td class="num"><b>' + U.brl(l.faturaNova) + '</b></td>' +
          '<td class="num ' + (l.saldoBase < 0 ? 'neg' : '') + '">' + U.brl(l.saldoBase) + '</td><td class="num ' + (l.saldo < 0 ? 'neg' : 'pos') + '">' + U.brl(l.saldo) + (l.recebido ? '<span class="sub">+ ' + U.brl0(l.recebido) + ' recebido</span>' : '') + '</td>' +
          '<td class="num heat-' + ui.nivelPct(l.comp) + '">' + (isFinite(l.comp) ? U.pct(l.comp) : '—') + '</td></tr>').join('') +
        '<tr class="total"><td>Total</td><td class="num">' + U.brl(U.sum(r.linhas, (l) => l.faturaBase)) + '</td><td class="num">' + U.brl(U.sum(r.linhas, (l) => l.parcela)) + '</td><td class="num">' + U.brl(U.sum(r.linhas, (l) => l.faturaNova)) + '</td>' +
        '<td class="num">' + U.brl(U.sum(r.linhas, (l) => l.saldoBase)) + '</td><td class="num">' + U.brl(U.sum(r.linhas, (l) => l.saldo)) + '</td><td></td></tr></tbody></table></div>' +
        '<p class="hint">"Fatura na planilha" soma os lançamentos ligados a este cartão em cada mês. A sobra considera todas as receitas e despesas do mês (como na Projeção anual).</p></section>' +
        '<div class="grid g2"><section class="panel"><h2>Faturas do cartão: antes e depois</h2><div class="chart-box"><canvas id="chScFat"></canvas></div></section>' +
        '<section class="panel"><h2>Sobra do mês: sem e com o empréstimo</h2><div class="chart-box"><canvas id="chScSaldo"></canvas></div></section></div>' +
        (cfg.modo === 'operadora' ? '' : '<section class="panel"><h2>Comparar quantidade de parcelas</h2><div class="table-wrap"><table><thead><tr><th class="num">Parcelas</th><th class="num">Valor da parcela</th><th class="num">Total a pagar</th><th class="num">Custo (juros + tarifa)</th><th class="num">Maior fatura</th><th class="num">Meses com déficit</th><th></th></tr></thead><tbody>' +
        [...new Set([3, 6, 10, 12, 18, 24, r.n])].sort((a, b) => a - b).map((n) => { const x = calcular(Object.assign({}, cfg, { parcelas: n })); const mx = Math.max(...x.linhas.map((l) => l.faturaNova));
          return '<tr class="' + (n === r.n ? 'sel' : '') + '"><td class="num">' + n + '×</td><td class="num">' + U.brl(x.parcela) + '</td><td class="num">' + U.brl(x.total) + '</td><td class="num">' + U.brl(x.juros) + '</td><td class="num">' + U.brl(mx) + '</td>' +
            '<td class="num ' + (x.linhas.some((l) => l.saldo < 0) ? 'neg' : 'pos') + '">' + x.linhas.filter((l) => l.saldo < 0).length + '</td><td class="actions">' + (n === r.n ? '<span class="pill info">atual</span>' : '<button class="btn sm" data-n="' + n + '">Usar</button>') + '</td></tr>'; }).join('') +
        '</tbody></table></div><p class="hint">Mais parcelas deixam a fatura mais leve, mas o custo total sobe quando há juros.</p></section>') +
        '') +
        (Object.keys(efetivados).length ? '<section class="panel"><h2>Empréstimos no cartão já efetivados</h2><div class="table-wrap"><table><thead><tr><th>Descrição</th><th>Cartão</th><th class="num">Parcelas</th><th class="num">Valor da parcela</th><th></th></tr></thead><tbody>' +
          Object.keys(efetivados).map((sid) => { const ls = efetivados[sid]; const ps = ls.filter((l) => l.tipo === 'despesa'); const cc = st.cartoes.find((x) => x.id === (ps[0] && ps[0].cartaoId));
            return '<tr><td>' + U.esc((ps[0] || ls[0]).descricao.replace(/ \(\d+\/\d+\)$/, '')) + '<span class="sub">' + (ps.length ? U.mesLabel(ps[0].mesRef) + ' a ' + U.mesLabel(ps[ps.length - 1].mesRef) : '') + '</span></td><td>' + U.esc(cc ? cc.nome : '—') + '</td>' +
              '<td class="num">' + ps.length + '</td><td class="num">' + (ps[0] ? U.brl(ps[0].valor) : '—') + '</td><td class="actions"><button class="btn sm danger" data-desfazer="' + sid + '">Desfazer</button></td></tr>'; }).join('') +
          '</tbody></table></div></section>' : '');

      const form = view.querySelector('#scForm');
      const ler = (ev) => {
        const v = ui.lerForm(form);
        const n = Math.round(+v.parcelas);
        const campo = ev && ev.target ? ev.target.name : '';
        cfg = Object.assign({}, cfg, { cartaoId: v.cartaoId, parcelas: n >= 1 && n <= 48 ? n : (v.parcelas === '' ? '' : cfg.parcelas), mesRecebe: v.mesRecebe,
          primeiraParcela: v.primeiraParcela, descricao: v.descricao, entraComoReceita: view.querySelector('#scRec').checked });
        if (cfg.modo === 'operadora') {
          // O campo alterado manda: a taxa calcula o valor recebido, e o valor recebido calcula a taxa.
          cfg.totalPagar = U.round2(U.parseValor(v.totalPagar) || 0);
          const rec = U.round2(U.parseValor(v.recebido) || 0), d = U.parseValor(v.descontoPct);
          const pelaTaxa = () => { cfg.descontoPct = v.descontoPct; cfg.recebido = d >= 0 && d < 100 ? U.round2(cfg.totalPagar * (1 - d / 100)) : cfg.recebido; };
          const peloRecebido = () => { cfg.recebido = rec; cfg.descontoPct = rec > 0 && cfg.totalPagar > 0 ? String(U.round2((1 - rec / cfg.totalPagar) * 100)).replace('.', ',') : ''; };
          if (campo === 'descontoPct') pelaTaxa();
          else if (campo === 'recebido') peloRecebido();
          else if (campo === 'totalPagar') { if (v.descontoPct !== '' && d >= 0) pelaTaxa(); else peloRecebido(); }
        } else { cfg.valor = U.round2(U.parseValor(v.valor) || 0); cfg.taxa = v.taxa; cfg.tarifa = v.tarifa; }
        if (cfg.cartaoId !== card.id) { const nc = st.cartoes.find((x) => x.id === cfg.cartaoId); if (nc && nc.taxaJuros != null && !cfg.taxa) cfg.taxa = String(nc.taxaJuros).replace('.', ','); }
        App.render();
      };
      form.querySelectorAll('select').forEach((el) => el.addEventListener('change', ler));
      form.querySelectorAll('input').forEach((el) => el.addEventListener('change', ler));
      view.querySelector('#scRec').addEventListener('change', ler);
      view.querySelectorAll('[name=scModo]').forEach((el) => el.addEventListener('change', () => { cfg.modo = el.value; App.render(); }));
      const btEf = view.querySelector('#scEfetivar');
      if (btEf) btEf.addEventListener('click', () => {
        if (!(r.valor > 0)) { ui.toast(cfg.modo === 'operadora' ? 'Informe o valor que você recebe (ou a taxa).' : 'Informe o valor do empréstimo.', 'bad'); return; }
        if (r.valor > r.total) { ui.toast('O valor recebido está maior que o total a pagar.', 'bad'); return; }
        efetivar(cfg, r);
      });
      view.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => { cfg.parcelas = +b.dataset.n; App.render(); }));
      view.querySelectorAll('[data-desfazer]').forEach((b) => b.addEventListener('click', async () => {
        const ids = st.lancamentos.filter((l) => l.simCartaoId === b.dataset.desfazer).map((l) => l.id);
        if (await ui.confirmar('Desfazer empréstimo', 'Remover os ' + ids.length + ' lançamentos criados por este empréstimo?', 'Remover', true)) await App.store.removeMany('lancamentos', ids);
      }));

      if (!preenchido) return;
      const labels = r.linhas.map((l) => U.mesLabel(l.mes));
      Ch.render('chScFat', { type: 'bar', data: { labels, datasets: [
        { label: 'Fatura na planilha', data: r.linhas.map((l) => l.faturaBase), backgroundColor: Ch.cor.cartao(), stack: 'f' },
        { label: 'Parcela do empréstimo', data: r.linhas.map((l) => l.parcela), backgroundColor: Ch.cor.warn(), stack: 'f' }] },
        options: { scales: { x: { stacked: true }, y: { stacked: true } } } });
      Ch.render('chScSaldo', { type: 'bar', data: { labels, datasets: [
        { label: 'Sem o empréstimo', data: r.linhas.map((l) => l.saldoBase), backgroundColor: Ch.alpha(Ch.cor.muted(), .35) },
        { label: 'Com o empréstimo', data: r.linhas.map((l) => l.saldo), backgroundColor: r.linhas.map((l) => (l.saldo < 0 ? Ch.cor.bad() : Ch.cor.good())) }] } });
    },
  };
})(window.App = window.App || {});
