/* 8/6. Contas e despesas — adicionar, editar, excluir lançamentos, filtros e vencimentos. */
(function (App) {
  'use strict';
  const U = App.U, ui = App.ui;
  const FORMAS = ['Pix', 'Débito', 'Boleto / débito', 'Cartão de crédito', 'Fatura do cartão', 'Dinheiro', 'Transferência', 'Conta bancária', 'Outro'];
  let filtro = null;
  const selecionados = new Set();

  function opcoesCategoria(tipo) {
    return App.store.state.categorias.filter((c) => (tipo === 'receita' ? c.grupo === 'receita' : c.grupo !== 'receita')).sort((a, b) => a.nome.localeCompare(b.nome)).map((c) => c.nome);
  }
  function form(l) {
    const st = App.store.state;
    const novo = !l;
    l = l || { tipo: 'despesa', data: U.hojeISO(), situacao: 'pago', categoria: 'Alimentação', formaPagamento: 'Pix' };
    const mesesFat = []; for (let i = 0; i <= 13; i++) mesesFat.push(U.mesAdd(U.mesAtual(), i));
    return '<div class="form-grid">' +
      ui.field('Tipo', ui.select('tipo', [{ v: 'despesa', t: 'Despesa' }, { v: 'receita', t: 'Receita' }], l.tipo)) +
      ui.field('Situação', ui.select('situacao', [{ v: 'pendente', t: 'Pendente' }, { v: 'pago', t: 'Pago / recebido' }], l.situacao)) +
      ui.field('Descrição', ui.input('descricao', l.descricao, 'required maxlength="120"'), '', 'full') +
      ui.field('Categoria', ui.select('categoria', opcoesCategoria(l.tipo), l.categoria), '<a href="#config" data-close-modal>gerenciar categorias</a>') +
      ui.field('Valor (R$)', ui.moneyInput('valor', l.valor)) +
      ui.field('Data', ui.input('data', l.data, 'type="date"')) +
      ui.field('Mês de referência', ui.input('mesRef', l.mesRef || U.mesDeData(l.data), 'type="month"'), 'Mês em que a conta entra no orçamento', 'f-mesref') +
      ui.field('Forma de pagamento', ui.select('formaPagamento', [''].concat(FORMAS), l.formaPagamento || '')) +
      (novo ? ui.field('Parcelas', ui.select('parcelasCompra', Array.from({ length: 24 }, (_, i) => ({ v: i + 1, t: i ? (i + 1) + '× sem juros' : 'À vista (1×)' })), 1), '', 'f-compra') +
        ui.field('1ª parcela na fatura de', ui.select('faturaInicial', mesesFat.map((m) => ({ v: m, t: U.mesLongo(m) })), U.mesAdd(U.mesAtual(), 1)), 'Depois do fechamento, a compra cai na fatura seguinte', 'f-compra') : '') +
      ui.field('Cartão utilizado', ui.select('cartaoId', [{ v: '', t: '— nenhum —' }].concat(st.cartoes.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map((c) => ({ v: c.id, t: c.nome }))), l.cartaoId || ''), '', 'f-cartao') +
      (!l.id ? ui.field('Repetir', ui.select('repetir', [{ v: '1', t: 'Só este mês' }].concat([2, 3, 6, 12].map((n) => ({ v: n, t: 'Por ' + n + ' meses' }))), '1'), 'Cria um lançamento por mês', 'f-repetir') : '') +
      (novo ? '<p class="hint full" id="dicaForma"></p>' : '') +
      ui.field('Observações', '<textarea name="observacoes">' + U.esc(l.observacoes || '') + '</textarea>', '', 'full') + '</div>' +
      (l.origem === 'planilha' ? '<p class="hint">Veio da planilha (aba "' + U.esc(l.fonte) + '", linha ' + (l.linhaPlanilha || '?') + '). Se você mudar valor, data ou descrição, a próxima importação mantém a sua versão desse campo.</p>' : '');
  }
  function ligarForm(m) {
    const tipo = m.body.querySelector('[name=tipo]'), cat = m.body.querySelector('[name=categoria]'), forma = m.body.querySelector('[name=formaPagamento]'), data = m.body.querySelector('[name=data]'), mesRef = m.body.querySelector('[name=mesRef]');
    tipo.addEventListener('change', () => { cat.innerHTML = opcoesCategoria(tipo.value).map((c) => '<option>' + U.esc(c) + '</option>').join(''); });
    const sit = m.body.querySelector('[name=situacao]'); let sitTocada = false; sit.addEventListener('change', () => { sitTocada = true; });
    const novo = !!m.body.querySelector('[name=parcelasCompra]');
    const ajusta = () => {
      const noCartao = /cart|fatura/i.test(forma.value), compraCartao = novo && forma.value === 'Cartão de crédito' && tipo.value === 'despesa';
      m.body.querySelector('.f-cartao').style.display = noCartao ? '' : 'none';
      m.body.querySelectorAll('.f-compra').forEach((e) => { e.style.display = compraCartao ? '' : 'none'; });
      m.body.querySelectorAll('.f-mesref, .f-repetir').forEach((e) => { e.style.display = compraCartao ? 'none' : ''; });
      // Pagou na hora (Pix, débito, dinheiro…) com data até hoje = já pago, desconta do disponível. No cartão vai para a fatura.
      if (novo && !sitTocada) sit.value = !compraCartao && /Pix|Débito|Dinheiro|Transfer/.test(forma.value) && data.value <= U.hojeISO() ? 'pago' : 'pendente';
      const dica = m.body.querySelector('#dicaForma');
      if (dica) dica.textContent = tipo.value === 'receita' ? 'A receita soma ao disponível quando estiver recebida (ou quando a data chegar).'
        : compraCartao ? 'A compra é dividida nas faturas do cartão escolhido e entra no orçamento do mês de cada fatura.'
        : sit.value === 'pago' ? 'Já pago: o valor sai do "Disponível agora" do mês na hora.' : 'Pendente: entra no "falta pagar" e sai do disponível quando você marcar como pago.';
    };
    forma.addEventListener('change', ajusta); tipo.addEventListener('change', ajusta); data.addEventListener('change', ajusta); sit.addEventListener('change', ajusta); ajusta();
    let mesTocado = false; mesRef.addEventListener('change', () => { mesTocado = true; });
    data.addEventListener('change', () => { if (!mesTocado && data.value) mesRef.value = data.value.slice(0, 7); });
    const link = m.body.querySelector('[data-close-modal]'); if (link) link.addEventListener('click', () => m.fechar());
  }

  function validar(m, base) {
    const v = ui.lerForm(m.body); ui.limparErros(m.body);
    const valor = U.round2(U.parseValor(v.valor));
    let ok = true;
    if (!v.descricao.trim()) { ui.erro(m.body, 'descricao', 'Informe uma descrição.'); ok = false; }
    if (!(valor > 0)) { ui.erro(m.body, 'valor', 'Informe um valor maior que zero.'); ok = false; }
    if (valor > 10000000) { ui.erro(m.body, 'valor', 'Valor muito alto. Confira.'); ok = false; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.data) || isNaN(new Date(v.data + 'T12:00').getTime())) { ui.erro(m.body, 'data', 'Data inválida.'); ok = false; }
    if (!/^\d{4}-\d{2}$/.test(v.mesRef)) { ui.erro(m.body, 'mesRef', 'Mês inválido.'); ok = false; }
    if (!v.categoria) { ui.erro(m.body, 'categoria', 'Escolha a categoria.'); ok = false; }
    if (!ok) return null;
    const cat = App.store.state.categorias.find((c) => c.nome === v.categoria);
    const o = Object.assign({}, base, { tipo: v.tipo, situacao: v.situacao, descricao: v.descricao.trim(), categoria: v.categoria, grupo: cat ? cat.grupo : (v.tipo === 'receita' ? 'receita' : 'variavel'),
      valor, data: v.data, mesRef: v.mesRef, formaPagamento: v.formaPagamento, cartaoId: /cart|fatura/i.test(v.formaPagamento) ? (v.cartaoId || null) : (base.cartaoId && base.origem === 'planilha' ? base.cartaoId : null),
      observacoes: v.observacoes, situacaoPresumida: false, atualizadoEm: Date.now() });
    if (base.origem === 'planilha') {
      const ed = Object.assign({}, base.editado || {});
      if (U.round2(base.valor) !== o.valor) ed.valor = true;
      if (base.data !== o.data) ed.data = true;
      if (base.descricao !== o.descricao) ed.descricao = true;
      o.editado = ed;
    }
    return { o, repetir: +v.repetir || 1, parcelasCompra: +v.parcelasCompra || 1, faturaInicial: v.faturaInicial, compraCartao: !base.id || !App.store.state.lancamentos.some((x) => x.id === base.id) ? (v.formaPagamento === 'Cartão de crédito' && v.tipo === 'despesa' && !!v.parcelasCompra) : false, cartaoSel: v.cartaoId };
  }

  App.editarLancamento = (l) => ui.modal({ titulo: l ? 'Editar lançamento' : 'Novo lançamento', corpo: form(l), aoAbrir: ligarForm, botoes: [{ texto: 'Cancelar' },
    { texto: 'Salvar', classe: 'primary', acao: async (m) => {
      const r = validar(m, l || { id: 'lan-' + U.uid(), origem: 'manual', criadoEm: Date.now() }); if (!r) return false;
      let itens = [r.o];
      if (r.compraCartao) {
        // Compra no cartão: divide em parcelas e lança cada uma na fatura do mês correspondente
        const card = App.store.state.cartoes.find((c) => c.id === r.cartaoSel);
        if (!card) { ui.erro(m.body, 'cartaoId', 'Escolha o cartão da compra.'); return false; }
        const n = r.parcelasCompra, parc = U.round2(r.o.valor / n);
        itens = Array.from({ length: n }, (_, i) => { const mes = U.mesAdd(r.faturaInicial, i);
          return Object.assign({}, r.o, { id: i ? 'lan-' + U.uid() : r.o.id, descricao: r.o.descricao + (n > 1 ? ' (' + (i + 1) + '/' + n + ')' : ''), valor: i < n - 1 ? parc : U.round2(r.o.valor - parc * (n - 1)),
            mesRef: mes, data: U.dataNoMes(mes, card.diaVencimento || +r.o.data.slice(8, 10)), diaVenc: card.diaVencimento || null, cartaoId: card.id, situacao: 'pendente', grupoCompra: n > 1 ? r.o.id : null, dataCompra: r.o.data,
            observacoes: ('Compra de ' + U.brl(r.o.valor) + ' em ' + U.dataBR(r.o.data) + (n > 1 ? ' em ' + n + '×' : '') + '. ' + (r.o.observacoes || '')).trim() }); });
      }
      for (let i = 1; !r.compraCartao && i < r.repetir; i++) {
        const mes = U.mesAdd(r.o.mesRef, i), dia = +r.o.data.slice(8, 10);
        itens.push(Object.assign({}, r.o, { id: 'lan-' + U.uid(), mesRef: mes, data: U.dataNoMes(U.mesAdd(U.mesDeData(r.o.data), i), dia), situacao: 'pendente' }));
      }
      // Evita duplicidade: mesmo tipo, descrição, valor e mês
      const dup = itens.filter((it) => App.store.state.lancamentos.some((x) => x.id !== it.id && x.tipo === it.tipo && x.mesRef === it.mesRef && U.round2(x.valor) === it.valor && U.norm(x.descricao) === U.norm(it.descricao)));
      if (dup.length && !(await ui.confirmar('Possível lançamento repetido', 'Já existe um lançamento igual (mesma descrição, valor e mês) em ' + dup.map((d) => U.mesLabel(d.mesRef)).join(', ') + '. Salvar mesmo assim?', 'Salvar mesmo assim'))) return false;
      await App.store.putMany('lancamentos', itens);
      const cx = App.F.caixaMes(itens[0].mesRef);
      ui.toast(r.compraCartao ? 'Compra lançada nas faturas do cartão (' + itens.map((x) => U.mesLabel(x.mesRef) + ' ' + U.brl(x.valor)).join(', ') + '). Ela não sai do dinheiro agora: entra no "falta pagar" de cada fatura.'
        : (itens.length > 1 ? itens.length + ' lançamentos criados.' : 'Lançamento salvo.') + ' Disponível agora em ' + U.mesLabel(itens[0].mesRef) + ': ' + U.brl(cx.disponivel) + '.', 'good', 7000);
    } }] });

  async function excluir(ids) {
    const ls = App.store.state.lancamentos.filter((l) => ids.includes(l.id));
    const daPlanilha = ls.filter((l) => l.origem === 'planilha');
    const ok = await ui.confirmar('Excluir lançamento' + (ls.length > 1 ? 's' : ''), 'Excluir ' + (ls.length > 1 ? ls.length + ' lançamentos' : '"' + U.esc(ls[0].descricao) + '"') + '?' +
      (daPlanilha.length ? '<br><br>' + daPlanilha.length + ' vieram da planilha.' + (App.sync && App.sync.podeGravar() && App.sync.gravacaoLigada() ? ' A célula correspondente também será <b>apagada na planilha</b>.' : ' Eles não voltam nas próximas importações (você pode desfazer isso em Configurações).') : ''), 'Excluir', true);
    if (!ok) return;
    if (daPlanilha.length) { const ig = new Set(App.store.getMeta('importIgnorados', [])); daPlanilha.forEach((l) => ig.add(l.id)); await App.store.setMeta('importIgnorados', [...ig]); }
    ids.forEach((id) => selecionados.delete(id));
    await App.store.removeMany('lancamentos', ids);
    ui.toast('Excluído.', 'good');
  }

  App.views.lancamentos = {
    render(view, acoes) {
      const st = App.store.state;
      if (!filtro) filtro = { mes: App.sel.mes, tipo: '', categoria: '', situacao: '', cartao: '', busca: '', origem: '' };
      if (App.filtroLancamentos) { Object.assign(filtro, App.filtroLancamentos); App.filtroLancamentos = null; }
      acoes.innerHTML = '<button class="btn primary" id="novoLan">' + ui.icon('plus') + 'Novo lançamento</button>';
      acoes.querySelector('#novoLan').addEventListener('click', () => App.editarLancamento(null));
      const meses = [...new Set([...App.F.mesesComDados(), U.mesAtual()])].sort();
      const cats = [...new Set(st.lancamentos.map((l) => l.categoria))].sort();
      const cartoes = new Map(st.cartoes.map((c) => [c.id, c.nome]));
      const busca = U.norm(filtro.busca);
      const lista = st.lancamentos.filter((l) => (!filtro.mes || l.mesRef === filtro.mes) && (!filtro.tipo || l.tipo === filtro.tipo) && (!filtro.categoria || l.categoria === filtro.categoria) &&
        (!filtro.situacao || (filtro.situacao === 'pago' ? l.situacao === 'pago' : l.situacao !== 'pago')) && (!filtro.cartao || l.cartaoId === filtro.cartao) &&
        (!filtro.origem || (filtro.origem === 'planilha' ? l.origem === 'planilha' : l.origem !== 'planilha')) && (!busca || U.norm(l.descricao + ' ' + l.observacoes + ' ' + l.categoria).includes(busca)))
        .sort((a, b) => (a.data === b.data ? a.descricao.localeCompare(b.descricao) : a.data < b.data ? -1 : 1));
      const rec = U.sum(lista.filter((l) => l.tipo === 'receita'), (l) => l.valor), desp = U.sum(lista.filter((l) => l.tipo === 'despesa'), (l) => l.valor);
      const pend = U.sum(lista.filter((l) => l.tipo === 'despesa' && l.situacao !== 'pago'), (l) => l.valor);
      const hojeISO = U.hojeISO();
      const LIM = 400;
      const ok = (l) => (l.tipo === 'receita' ? App.F.recebida(l) : l.situacao === 'pago');
      const parcial = (l) => l.tipo === 'despesa' && App.F.situacaoDe(l) === 'parcial';
      const cx = filtro.mes ? App.F.caixaMes(filtro.mes) : null;
      view.innerHTML =
        '<section class="panel"><div class="toolbar">' +
        ui.field('Mês', ui.selectMes('fMes', meses, filtro.mes, '<option value=""' + (!filtro.mes ? ' selected' : '') + '>Todos os meses</option>')) +
        ui.field('Tipo', '<select id="fTipo" class="inp">' + [['', 'Todos'], ['despesa', 'Despesas'], ['receita', 'Receitas']].map(([v, t]) => '<option value="' + v + '"' + (filtro.tipo === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>') +
        ui.field('Categoria', '<select id="fCat" class="inp"><option value="">Todas</option>' + cats.map((c) => '<option' + (filtro.categoria === c ? ' selected' : '') + '>' + U.esc(c) + '</option>').join('') + '</select>') +
        ui.field('Situação', '<select id="fSit" class="inp">' + [['', 'Todas'], ['pendente', 'Pendentes'], ['pago', 'Pagas']].map(([v, t]) => '<option value="' + v + '"' + (filtro.situacao === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>') +
        ui.field('Cartão', '<select id="fCar" class="inp"><option value="">Todos</option>' + st.cartoes.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map((c) => '<option value="' + c.id + '"' + (filtro.cartao === c.id ? ' selected' : '') + '>' + U.esc(c.nome) + '</option>').join('') + '</select>') +
        ui.field('Origem', '<select id="fOri" class="inp">' + [['', 'Todas'], ['planilha', 'Planilha'], ['manual', 'Cadastrados aqui']].map(([v, t]) => '<option value="' + v + '"' + (filtro.origem === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>') +
        ui.field('Buscar', '<input id="fBusca" class="inp" value="' + U.esc(filtro.busca) + '" placeholder="descrição…">') + '</div></section>' +
        (cx ? '<section class="kpis" aria-label="Caixa do mês">' +
          ui.kpi({ rotulo: 'Já recebido', valor: U.brl(cx.recebido), icone: 'wallet', sub: cx.aReceber ? 'a receber: ' + U.brl(cx.aReceber) : 'tudo recebido' }) +
          ui.kpi({ rotulo: 'Contas pagas', valor: U.brl(cx.pago), icone: 'check' }) +
          ui.kpi({ rotulo: 'Disponível agora', valor: U.brl(cx.disponivel), icone: 'cash', nivel: cx.disponivel < 0 ? 'bad' : 'good', sub: 'recebido − pago' }) +
          ui.kpi({ rotulo: 'Falta pagar', valor: U.brl(cx.aPagar), icone: 'alert', nivel: cx.aPagar ? 'warn' : 'good' }) +
          ui.kpi({ rotulo: 'Saldo previsto no fim do mês', valor: U.brl(cx.previsto), icone: 'trend', nivel: cx.previsto < 0 ? 'bad' : 'good', sub: 'disponível + a receber − falta pagar' }) + '</section>'
        : '<section class="kpis">' + ui.kpi({ rotulo: 'Lançamentos', valor: String(lista.length), icone: 'list' }) + ui.kpi({ rotulo: 'Receitas', valor: U.brl(rec), icone: 'wallet' }) +
          ui.kpi({ rotulo: 'Despesas', valor: U.brl(desp), icone: 'cash' }) + ui.kpi({ rotulo: 'Despesas pendentes', valor: U.brl(pend), icone: 'alert', nivel: pend ? 'warn' : 'good' }) + '</section>') +
        (cx && (filtro.tipo || filtro.categoria || filtro.situacao || filtro.cartao || filtro.busca || filtro.origem) ? '<p class="hint">Os indicadores acima são do mês inteiro; a lista abaixo está filtrada.</p>' : '') +
        '<section class="panel"><div class="panel-head"><h2 style="margin:0">' + (filtro.mes ? U.mesLongo(filtro.mes) : 'Todos os meses') + '</h2><div class="actions" id="bulk"' + (selecionados.size ? '' : ' style="visibility:hidden"') + '>' +
        '<span class="small muted" id="selCount">' + selecionados.size + ' selecionado(s)</span><button class="btn sm" data-bulk="pago">Marcar pagos</button><button class="btn sm" data-bulk="pendente">Marcar pendentes</button><button class="btn sm danger" data-bulk="del">Excluir</button></div></div>' +
        '<div class="table-wrap"><table><thead><tr><th><input type="checkbox" id="selAll" aria-label="Selecionar todos"></th><th>Data</th><th>Descrição</th><th>Categoria</th><th>Forma / cartão</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>' +
        (lista.slice(0, LIM).map((l) => {
          const venc = l.tipo === 'despesa' && l.situacao !== 'pago' && l.data < hojeISO;
          return '<tr><td><input type="checkbox" data-sel="' + l.id + '"' + (selecionados.has(l.id) ? ' checked' : '') + ' aria-label="Selecionar"></td><td>' + U.dataBR(l.data) + (l.mesRef !== U.mesDeData(l.data) ? '<span class="sub">ref. ' + U.mesLabel(l.mesRef) + '</span>' : '') + '</td>' +
            '<td>' + U.esc(l.descricao) + '<span class="sub">' + (l.origem === 'planilha' ? 'planilha · ' + U.esc(l.fonte) : l.origem === 'simulacao' ? 'criado por simulação' : 'cadastrado aqui') + (l.observacoes ? ' · ' + U.esc(l.observacoes) : '') + '</span></td>' +
            '<td>' + U.esc(l.categoria) + '</td><td>' + U.esc(l.formaPagamento || '—') + (l.cartaoId && cartoes.get(l.cartaoId) ? '<span class="sub">' + U.esc(cartoes.get(l.cartaoId)) + '</span>' : '') + '</td>' +
            '<td class="num ' + (l.tipo === 'receita' ? 'pos' : '') + '">' + (l.tipo === 'receita' ? '+ ' : '') + U.brl(l.valor) + '</td>' +
            '<td><button class="chip ' + (ok(l) ? 'on' : 'off') + '" data-sit="' + l.id + '" title="Clique para alterar">' + (ok(l) ? (l.tipo === 'receita' ? 'recebido' : 'pago') : parcial(l) ? 'parcial: ' + U.brl0(App.F.valorPago(l)) : (l.tipo === 'receita' ? 'a receber' : 'pendente')) + '</button>' + (venc ? ' <span class="pill bad">vencida</span>' : '') + '</td>' +
            '<td class="actions"><button class="btn sm" data-ed="' + l.id + '" aria-label="Editar">' + ui.icon('edit') + '</button><button class="btn sm danger" data-del="' + l.id + '" aria-label="Excluir">' + ui.icon('trash') + '</button></td></tr>';
        }).join('') || '<tr><td colspan="8" class="muted">Nenhum lançamento com esses filtros.</td></tr>') +
        '</tbody>' + (lista.length ? '<tfoot><tr class="total"><td></td><td colspan="4">Total (receitas − despesas)</td><td class="num">' + U.brl(rec - desp) + '</td><td colspan="2"></td></tr></tfoot>' : '') + '</table></div>' +
        (lista.length > LIM ? '<p class="hint">Mostrando ' + LIM + ' de ' + lista.length + '. Use os filtros para ver o restante.</p>' : '') + '</section>';

      const set = (k, v) => { filtro[k] = v; if (k === 'mes' && v) App.sel.mes = v; App.render(); };
      view.querySelector('#fMes').addEventListener('change', (e) => set('mes', e.target.value));
      view.querySelector('#fTipo').addEventListener('change', (e) => set('tipo', e.target.value));
      view.querySelector('#fCat').addEventListener('change', (e) => set('categoria', e.target.value));
      view.querySelector('#fSit').addEventListener('change', (e) => set('situacao', e.target.value));
      view.querySelector('#fCar').addEventListener('change', (e) => set('cartao', e.target.value));
      view.querySelector('#fOri').addEventListener('change', (e) => set('origem', e.target.value));
      view.querySelector('#fBusca').addEventListener('input', U.debounce((e) => { filtro.busca = e.target.value; App.render(); const b = document.getElementById('fBusca'); if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); } }, 300));
      view.querySelectorAll('[data-ed]').forEach((b) => b.addEventListener('click', () => App.editarLancamento(st.lancamentos.find((l) => l.id === b.dataset.ed))));
      view.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => excluir([b.dataset.del])));
      view.querySelectorAll('[data-sit]').forEach((b) => b.addEventListener('click', async () => { const l = st.lancamentos.find((x) => x.id === b.dataset.sit);
        const estava = ok(l);
        await App.store.put('lancamentos', Object.assign({}, l, { situacao: estava ? 'pendente' : 'pago', pagamentos: estava ? [] : l.pagamentos, situacaoPresumida: false, atualizadoEm: Date.now() }));
        ui.toast((l.tipo === 'receita' ? (estava ? 'Marcado como a receber. ' : 'Recebido. ') : (estava ? 'Voltou para pendente. ' : 'Conta paga. ')) + 'Disponível agora em ' + U.mesLabel(l.mesRef) + ': ' + U.brl(App.F.caixaMes(l.mesRef).disponivel), 'good'); }));
      const bulk = view.querySelector('#bulk');
      const atualizaBulk = () => { bulk.style.visibility = selecionados.size ? 'visible' : 'hidden'; view.querySelector('#selCount').textContent = selecionados.size + ' selecionado(s)'; };
      view.querySelectorAll('[data-sel]').forEach((c) => c.addEventListener('change', () => { if (c.checked) selecionados.add(c.dataset.sel); else selecionados.delete(c.dataset.sel); atualizaBulk(); }));
      view.querySelector('#selAll').addEventListener('change', (e) => { lista.slice(0, LIM).forEach((l) => { if (e.target.checked) selecionados.add(l.id); else selecionados.delete(l.id); }); view.querySelectorAll('[data-sel]').forEach((c) => { c.checked = e.target.checked; }); atualizaBulk(); });
      view.querySelectorAll('[data-bulk]').forEach((b) => b.addEventListener('click', async () => {
        const ids = [...selecionados].filter((id) => st.lancamentos.some((l) => l.id === id)); if (!ids.length) return;
        if (b.dataset.bulk === 'del') return excluir(ids);
        await App.store.putMany('lancamentos', st.lancamentos.filter((l) => ids.includes(l.id)).map((l) => Object.assign({}, l, { situacao: b.dataset.bulk, situacaoPresumida: false, atualizadoEm: Date.now() })));
        selecionados.clear();
      }));
    },
  };
})(window.App = window.App || {});
