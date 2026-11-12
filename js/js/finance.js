/* Cálculos financeiros. Funções puras sempre que possível (testadas em testes/teste-calculos.js). */
(function (App) {
  'use strict';
  const U = App.U;
  const F = {};
  const GRUPOS_GASTO = ['fixa', 'cartao', 'emprestimo', 'variavel'];

  /* ======================= Mês a mês ======================= */
  F.lancamentosDoMes = (mes, lista) => (lista || App.store.state.lancamentos).filter((l) => l.mesRef === mes);

  F.mesesComDados = (lista) => [...new Set((lista || App.store.state.lancamentos).map((l) => l.mesRef))].filter(Boolean).sort();

  /** Resumo de um mês: totais por grupo, saldo, comprometimento e listas de contas. */
  F.resumoMes = (mes, lista) => {
    const ls = F.lancamentosDoMes(mes, lista);
    const g = { receita: 0, fixa: 0, cartao: 0, emprestimo: 0, variavel: 0, reserva: 0 };
    const cat = {};
    ls.forEach((l) => {
      const grupo = App.Categorias.grupoDe(l);
      g[grupo] = (g[grupo] || 0) + l.valor;
      if (l.tipo === 'despesa' && grupo !== 'reserva') cat[l.categoria] = (cat[l.categoria] || 0) + l.valor;
    });
    Object.keys(g).forEach((k) => { g[k] = U.round2(g[k]); });
    const gastos = U.round2(GRUPOS_GASTO.reduce((a, k) => a + g[k], 0));
    const saldo = U.round2(g.receita - gastos - g.reserva);
    const despesas = ls.filter((l) => l.tipo === 'despesa');
    return {
      mes, receitas: g.receita, fixa: g.fixa, cartao: g.cartao, emprestimo: g.emprestimo, variavel: g.variavel, reserva: g.reserva,
      gastos, saldo, comprometimento: g.receita > 0 ? gastos / g.receita : (gastos > 0 ? Infinity : 0),
      porCategoria: Object.keys(cat).map((k) => ({ categoria: k, valor: U.round2(cat[k]) })).sort((a, b) => b.valor - a.valor),
      pagas: despesas.filter((l) => l.situacao === 'pago'), pendentes: despesas.filter((l) => l.situacao !== 'pago'),
      totalPago: U.sum(despesas, F.valorPago),
      totalPendente: U.round2(U.sum(despesas, (l) => l.valor) - U.sum(despesas, F.valorPago)),
      qtd: ls.length,
    };
  };

  /** Receita já recebida: marcada como recebida, ou com data até hoje (se você não marcou como pendente). */
  /** Quanto já foi pago de uma despesa: tudo, se está paga; senão a soma dos pagamentos parciais. */
  F.valorPago = (l) => (l.situacao === 'pago' ? l.valor : Math.min(l.valor, U.sum(l.pagamentos || [], (p) => +p.valor || 0)));
  /** pago · parcial · pendente */
  F.situacaoDe = (l) => (l.situacao === 'pago' ? 'pago' : (l.pagamentos || []).length && F.valorPago(l) > 0.004 ? 'parcial' : 'pendente');
  F.recebida = (l) => l.situacao === 'pago' || (l.situacaoPresumida !== false && l.data <= U.hojeISO());
  /**
   * Caixa do mês: o que já entrou menos o que já foi pago. Cai na hora em que uma conta é marcada como paga
   * ou uma compra no Pix/débito/dinheiro é lançada.
   */
  F.caixaMes = (mes, lista) => {
    const ls = F.lancamentosDoMes(mes, lista);
    const rec = ls.filter((l) => l.tipo === 'receita'), desp = ls.filter((l) => l.tipo === 'despesa');
    const div = lista ? [] : F.contasDividasMes(mes);
    const recebido = U.sum(rec.filter(F.recebida), (l) => l.valor), receitas = U.sum(rec, (l) => l.valor);
    const pago = U.round2(U.sum(desp, F.valorPago) + U.sum(div, (x) => x.valorPago || 0));
    const despesas = U.round2(U.sum(desp, (l) => l.valor) + U.sum(div, (x) => x.valor));
    const emprestimos = U.sum(rec.filter((l) => /Empréstimo recebido/i.test(l.categoria)), (l) => l.valor);
    return { receitas, recebido, aReceber: U.round2(receitas - recebido), despesas, pago, aPagar: U.round2(despesas - pago), disponivel: U.round2(recebido - pago),
      previsto: U.round2(receitas - despesas), emprestimos, pctPago: despesas > 0 ? pago / despesas : 1, dividas: div };
  };

  /** Pagamentos das dívidas do simulador que caem no mês (as que estão na projeção). Pago = pagamento registrado no mês. */
  F.contasDividasMes = (mes) => App.store.state.dividas.filter((d) => d.incluirProjecao !== false).map((d) => {
    const c = F.calcularDivida(d); const l = c.linhas.find((x) => x.mes === mes);
    if (!l) return null;
    const dia = +String(d.primeiroPagamento || '').slice(8, 10) || 10;
    const previsto = U.round2(Math.min(l.saldoAtualizado, d.modalidade === 'parcelado' ? c.parcela : (+d.pagamentoMensal || c.planejado)));
    if (l.origem === 'registrado') {
      if (!(l.pago > 0)) return null;
      const valor = U.round2(Math.max(previsto, l.pago)); // pagou menos que o previsto = pagamento parcial
      return { divida: d, valor, valorPago: l.pago, pago: l.pago >= valor - 0.004, parcial: l.pago < valor - 0.004, data: U.dataNoMes(mes, dia) };
    }
    return { divida: d, valor: l.pago, valorPago: 0, pago: false, data: U.dataNoMes(mes, dia), parcela: c.parcela };
  }).filter(Boolean);

  /** Situação: verde, amarelo ou vermelho. */
  F.nivel = (r) => {
    if (r.saldo < 0 || r.comprometimento > 0.9) return 'bad';
    if (r.comprometimento > 0.7) return 'warn';
    return 'good';
  };

  /** Variação percentual com tratamento de zero. */
  F.variacao = (atual, anterior) => (anterior ? (atual - anterior) / Math.abs(anterior) : null);

  /** Texto em linguagem simples, montado só com os números do mês. */
  F.textoMes = (r, ant) => {
    if (!r.qtd) return 'Não há lançamentos em ' + U.mesLongo(r.mes) + '.';
    const partes = [];
    partes.push('Em ' + U.mesLongo(r.mes) + ', a renda registrada foi de ' + U.brl(r.receitas) + '.');
    if (r.receitas > 0) partes.push('Os gastos somaram ' + U.brl(r.gastos) + ', o equivalente a ' + U.pct(r.comprometimento) + ' da renda.');
    else partes.push('Os gastos somaram ' + U.brl(r.gastos) + ', mas não há renda registrada neste mês.');
    if (r.saldo >= 0) partes.push('Sobraram ' + U.brl(r.saldo) + (r.reserva ? ', depois de guardar ' + U.brl(r.reserva) : '') + '.');
    else partes.push('Faltaram ' + U.brl(-r.saldo) + ': os gastos passaram da renda.');
    const maior = r.porCategoria[0];
    if (maior && r.gastos > 0) partes.push('O maior peso foi ' + maior.categoria.toLowerCase() + ', com ' + U.brl(maior.valor) + ' (' + U.pct(maior.valor / r.gastos) + ' dos gastos).');
    if (ant && ant.qtd) {
      const v = F.variacao(r.gastos, ant.gastos);
      if (v != null) partes.push(v === 0 ? 'Os gastos ficaram iguais aos de ' + U.mesLongo(ant.mes) + '.'
        : 'Houve ' + (v > 0 ? 'aumento' : 'redução') + ' de ' + U.pct(Math.abs(v)) + ' nos gastos em relação a ' + U.mesLongo(ant.mes) + '.');
    }
    if (r.pendentes.length) partes.push('Ainda há ' + r.pendentes.length + ' conta(s) pendente(s), somando ' + U.brl(r.totalPendente) + '.');
    return partes.join(' ');
  };

  /* ======================= Dívidas ======================= */
  /** Parcela fixa pelo sistema Price. taxa em fração ao mês (0,05 = 5%). */
  F.pmt = (valor, taxa, n) => {
    if (!(n > 0)) return 0;
    if (!taxa) return U.round2(valor / n);
    return U.round2(valor * taxa / (1 - Math.pow(1 + taxa, -n)));
  };

  /** Taxa mensal efetiva de um empréstimo: recebe 'valor' e paga n parcelas de 'parcela' (inclui tarifas embutidas). */
  F.taxaEfetiva = (valor, parcela, n) => {
    if (!(valor > 0) || !(parcela > 0) || parcela * n <= valor + 0.005) return 0;
    let lo = 0, hi = 1;
    for (let k = 0; k < 100; k++) { const mid = (lo + hi) / 2; const vp = parcela * (1 - Math.pow(1 + mid, -n)) / mid; if (vp > valor) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };

  /**
   * Simulação pura de dívida com juros compostos sobre o saldo devedor.
   * A cada mês: juros = saldo × taxa; saldo atualizado = saldo + juros; novo saldo = saldo atualizado − pagamento.
   * Opções: pagamento (por mês), extras {indiceMes: valor}, maxMeses.
   */
  F.simularDivida = (saldoInicial, taxaMensal, pagamento, opts) => {
    opts = opts || {};
    const taxa = (taxaMensal || 0) / 100;
    const extras = opts.extras || {};
    const max = opts.maxMeses || 600;
    const linhas = []; let saldo = U.round2(saldoInicial), totalJuros = 0, totalPago = 0, cresce = false;
    for (let i = 0; i < max && saldo > 0.004; i++) {
      const juros = U.round2(saldo * taxa);
      const atualizado = U.round2(saldo + juros);
      const pagPlan = U.round2((typeof pagamento === 'function' ? pagamento(i, atualizado) : pagamento) || 0);
      const extra = U.round2(extras[i] || 0);
      const pago = Math.min(atualizado, U.round2(pagPlan + extra));
      const novo = U.round2(atualizado - pago);
      totalJuros += juros; totalPago += pago;
      linhas.push({ i, saldoInicial: saldo, juros, saldoAtualizado: atualizado, pagamento: Math.min(pagPlan, pago), extra: U.round2(pago - Math.min(pagPlan, pago)), pago, novoSaldo: novo, aumentou: novo > saldo });
      if (novo >= saldo - 0.004 && !Object.keys(extras).some((k) => +k > i)) { cresce = true; saldo = novo; break; }
      saldo = novo;
    }
    return { linhas, meses: linhas.length, quitada: saldo <= 0.004, saldoFinal: saldo, totalJuros: U.round2(totalJuros), totalPago: U.round2(totalPago), naoQuita: cresce || saldo > 0.004 };
  };

  /**
   * Situação real de uma dívida cadastrada: aplica mês a mês os juros e os pagamentos registrados até o mês atual
   * e, a partir daí, projeta com o pagamento planejado (rotativo) ou a parcela fixa (parcelado).
   */
  F.calcularDivida = (d, override) => {
    override = override || {};
    const taxaPct = override.taxa != null ? override.taxa : (+d.taxa || 0);
    const taxa = taxaPct / 100;
    const mes0 = U.mesDeData(d.primeiroPagamento) || U.mesAtual();
    const hoje = U.mesAtual();
    const parcelado = d.modalidade === 'parcelado';
    const parcela = parcelado ? F.pmt(+d.valorInicial, taxa, +d.parcelas || 1) : null;
    const planejado = override.pagamento != null ? +override.pagamento : (parcelado ? parcela : (+d.pagamentoMensal || 0));
    const pagPorMes = {};
    (d.pagamentos || []).forEach((p) => { let k = U.mesDeData(p.data); if (U.mesDiff(mes0, k) < 0) k = mes0; pagPorMes[k] = U.round2((pagPorMes[k] || 0) + (+p.valor || 0)); });
    const extrasPlan = {}; (override.extras || d.extrasPlanejados || []).forEach((e) => { if (e.mes && +e.valor > 0) extrasPlan[e.mes] = U.round2((extrasPlan[e.mes] || 0) + +e.valor); });
    const extraMensal = +(override.extraMensal || 0);

    const linhas = []; let saldo = U.round2(+d.valorInicial || 0), totalJuros = 0, totalPago = 0, jurosPagos = 0, naoQuita = false;
    let saldoHoje = null, jurosRestantes = 0, k = mes0;
    for (let i = 0; i < 600 && saldo > 0.004; i++, k = U.mesAdd(k, 1)) {
      const passado = U.mesDiff(k, hoje) > 0, atual = k === hoje;
      const juros = U.round2(saldo * taxa);
      const atualizado = U.round2(saldo + juros);
      let pagamento, origem;
      if (passado) { pagamento = pagPorMes[k] || 0; origem = 'registrado'; }
      else if (atual && pagPorMes[k]) { pagamento = pagPorMes[k]; origem = 'registrado'; }
      else { pagamento = U.round2(planejado + extraMensal + (extrasPlan[k] || 0)); origem = 'previsto'; }
      const pago = Math.min(atualizado, pagamento);
      const novo = U.round2(atualizado - pago);
      linhas.push({ mes: k, saldoInicial: saldo, juros, saldoAtualizado: atualizado, pago, novoSaldo: novo, origem, aumentou: novo > saldo + 0.004,
        semPagamento: origem === 'registrado' && pago === 0, parcialParcela: parcelado && origem === 'registrado' && pago + 0.004 < Math.min(parcela, atualizado) });
      totalJuros += juros; totalPago += pago;
      if (origem === 'registrado') jurosPagos += juros; else jurosRestantes += juros;
      if (!passado && !(atual && pagPorMes[k]) && saldoHoje === null) saldoHoje = saldo;
      const temExtraDepois = Object.keys(extrasPlan).some((m) => U.mesDiff(k, m) > 0);
      if (origem === 'previsto' && novo >= saldo - 0.004 && !temExtraDepois) { naoQuita = true; saldo = novo; break; }
      saldo = novo;
    }
    if (saldoHoje === null) saldoHoje = saldo;
    const ultima = linhas[linhas.length - 1];
    const primeiraPrevista = linhas.find((l) => l.origem === 'previsto');
    const restantes = linhas.filter((l) => l.origem === 'previsto');
    return {
      linhas, parcela, planejado, mes0, taxaPct,
      saldoAtual: U.round2(saldoHoje),
      jurosProximoMes: primeiraPrevista ? primeiraPrevista.juros : 0,
      pagamentoMinimoParaNaoCrescer: primeiraPrevista ? primeiraPrevista.juros : 0,
      totalJuros: U.round2(totalJuros), totalPago: U.round2(totalPago), jurosRestantes: U.round2(jurosRestantes),
      totalRegistrado: U.sum(d.pagamentos || [], (p) => +p.valor || 0),
      mesesRestantes: restantes.length, quitacao: naoQuita ? null : (ultima ? ultima.mes : mes0), naoQuita,
      valorParaQuitarHoje: U.round2(saldoHoje),
      economiaQuitandoHoje: parcelado ? U.round2(restantes.reduce((a, l) => a + l.pago, 0) - saldoHoje) : U.round2(jurosRestantes),
      quitada: !naoQuita && saldo <= 0.004 && restantes.length === 0,
    };
  };

  /** Valor previsto de pagamento de cada dívida por mês (para a projeção). */
  F.pagamentosPrevistosDividas = () => {
    const out = {};
    App.store.state.dividas.filter((d) => d.incluirProjecao !== false).forEach((d) => {
      F.calcularDivida(d).linhas.forEach((l) => { if (l.origem === 'previsto') { (out[l.mes] = out[l.mes] || []).push({ divida: d, valor: l.pago, saldoDepois: l.novoSaldo }); } });
    });
    return out;
  };

  /** Saldo devedor das dívidas do simulador ao fim de um mês. */
  F.saldoDividasNoMes = (mes) => U.round2(App.store.state.dividas.filter((d) => d.incluirProjecao !== false).reduce((a, d) => {
    const c = F.calcularDivida(d);
    if (U.mesDiff(c.mes0, mes) < 0) return a + (+d.valorInicial || 0);
    const l = c.linhas.filter((x) => U.mesDiff(x.mes, mes) >= 0).pop();
    return a + (l ? l.novoSaldo : 0);
  }, 0));

  /* ======================= Projeção e simulações ======================= */
  /** Lançamentos "modelo" para meses sem dados da planilha: repete receitas e despesas fixas do último mês com dados. */
  F.modeloRecorrente = (lista) => {
    lista = lista || App.store.state.lancamentos;
    const meses = F.mesesComDados(lista);
    for (let i = meses.length - 1; i >= 0; i--) {
      const ls = lista.filter((l) => l.mesRef === meses[i]);
      const rec = ls.filter((l) => l.tipo === 'receita' && l.categoria === 'Salário');
      if (rec.length) return { mes: meses[i], receitas: rec, fixas: ls.filter((l) => App.Categorias.grupoDe(l) === 'fixa') };
    }
    return { mes: null, receitas: [], fixas: [] };
  };

  /** Converte os itens de uma simulação em valores por mês. */
  F.itensSimulacao = (sim, meses) => {
    const linhas = {}; meses.forEach((m) => { linhas[m] = []; });
    const add = (m, tipo, grupo, desc, valor) => { if (linhas[m] && valor) linhas[m].push({ tipo, grupo, descricao: desc, valor: U.round2(valor) }); };
    (sim.itens || []).forEach((it) => {
      const ini = it.inicio || meses[0];
      const dur = +it.meses > 0 ? +it.meses : 9999;
      const nome = it.descricao || '';
      const emPeriodo = (m) => U.mesDiff(ini, m) >= 0 && U.mesDiff(ini, m) < dur;
      if (it.tipo === 'renda') meses.forEach((m) => { if (emPeriodo(m)) add(m, 'receita', 'receita', nome || 'Nova renda', +it.valor); });
      if (it.tipo === 'salario') meses.forEach((m) => { if (emPeriodo(m)) { const v = +it.valor; if (v >= 0) add(m, 'receita', 'receita', nome || 'Aumento de salário', v); else add(m, 'despesa', 'fixa', nome || 'Redução de salário', -v); } });
      if (it.tipo === 'despesa') meses.forEach((m) => { if (emPeriodo(m)) add(m, 'despesa', it.grupo || 'fixa', nome || 'Nova despesa', +it.valor); });
      if (it.tipo === 'extraordinario') add(ini, 'despesa', 'variavel', nome || 'Gasto extraordinário', +it.valor);
      if (it.tipo === 'parcelada') {
        const n = Math.max(1, +it.parcelas || 1); const p = F.pmt(+it.valor, (+it.taxa || 0) / 100, n);
        for (let i = 0; i < n; i++) add(U.mesAdd(ini, i), 'despesa', 'cartao', (nome || 'Compra parcelada') + ' (' + (i + 1) + '/' + n + ')', p);
      }
      if (it.tipo === 'emprestimo') {
        const n = Math.max(1, +it.parcelas || 1); const p = F.pmt(+it.valor, (+it.taxa || 0) / 100, n);
        add(ini, 'receita', 'receita', (nome || 'Empréstimo') + ' (valor recebido)', +it.valor);
        for (let i = 1; i <= n; i++) add(U.mesAdd(ini, i), 'despesa', 'emprestimo', (nome || 'Empréstimo') + ' (' + i + '/' + n + ')', p);
      }
    });
    return linhas;
  };

  /**
   * Projeção mês a mês. Usa os lançamentos existentes; meses sem dados repetem receitas e despesas fixas do último mês com salário.
   * Inclui gasto variável previsto (Configurações), dívidas do simulador e as simulações indicadas.
   */
  F.projecao = (opts) => {
    opts = opts || {};
    const st = App.store.state;
    const inicio = opts.inicio || U.mesAtual();
    const n = opts.meses || 12;
    const meses = U.mesRange(inicio, U.mesAdd(inicio, n - 1));
    const modelo = F.modeloRecorrente();
    const varPrev = +App.store.getMeta('gastoVariavelPrevisto', 0) || 0;
    const prevDiv = opts.semDividas ? {} : F.pagamentosPrevistosDividas();
    const sims = (opts.simulacoes || []).map((s) => F.itensSimulacao(s, meses));
    const reservaIni = +App.store.getMeta('reservaInicial', 0) || 0;
    let acumulado = 0;
    const out = meses.map((m) => {
      const reais = st.lancamentos.filter((l) => l.mesRef === m);
      const temDados = reais.some((l) => l.tipo === 'receita');
      const linhas = reais.map((l) => ({ tipo: l.tipo, grupo: App.Categorias.grupoDe(l), descricao: l.descricao, valor: l.valor, real: true }));
      let estimado = false;
      if (!temDados && modelo.mes) {
        estimado = true;
        modelo.receitas.forEach((l) => linhas.push({ tipo: 'receita', grupo: 'receita', descricao: l.descricao, valor: l.valor, estimado: true }));
        if (!reais.some((l) => App.Categorias.grupoDe(l) === 'fixa')) modelo.fixas.forEach((l) => linhas.push({ tipo: 'despesa', grupo: 'fixa', descricao: l.descricao, valor: l.valor, estimado: true }));
      }
      if (varPrev > 0 && !reais.some((l) => App.Categorias.grupoDe(l) === 'variavel')) linhas.push({ tipo: 'despesa', grupo: 'variavel', descricao: 'Gasto variável previsto', valor: varPrev, estimado: true });
      (prevDiv[m] || []).forEach((p) => linhas.push({ tipo: 'despesa', grupo: 'emprestimo', descricao: p.divida.nome + ' (simulador de dívidas)', valor: p.valor, divida: true }));
      sims.forEach((s) => (s[m] || []).forEach((x) => linhas.push(Object.assign({ simulado: true }, x))));
      const t = { receita: 0, fixa: 0, cartao: 0, emprestimo: 0, variavel: 0, reserva: 0 };
      linhas.forEach((l) => { t[l.grupo] = (t[l.grupo] || 0) + l.valor; });
      Object.keys(t).forEach((k) => { t[k] = U.round2(t[k]); });
      const despesas = U.round2(t.fixa + t.cartao + t.emprestimo + t.variavel);
      const saldo = U.round2(t.receita - despesas - t.reserva);
      acumulado = U.round2(acumulado + saldo);
      return { mes: m, linhas, estimado, receitas: t.receita, fixa: t.fixa, cartao: t.cartao, emprestimo: t.emprestimo, variavel: t.variavel, reserva: t.reserva,
        despesas, saldo, acumulado, comprometimento: t.receita > 0 ? despesas / t.receita : (despesas > 0 ? Infinity : 0) };
    });
    // Dívidas restantes ao fim de cada mês: faturas/parcelas pendentes dos meses seguintes + saldo das dívidas do simulador
    const futuras = st.lancamentos.filter((l) => l.tipo === 'despesa' && ['cartao', 'emprestimo'].includes(App.Categorias.grupoDe(l)) && l.situacao !== 'pago');
    out.forEach((o) => {
      o.dividasRestantes = U.round2(U.sum(futuras.filter((l) => U.mesDiff(o.mes, l.mesRef) > 0), (l) => l.valor) + (opts.semDividas ? 0 : F.saldoDividasNoMes(o.mes)));
      o.reservaAcumulada = reservaIni;
    });
    return out;
  };

  /** Total de dívidas em aberto hoje: faturas e parcelas pendentes deste mês em diante + saldo das dívidas do simulador. */
  F.dividasEmAberto = () => {
    const hoje = U.mesAtual();
    const st = App.store.state;
    const planilha = U.sum(st.lancamentos.filter((l) => l.tipo === 'despesa' && ['cartao', 'emprestimo'].includes(App.Categorias.grupoDe(l)) && l.situacao !== 'pago' && U.mesDiff(hoje, l.mesRef) >= 0), (l) => l.valor);
    const sim = U.sum(st.dividas.filter((d) => d.incluirProjecao !== false), (d) => F.calcularDivida(d).saldoAtual);
    return { planilha, simulador: sim, total: U.round2(planilha + sim) };
  };

  /** Dinheiro guardado: reserva inicial informada + lançamentos pagos na categoria reserva. */
  F.economizado = () => {
    const ini = +App.store.getMeta('reservaInicial', 0) || 0;
    const mov = U.sum(App.store.state.lancamentos.filter((l) => App.Categorias.grupoDe(l) === 'reserva' && l.situacao === 'pago'), (l) => l.valor);
    return { inicial: ini, movimentos: mov, total: U.round2(ini + mov) };
  };

  /** Dados de um cartão ou empréstimo a partir dos lançamentos ligados a ele. */
  F.resumoCartao = (c) => {
    const hoje = U.mesAtual();
    const ls = App.store.state.lancamentos.filter((l) => l.cartaoId === c.id && l.tipo === 'despesa').sort((a, b) => (a.mesRef < b.mesRef ? -1 : 1));
    const atual = U.sum(ls.filter((l) => l.mesRef === hoje), (l) => l.valor);
    const futuras = ls.filter((l) => U.mesDiff(hoje, l.mesRef) > 0);
    const pendentes = ls.filter((l) => U.mesDiff(hoje, l.mesRef) >= 0 && l.situacao !== 'pago');
    const proximo = pendentes[0] || null;
    const limite = c.limite != null && c.limite !== '' ? +c.limite : null;
    const usado = c.limiteUsado != null && c.limiteUsado !== '' ? +c.limiteUsado : null;
    const restantes = ls.filter((l) => U.mesDiff(hoje, l.mesRef) >= 0);
    return {
      lancamentos: ls, faturaAtual: U.round2(atual), futuras, totalFuturo: U.sum(futuras, (l) => l.valor),
      saldoPrevisto: U.sum(pendentes, (l) => l.valor),
      proximoVencimento: proximo ? proximo.data : null, proximoValor: proximo ? proximo.valor : null,
      limite, usado, disponivel: limite != null && usado != null ? U.round2(limite - usado) : null,
      utilizacao: limite && usado != null ? usado / limite : null,
      parcelasRestantes: restantes.length, ultimaParcela: restantes.length ? restantes[restantes.length - 1].mesRef : null,
      parcelaAtual: restantes.length ? restantes[0].valor : null,
      ativo: restantes.length > 0, historico: U.sum(ls, (l) => l.valor),
    };
  };

  App.F = F;
})(window.App = window.App || {});
