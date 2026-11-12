/* Compras dos cartões pelo Open Finance (Meu Pluggy).
 * O script do Google (integracao/PluggyFinancas.gs) salva no Drive um arquivo com as compras; a versão online lê esse arquivo
 * e lança cada compra (e as parcelas futuras) na fatura do cartão associado, sem duplicar.
 * Regra: só entram compras feitas a partir da data de início escolhida para o cartão — o que é anterior já está nos valores da planilha.
 * Quando a fatura fecha, o painel compara com o valor oficial do banco e mostra a diferença. */
(function (App) {
  'use strict';
  const U = App.U, ui = App.ui;
  const OF = {};
  OF.NOME_ARQUIVO = 'FINANÇAS IASMYM E TIAGO - compras dos cartões (Open Finance).json';

  OF.dados = () => App.store.getMeta('ofDados', null);
  OF.mapa = () => App.store.getMeta('ofMapa', {}) || {};
  const dia = (iso) => (iso ? +String(iso).slice(8, 10) : null);

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

  /** Dias de fechamento e vencimento do cartão (cadastro do painel, senão o que o banco informou). */
  function dias(conta, card) {
    const venc = (card && card.diaVencimento) || dia(conta.vencimento) || null;
    let fech = (card && card.diaFechamento) || dia(conta.fechamento) || null;
    if (!fech && venc) fech = ((venc - 8 + 30) % 30) || 30; // sem informação: ~7 dias antes do vencimento
    return { fech, venc };
  }
  /** Em que fatura (mês do vencimento) cai uma compra feita nesta data. */
  function mesDaFatura(iso, d) {
    const m = U.mesDeData(iso);
    if (!d.fech) return U.mesAdd(m, 1);
    const mesFech = dia(iso) < d.fech ? m : U.mesAdd(m, 1);
    return d.venc && d.venc > d.fech ? mesFech : U.mesAdd(mesFech, 1);
  }
  OF._mesDaFatura = mesDaFatura;
  /** Primeira fatura ainda não paga: a que já fechou mas vence hoje ou depois, senão a que está aberta. */
  function inicioDoBanco(conta, d) {
    const hoje = U.hojeISO(); let m = mesDaFatura(hoje, d);
    (conta.faturas || []).forEach((f) => { if (f.vencimento && f.vencimento >= hoje) { const fm = U.mesDeData(f.vencimento); if (U.mesDiff(fm, m) > 0) m = fm; } });
    return m;
  }
  OF.inicioDoBanco = (conta) => { const mp = OF.mapa()[conta.id] || {}; const card = App.store.state.cartoes.find((c) => c.id === mp.cartaoId); return inicioDoBanco(conta, dias(conta, card)); };

  /** Calcula o que deve existir no painel a partir do arquivo do Open Finance. Não grava nada. */
  function planejar(dados) {
    const st = App.store.state, mapa = OF.mapa(), hoje = U.hojeISO();
    const desejados = new Map(), cartoesOps = [];
    const catCartao = (App.store.state.categorias.find((c) => c.grupo === 'cartao') || { nome: 'Cartão de crédito' }).nome;
    (dados.contas || []).forEach((conta) => {
      const mp = mapa[conta.id]; if (!mp || !mp.cartaoId) return;
      const card = st.cartoes.find((c) => c.id === mp.cartaoId); if (!card) return;
      const d = dias(conta, card);
      const faturaAtual = mesDaFatura(hoje, d), faturaInicio = mesDaFatura(mp.desde, d);
      const banco = mp.modo === 'banco', inicioBanco = banco ? inicioDoBanco(conta, d) : null;
      const contas = new Map((conta.faturas || []).map((f) => [f.id, f]));
      // atualiza limite e dias do cartão com o que o banco informa
      const lim = conta.limite != null ? U.round2(conta.limite) : card.limite;
      const usado = conta.limite != null && conta.disponivel != null ? U.round2(conta.limite - conta.disponivel) : card.limiteUsado;
      const novoCard = Object.assign({}, card, { limite: lim, limiteUsado: usado, diaFechamento: card.diaFechamento || dia(conta.fechamento) || null, diaVencimento: card.diaVencimento || dia(conta.vencimento) || null });
      if (['limite', 'limiteUsado', 'diaFechamento', 'diaVencimento'].some((k) => novoCard[k] !== card[k])) cartoesOps.push({ store: 'cartoes', item: novoCard });

      (dados.transacoes || []).filter((t) => t.contaId === conta.id && t.tipo === 'DEBIT' && t.valor > 0).forEach((t) => {
        const j = t.parcela || 1, n = Math.max(t.parcelas || 1, j);
        let mes;
        const bill = t.billId && contas.get(t.billId);
        if (bill && bill.vencimento) mes = U.mesDeData(bill.vencimento);
        else if (t.dataCompra && n > 1) mes = U.mesAdd(mesDaFatura(t.dataCompra, d), j - 1);
        else mes = mesDaFatura(t.data, d);
        if (t.status !== 'POSTED' && !bill && U.mesDiff(mes, faturaAtual) > 0) mes = faturaAtual; // ainda não faturada: não pode estar numa fatura que já fechou
        const inicioCompra = U.mesAdd(mes, -(j - 1));
        const dataCompra = t.dataCompra || (n > 1 ? null : t.data);
        // só compras novas (a partir da data de início); o que é anterior já está na planilha
        if (!banco && (dataCompra ? dataCompra < mp.desde : U.mesDiff(faturaInicio, inicioCompra) <= 0)) return;
        if (banco && U.mesDiff(inicioBanco, U.mesAdd(mes, (n > 1 ? n : j) - j)) < 0) return; // modo banco: só o que cai da primeira fatura não paga em diante
        const nome = (t.loja || t.descricao || 'Compra').trim();
        const grupo = n > 1 ? 'of-' + hash(conta.id + '|' + U.slug(t.descricao) + '|' + t.valor.toFixed(2) + '|' + n + '|' + inicioCompra) : null;
        for (let k = j; k <= (n > 1 ? n : 1); k++) {
          const id = n > 1 ? grupo + '-' + k : 'of-' + t.id;
          if (k > j && desejados.has(id)) continue; // a parcela real já veio do banco
          const mesK = U.mesAdd(mes, k - j);
          if (banco && U.mesDiff(inicioBanco, mesK) < 0) continue;
          desejados.set(id, {
            id, origem: 'openfinance', tipo: 'despesa', descricao: nome + (n > 1 ? ' (' + k + '/' + n + ')' : ''), valor: U.round2(t.valor), categoria: catCartao,
            mesRef: mesK, data: U.dataNoMes(mesK, d.venc || 10), diaVenc: d.venc || null, cartaoId: card.id, formaPagamento: 'Cartão de crédito',
            grupoCompra: grupo, dataCompra: dataCompra || t.data, ofConta: conta.id, ofModo: banco ? 'banco' : 'novas', ofTx: k === j ? t.id : null, ofData: t.data, projetado: k > j,
            observacoes: 'Open Finance · compra em ' + U.dataBR(dataCompra || t.data) + (n > 1 ? ' em ' + n + '×' + (k > j ? ' · parcela prevista' : '') : '') + (t.categoria ? ' · ' + t.categoria : ''),
          });
        }
      });
    });
    // Modo "fatura inteira pelo banco": zera o valor da planilha desse cartão a partir da primeira fatura não paga
    // (o valor original fica guardado e volta se o modo for desligado).
    const zerar = new Map();
    (dados.contas || []).forEach((conta) => { const mp = mapa[conta.id]; if (!mp || mp.modo !== 'banco' || !mp.cartaoId) return;
      const card = st.cartoes.find((c) => c.id === mp.cartaoId); if (card) zerar.set(card.id, inicioDoBanco(conta, dias(conta, card))); });
    const planilhaOps = [];
    st.lancamentos.filter((l) => l.origem === 'planilha' && l.tipo === 'despesa' && l.cartaoId).forEach((l) => {
      const ini = zerar.get(l.cartaoId), deveZerar = ini && U.mesDiff(ini, l.mesRef) >= 0;
      if (deveZerar && l.ofZerado == null) planilhaOps.push({ store: 'lancamentos', item: Object.assign({}, l, { ofZerado: l.valor, valor: 0, editado: Object.assign({}, l.editado || {}, { valor: true }) }) });
      // volta o valor guardado; continua marcado como editado para a próxima leitura da planilha não apagar a linha
      // (a célula ainda tem o valor do banco até o painel regravar a planilha)
      else if (!deveZerar && l.ofZerado != null) { const it = Object.assign({}, l, { valor: l.ofZerado, editado: Object.assign({}, l.editado || {}, { valor: true }) }); delete it.ofZerado; planilhaOps.push({ store: 'lancamentos', item: it }); }
    });
    return { desejados, cartoesOps: cartoesOps.concat(planilhaOps) };
  }

  /** Aplica o arquivo: cria/atualiza/remove os lançamentos do Open Finance. Retorna o resumo. */
  OF.aplicar = async (dados) => {
    dados = dados || OF.dados(); if (!dados) return null;
    const st = App.store.state, mapa = OF.mapa(), ex = st.meta.excluidos || {};
    const { desejados, cartoesOps } = planejar(dados);
    // ao trocar o modo, compras que não devem mais existir saem logo abaixo (fora de "desejados")
    const ops = cartoesOps.slice(); let novos = 0, alterados = 0, removidos = 0;
    const pagoNaFatura = (cartaoId, mes) => st.lancamentos.some((l) => l.cartaoId === cartaoId && l.mesRef === mes && l.origem === 'planilha' && l.situacao === 'pago');
    desejados.forEach((n, id) => {
      if (ex[id]) return;                                   // apagado de propósito no painel
      const a = st.lancamentos.find((l) => l.id === id);
      if (!a) { ops.push({ store: 'lancamentos', item: Object.assign({ criadoEm: Date.now(), situacao: pagoNaFatura(n.cartaoId, n.mesRef) ? 'pago' : 'pendente' }, n) }); novos++; return; }
      if (a.editado && Object.keys(a.editado).length) return; // editado à mão: mantém
      if (['valor', 'mesRef', 'descricao', 'projetado', 'cartaoId', 'ofTx', 'ofModo'].some((k) => a[k] !== n[k])) { ops.push({ store: 'lancamentos', item: Object.assign({}, a, n, { situacao: a.situacao, pagamentos: a.pagamentos }) }); alterados++; }
    });
    const contasNoArquivo = new Set((dados.contas || []).map((c) => c.id));
    const limiteJanela = new Date(Date.parse(dados.geradoEm || Date.now()) - 100 * 864e5).toISOString().slice(0, 10);
    st.lancamentos.filter((l) => l.origem === 'openfinance' && l.ofConta && !desejados.has(l.id) && !(l.editado && Object.keys(l.editado).length)).forEach((l) => {
      const semMapa = !mapa[l.ofConta] || !mapa[l.ofConta].cartaoId;
      const sumiu = contasNoArquivo.has(l.ofConta) && (l.projetado || (l.ofData && l.ofData >= limiteJanela)); // compra cancelada / parcela prevista que mudou
      const trocouModo = mapa[l.ofConta] && (mapa[l.ofConta].modo || 'novas') !== (l.ofModo || 'novas');
      if (semMapa || sumiu || trocouModo || (mapa[l.ofConta] && mapa[l.ofConta].cartaoId !== l.cartaoId)) { ops.push({ store: 'lancamentos', del: true, id: l.id }); removidos++; }
    });
    if (ops.length) await App.store.aplicarLote(ops);
    const r = { novos, alterados, removidos, quando: Date.now() };
    await App.store.setMetaSilencioso('ofUltimaAplicacao', r);
    return r;
  };

  /** Recebe o conteúdo novo do arquivo (vindo do Drive) e aplica. */
  OF.receber = async (dados) => {
    if (!dados || dados.fonte !== 'pluggy') return null;
    await App.store.setMetaSilencioso('ofDados', dados);
    const r = await OF.aplicar(dados);
    if (r && r.novos) ui.toast('Open Finance: ' + r.novos + ' compra(s) nova(s) lançada(s) nas faturas.', 'good', 6000);
    return r;
  };

  /** Comparação com as faturas oficiais do banco. */
  OF.conferencia = (conta) => {
    const mp = OF.mapa()[conta.id]; if (!mp || !mp.cartaoId) return [];
    const st = App.store.state, card = st.cartoes.find((c) => c.id === mp.cartaoId); if (!card) return [];
    const d = dias(conta, card), atual = mesDaFatura(U.hojeISO(), d), inicio = mesDaFatura(mp.desde, d);
    const soma = (mes) => U.round2(U.sum(st.lancamentos.filter((l) => l.cartaoId === card.id && l.mesRef === mes && l.tipo === 'despesa'), (l) => l.valor));
    const doOF = (mes) => U.round2(U.sum(st.lancamentos.filter((l) => l.cartaoId === card.id && l.mesRef === mes && l.origem === 'openfinance'), (l) => l.valor));
    const linhas = (conta.faturas || []).filter((f) => f.vencimento && f.total != null && U.mesDiff(inicio, U.mesDeData(f.vencimento)) >= 0)
      .map((f) => { const mes = U.mesDeData(f.vencimento); const s = soma(mes); return { mes, oficial: U.round2(f.total), sistema: s, compras: doOF(mes), diferenca: U.round2(f.total - s), fechada: true }; });
    if (!linhas.some((x) => x.mes === atual)) linhas.push({ mes: atual, oficial: null, sistema: soma(atual), compras: doOF(atual), diferenca: null, fechada: false });
    return linhas.sort((a, b) => (a.mes < b.mes ? -1 : 1)).slice(-4);
  };
  OF.ajustar = async (conta, mes, dif) => {
    const mp = OF.mapa()[conta.id]; const id = 'of-ajuste-' + conta.id.slice(0, 8) + '-' + mes;
    const a = App.store.state.lancamentos.find((l) => l.id === id);
    const valor = U.round2((a ? a.valor : 0) + dif);
    if (valor <= 0.004) { if (a) await App.store.remove('lancamentos', id); return; }
    const card = App.store.state.cartoes.find((c) => c.id === mp.cartaoId);
    await App.store.put('lancamentos', Object.assign({}, a || { criadoEm: Date.now(), situacao: 'pendente' }, { id, origem: 'manual', tipo: 'despesa', descricao: 'Ajuste da fatura ' + (card ? card.nome : '') + ' (valor oficial do banco)', valor,
      categoria: (App.store.state.categorias.find((c) => c.grupo === 'cartao') || { nome: 'Cartão de crédito' }).nome, mesRef: mes, data: U.dataNoMes(mes, (card && card.diaVencimento) || 10), diaVenc: card && card.diaVencimento, cartaoId: mp.cartaoId, formaPagamento: 'Cartão de crédito',
      observacoes: 'Diferença entre a fatura oficial (Open Finance) e o que estava no painel.' }));
  };

  /** Sugestão de cartão do painel para uma conta do banco (pelo nome do banco). */
  function sugerir(conta) {
    const n = U.norm(conta.banco + ' ' + conta.nome);
    const chaves = ['NUBANK', 'MERCADO PAGO', 'AMERICANAS', 'INFINIT', 'ITAU', 'BRADESCO', 'SANTANDER', 'INTER', 'CAIXA', 'NEON', 'PAN', 'C6', 'PICPAY', 'BANCO DO BRASIL'];
    const k = chaves.find((x) => n.indexOf(x) > -1); if (!k) return '';
    const c = App.store.state.cartoes.filter((x) => U.norm(x.nome).indexOf(k) > -1);
    if (c.length <= 1) return c[0] ? c[0].id : '';
    // mais de um cartão do mesmo banco: o que tiver mais palavras em comum com o nome da conta (ex.: o nome do titular)
    const pts = (x) => U.norm(x.nome).split(' ').filter((w) => w.length > 2 && w !== k && n.indexOf(w) > -1).length;
    const ord = c.map((x) => ({ x, p: pts(x) })).sort((a, b) => b.p - a.p);
    return ord[0].p > ord[1].p ? ord[0].x.id : '';
  }

  /* ---------- painel na tela Cartões ---------- */
  OF.painel = () => {
    const dados = OF.dados(), mapa = OF.mapa(), st = App.store.state;
    const N = App.nuvem, online = N && N.ativa();
    let h = '<section class="panel" id="ofPainel"><div class="panel-head"><h2 style="margin:0">Compras automáticas (Open Finance)</h2>' +
      (dados ? '<span class="pill">dados do banco de ' + U.dataHoraBR(Date.parse(dados.geradoEm)) + '</span>' : '') + '</div>';
    if (!dados) {
      return h + '<p class="prose small">As compras dos cartões podem entrar sozinhas aqui, pelo Open Finance (Meu Pluggy, grátis). ' +
        (online ? 'Ainda não encontrei no seu Drive o arquivo de compras. Siga o guia <b>INTEGRAR-CARTOES.txt</b> (que veio no pacote) para ligar.' : 'Isso funciona na versão online (entre com o Google). Veja o guia <b>INTEGRAR-CARTOES.txt</b>.') + '</p></section>';
    }
    const ult = App.store.getMeta('ofUltimaAplicacao', null);
    h += '<p class="prose small">Cada compra nova vai para a fatura certa do cartão (parceladas: todas as parcelas). Compras feitas antes da data de início não entram, porque já estão nos valores da planilha. ' +
      'O banco atualiza o Open Finance cerca de uma vez por dia.' + (ult ? ' Última leitura: ' + ult.novos + ' novas, ' + ult.alterados + ' atualizadas, ' + ult.removidos + ' removidas.' : '') + '</p>';
    if ((dados.erros || []).length) h += '<div class="banner warn">' + ui.icon('alert') + '<div><b>Avisos da última busca no banco</b>' + dados.erros.map(U.esc).join('<br>') + '</div></div>';
    const opts = [{ v: '', t: '— escolher —' }, { v: 'ignorar', t: 'Não lançar (ignorar este cartão)' }].concat(st.cartoes.filter((c) => !c.inativo).sort((a, b) => a.nome.localeCompare(b.nome)).map((c) => ({ v: c.id, t: c.nome })));
    (dados.contas || []).forEach((c) => {
      const mp = mapa[c.id] || {};
      const sel = mp.cartaoId || (mp.ignorar ? 'ignorar' : '');
      const sug = !sel ? sugerir(c) : '';
      h += '<div class="of-conta" style="border-top:1px solid var(--line);padding-top:12px;margin-top:12px">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap"><div><b>' + U.esc(c.banco) + ' — ' + U.esc(c.nome) + '</b>' + (c.numero ? ' <span class="hint">final ' + U.esc(c.numero) + '</span>' : '') +
        '<div class="hint">' + (c.limite != null ? 'limite ' + U.brl(c.limite) + (c.disponivel != null ? ' · disponível ' + U.brl(c.disponivel) : '') : '') + (c.fechamento ? ' · fecha ' + U.dataBR(c.fechamento) : '') + (c.vencimento ? ' · vence ' + U.dataBR(c.vencimento) : '') + '</div></div>' +
        (sel && sel !== 'ignorar' ? '<span class="pill good">lançando</span>' : sel === 'ignorar' ? '<span class="pill">ignorado</span>' : '<span class="pill warn">associe a um cartão</span>') + '</div>' +
        '<div class="form-grid" style="margin-top:8px"><label class="field"><span>Cartão no painel</span>' + ui.select('ofCard-' + c.id, opts, sel || sug) + '</label>' +
        '<label class="field"><span>Lançar compras a partir de</span><input type="date" name="ofDesde-' + c.id + '" value="' + (mp.desde || U.hojeISO()) + '"' + (mp.modo === 'banco' ? ' disabled' : '') + '></label>' +
        '<label class="field" style="grid-column:1/-1"><span>Valor da fatura</span>' + ui.select('ofModo-' + c.id, [{ v: 'novas', t: 'Planilha + compras novas do banco (a partir da data acima)' }, { v: 'banco', t: 'Fatura inteira pelo banco (substitui o valor da planilha a partir da fatura em aberto)' }], mp.modo || 'novas') + '</label></div>' +
        (mp.modo === 'banco' && mp.cartaoId ? '<p class="hint">Desde a fatura de ' + U.mesLongo(OF.inicioDoBanco(c)) + ', o total deste cartão é a soma das compras e parcelas informadas pelo banco. O valor que estava na planilha fica guardado e volta se você mudar esta opção.</p>' : '') +
        '<div class="actions" style="justify-content:flex-start"><button class="btn sm primary" data-of-salvar="' + c.id + '">' + (sel ? 'Salvar' : 'Começar a lançar') + '</button></div>';
      if (mp.cartaoId) {
        const conf = OF.conferencia(c);
        if (conf.length) h += '<div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Fatura</th><th class="num">Compras do Open Finance</th><th class="num">Total no painel</th><th class="num">Oficial do banco</th><th class="num">Diferença</th><th></th></tr></thead><tbody>' +
          conf.map((x) => '<tr><td>' + U.mesLongo(x.mes) + (x.fechada ? '' : ' <span class="hint">(aberta)</span>') + '</td><td class="num">' + U.brl(x.compras) + '</td><td class="num">' + U.brl(x.sistema) + '</td><td class="num">' + (x.oficial != null ? U.brl(x.oficial) : '—') + '</td>' +
            '<td class="num ' + (x.diferenca && Math.abs(x.diferenca) > 0.5 ? (x.diferenca > 0 ? 'neg' : 'pos') : '') + '">' + (x.diferenca != null ? (Math.abs(x.diferenca) <= 0.5 ? 'confere' : U.brl(x.diferenca)) : '—') + '</td>' +
            '<td>' + (x.diferenca != null && x.diferenca > 0.5 ? '<button class="btn sm" data-of-ajustar="' + c.id + '|' + x.mes + '|' + x.diferenca + '">Ajustar</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>';
      }
      h += '</div>';
    });
    return h + '</section>';
  };
  OF.ligar = (view) => {
    view.querySelectorAll('[data-of-salvar]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.dataset.ofSalvar, v = view.querySelector('[name="ofCard-' + id + '"]').value, desde = view.querySelector('[name="ofDesde-' + id + '"]').value || U.hojeISO();
      const modo = view.querySelector('[name="ofModo-' + id + '"]').value;
      if (!v) { ui.toast('Escolha o cartão do painel (ou "Não lançar").', 'bad'); return; }
      const mapa = Object.assign({}, OF.mapa()); mapa[id] = v === 'ignorar' ? { ignorar: true } : { cartaoId: v, desde, modo };
      await App.store.setMeta('ofMapa', mapa);
      const r = await OF.aplicar();
      ui.toast(v === 'ignorar' ? 'Esse cartão não será lançado.' : modo === 'banco' ? 'Pronto: a fatura deste cartão agora vem do banco (' + (r ? r.novos : 0) + ' compra(s)/parcela(s) lançada(s)).' : 'Pronto: ' + (r ? r.novos : 0) + ' compra(s) lançada(s) a partir de ' + U.dataBR(desde) + '.', 'good', 6000);
    }));
    view.querySelectorAll('[data-of-ajustar]').forEach((b) => b.addEventListener('click', async () => {
      const [id, mes, dif] = b.dataset.ofAjustar.split('|'); const conta = (OF.dados().contas || []).find((c) => c.id === id);
      if (await ui.confirmar('Ajustar fatura', 'Lança ' + U.brl(+dif) + ' na fatura de ' + U.mesLongo(mes) + ' para o total ficar igual ao valor oficial do banco (compras anteriores à data de início, juros, tarifas…). Continuar?', 'Ajustar')) { await OF.ajustar(conta, mes, +dif); ui.toast('Fatura ajustada.', 'good'); }
    }));
  };
  App.openfinance = OF;
})(window.App = window.App || {});
