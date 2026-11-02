/* 6/3. Cartões — limites, faturas, parcelamentos futuros e empréstimos. Limites e taxas não vêm da planilha: o usuário cadastra. */
(function (App) {
  'use strict';
  const U = App.U, F = App.F, ui = App.ui, Ch = App.charts;
  let mostrarInativos = false;

  function formCartao(c) {
    c = c || { tipo: 'cartao' };
    return '<div class="form-grid">' +
      ui.field('Nome', ui.input('nome', c.nome, 'required'), '', 'full') +
      ui.field('Tipo', ui.select('tipo', [{ v: 'cartao', t: 'Cartão de crédito' }, { v: 'emprestimo', t: 'Empréstimo, acordo ou financiamento' }], c.tipo)) +
      ui.field('Dia de vencimento', ui.input('diaVencimento', c.diaVencimento, 'type="number" min="1" max="31"')) +
      ui.field('Limite total', ui.moneyInput('limite', c.limite), 'Veja no app do banco') +
      ui.field('Limite utilizado hoje', ui.moneyInput('limiteUsado', c.limiteUsado), 'Inclui parcelas futuras já lançadas') +
      ui.field('Taxa de juros (% ao mês)', ui.input('taxaJuros', c.taxaJuros != null ? String(c.taxaJuros).replace('.', ',') : '', 'inputmode="decimal"'), 'Do rotativo, do parcelamento ou do empréstimo') +
      ui.field('Titular', ui.input('titular', c.titular)) +
      ui.field('Valor original (empréstimos)', ui.moneyInput('valorOriginal', c.valorOriginal)) +
      ui.field('Total de parcelas (empréstimos)', ui.input('parcelasTotal', c.parcelasTotal, 'type="number" min="1"')) +
      ui.field('Observações', '<textarea name="observacoes">' + U.esc(c.observacoes || '') + '</textarea>', '', 'full') + '</div>';
  }
  function lerCartao(m, base) {
    const v = ui.lerForm(m.body); ui.limparErros(m.body);
    const num = (s) => { if (s === '' || s == null) return null; const n = U.parseValor(s); return isNaN(n) ? NaN : n; };
    const o = Object.assign({}, base, { nome: v.nome.trim(), tipo: v.tipo, diaVencimento: v.diaVencimento ? +v.diaVencimento : null, limite: num(v.limite), limiteUsado: num(v.limiteUsado),
      taxaJuros: num(v.taxaJuros), titular: v.titular.trim(), valorOriginal: num(v.valorOriginal), parcelasTotal: v.parcelasTotal ? +v.parcelasTotal : null, observacoes: v.observacoes, atualizadoEm: Date.now() });
    let ok = true;
    if (!o.nome) { ui.erro(m.body, 'nome', 'Informe um nome.'); ok = false; }
    ['limite', 'limiteUsado', 'taxaJuros', 'valorOriginal'].forEach((k) => { if (Number.isNaN(o[k]) || (o[k] != null && o[k] < 0)) { ui.erro(m.body, k, 'Valor inválido.'); ok = false; } });
    if (o.diaVencimento && (o.diaVencimento < 1 || o.diaVencimento > 31)) { ui.erro(m.body, 'diaVencimento', 'Dia entre 1 e 31.'); ok = false; }
    if (o.limite != null && o.limiteUsado != null && o.limiteUsado > o.limite) { ui.erro(m.body, 'limiteUsado', 'Maior que o limite total.'); ok = false; }
    return ok ? o : null;
  }
  App.editarCartao = (c) => ui.modal({ titulo: c ? 'Editar ' + c.nome : 'Novo cartão ou empréstimo', corpo: formCartao(c), botoes: [{ texto: 'Cancelar' },
    { texto: 'Salvar', classe: 'primary', acao: async (m) => {
      const o = lerCartao(m, c || { id: 'card-' + U.uid(), origem: 'manual', criadoEm: Date.now() }); if (!o) return false;
      if (!c && App.store.state.cartoes.some((x) => U.norm(x.nome) === U.norm(o.nome))) { ui.erro(m.body, 'nome', 'Já existe um cartão com esse nome.'); return false; }
      await App.store.put('cartoes', o); ui.toast('Salvo.', 'good');
    } }] });

  function unir(c) {
    const outros = App.store.state.cartoes.filter((x) => x.id !== c.id).sort((a, b) => a.nome.localeCompare(b.nome));
    ui.modal({ titulo: 'Unir "' + c.nome + '" com outro cartão', corpo: '<p class="prose">Use quando o mesmo cartão aparece com nomes diferentes nas abas da planilha (por exemplo "Cartão Mercado Pago" e "Cartão Mercado Pago Iasmym"). ' +
      'Os lançamentos de "' + U.esc(c.nome) + '" passam para o cartão escolhido, e as próximas importações já fazem isso sozinhas.</p>' +
      ui.field('Unir com', ui.select('destino', outros.map((x) => ({ v: x.id, t: x.nome })), '')), botoes: [{ texto: 'Cancelar' },
      { texto: 'Unir', classe: 'primary', acao: async (m) => {
        const dest = App.store.state.cartoes.find((x) => x.id === m.body.querySelector('[name=destino]').value); if (!dest) return false;
        const aliases = Object.assign({}, App.store.getMeta('aliasesCartao', {}));
        (c.nomesPlanilha || [c.nome]).forEach((n) => { aliases[U.norm(n)] = dest.id; });
        Object.keys(aliases).forEach((k) => { if (aliases[k] === c.id) aliases[k] = dest.id; });
        const ls = App.store.state.lancamentos.filter((l) => l.cartaoId === c.id).map((l) => Object.assign({}, l, { cartaoId: dest.id }));
        dest.nomesPlanilha = [...new Set([...(dest.nomesPlanilha || []), ...(c.nomesPlanilha || [])])];
        await App.store.aplicarLote([...ls.map((item) => ({ store: 'lancamentos', item })), { store: 'cartoes', item: dest }, { store: 'cartoes', del: true, id: c.id },
          { store: 'meta', item: { id: 'aliasesCartao', value: aliases } },
          ...App.store.state.dividas.filter((d) => d.cartaoId === c.id).map((d) => ({ store: 'dividas', item: Object.assign({}, d, { cartaoId: dest.id }) }))]);
        ui.toast('Cartões unidos.', 'good');
      } }] });
  }

  App.views.cartoes = {
    render(view, acoes) {
      acoes.innerHTML = '<button class="btn primary" id="novoCartao">' + ui.icon('plus') + 'Novo cartão ou empréstimo</button>';
      acoes.querySelector('#novoCartao').addEventListener('click', () => App.editarCartao(null));
      const st = App.store.state;
      if (!st.cartoes.length) { view.innerHTML = ui.vazio('Nenhum cartão cadastrado', 'Os cartões e empréstimos são criados ao importar a planilha, ou você pode cadastrar um agora.'); return; }
      const todos = st.cartoes.map((c) => ({ c, r: F.resumoCartao(c) }));
      const ativos = todos.filter((x) => x.r.ativo || x.c.origem === 'manual');
      const lista = (mostrarInativos ? todos : ativos);
      const cartoes = lista.filter((x) => x.c.tipo !== 'emprestimo').sort((a, b) => b.r.saldoPrevisto - a.r.saldoPrevisto);
      const emprest = lista.filter((x) => x.c.tipo === 'emprestimo').sort((a, b) => b.r.saldoPrevisto - a.r.saldoPrevisto);
      const semLimite = cartoes.filter((x) => x.r.limite == null).length;

      const tile = ({ c, r }) => {
        const nivel = r.utilizacao == null ? '' : ui.nivelPct(r.utilizacao);
        const fut = r.futuras.slice(0, 6).map((l) => '<span class="pill">' + U.mesLabel(l.mesRef) + ' ' + U.brl0(l.valor) + '</span>').join(' ');
        return '<div class="panel card-tile"><div class="ct-head"><div><div class="ct-name">' + U.esc(c.nome) + '</div><div class="small muted">' + (c.titular ? U.esc(c.titular) + ' · ' : '') +
          (c.diaVencimento ? 'vence dia ' + c.diaVencimento : 'sem dia de vencimento') + '</div></div>' + (r.ativo ? '<span class="pill info">em uso</span>' : '<span class="pill">sem faturas futuras</span>') + '</div>' +
          '<dl class="kv"><dt>Fatura de ' + U.mesLabel(U.mesAtual()) + '</dt><dd>' + U.brl(r.faturaAtual) + '</dd>' +
          '<dt>Próximo vencimento</dt><dd>' + (r.proximoVencimento ? U.dataBR(r.proximoVencimento) + ' · ' + U.brl(r.proximoValor) : '—') + '</dd>' +
          '<dt>Faturas futuras (planilha)</dt><dd>' + U.brl(r.totalFuturo) + '</dd>' +
          '<dt title="Faturas pendentes do mês atual em diante">Saldo devedor previsto</dt><dd>' + U.brl(r.saldoPrevisto) + '</dd>' +
          '<dt>Limite total</dt><dd>' + (r.limite != null ? U.brl(r.limite) : '<span class="muted">não informado</span>') + '</dd>' +
          '<dt>Limite utilizado</dt><dd>' + (r.usado != null ? U.brl(r.usado) : '<span class="muted">não informado</span>') + '</dd>' +
          '<dt>Limite disponível</dt><dd>' + (r.disponivel != null ? U.brl(r.disponivel) : '—') + '</dd>' +
          (c.taxaJuros != null ? '<dt>Juros</dt><dd>' + U.num2(c.taxaJuros) + '% ao mês</dd>' : '') + '</dl>' +
          (r.utilizacao != null ? '<div><div class="small muted">Uso do limite: <b class="' + (nivel === 'good' ? 'pos' : nivel === 'warn' ? 'wrn' : 'neg') + '">' + U.pct(r.utilizacao) + '</b></div><div class="bar ' + nivel + '"><span style="width:' + Math.min(100, r.utilizacao * 100) + '%"></span></div></div>' : '') +
          (fut ? '<div><div class="small muted" style="margin-bottom:4px">Parcelas e faturas futuras</div>' + fut + (r.futuras.length > 6 ? ' <span class="small muted">+' + (r.futuras.length - 6) + '</span>' : '') + '</div>' : '') +
          '<div class="actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn sm" data-edit="' + c.id + '">' + ui.icon('edit') + 'Editar</button>' +
          '<button class="btn sm" data-unir="' + c.id + '">Unir com…</button><button class="btn sm" data-sim="' + c.id + '">' + ui.icon('debt') + 'Simular dívida</button>' +
          '<a class="btn sm" href="#lancamentos" data-ver="' + c.id + '">Lançamentos</a>' + (c.origem === 'manual' && !r.lancamentos.length ? '<button class="btn sm danger" data-del="' + c.id + '">' + ui.icon('trash') + '</button>' : '') + '</div></div>';
      };

      view.innerHTML =
        (semLimite ? '<div class="banner info">' + ui.icon('info') + '<div><b>Limites e taxas não estão na planilha</b>Cadastre o limite total, o limite usado e os juros de cada cartão em "Editar" para ver o percentual de uso. Nada é inventado: sem esses dados, os campos ficam como "não informado".</div></div>' : '') +
        '<div class="panel-head"><h2 style="margin:0">Cartões de crédito <small>' + cartoes.length + '</small></h2><label class="check"><input type="checkbox" id="inativos"' + (mostrarInativos ? ' checked' : '') + '> Mostrar também os sem faturas futuras (' + (todos.length - ativos.length) + ')</label></div>' +
        '<div class="cards-grid">' + (cartoes.map(tile).join('') || '<p class="muted">Nenhum cartão com faturas futuras.</p>') + '</div>' +
        '<section class="panel"><h2>Comparação entre cartões</h2><div class="chart-box tall"><canvas id="chCartoes"></canvas></div></section>' +
        '<section class="panel"><h2>Empréstimos, acordos e financiamentos</h2><div class="table-wrap"><table><thead><tr><th>Nome</th><th class="num">Valor original</th><th class="num">Saldo devedor previsto</th><th class="num">Parcela atual</th>' +
        '<th class="num">Juros</th><th class="num">Parcelas restantes</th><th>Previsão de quitação</th><th></th></tr></thead><tbody>' +
        (emprest.map(({ c, r }) => '<tr><td>' + U.esc(c.nome) + '<span class="sub">' + (c.diaVencimento ? 'vence dia ' + c.diaVencimento : '') + '</span></td>' +
          '<td class="num">' + (c.valorOriginal != null ? U.brl(c.valorOriginal) : '<span class="muted">não informado</span>') + '</td>' +
          '<td class="num">' + U.brl(r.saldoPrevisto) + '<span class="sub">soma das parcelas na planilha</span></td><td class="num">' + (r.parcelaAtual != null ? U.brl(r.parcelaAtual) : '—') + '</td>' +
          '<td class="num">' + (c.taxaJuros != null ? U.num2(c.taxaJuros) + '% a.m.' : '<span class="muted">não informada</span>') + '</td>' +
          '<td class="num">' + r.parcelasRestantes + (c.parcelasTotal ? ' de ' + c.parcelasTotal : '') + '</td><td>' + (r.ultimaParcela ? U.mesLongo(r.ultimaParcela) : '—') + '</td>' +
          '<td class="actions"><button class="btn sm" data-edit="' + c.id + '">' + ui.icon('edit') + '</button></td></tr>').join('') || '<tr><td colspan="8" class="muted">Nenhum empréstimo com parcelas futuras.</td></tr>') +
        '</tbody></table></div><p class="hint">O saldo devedor previsto é a soma das parcelas que ainda aparecem na planilha. O saldo real com juros pode ser diferente: confira no app do banco ou cadastre a dívida no Simulador de dívidas.</p></section>';

      view.querySelector('#inativos').addEventListener('change', (e) => { mostrarInativos = e.target.checked; App.render(); });
      view.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => App.editarCartao(st.cartoes.find((x) => x.id === b.dataset.edit))));
      view.querySelectorAll('[data-unir]').forEach((b) => b.addEventListener('click', () => unir(st.cartoes.find((x) => x.id === b.dataset.unir))));
      view.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => { App.filtroLancamentos = { cartao: b.dataset.ver, mes: '' }; }));
      view.querySelectorAll('[data-sim]').forEach((b) => b.addEventListener('click', () => { App.novaDividaDe = b.dataset.sim; App.navegar('dividas'); }));
      view.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        if (await ui.confirmar('Excluir cartão', 'Excluir este cartão cadastrado manualmente?', 'Excluir', true)) await App.store.remove('cartoes', b.dataset.del);
      }));

      const comp = cartoes.filter((x) => x.r.saldoPrevisto > 0 || x.r.usado);
      Ch.render('chCartoes', { type: 'bar', data: { labels: comp.map((x) => x.c.nome.replace(/^Cartão /, '')), datasets: [
        { label: 'Fatura deste mês', data: comp.map((x) => x.r.faturaAtual), backgroundColor: Ch.cor.cartao() },
        { label: 'Faturas futuras', data: comp.map((x) => x.r.totalFuturo), backgroundColor: Ch.alpha(Ch.cor.cartao(), .4) },
        { label: 'Limite utilizado (informado)', data: comp.map((x) => x.r.usado || 0), backgroundColor: Ch.cor.warn() },
        { label: 'Limite disponível (informado)', data: comp.map((x) => x.r.disponivel || 0), backgroundColor: Ch.alpha(Ch.cor.good(), .6) },
      ] }, options: { indexAxis: 'y', scales: { x: { ticks: { callback: (v) => U.brl0(v) }, grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--line') } }, y: { grid: { display: false }, ticks: { callback: function (v) { return this.getLabelForValue(v); } } } } } });
    },
  };
})(window.App = window.App || {});
