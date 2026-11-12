/* Importação da planilha Excel (SheetJS).
 * Reconhece dois formatos de aba pelo conteúdo (não pela posição):
 *  - "Contas do ano" (ex.: CONTAS 2025, CONTAS 2026): linha "CONTAS E CARTÕES" com colunas JAN…DEZ e "ANO: 2025".
 *  - "Planilha financeira": seções ENTRADAS, DESPESAS FIXAS e CARTÕES DE CRÉDITO E EMPRÉSTIMO com colunas de meses.
 * Cada valor vira um lançamento com uma chave estável (aba + linha + mês), o que permite reimportar sem duplicar. */
(function (App) {
  'use strict';
  const U = App.U, C = App.Categorias;
  const MES_ABREV = { JAN: 0, FEV: 1, MAR: 2, ABR: 3, MAI: 4, JUN: 5, JUL: 6, AGO: 7, SET: 8, OUT: 9, NOV: 10, DEZ: 11 };
  const MES_NOMES = { JANEIRO: 0, FEVEREIRO: 1, MARCO: 2, ABRIL: 3, MAIO: 4, JUNHO: 5, JULHO: 6, AGOSTO: 7, SETEMBRO: 8, OUTUBRO: 9, NOVEMBRO: 10, DEZEMBRO: 11,
    JANUARY: 0, FEBRUARY: 1, MARCH: 2, APRIL: 3, MAY: 4, JUNE: 5, JULY: 6, AUGUST: 7, SEPTEMBER: 8, OCTOBER: 9, NOVEMBER: 10, DECEMBER: 11 };

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const valorCel = (v) => {
    if (isNum(v)) return v;
    if (typeof v === 'string' && /\d/.test(v) && /^[\sR$\d.,-]+$/.test(v)) { const n = U.parseValor(v); return isNaN(n) ? null : n; }
    return null;
  };
  const ref = (r, c) => (window.XLSX ? XLSX.utils.encode_cell({ r, c }) : 'L' + (r + 1) + 'C' + (c + 1));

  /** Lê um cabeçalho de mês: data do Excel, "January-2027", "NOVEMBRO", "JAN". Retorna {m, y|null}. */
  function lerMes(v, abreviado) {
    if (v instanceof Date) return { m: v.getMonth(), y: v.getFullYear() };
    if (isNum(v) && v > 20000 && v < 80000 && window.XLSX) { const d = XLSX.SSF.parse_date_code(v); if (d) return { m: d.m - 1, y: d.y }; }
    if (typeof v !== 'string') return null;
    const n = U.norm(v); if (!n) return null;
    const y = (n.match(/(19|20)\d\d/) || [])[0];
    const nome = n.replace(/[^A-Z]/g, '');
    if (abreviado && MES_ABREV[nome] != null) return { m: MES_ABREV[nome], y: y ? +y : null };
    for (const k in MES_NOMES) if (nome.indexOf(k) === 0 || (nome.length >= 3 && k.indexOf(nome) === 0 && nome.length >= 4)) return { m: MES_NOMES[k], y: y ? +y : null };
    if (MES_ABREV[nome.slice(0, 3)] != null && nome.length === 3) return { m: MES_ABREV[nome], y: y ? +y : null };
    return null;
  }
  /** Dia de vencimento a partir de "DIA 05 DE TODO MÊS", "25 DE TODO MÊS", 10… */
  function lerDia(v) {
    if (isNum(v) && v >= 1 && v <= 31) return Math.round(v);
    const m = String(v || '').match(/(\d{1,2})/); if (!m) return null;
    const d = +m[1]; return d >= 1 && d <= 31 ? d : null;
  }
  function linhas(ws) { return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }); }
  const label = (row) => (row && row[0] != null ? String(row[0]).trim() : '');

  /* ---------- formato "Contas do ano" ---------- */
  function lerAbaAnual(nome, rows, ws) {
    let h = -1;
    for (let r = 0; r < rows.length; r++) if (U.norm(label(rows[r])) === 'CONTAS E CARTOES') { h = r; break; }
    if (h < 0) return null;
    const meses = {};
    rows[h].forEach((v, c) => { const p = lerMes(v, true); if (p && c > 0) meses[c] = p.m; });
    if (Object.keys(meses).length < 6) return null;
    let ano = null;
    rows.forEach((row) => (row || []).forEach((v) => { const m = typeof v === 'string' && v.match(/ANO:\s*((19|20)\d\d)/i); if (m && !ano) ano = +m[1]; }));
    if (!ano) { const m = nome.match(/(19|20)\d\d/); if (m) ano = +m[0]; }
    if (!ano) return { erro: 'Não achei o ano da aba (procurei "ANO: 2025" e o nome da aba).' };

    const receitas = [];
    for (let r = 0; r < h; r++) (rows[r] || []).forEach((v, c) => {
      if (typeof v === 'string' && /^SALARIO/.test(U.norm(v))) {
        for (let k = c + 1; k < Math.min(c + 4, rows[r].length); k++) { const n = valorCel(rows[r][k]); if (n) { receitas.push({ nome: v.trim(), valor: n, ref: ref(r, k) }); break; } }
      }
    });
    const colsMes = Object.keys(meses).map(Number);
    const minC = Math.min(...colsMes), maxC = Math.max(...colsMes);
    const despesas = [], foraTabela = []; let totais = null;
    for (let r = h + 1; r < rows.length; r++) {
      const row = rows[r] || []; const lb = label(row); const n = U.norm(lb);
      if (/^DESPESAS EXTRAS|^PAGAMENTOS POR DATAS/.test(n)) break;
      const vals = {};
      colsMes.forEach((c) => { const v = valorCel(row[c]); if (v != null && v !== 0) vals[meses[c]] = v; });
      if (!lb || /^TOTAL/.test(n)) {
        if (Object.keys(vals).length && !totais) totais = { linha: r + 1, todos: colsMes.reduce((o, c) => { o[meses[c]] = valorCel(row[c]) || 0; return o; }, {}),
          formulas: colsMes.reduce((o, c) => { const cel = ws && ws[ref(r, c)]; if (cel && cel.f) o[meses[c]] = { celula: ref(r, c), f: cel.f }; return o; }, {}) };
        continue;
      }
      if (/^ANO:/.test(n)) continue;
      despesas.push({ label: lb, dia: lerDia(row[1]), vals, linha: r + 1 });
      row.forEach((v, c) => { if (c > maxC && v != null && String(v).trim() !== '') foraTabela.push(ref(r, c) + ' = ' + v + ' (linha "' + lb + '")'); });
    }
    const colDoMes = {}; colsMes.forEach((c) => { colDoMes[U.mesKey(ano, meses[c])] = c; });
    return { tipo: 'anual', nome, ano, receitas, despesas, totais, foraTabela, minC, colDoMes };
  }

  /* ---------- formato "Planilha financeira" ---------- */
  function lerAbaPlanilha(nome, rows, anosEscolhidos, ambiguos) {
    const idx = (txt, from) => { for (let r = from || 0; r < rows.length; r++) if (U.norm(label(rows[r])).replace(/:$/, '') === txt) return r; return -1; };
    const iEnt = idx('ENTRADAS'), iFix = idx('DESPESAS FIXAS'), iCar = (() => { for (let r = 0; r < rows.length; r++) if (/^CARTOES DE CREDITO/.test(U.norm(label(rows[r])))) return r; return -1; })();
    if (iFix < 0 || iCar < 0) return null;
    const hoje = new Date(); const refT = hoje.getFullYear() * 12 + hoje.getMonth();

    /** Interpreta a linha de meses de uma seção. Meses sem ano são resolvidos pelo ano mais próximo de hoje (o usuário pode trocar). */
    function cabecalho(r, secao) {
      const cols = {};
      (rows[r] || []).forEach((v, c) => {
        if (c < 2) return;
        const p = lerMes(v, false); if (!p) return;
        let y = p.y;
        if (y == null) {
          const key = nome + '|' + secao + '|' + ref(r, c);
          const cands = [hoje.getFullYear() - 1, hoje.getFullYear(), hoje.getFullYear() + 1];
          let best = cands.reduce((a, b) => Math.abs(b * 12 + p.m - refT) < Math.abs(a * 12 + p.m - refT) ? b : a);
          if (anosEscolhidos && anosEscolhidos[key]) best = +anosEscolhidos[key];
          ambiguos.push({ key, aba: nome, celula: ref(r, c), texto: String(v), mes: p.m, ano: best, opcoes: cands });
          y = best;
        }
        cols[c] = U.mesKey(y, p.m);
      });
      return cols;
    }
    function secao(iTitulo, nomeSecao) {
      let hd = -1; for (let r = iTitulo + 1; r < iTitulo + 4 && r < rows.length; r++) if (U.norm(label(rows[r])) === 'DESCRICAO') { hd = r; break; }
      if (hd < 0) return { itens: [], cols: {}, totais: null };
      let cols = cabecalho(hd, nomeSecao), first = hd + 1;
      const prox = cabecalho(hd + 1, nomeSecao + '-meses');
      if (Object.keys(prox).length >= Object.keys(cols).length && Object.keys(prox).length > 0) { cols = prox; first = hd + 2; }
      const itens = []; let totais = null;
      for (let r = first; r < rows.length; r++) {
        const row = rows[r] || []; const lb = label(row); const n = U.norm(lb);
        if (/^TOTAL/.test(n)) { totais = { linha: r + 1, vals: {} }; Object.keys(cols).forEach((c) => { const v = valorCel(row[c]); totais.vals[cols[c]] = v == null && row[c] == null ? null : (v || 0); }); break; }
        if (/^CARTOES DE CREDITO|^RESUMO DOS MESES|^DESPESAS FIXAS/.test(n)) break;
        if (!lb) continue;
        const vals = {}; Object.keys(cols).forEach((c) => { const v = valorCel(row[c]); if (v != null && v !== 0) vals[cols[c]] = v; });
        itens.push({ label: lb, dia: lerDia(row[1]), valorPadrao: valorCel(row[2]), vals, linha: r + 1 });
      }
      const colDoMes = {}; Object.keys(cols).forEach((c) => { colDoMes[cols[c]] = +c; });
      return { itens, cols, colDoMes, totais };
    }
    const fixas = secao(iFix, 'fixas');
    const cartoes = secao(iCar, 'cartoes');
    const mesesCobertos = [...new Set([...Object.values(fixas.cols), ...Object.values(cartoes.cols)])].sort();

    // Entradas: valor fixo (coluna VALOR) em todos os meses cobertos + renda eventual por mês (colunas JANEIRO…DEZEMBRO)
    const receitas = [], extras = [], linhasEntrada = []; let colExtraDoMes = {};
    if (iEnt > -1) {
      let hd = -1; for (let r = iEnt + 1; r < iEnt + 4; r++) if (U.norm(label(rows[r])) === 'DESCRICAO') { hd = r; break; }
      if (hd > -1) {
        const colMes = {}; (rows[hd] || []).forEach((v, c) => { if (c >= 3) { const p = lerMes(v, false); if (p) colMes[c] = p.m; } });
        const anoDoMes = {}; mesesCobertos.forEach((k) => { anoDoMes[U.mesParts(k).m] = k; });
        Object.keys(colMes).forEach((c) => { if (anoDoMes[colMes[c]]) colExtraDoMes[anoDoMes[colMes[c]]] = +c; });
        for (let r = hd + 1; r < iFix; r++) {
          const row = rows[r] || []; const lb = label(row); if (!lb) continue;
          linhasEntrada.push({ label: lb, linha: r + 1 });
          const v = valorCel(row[2]);
          if (v) receitas.push({ label: lb, dia: lerDia(row[1]), valor: v, linha: r + 1 });
          Object.keys(colMes).forEach((c) => { const x = valorCel(row[c]); if (x) { const k = anoDoMes[colMes[c]]; if (k) extras.push({ label: lb, mesRef: k, valor: x, linha: r + 1 }); } });
        }
      }
    }
    // Resumo dos meses (só para conferência)
    let resumo = null; const iRes = idx('RESUMO DOS MESES');
    if (iRes > -1) {
      let hm = -1; for (let r = iRes + 1; r < iRes + 4; r++) if ((rows[r] || []).some((v) => lerMes(v, false))) { hm = r; break; }
      if (hm > -1) {
        const colM = {}; rows[hm].forEach((v, c) => { const p = lerMes(v, false); if (p) colM[c] = p.m; });
        const anoDoMes = {}; mesesCobertos.forEach((k) => { anoDoMes[U.mesParts(k).m] = k; });
        resumo = {};
        for (let r = hm + 1; r < Math.min(rows.length, hm + 8); r++) {
          const n = U.norm(label(rows[r])); if (!n) continue;
          const vals = {}; Object.keys(colM).forEach((c) => { const v = valorCel(rows[r][c]); if (v != null && anoDoMes[colM[c]]) vals[anoDoMes[colM[c]]] = v; });
          resumo[n] = vals;
        }
      }
    }
    return { tipo: 'planilha', nome, receitas, extras, fixas, cartoes, mesesCobertos, resumo, linhasEntrada, colExtraDoMes };
  }

  /** Explica a diferença entre o total da planilha e a soma das linhas lendo a fórmula do total (linhas que ficaram de fora e números fixos). */
  function explicarFormula(fm, despesas, m, lin) {
    const incl = new Set(); let f = fm.f.toUpperCase();
    f = f.replace(/\$?([A-Z]{1,3})\$?(\d+):\$?([A-Z]{1,3})\$?(\d+)/g, (x, c1, r1, c2, r2) => { for (let r = +r1; r <= +r2; r++) incl.add(r); return ' '; });
    f = f.replace(/\$?([A-Z]{1,3})\$?(\d+)/g, (x, c, r) => { incl.add(+r); return ' '; });
    const constantes = (f.match(/[-+]\s*\d+(?:\.\d+)?/g) || []).map((x) => parseFloat(x.replace(/\s/g, '')));
    const fora = despesas.filter((d) => !incl.has(d.linha) && d.vals[m]).map((d) => ({ label: d.label, linha: d.linha, valor: d.vals[m] }));
    const somaFora = U.sum(fora, (x) => x.valor), somaConst = U.sum(constantes);
    const partes = [];
    if (fora.length) partes.push('não soma ' + fora.map((x) => x.label + ' (linha ' + x.linha + ', ' + U.brl(x.valor) + ')').join(', '));
    if (constantes.length) partes.push('soma o número fixo ' + constantes.map((x) => U.num2(x)).join(', ') + ' em vez de uma célula');
    return { celula: fm.celula, formula: fm.f, fora, constantes, texto: partes.length ? 'A fórmula ' + fm.celula + ' (=' + fm.f + ') ' + partes.join(' e ') + '.' : '',
      explicada: Math.abs(U.round2(lin.planilha + somaFora - somaConst) - lin.calculado) < 0.01 };
  }

  const ABA_CONTROLE = 'CONTROLE DO DASHBOARD';
  /** Lê a aba que o painel grava: situação de cada lançamento e quanto o painel somou em cada célula. */
  function lerControle(rows) {
    const out = { status: {}, contrib: {}, gravado: {} };
    const sit = (v) => { const sx = U.norm(v); return /PARCIAL/.test(sx) ? 'parcial' : /PAG|RECEB/.test(sx) ? 'pago' : 'pendente'; };
    let modo = null, cab = null;
    rows.forEach((row) => {
      const a = U.norm(label(row));
      if (a === 'LANCAMENTOS DO PAINEL') { modo = 'lan'; cab = null; return; }
      if (a === 'VALORES SOMADOS PELO PAINEL NAS CELULAS') { modo = 'contrib'; cab = null; return; }
      if (a === 'DIVIDAS DO SIMULADOR') { modo = null; return; }
      if (!modo || !row) return;
      if (!cab) { cab = row.map((x) => U.norm(x)); return; }
      const col = (n) => row[cab.indexOf(n)];
      if (modo === 'lan' && col('ID')) {
        out.status[String(col('ID'))] = sit(col('SITUACAO'));
        const ig = cab.indexOf('SITUACAO GRAVADA PELO PAINEL (NAO EDITAR)'); if (ig > -1 && row[ig]) out.gravado[String(col('ID'))] = sit(row[ig]);
      }
      if (modo === 'contrib' && col('ABA') && col('LINHA') && col('MES')) {
        const v = valorCel(col('VALOR GRAVADO PELO PAINEL')); if (v) out.contrib[col('ABA') + '|' + (+col('LINHA')) + '|' + String(col('MES'))] = v;
      }
    });
    return out;
  }

  /* ---------- análise completa (não grava nada) ---------- */
  function analisar(wb, opts) {
    opts = opts || {};
    const st = App.store.state;
    const aliases = App.store.getMeta('aliasesCartao', {});
    const ignorados = new Set(App.store.getMeta('importIgnorados', []));
    const mesAtual = U.mesAtual();
    const ambiguos = [], avisos = [], abas = [];
    let controle = { status: {}, contrib: {} };
    wb.SheetNames.forEach((nome) => {
      const rows = linhas(wb.Sheets[nome]);
      if (U.norm(nome) === ABA_CONTROLE) { controle = lerControle(rows); return; }
      const a = lerAbaAnual(nome, rows, wb.Sheets[nome]) || lerAbaPlanilha(nome, rows, opts.anos, ambiguos);
      if (!a) { abas.push({ nome, tipo: 'ignorada', motivo: 'Formato não reconhecido' }); return; }
      if (a.erro) { abas.push({ nome, tipo: 'ignorada', motivo: a.erro }); return; }
      abas.push(a);
    });

    // Prioridade quando o mesmo mês aparece em mais de uma aba: a ordem escolhida, senão "planilha" antes das anuais e anos mais novos primeiro.
    const reconhecidas = abas.filter((a) => a.tipo !== 'ignorada');
    let ordem = opts.prioridade && opts.prioridade.length ? opts.prioridade.slice() : reconhecidas
      .slice().sort((x, y) => (x.tipo === y.tipo ? (y.ano || 0) - (x.ano || 0) : (x.tipo === 'planilha' ? -1 : 1))).map((a) => a.nome);
    ordem = ordem.filter((n) => reconhecidas.some((a) => a.nome === n));
    const donoDoMes = {};
    const mesesDaAba = (a) => a.tipo === 'planilha' ? a.mesesCobertos
      : [...new Set(a.despesas.flatMap((d) => Object.keys(d.vals).map((m) => U.mesKey(a.ano, +m))))].sort();
    ordem.forEach((n) => { const a = reconhecidas.find((x) => x.nome === n); mesesDaAba(a).forEach((k) => { if (!donoDoMes[k]) donoDoMes[k] = n; }); });
    const conflitos = {};
    reconhecidas.forEach((a) => mesesDaAba(a).forEach((k) => { if (donoDoMes[k] !== a.nome) (conflitos[a.nome + '→' + donoDoMes[k]] = conflitos[a.nome + '→' + donoDoMes[k]] || []).push(k); }));
    Object.keys(conflitos).forEach((par) => { const [perde, ganha] = par.split('→');
      avisos.push(conflitos[par].map(U.mesLabel).join(', ') + ' aparecem nas abas "' + perde + '" e "' + ganha + '". Usei "' + ganha + '" para esses meses.'); });

    const lancs = [], cartoes = {}, conferencia = [];
    const cartaoDe = (lb, dia, tipoConta) => {
      const n = U.norm(lb);
      const id = aliases[n] || ('card-' + U.slug(lb));
      if (!cartoes[id]) cartoes[id] = { id, nome: U.titulo(lb), tipo: tipoConta === 'emprestimo' ? 'emprestimo' : 'cartao', diaVencimento: dia, nomesPlanilha: [lb] };
      else { if (!cartoes[id].diaVencimento && dia) cartoes[id].diaVencimento = dia; if (cartoes[id].nomesPlanilha.indexOf(lb) < 0) cartoes[id].nomesPlanilha.push(lb); }
      return id;
    };
    const ocorr = {};
    const addDespesa = (aba, lb, dia, mesRef, valor, linha) => {
      if (donoDoMes[mesRef] !== aba) return;
      valor = U.round2(valor - (controle.contrib[aba + '|' + linha + '|' + mesRef] || 0));
      if (valor <= 0.004) return;
      const base = 'imp-' + U.slug(aba) + '-' + U.slug(lb) + '-' + mesRef;
      ocorr[base] = (ocorr[base] || 0) + 1;
      const id = ocorr[base] > 1 ? base + '-' + ocorr[base] : base;
      const cl = C.classificar(lb);
      const card = cl.tipoConta ? cartaoDe(lb, dia, cl.tipoConta) : null;
      lancs.push({ id, origem: 'planilha', fonte: aba, linhaPlanilha: linha, descricao: U.titulo(lb), nomePlanilha: lb, tipo: 'despesa',
        categoria: cl.categoria, grupo: cl.grupo, valor: U.round2(valor), mesRef, diaVenc: dia, data: U.dataNoMes(mesRef, dia),
        formaPagamento: card ? (cl.grupo === 'cartao' ? 'Fatura do cartão' : 'Boleto / débito') : '', cartaoId: card,
        situacao: U.mesDiff(mesRef, mesAtual) > 0 ? 'pago' : 'pendente', situacaoPresumida: true, observacoes: '' });
    };
    const addReceita = (aba, lb, dia, mesRef, valor, sufixo, linha) => {
      if (donoDoMes[mesRef] !== aba) return;
      if (linha) { valor = U.round2(valor - (controle.contrib[aba + '|' + linha + '|' + mesRef] || 0)); if (valor <= 0.004) return; }
      const id = 'imp-' + U.slug(aba) + '-rec-' + U.slug(lb) + (sufixo || '') + '-' + mesRef;
      lancs.push({ id, origem: 'planilha', fonte: aba, linhaPlanilha: linha || null, descricao: U.titulo(lb), nomePlanilha: lb, tipo: 'receita', categoria: sufixo ? 'Renda extra' : C.classificarReceita(lb),
        grupo: 'receita', valor: U.round2(valor), mesRef, diaVenc: dia, data: U.dataNoMes(mesRef, dia), formaPagamento: 'Conta bancária', cartaoId: null,
        situacao: U.mesDiff(mesRef, mesAtual) > 0 ? 'pago' : 'pendente', situacaoPresumida: true, observacoes: '' });
    };

    // Processa na ordem de prioridade: o dia de vencimento do cartão vem da aba mais nova
    ordem.map((n) => reconhecidas.find((a) => a.nome === n)).forEach((a) => {
      if (a.tipo === 'anual') {
        a.despesas.forEach((d) => Object.keys(d.vals).forEach((m) => addDespesa(a.nome, d.label, d.dia, U.mesKey(a.ano, +m), d.vals[m], d.linha)));
        const mesesComDados = mesesDaAba(a).filter((k) => donoDoMes[k] === a.nome);
        mesesComDados.forEach((k) => a.receitas.forEach((rc) => addReceita(a.nome, rc.nome, 5, k, rc.valor)));
        if (a.foraTabela.length) avisos.push('Aba "' + a.nome + '": ' + a.foraTabela.length + ' valor(es) fora das colunas de meses não foram importados: ' + a.foraTabela.join('; ') + '.');
        if (a.totais) {
          const linhasConf = Object.keys(a.totais.todos).map((m) => {
            const k = U.mesKey(a.ano, +m);
            const calc = U.sum(lancs.filter((l) => l.fonte === a.nome && l.mesRef === k && l.tipo === 'despesa'), (l) => l.valor);
            const lin = { mes: k, planilha: U.round2(a.totais.todos[m]), calculado: calc, usado: donoDoMes[k] === a.nome };
            if (Math.abs(lin.planilha - lin.calculado) > 0.004 && a.totais.formulas[m]) lin.explicacao = explicarFormula(a.totais.formulas[m], a.despesas, +m, lin);
            return lin;
          }).filter((x) => x.planilha || x.calculado);
          conferencia.push({ aba: a.nome, linha: a.totais.linha, titulo: 'Total de despesas por mês', linhas: linhasConf });
        }
      } else {
        [a.fixas, a.cartoes].forEach((s) => s.itens.forEach((d) => Object.keys(d.vals).forEach((k) => addDespesa(a.nome, d.label, d.dia, k, d.vals[k], d.linha))));
        a.mesesCobertos.forEach((k) => a.receitas.forEach((rc) => addReceita(a.nome, rc.label, rc.dia, k, rc.valor)));
        a.extras.forEach((x) => addReceita(a.nome, x.label, null, x.mesRef, x.valor, '-extra', x.linha));
        [['Despesas fixas', a.fixas], ['Cartões e empréstimos', a.cartoes]].forEach(([titulo, s]) => {
          if (!s.totais) return;
          const nomes = new Set(s.itens.map((i) => i.label));
          conferencia.push({ aba: a.nome, linha: s.totais.linha, titulo, linhas: Object.keys(s.totais.vals).sort().map((k) => ({
            mes: k, planilha: s.totais.vals[k] == null ? null : U.round2(s.totais.vals[k]),
            calculado: U.round2(U.sum(lancs.filter((l) => l.fonte === a.nome && l.mesRef === k && l.tipo === 'despesa' && nomes.has(l.nomePlanilha)), (l) => l.valor) +
              U.sum(s.itens.map((i) => controle.contrib[a.nome + '|' + i.linha + '|' + k] || 0))), usado: donoDoMes[k] === a.nome })) });
        });
        if (a.resumo && a.resumo['TOTAL DE ENTRADAS']) {
          conferencia.push({ aba: a.nome, titulo: 'Total de entradas (Resumo dos meses)', linhas: Object.keys(a.resumo['TOTAL DE ENTRADAS']).sort().map((k) => ({
            mes: k, planilha: U.round2(a.resumo['TOTAL DE ENTRADAS'][k]), calculado: U.sum(lancs.filter((l) => l.fonte === a.nome && l.mesRef === k && l.tipo === 'receita'), (l) => l.valor), usado: true })) });
        }
      }
    });

    // Conta sem dia na planilha usa o dia de vencimento do cartão (de outra aba ou do cadastro)
    lancs.forEach((l) => {
      if (l.diaVenc || !l.cartaoId) return;
      const salvo = st.cartoes.find((c) => c.id === l.cartaoId);
      const dia = (salvo && salvo.diaVencimento) || (cartoes[l.cartaoId] && cartoes[l.cartaoId].diaVencimento);
      if (dia) { l.diaVenc = dia; l.data = U.dataNoMes(l.mesRef, dia); l.diaDoCartao = true; }
    });

    // Diferenças em relação ao que já está salvo
    const atuais = new Map(st.lancamentos.filter((l) => l.origem === 'planilha').map((l) => [l.id, l]));
    const novos = [], alterados = [], iguais = [], pulados = [];
    const vistos = new Set();
    lancs.forEach((l) => {
      vistos.add(l.id);
      if (ignorados.has(l.id)) { pulados.push(l); return; }
      const e = atuais.get(l.id);
      if (!e) { novos.push(l); return; }
      const ed = e.editado || {};
      const mudou = [];
      if (U.round2(e.valor) !== l.valor && !ed.valor) mudou.push({ campo: 'valor', de: e.valor, para: l.valor });
      if (e.data !== l.data && !ed.data) mudou.push({ campo: 'data', de: e.data, para: l.data });
      if (e.descricao !== l.descricao && !ed.descricao) mudou.push({ campo: 'descrição', de: e.descricao, para: l.descricao });
      if (mudou.length) alterados.push({ antigo: e, novo: l, mudou }); else iguais.push(l);
    });
    const removidos = [], mantidos = [];
    atuais.forEach((e, id) => { if (!vistos.has(id)) { if (e.editado && Object.keys(e.editado).length) mantidos.push(e); else removidos.push(e); } });
    // Possíveis duplicatas com lançamentos feitos à mão
    const manuais = st.lancamentos.filter((l) => l.origem !== 'planilha');
    const duplicatas = novos.filter((l) => manuais.some((m) => m.mesRef === l.mesRef && m.tipo === l.tipo && U.round2(m.valor) === l.valor && U.norm(m.descricao) === U.norm(l.descricao)));

    // O que o painel gravou na aba (coluna própria; vale também quando quem gravou foi o outro aparelho). Planilhas antigas: o que este aparelho gravou.
    const gravado = Object.keys(controle.gravado || {}).length ? controle.gravado : (App.store.getMeta('controleGravado', {}) || {});
    const statusExterno = Object.keys(controle.status).map((id) => ({ id, situacao: controle.status[id] }))
      .filter((x) => gravado[x.id] && gravado[x.id] !== x.situacao)
      .filter((x) => x.situacao !== 'parcial') // valor parcial só se registra pelo painel
      .map((x) => ({ x, l: st.lancamentos.find((l) => l.id === x.id) })).filter((o) => o.l && App.F.situacaoDe(o.l) !== o.x.situacao).map((o) => ({ id: o.x.id, situacao: o.x.situacao, descricao: o.l.descricao, mesRef: o.l.mesRef }));
    // Mapa das células (para o painel gravar de volta)
    const mapa = reconhecidas.map((a) => a.tipo === 'anual'
      ? { aba: a.nome, tipo: 'anual', linhas: a.despesas.map((d) => ({ linha: d.linha, label: d.label, secao: 'contas', colDoMes: a.colDoMes })) }
      : { aba: a.nome, tipo: 'planilha', linhas: [].concat(a.fixas.itens.map((d) => ({ linha: d.linha, label: d.label, secao: 'fixas', colDoMes: a.fixas.colDoMes })),
          a.cartoes.itens.map((d) => ({ linha: d.linha, label: d.label, secao: 'cartoes', colDoMes: a.cartoes.colDoMes })),
          a.linhasEntrada.map((d) => ({ linha: d.linha, label: d.label, secao: 'entradas', colDoMes: a.colExtraDoMes }))), mesesCobertos: a.mesesCobertos });
    const novosCartoes = Object.values(cartoes).filter((c) => !st.cartoes.some((x) => x.id === c.id));
    return { abas, ambiguos, avisos, conferencia, lancamentos: lancs, cartoes: Object.values(cartoes), novosCartoes,
      diff: { novos, alterados, iguais, removidos, mantidos, pulados, duplicatas }, ordem, donoDoMes, mapa, controle, statusExterno };
  }

  /** Grava o resultado da análise, preservando o que o usuário editou (situação, observações, forma de pagamento…). */
  async function aplicar(res, nomeArquivo) {
    const ops = [];
    const agora = Date.now();
    res.diff.novos.forEach((l) => ops.push({ store: 'lancamentos', item: Object.assign({}, l, { criadoEm: agora, atualizadoEm: agora }) }));
    res.diff.alterados.forEach(({ antigo, novo }) => {
      const ed = antigo.editado || {};
      const item = Object.assign({}, antigo, { atualizadoEm: agora });
      ['valor', 'data', 'descricao', 'diaVenc', 'nomePlanilha', 'linhaPlanilha'].forEach((k) => { if (!ed[k]) item[k] = novo[k]; });
      ops.push({ store: 'lancamentos', item });
    });
    res.diff.removidos.forEach((l) => ops.push({ store: 'lancamentos', del: true, id: l.id }));
    (res.statusExterno || []).forEach((x) => { const l = App.store.state.lancamentos.find((y) => y.id === x.id);
      if (l) ops.push({ store: 'lancamentos', item: Object.assign({}, l, { situacao: x.situacao, pagamentos: x.situacao === 'pendente' ? [] : l.pagamentos, situacaoPresumida: false, atualizadoEm: agora }) }); });
    res.cartoes.forEach((c) => {
      const e = App.store.state.cartoes.find((x) => x.id === c.id);
      if (!e) ops.push({ store: 'cartoes', item: Object.assign({ limite: null, limiteUsado: null, taxaJuros: null, valorOriginal: null, parcelasTotal: null, observacoes: '', origem: 'planilha', criadoEm: agora }, c) });
      else {
        const item = Object.assign({}, e);
        if (!item.diaVencimento && c.diaVencimento) item.diaVencimento = c.diaVencimento;
        item.nomesPlanilha = [...new Set([...(e.nomesPlanilha || []), ...c.nomesPlanilha])];
        ops.push({ store: 'cartoes', item });
      }
    });
    const registro = { quando: agora, arquivo: nomeArquivo || '', novos: res.diff.novos.length, alterados: res.diff.alterados.length + (res.statusExterno || []).length, removidos: res.diff.removidos.length,
      iguais: res.diff.iguais.length, abas: res.abas.map((a) => a.nome + (a.tipo === 'ignorada' ? ' (ignorada)' : '')) };
    const hist = (App.store.getMeta('historicoImportacao', []) || []).slice(-19);
    hist.push(registro);
    ops.push({ store: 'meta', item: { id: 'historicoImportacao', value: hist } });
    ops.push({ store: 'meta', item: { id: 'ultimaImportacao', value: registro } });
    await App.store.aplicarLote(ops);
    return registro;
  }

  async function lerArquivo(file) {
    const buf = await file.arrayBuffer();
    return XLSX.read(buf, { type: 'array', cellDates: false });
  }

  App.Importer = { analisar, aplicar, lerArquivo, ABA_CONTROLE, _lerMes: lerMes, _lerDia: lerDia };
})(window.App = window.App || {});
