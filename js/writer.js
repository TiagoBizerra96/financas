/* Grava as mudanças do painel na planilha .xlsx sem refazer o arquivo:
 *  - abre o .xlsx (JSZip) e altera só o XML das células que mudaram, mantendo estilo, comentários, mesclagens e fórmulas;
 *  - parcelas de cartão e receitas criadas no painel são somadas nas células da aba PLANILHA FINANCEIRA
 *    (e registradas na aba de controle, para não serem contadas duas vezes na próxima leitura);
 *  - cria/atualiza a aba "CONTROLE DO DASHBOARD" com todos os lançamentos e a situação (pago/pendente);
 *  - pede ao Excel/Google Sheets para recalcular as fórmulas ao abrir. */
(function (App) {
  'use strict';
  const U = App.U;
  const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const T_WS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet';
  const CT_WS = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';

  const colLetra = (n) => { let s = ''; n += 1; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const colNum = (l) => { let n = 0; for (const ch of l) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const partRef = (ref) => { const m = ref.match(/^([A-Z]+)(\d+)$/); return { c: colNum(m[1]), r: +m[2] }; };
  const escXml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const attr = (tag, n) => { const m = tag.match(new RegExp('\\b' + n + '="([^"]*)"')); return m ? m[1] : null; };
  const num = (v) => { const n = U.round2(v); return String(n); };

  /** Desloca as referências relativas de uma fórmula (para desfazer fórmulas compartilhadas). */
  function deslocar(f, dr, dc) {
    return f.replace(/('[^']*'!|[A-Za-z_][\w.]*!)?(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\w(])|(\$?)([A-Z]{1,3}):(\$?)([A-Z]{1,3})(?![\w(\d])/g,
      (m, sh, a1, c1, a2, r1, b1, cA, b2, cB) => {
        if (c1) return (sh || '') + a1 + (a1 ? c1 : colLetra(colNum(c1) + dc)) + a2 + (a2 ? r1 : (+r1 + dr));
        return b1 + (b1 ? cA : colLetra(colNum(cA) + dc)) + ':' + b2 + (b2 ? cB : colLetra(colNum(cB) + dc));
      });
  }

  /** Planilha (XML de uma aba) com operações de célula. */
  function Folha(xml) { this.xml = xml; this.notas = []; }
  Folha.prototype.acharLinha = function (r) {
    const re = new RegExp('<row\\b[^>]*\\br="' + r + '"[^>]*?(/>|>)');
    const m = re.exec(this.xml); if (!m) return null;
    if (m[1] === '/>') return { ini: m.index, fimTag: m.index + m[0].length, fim: m.index + m[0].length, vazia: true, tag: m[0] };
    const fim = this.xml.indexOf('</row>', m.index);
    return { ini: m.index, fimTag: m.index + m[0].length, fim: fim + 6, vazia: false, tag: m[0] };
  };
  Folha.prototype.acharCelula = function (ref) {
    const lin = this.acharLinha(partRef(ref).r); if (!lin || lin.vazia) return { lin, cel: null };
    const corpo = this.xml.slice(lin.fimTag, lin.fim - 6);
    const re = new RegExp('<c\\b[^>]*\\br="' + ref + '"[^>]*?(/>|>[\\s\\S]*?</c>)');
    const m = re.exec(corpo);
    return { lin, cel: m ? { ini: lin.fimTag + m.index, fim: lin.fimTag + m.index + m[0].length, txt: m[0] } : null };
  };
  /** Se a célula é a "mestra" de uma fórmula compartilhada, escreve a fórmula explícita em cada célula que a usa. */
  Folha.prototype.desfazerCompartilhada = function (txtCel, ref) {
    const fm = txtCel.match(/<f\b([^>]*)>([^<]*)<\/f>/); if (!fm || attr(fm[1], 't') !== 'shared' || !attr(fm[1], 'ref')) return;
    const si = attr(fm[1], 'si'), base = partRef(ref), formula = unesc(fm[2]);
    const re = new RegExp('<c\\b([^>]*)\\br="([A-Z]+\\d+)"([^>]*)>([\\s\\S]*?)</c>', 'g');
    this.xml = this.xml.replace(re, (todo, a1, r2, a3, corpo) => {
      const f = corpo.match(/<f\b([^>]*)\/>|<f\b([^>]*)>([^<]*)<\/f>/); if (!f) return todo;
      const at = f[1] || f[2]; if (attr(at, 't') !== 'shared' || attr(at, 'si') !== si) return todo;
      const p = partRef(r2); const nova = '<f>' + escXml(deslocar(formula, p.r - base.r, p.c - base.c)) + '</f>';
      return '<c' + a1 + ' r="' + r2 + '"' + a3 + '>' + corpo.replace(f[0], nova) + '</c>';
    });
    this.notas.push('fórmula compartilhada a partir de ' + ref + ' reescrita célula a célula');
  };
  /** Referências (A1) usadas por uma fórmula, na própria aba. Intervalos viram {c1,r1,c2,r2}. */
  function refsDaFormula(f) {
    const out = [];
    f.replace(/('[^']*'!|[A-Za-z_][\w.]*!)?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?(?![\w(])|('[^']*'!|[A-Za-z_][\w.]*!)?\$?([A-Z]{1,3}):\$?([A-Z]{1,3})(?![\w(\d])/g,
      (m, sh, c1, r1, c2, r2, sh2, cA, cB) => {
        if (sh || sh2) return m; // outra aba: ignora
        if (c1) out.push({ c1: colNum(c1), r1: +r1, c2: colNum(c2 || c1), r2: +(r2 || r1) });
        else out.push({ c1: colNum(cA), r1: 1, c2: colNum(cB), r2: 1048576 });
        return m;
      });
    return out;
  }
  /**
   * Apaga o valor guardado (cache) das fórmulas que dependem das células alteradas — totais, resumos —, para o Excel,
   * o Google Sheets e o LibreOffice mostrarem o total recalculado. Células de dados (protegidas) nunca perdem o valor.
   */
  Folha.prototype.limparCacheDependentes = function (alteradas, protegidas) {
    const cels = []; const mestres = {};
    const re = /<c\b[^>]*\br="([A-Z]+\d+)"[^>]*>([\s\S]*?)<\/c>/g; let m;
    while ((m = re.exec(this.xml))) {
      const fm = m[2].match(/<f\b([^>]*)\/>|<f\b([^>]*)>([^<]*)<\/f>/); if (!fm) continue;
      const at = fm[1] != null ? fm[1] : fm[2];
      if (fm[3] != null && attr(at, 't') === 'shared' && attr(at, 'ref')) mestres[attr(at, 'si')] = { ref: m[1], f: unesc(fm[3]) };
      cels.push({ ref: m[1], f: fm[3] != null ? unesc(fm[3]) : null, si: attr(at, 't') === 'shared' ? attr(at, 'si') : null });
    }
    cels.forEach((c) => { if (c.f == null && c.si && mestres[c.si]) { const b = partRef(mestres[c.si].ref), p = partRef(c.ref); c.f = deslocar(mestres[c.si].f, p.r - b.r, p.c - b.c); } c.refs = c.f ? refsDaFormula(c.f) : []; });
    const sujas = new Set(alteradas); let mudou = true;
    const dentro = (ref, rg) => { const p = partRef(ref); return p.c >= rg.c1 && p.c <= rg.c2 && p.r >= rg.r1 && p.r <= rg.r2; };
    while (mudou) {
      mudou = false;
      cels.forEach((c) => { if (sujas.has(c.ref) || protegidas.has(c.ref)) return; if ([...sujas].some((s) => c.refs.some((rg) => dentro(s, rg)))) { sujas.add(c.ref); mudou = true; } });
    }
    let n = 0;
    cels.forEach((c) => {
      if (!sujas.has(c.ref) || alteradas.has(c.ref) || protegidas.has(c.ref)) return;
      const r2 = new RegExp('(<c\\b[^>]*\\br="' + c.ref + '"[^>]*>[\\s\\S]*?</f>|<c\\b[^>]*\\br="' + c.ref + '"[^>]*>[\\s\\S]*?<f\\b[^>]*/>)<v>[^<]*</v>');
      const antes = this.xml; this.xml = this.xml.replace(r2, '$1'); if (antes !== this.xml) n++;
    });
    return n;
  };
  /** Grava um número (ou limpa, se null) mantendo o estilo da célula. */
  Folha.prototype.gravar = function (ref, valor) {
    let { lin, cel } = this.acharCelula(ref);
    if (cel && /<f\b/.test(cel.txt)) {
      this.desfazerCompartilhada(cel.txt, ref);
      ({ lin, cel } = this.acharCelula(ref));
      this.notas.push('a célula ' + ref + ' tinha fórmula e passou a ter o valor gravado pelo painel');
    }
    const s = cel ? attr(cel.txt.match(/^<c\b[^>]*/)[0], 's') : null;
    const nova = '<c r="' + ref + '"' + (s ? ' s="' + s + '"' : '') + (valor == null ? '/>' : '><v>' + num(valor) + '</v></c>');
    if (cel) { this.xml = this.xml.slice(0, cel.ini) + nova + this.xml.slice(cel.fim); return; }
    if (valor == null) return;
    const { r, c } = partRef(ref);
    if (!lin) { // cria a linha na posição certa
      const rows = [...this.xml.matchAll(/<row\b[^>]*\br="(\d+)"/g)];
      const depois = rows.find((m) => +m[1] > r);
      const html = '<row r="' + r + '">' + nova + '</row>';
      if (depois) this.xml = this.xml.slice(0, depois.index) + html + this.xml.slice(depois.index);
      else if (/<sheetData\s*\/>/.test(this.xml)) this.xml = this.xml.replace(/<sheetData\s*\/>/, '<sheetData>' + html + '</sheetData>');
      else this.xml = this.xml.replace('</sheetData>', html + '</sheetData>');
      return;
    }
    if (lin.vazia) { this.xml = this.xml.slice(0, lin.ini) + lin.tag.replace(/\/>$/, '>') + nova + '</row>' + this.xml.slice(lin.fim); return; }
    const corpo = this.xml.slice(lin.fimTag, lin.fim - 6);
    const cels = [...corpo.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"/g)];
    const prox = cels.find((m) => colNum(m[1]) > c);
    const pos = prox ? lin.fimTag + prox.index : lin.fim - 6;
    this.xml = this.xml.slice(0, pos) + nova + this.xml.slice(pos);
  };

  /** Monta o XML da aba de controle. */
  function abaControle(st, contribs, quando) {
    const linhas = []; let r = 0;
    const cel = (c, v) => {
      const ref = colLetra(c) + r;
      if (v == null || v === '') return '';
      if (typeof v === 'number') return '<c r="' + ref + '"><v>' + num(v) + '</v></c>';
      return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + escXml(v) + '</t></is></c>';
    };
    const add = (vals) => { r++; linhas.push('<row r="' + r + '">' + vals.map((v, i) => cel(i, v)).join('') + '</row>'); };
    const cartao = new Map(st.cartoes.map((c) => [c.id, c.nome]));
    add(['CONTROLE DO DASHBOARD — gravado pelo painel em ' + U.dataHoraBR(quando) + '. Você pode mudar a coluna SITUAÇÃO (Pago ou Pendente); o restante é refeito a cada gravação.']);
    add([]);
    add(['LANÇAMENTOS DO PAINEL']);
    add(['MÊS', 'DATA', 'DESCRIÇÃO', 'CATEGORIA', 'TIPO', 'VALOR', 'SITUAÇÃO', 'FORMA DE PAGAMENTO', 'CARTÃO', 'ORIGEM', 'OBSERVAÇÕES', 'ID', 'VALOR JÁ PAGO', 'SITUAÇÃO GRAVADA PELO PAINEL (não editar)']);
    st.lancamentos.slice().sort((a, b) => (a.mesRef === b.mesRef ? (a.data < b.data ? -1 : 1) : a.mesRef < b.mesRef ? -1 : 1)).forEach((l) => {
      const sit = l.tipo === 'receita' ? (App.F.recebida(l) ? 'Recebido' : 'Pendente') : ({ pago: 'Pago', parcial: 'Parcial', pendente: 'Pendente' }[App.F.situacaoDe(l)]);
      add([U.mesLabel(l.mesRef), U.dataBR(l.data), l.descricao, l.categoria, l.tipo === 'receita' ? 'Receita' : 'Despesa', l.valor, sit,
        l.formaPagamento || '', cartao.get(l.cartaoId) || '', l.origem === 'planilha' ? 'Planilha (' + (l.fonte || '') + ')' : l.simCartaoId ? 'Empréstimo no cartão' : l.origem === 'simulacao' ? 'Simulação' : 'Painel', l.observacoes || '', l.id,
        l.tipo === 'despesa' ? App.F.valorPago(l) : '', sit]);
    });
    add([]);
    add(['VALORES SOMADOS PELO PAINEL NAS CÉLULAS']);
    add(['ABA', 'LINHA', 'MÊS', 'CÉLULA', 'VALOR GRAVADO PELO PAINEL', 'O QUE É']);
    contribs.forEach((x) => add([x.aba, x.linha, x.mes, x.ref, x.valor, x.desc]));
    add([]);
    add(['DÍVIDAS DO SIMULADOR']);
    add(['NOME', 'MODALIDADE', 'VALOR INICIAL', 'JUROS % A.M.', 'SALDO DEVEDOR ATUAL', 'QUITAÇÃO PREVISTA', 'PAGAMENTOS REGISTRADOS']);
    st.dividas.forEach((d) => { const c = App.F.calcularDivida(d);
      add([d.nome, d.modalidade === 'parcelado' ? 'Parcelado' : 'Rotativo', +d.valorInicial, +d.taxa, c.saldoAtual, c.naoQuita ? 'não quita' : U.mesLongo(c.quitacao), c.totalRegistrado]); });
    const larg = [10, 12, 44, 22, 10, 14, 11, 20, 26, 22, 40, 34];
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="' + NS_MAIN + '" xmlns:r="' + NS_R + '"><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/><cols>' + larg.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>' +
      '<sheetData>' + linhas.join('') + '</sheetData></worksheet>';
  }

  /** Calcula o que precisa mudar e gera o novo arquivo. Retorna null se nada mudou. */
  async function gerar(bytes) {
    const st = App.store.state;
    const wb = XLSX.read(bytes, { type: 'array' });
    const res = App.Importer.analisar(wb, App.store.getMeta('opcoesImportacao', {}) || {});
    const zip = await JSZip.loadAsync(bytes);
    const wbXml = await zip.file('xl/workbook.xml').async('string');
    const relsPath = 'xl/_rels/workbook.xml.rels';
    let rels = await zip.file(relsPath).async('string');
    const caminhoDaAba = (nome) => {
      const m = [...wbXml.matchAll(/<sheet\b[^>]*>/g)].map((x) => x[0]).find((t) => U.norm(unesc(attr(t, 'name') || '')) === U.norm(nome));
      if (!m) return null;
      const rid = attr(m, 'r:id') || (m.match(/\b\w+:id="([^"]+)"/) || [])[1];
      const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((x) => x[0]).find((t) => attr(t, 'Id') === rid);
      if (!rel) return null; const tgt = attr(rel, 'Target');
      return tgt.startsWith('/') ? tgt.slice(1) : 'xl/' + tgt.replace(/^\.\//, '');
    };

    // 1) Valor desejado de cada célula mapeada
    const desejado = new Map(), contribs = [];
    const chave = (aba, linha, mes) => aba + '|' + linha + '|' + mes;
    res.mapa.forEach((m) => m.linhas.forEach((ln) => Object.keys(ln.colDoMes || {}).forEach((mes) => {
      if (res.donoDoMes[mes] !== m.aba) return;
      desejado.set(chave(m.aba, ln.linha, mes), { aba: m.aba, linha: ln.linha, col: ln.colDoMes[mes], mes, label: ln.label, base: 0, extra: 0, itens: [] });
    })));
    st.lancamentos.forEach((l) => {
      if (l.origem === 'planilha') { const d = desejado.get(chave(l.fonte, l.linhaPlanilha, l.mesRef)); if (d) d.base += l.valor; return; }
      const pf = res.mapa.find((m) => m.tipo === 'planilha' && res.donoDoMes[l.mesRef] === m.aba); if (!pf) return;
      let ln = null;
      if (l.tipo === 'despesa' && l.cartaoId) {
        const card = st.cartoes.find((c) => c.id === l.cartaoId); if (!card) return;
        const nomes = new Set([...(card.nomesPlanilha || []), card.nome].map(U.norm));
        ln = pf.linhas.find((x) => x.secao === 'cartoes' && nomes.has(U.norm(x.label)));
      } else if (l.tipo === 'receita') ln = pf.linhas.find((x) => x.secao === 'entradas' && /^RENDA EXTRA/.test(U.norm(x.label)));
      if (!ln) return;
      const d = desejado.get(chave(pf.aba, ln.linha, l.mesRef)); if (!d) return;
      d.extra += l.valor; d.itens.push(l.descricao);
    });

    // 2) Compara com o arquivo e grava as células diferentes
    const folhas = {}, mudancas = [], alteradasPorAba = {}, protegidasPorAba = {};
    for (const d of desejado.values()) (protegidasPorAba[d.aba] = protegidasPorAba[d.aba] || new Set()).add(colLetra(d.col) + d.linha);
    for (const d of desejado.values()) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[d.aba], { header: 1, raw: true, defval: null });
      const atualRaw = (rows[d.linha - 1] || [])[d.col];
      const atual = typeof atualRaw === 'number' ? atualRaw : (U.parseValor(atualRaw) || 0);
      const novo = U.round2(d.base + d.extra);
      const ref = colLetra(d.col) + d.linha;
      if (d.extra > 0.004) contribs.push({ aba: d.aba, linha: d.linha, mes: d.mes, ref, valor: U.round2(d.extra), desc: d.label + ' · ' + d.itens.join('; ') });
      if (Math.abs(novo - atual) <= 0.004) continue;
      const p = caminhoDaAba(d.aba); if (!p) continue;
      if (!folhas[p]) folhas[p] = new Folha(await zip.file(p).async('string'));
      folhas[p].gravar(ref, novo > 0.004 ? novo : null);
      (alteradasPorAba[p] = alteradasPorAba[p] || { aba: d.aba, refs: new Set() }).refs.add(ref);
      mudancas.push({ aba: d.aba, ref, label: d.label, mes: d.mes, de: U.round2(atual), para: novo });
    }
    let semCache = 0;
    Object.keys(folhas).forEach((p) => { semCache += folhas[p].limparCacheDependentes(alteradasPorAba[p].refs, protegidasPorAba[alteradasPorAba[p].aba] || new Set()); zip.file(p, folhas[p].xml); });

    // 3) Aba de controle (só regrava se o conteúdo mudou, ignorando a data)
    const agora = Date.now();
    const novaCtrl = abaControle(st, contribs, agora);
    let caminhoCtrl = caminhoDaAba(App.Importer.ABA_CONTROLE);
    const semData = (x) => x.replace(/gravado pelo painel em [^.]*\./, '');
    let ctrlMudou = true, wbNovo = wbXml;
    if (caminhoCtrl) { const ant = await zip.file(caminhoCtrl).async('string'); ctrlMudou = semData(ant) !== semData(novaCtrl); }
    if (!mudancas.length && !ctrlMudou) return null;
    if (!caminhoCtrl) {
      const nums = Object.keys(zip.files).map((f) => (f.match(/^xl\/worksheets\/sheet(\d+)\.xml$/) || [])[1]).filter(Boolean).map(Number);
      caminhoCtrl = 'xl/worksheets/sheet' + (Math.max(0, ...nums) + 1) + '.xml';
      const ids = [...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1]); const rid = 'rId' + (Math.max(0, ...ids) + 1);
      rels = rels.replace('</Relationships>', '<Relationship Id="' + rid + '" Type="' + T_WS + '" Target="' + caminhoCtrl.replace('xl/', '') + '"/></Relationships>');
      const sids = [...wbXml.matchAll(/sheetId="(\d+)"/g)].map((m) => +m[1]);
      // declara o namespace no próprio elemento: vale tanto para arquivos do Excel quanto do Google Sheets/openpyxl
      wbNovo = wbNovo.replace('</sheets>', '<sheet xmlns:r="' + NS_R + '" name="' + App.Importer.ABA_CONTROLE + '" sheetId="' + (Math.max(0, ...sids) + 1) + '" r:id="' + rid + '"/></sheets>');
      let ct = await zip.file('[Content_Types].xml').async('string');
      ct = ct.replace('</Types>', '<Override PartName="/' + caminhoCtrl + '" ContentType="' + CT_WS + '"/></Types>');
      zip.file('[Content_Types].xml', ct);
    }
    zip.file(caminhoCtrl, novaCtrl);

    // 4) Recalcular fórmulas ao abrir; a cadeia de cálculo antiga é descartada (o Excel refaz)
    if (/<calcPr\b/.test(wbNovo)) wbNovo = wbNovo.replace(/<calcPr\b([^>]*?)(\/?)>/, (m, a, fecha) => '<calcPr' + a.replace(/\sfullCalcOnLoad="[^"]*"/, '') + ' fullCalcOnLoad="1"' + fecha + '>');
    else if (/<\/definedNames>/.test(wbNovo)) wbNovo = wbNovo.replace('</definedNames>', '</definedNames><calcPr fullCalcOnLoad="1"/>');
    else wbNovo = wbNovo.replace('</sheets>', '</sheets><calcPr fullCalcOnLoad="1"/>');
    zip.file('xl/workbook.xml', wbNovo);
    if (zip.file('xl/calcChain.xml')) {
      zip.remove('xl/calcChain.xml');
      rels = rels.replace(/<Relationship\b[^>]*calcChain[^>]*\/>/g, '');
      const ct = await zip.file('[Content_Types].xml').async('string');
      zip.file('[Content_Types].xml', ct.replace(/<Override\b[^>]*calcChain[^>]*\/>/g, ''));
    }
    zip.file(relsPath, rels);
    const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const status = {}; st.lancamentos.forEach((l) => { status[l.id] = l.tipo === 'receita' ? (App.F.recebida(l) ? 'pago' : 'pendente') : App.F.situacaoDe(l); });
    return { bytes: out, mudancas, contribs, status, semCache, notas: Object.values(folhas).flatMap((f) => f.notas), quando: agora };
  }

  App.Writer = { gerar, _deslocar: deslocar, _Folha: Folha };
})(window.App = window.App || {});
