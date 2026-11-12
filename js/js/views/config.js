/* 8. Configurações — importação com conferência, sincronização, exportação para Excel, backup, categorias e ajustes. */
(function (App) {
  'use strict';
  const U = App.U, F = App.F, ui = App.ui, C = App.Categorias;

  /* ---------- importação com prévia ---------- */
  App.abrirPreviaImportacao = function abrirPrevia(wb, nomeArquivo, opts) {
    opts = Object.assign({}, App.store.getMeta('opcoesImportacao', {}), opts || {});
    const res = App.Importer.analisar(wb, opts);
    const reconhecidas = res.abas.filter((a) => a.tipo !== 'ignorada');
    if (!reconhecidas.length) { ui.toast('Nenhuma aba reconhecida nesta planilha. Confira se é a planilha financeira.', 'bad', 7000); return; }
    const d = res.diff;
    const grupos = {}; res.ambiguos.forEach((a) => { const k = a.aba + '|' + U.norm(a.texto); (grupos[k] = grupos[k] || { aba: a.aba, texto: a.texto, ano: a.ano, opcoes: a.opcoes, keys: [] }).keys.push(a.key); });
    const conf = res.conferencia.map((c) => '<details class="box"' + (c.linhas.some((l) => l.usado && l.planilha != null && Math.abs(l.calculado - l.planilha) > 0.004) ? ' open' : '') + '><summary>' + U.esc(c.aba) + ' · ' + U.esc(c.titulo) + ' — ' +
      (c.linhas.filter((l) => l.usado && l.planilha != null).every((l) => Math.abs(l.calculado - l.planilha) < 0.01) ? '<span class="pos">todos os meses conferem</span>' : '<span class="wrn">há diferenças</span>') + '</summary>' +
      '<div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Mês</th><th class="num">Total na planilha</th><th class="num">Soma das linhas</th><th>Situação</th></tr></thead><tbody>' +
      c.linhas.map((l) => { const dif = U.round2(l.calculado - l.planilha);
        return '<tr><td>' + U.mesLabel(l.mes) + '</td><td class="num">' + (l.planilha == null ? '—' : U.brl(l.planilha)) + '</td><td class="num">' + U.brl(l.calculado) + '</td><td>' +
          (!l.usado ? '<span class="pill">mês vem de outra aba</span>' : l.planilha == null ? '<span class="pill info">total recalculado ao abrir a planilha</span>' : Math.abs(dif) < 0.01 ? '<span class="pill good">confere</span>'
            : '<span class="pill warn">diferença ' + U.brl(dif) + '</span>' + (l.explicacao && l.explicacao.texto ? '<span class="sub">' + U.esc(l.explicacao.texto) + (l.explicacao.explicada ? ' Isso explica toda a diferença.' : '') + '</span>' : '')) + '</td></tr>'; }).join('') +
      '</tbody></table></div></details>').join('');
    const lista = (arr, f, max) => '<ul class="small" style="margin:6px 0 0;padding-left:18px">' + arr.slice(0, max || 30).map((x) => '<li>' + f(x) + '</li>').join('') + (arr.length > (max || 30) ? '<li>… e mais ' + (arr.length - (max || 30)) + '</li>' : '') + '</ul>';
    const porMes = U.groupBy(d.novos, (l) => l.mesRef);
    const corpo =
      '<div class="kpis">' + ui.kpi({ rotulo: 'Novos', valor: String(d.novos.length), nivel: d.novos.length ? 'good' : '' }) + ui.kpi({ rotulo: 'Alterados', valor: String(d.alterados.length), nivel: d.alterados.length ? 'warn' : '' }) +
      ui.kpi({ rotulo: 'Removidos da planilha', valor: String(d.removidos.length), nivel: d.removidos.length ? 'bad' : '' }) + ui.kpi({ rotulo: 'Sem mudança', valor: String(d.iguais.length) }) + '</div>' +
      '<div><b>Abas</b>' + lista(res.abas, (a) => U.esc(a.nome) + ' — ' + (a.tipo === 'anual' ? 'contas do ano ' + a.ano : a.tipo === 'planilha' ? 'planilha financeira (' + a.mesesCobertos.map(U.mesLabel).join(', ') + ')' : '<span class="wrn">ignorada: ' + U.esc(a.motivo) + '</span>')) + '</div>' +
      (Object.keys(grupos).length ? '<div><b>Meses sem ano no cabeçalho</b><p class="hint" style="margin:4px 0">Escolhi o ano mais próximo de hoje. Mude se estiver errado:</p><div class="toolbar">' +
        Object.values(grupos).map((g, i) => ui.field(g.aba + ' · ' + g.texto, '<select data-ano="' + i + '">' + g.opcoes.map((o) => '<option' + (o === g.ano ? ' selected' : '') + '>' + o + '</option>').join('') + '</select>')).join('') + '</div></div>' : '') +
      (reconhecidas.length > 1 ? '<div>' + ui.field('Quando o mesmo mês aparece em mais de uma aba, usar primeiro', '<select id="prio">' + res.ordem.map((n) => '<option' + (n === res.ordem[0] ? ' selected' : '') + '>' + U.esc(n) + '</option>').join('') + '</select>') + '</div>' : '') +
      (res.avisos.length ? '<div class="banner warn">' + ui.icon('alert') + '<div><b>Avisos</b>' + lista(res.avisos, U.esc, 10) + '</div></div>' : '') +
      '<div><b>Conferência com os totais da planilha</b><p class="hint" style="margin:4px 0">O sistema soma todas as linhas. Quando a fórmula de total da planilha deixa linhas de fora, a diferença aparece aqui com a explicação.</p>' + conf + '</div>' +
      (d.novos.length ? '<details class="box"><summary>Novos lançamentos (' + d.novos.length + ')</summary>' + lista(Object.keys(porMes).sort(), (m) => U.mesLongo(m) + ': ' + porMes[m].length + ' lançamento(s), ' + U.brl(U.sum(porMes[m], (l) => (l.tipo === 'receita' ? 0 : l.valor))) + ' em despesas', 40) + '</details>' : '') +
      (d.alterados.length ? '<details class="box" open><summary>Alterados (' + d.alterados.length + ')</summary>' + lista(d.alterados, (a) => U.esc(a.novo.descricao) + ' · ' + U.mesLabel(a.novo.mesRef) + ': ' + a.mudou.map((m) => m.campo + ' ' + (m.campo === 'valor' ? U.brl(m.de) + ' → ' + U.brl(m.para) : U.esc(m.de) + ' → ' + U.esc(m.para))).join(', ')) + '</details>' : '') +
      (d.removidos.length ? '<details class="box" open><summary>Saíram da planilha e serão removidos (' + d.removidos.length + ')</summary>' + lista(d.removidos, (l) => U.esc(l.descricao) + ' · ' + U.mesLabel(l.mesRef) + ' · ' + U.brl(l.valor)) + '</details>' : '') +
      (d.mantidos.length ? '<details class="box"><summary>Saíram da planilha mas foram editados por você e serão mantidos (' + d.mantidos.length + ')</summary>' + lista(d.mantidos, (l) => U.esc(l.descricao) + ' · ' + U.mesLabel(l.mesRef)) + '</details>' : '') +
      (d.duplicatas.length ? '<div class="banner warn">' + ui.icon('alert') + '<div><b>Possíveis duplicatas</b>' + d.duplicatas.length + ' lançamento(s) novo(s) da planilha são iguais a lançamentos que você cadastrou aqui (mesma descrição, valor e mês). Confira depois em "Contas e despesas".</div></div>' : '') +
      (d.pulados.length ? '<p class="hint">' + d.pulados.length + ' lançamento(s) que você excluiu antes não serão importados de novo.</p>' : '') +
      '<p class="hint">Situação (pago/pendente), observações, forma de pagamento e cartão que você ajustou são preservados. Meses passados entram como "pagos"; o mês atual e os futuros, como "pendentes".</p>';
    const m = ui.modal({ titulo: 'Importar "' + nomeArquivo + '"', largo: true, corpo, botoes: [{ texto: 'Cancelar' },
      { texto: d.novos.length + d.alterados.length + d.removidos.length ? 'Importar' : 'Nada mudou — fechar', classe: 'primary', acao: async () => {
        if (!(d.novos.length + d.alterados.length + d.removidos.length) && App.store.state.lancamentos.length) return;
        const reg = await App.Importer.aplicar(res, nomeArquivo);
        await App.store.setMeta('opcoesImportacao', { anos: opts.anos || {}, prioridade: opts.prioridade || null });
        if (!App.sel.mes || !App.F.mesesComDados().includes(App.sel.mes)) App.sel.mes = App.mesPadrao();
        ui.toast('Importação concluída: ' + reg.novos + ' novos, ' + reg.alterados + ' alterados, ' + reg.removidos + ' removidos.', 'good', 6000);
      } }] });
    const reabrir = (novo) => { m.fechar(); abrirPrevia(wb, nomeArquivo, Object.assign({}, opts, novo)); };
    m.body.querySelectorAll('[data-ano]').forEach((s) => s.addEventListener('change', () => {
      const anos = Object.assign({}, opts.anos || {}); Object.values(grupos)[+s.dataset.ano].keys.forEach((k) => { anos[k] = +s.value; }); reabrir({ anos }); }));
    const pr = m.body.querySelector('#prio');
    if (pr) pr.addEventListener('change', () => reabrir({ prioridade: [pr.value].concat(res.ordem.filter((n) => n !== pr.value)) }));
  };

  /* ---------- exportação ---------- */
  function exportarExcel() {
    const st = App.store.state; const wb = XLSX.utils.book_new();
    const moeda = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
    const folha = (nome, cab, linhas, colsMoeda, colsPct, larg) => {
      const ws = XLSX.utils.aoa_to_sheet([cab].concat(linhas), { cellDates: true });
      const rng = XLSX.utils.decode_range(ws['!ref']);
      for (let r = 1; r <= rng.e.r; r++) {
        (colsMoeda || []).forEach((c) => { const cel = ws[XLSX.utils.encode_cell({ r, c })]; if (cel && cel.t === 'n') cel.z = moeda; });
        (colsPct || []).forEach((c) => { const cel = ws[XLSX.utils.encode_cell({ r, c })]; if (cel && cel.t === 'n') cel.z = '0.0%'; });
      }
      ws['!cols'] = (larg || cab.map(() => 16)).map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, nome);
    };
    const dt = (iso) => (iso ? new Date(iso + 'T12:00:00') : '');
    const meses = F.mesesComDados();
    folha('Resumo mensal', ['Mês', 'Receitas', 'Despesas fixas', 'Cartões', 'Empréstimos e acordos', 'Variáveis', 'Reserva', 'Total de gastos', 'Saldo', 'Comprometimento'],
      meses.map((m) => { const r = F.resumoMes(m); return [U.mesLongo(m), r.receitas, r.fixa, r.cartao, r.emprestimo, r.variavel, r.reserva, r.gastos, r.saldo, isFinite(r.comprometimento) ? r.comprometimento : '']; }),
      [1, 2, 3, 4, 5, 6, 7, 8], [9], [18, 14, 14, 14, 18, 14, 12, 15, 14, 15]);
    const cart = new Map(st.cartoes.map((c) => [c.id, c.nome]));
    folha('Lançamentos', ['Data', 'Mês de referência', 'Descrição', 'Categoria', 'Grupo', 'Tipo', 'Valor', 'Forma de pagamento', 'Cartão', 'Situação', 'Origem', 'Aba da planilha', 'Observações', 'ID'],
      st.lancamentos.slice().sort((a, b) => (a.data < b.data ? -1 : 1)).map((l) => [dt(l.data), l.mesRef, l.descricao, l.categoria, C.GRUPOS[C.grupoDe(l)] || '', l.tipo === 'receita' ? 'Receita' : 'Despesa', l.valor, l.formaPagamento || '',
        cart.get(l.cartaoId) || '', l.situacao === 'pago' ? 'Pago' : 'Pendente', l.origem, l.fonte || '', l.observacoes || '', l.id]), [6], [], [12, 12, 34, 22, 18, 9, 13, 18, 26, 10, 10, 22, 30, 30]);
    st.lancamentos.length && (wb.Sheets['Lançamentos']['!autofilter'] = { ref: 'A1:N' + (st.lancamentos.length + 1) });
    folha('Cartões e empréstimos', ['Nome', 'Tipo', 'Dia de vencimento', 'Limite total', 'Limite utilizado', 'Limite disponível', 'Juros (% a.m.)', 'Fatura do mês atual', 'Saldo devedor previsto', 'Parcelas restantes', 'Última parcela', 'Valor original', 'Observações'],
      st.cartoes.map((c) => { const r = F.resumoCartao(c); return [c.nome, c.tipo === 'emprestimo' ? 'Empréstimo/acordo' : 'Cartão', c.diaVencimento || '', r.limite ?? '', r.usado ?? '', r.disponivel ?? '', c.taxaJuros ?? '', r.faturaAtual, r.saldoPrevisto, r.parcelasRestantes, r.ultimaParcela ? U.mesLongo(r.ultimaParcela) : '', c.valorOriginal ?? '', c.observacoes || '']; }),
      [3, 4, 5, 7, 8, 11], [], [34, 16, 10, 14, 14, 14, 10, 14, 16, 10, 18, 14, 30]);
    folha('Dívidas (simulador)', ['Nome', 'Modalidade', 'Valor inicial', 'Juros (% a.m.)', 'Parcelas', '1º pagamento', 'Pagamento mensal / parcela', 'Saldo devedor atual', 'Total de juros', 'Total a pagar', 'Quitação prevista'],
      st.dividas.map((d) => { const c = F.calcularDivida(d); return [d.nome, d.modalidade === 'parcelado' ? 'Parcelado' : 'Rotativo', +d.valorInicial, +d.taxa, d.parcelas || '', dt(d.primeiroPagamento), c.parcela || c.planejado, c.saldoAtual, c.totalJuros, c.naoQuita ? '' : c.totalPago, c.naoQuita ? 'não quita' : U.mesLongo(c.quitacao)]; }),
      [2, 6, 7, 8, 9], [], [28, 12, 14, 10, 9, 12, 16, 16, 14, 14, 18]);
    folha('Pagamentos de dívidas', ['Dívida', 'Data', 'Valor', 'Tipo', 'Observação'], st.dividas.flatMap((d) => (d.pagamentos || []).map((p) => [d.nome, dt(p.data), p.valor, p.tipo, p.obs || ''])), [2], [], [28, 12, 14, 12, 30]);
    const p = F.projecao({ meses: 12, simulacoes: st.simulacoes.filter((s) => s.incluirProjecao) });
    folha('Projeção 12 meses', ['Mês', 'Receitas', 'Fixas', 'Cartões', 'Empréstimos', 'Variáveis', 'Total de despesas', 'Comprometimento', 'Saldo previsto', 'Acumulado', 'Dívidas restantes', 'Estimado?'],
      p.map((x) => [U.mesLongo(x.mes), x.receitas, x.fixa, x.cartao, x.emprestimo, x.variavel, x.despesas, isFinite(x.comprometimento) ? x.comprometimento : '', x.saldo, x.acumulado, x.dividasRestantes, x.estimado ? 'sim' : '']), [1, 2, 3, 4, 5, 6, 8, 9, 10], [7], [18, 13, 13, 13, 13, 13, 15, 14, 14, 14, 15, 10]);
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
    ui.baixar('financas-iasmym-tiago-' + U.hojeISO() + '.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    ui.toast('Planilha exportada.', 'good');
  }
  App.exportarExcel = exportarExcel;

  App.backup = backup;
  function backup() {
    ui.baixar('backup-financas-' + U.hojeISO() + '.json', new Blob([JSON.stringify(App.store.dump(), null, 1)], { type: 'application/json' }));
    App.store.setMeta('ultimoBackup', Date.now());
    ui.toast('Backup salvo na pasta de downloads.', 'good');
  }

  /* ---------- categorias ---------- */
  function editarCategoria(c) {
    ui.modal({ titulo: c ? 'Editar categoria' : 'Nova categoria', corpo: '<div class="form-grid">' + ui.field('Nome', ui.input('nome', c && c.nome, 'required')) +
      ui.field('Entra em', ui.select('grupo', Object.keys(C.GRUPOS).map((k) => ({ v: k, t: C.GRUPOS[k] })), c ? c.grupo : 'variavel'), 'Define em qual indicador o valor é somado') + '</div>',
    botoes: [{ texto: 'Cancelar' }, { texto: 'Salvar', classe: 'primary', acao: async (m) => {
      const v = ui.lerForm(m.body); ui.limparErros(m.body); const nome = v.nome.trim();
      if (!nome) { ui.erro(m.body, 'nome', 'Informe o nome.'); return false; }
      if (App.store.state.categorias.some((x) => U.norm(x.nome) === U.norm(nome) && (!c || x.id !== c.id))) { ui.erro(m.body, 'nome', 'Já existe.'); return false; }
      const nova = Object.assign({}, c || { id: 'cat-' + U.uid() }, { nome, grupo: v.grupo });
      const ops = [{ store: 'categorias', item: nova }];
      if (c && c.nome !== nome) App.store.state.lancamentos.filter((l) => l.categoria === c.nome).forEach((l) => ops.push({ store: 'lancamentos', item: Object.assign({}, l, { categoria: nome }) }));
      await App.store.aplicarLote(ops);
    } }] });
  }
  async function excluirCategoria(c) {
    const usos = App.store.state.lancamentos.filter((l) => l.categoria === c.nome);
    if (!usos.length) { if (await ui.confirmar('Excluir categoria', 'Excluir "' + U.esc(c.nome) + '"?', 'Excluir', true)) await App.store.remove('categorias', c.id); return; }
    const outras = App.store.state.categorias.filter((x) => x.id !== c.id && (x.grupo === 'receita') === (c.grupo === 'receita'));
    ui.modal({ titulo: 'Excluir "' + c.nome + '"', corpo: '<p>' + usos.length + ' lançamento(s) usam esta categoria. Para onde mover?</p>' + ui.field('Mover para', ui.select('destino', outras.map((x) => x.nome), outras[0] && outras[0].nome)),
      botoes: [{ texto: 'Cancelar' }, { texto: 'Mover e excluir', classe: 'danger solid', acao: async (m) => {
        const dest = m.body.querySelector('[name=destino]').value;
        await App.store.aplicarLote(usos.map((l) => ({ store: 'lancamentos', item: Object.assign({}, l, { categoria: dest }) })).concat([{ store: 'categorias', del: true, id: c.id }]));
      } }] });
  }


  /* ---------- seção Online (Google Drive) ---------- */
  function secaoOnline() {
    const N = App.nuvem, G = App.google; if (!N) return '';
    const c = N.cfg(), id = G.clientId();
    let h = '<section class="panel"><div class="panel-head"><h2 style="margin:0">Online com Google Drive</h2>' +
      (App.instalado() ? '<span class="pill good">app instalado</span>' : '<button class="btn sm" data-instalar>' + ui.icon('download') + 'Instalar app</button>') + '</div>';
    if (!G.disponivel()) {
      return h + '<p class="prose small">Esta cópia está aberta direto do computador (arquivo local). O login com Google só funciona com o sistema publicado na internet (https). Siga o guia <b>PUBLICAR-ONLINE.txt</b> que veio no pacote; aqui continua funcionando a sincronização pela pasta do Drive.</p></section>';
    }
    if (!id) {
      return h + '<p class="prose small">Falta o <b>ID do cliente Google</b> (passo 2 do guia PUBLICAR-ONLINE.txt). Cole abaixo — ou deixe gravado no arquivo js/config-online.js para valer para os dois.</p>' +
        '<div class="form-grid"><label class="field" style="grid-column:1/-1"><span>ID do cliente OAuth</span><input id="gClientId" placeholder="123456789-xxxx.apps.googleusercontent.com"></label></div>' +
        '<div class="actions" style="justify-content:flex-start"><button class="btn primary" id="btnClientId">Salvar</button></div></section>';
    }
    if (!N.ativa()) {
      return h + '<p class="prose small">Entre com a conta Google que tem a planilha (ou com a qual ela foi compartilhada). O painel lê e grava a planilha direto no Drive e guarda pagamentos, dívidas e simulações num arquivo de dados ao lado dela — assim vocês dois veem tudo igual, no celular e no computador.</p>' +
        '<div class="actions" style="justify-content:flex-start"><button class="btn primary" data-entrar-google>' + ui.icon('link') + 'Entrar com Google</button></div>' +
        (N.erro() ? '<p class="neg small">' + U.esc(N.erro()) + '</p>' : '') + '<p class="hint">ID do cliente: ' + U.esc(id.slice(0, 18)) + '… <a href="#config" id="btnTrocarClient">trocar</a></p></section>';
    }
    const u = G.usuario() || {};
    return h + '<p class="prose small">Conectado como <b>' + U.esc(u.email || '') + '</b>. Sincroniza a cada 30 segundos com o app aberto, ao voltar para ele e logo depois de cada alteração.</p>' +
      '<div class="table-wrap"><table><tbody>' +
      '<tr><td>Planilha</td><td>' + U.esc(c.planilhaNome || '—') + '</td></tr>' +
      '<tr><td>Dados do painel</td><td>' + (c.dadosId ? 'arquivo .json na mesma pasta da planilha' : '—') + '</td></tr>' +
      '<tr><td>Última sincronização</td><td>' + (N.ultimo() ? new Date(N.ultimo()).toLocaleString('pt-BR') : '—') + (N.erro() ? ' <span class="neg">· ' + U.esc(N.erro()) + '</span>' : '') + '</td></tr>' +
      '</tbody></table></div>' +
      '<label class="check" style="margin-top:10px"><input type="checkbox" id="gravarPlanilhaN"' + (App.store.getMeta('gravarNaPlanilha', true) !== false ? ' checked' : '') + '> Gravar na planilha as mudanças feitas no painel</label>' +
      '<label class="check" style="margin-top:6px"><input type="checkbox" id="autoAplicarN"' + (App.store.getMeta('syncAutoAplicar', true) ? ' checked' : '') + '> Trazer as mudanças da planilha sem perguntar</label>' +
      '<div class="actions" style="justify-content:flex-start;flex-wrap:wrap;margin-top:10px">' +
      '<button class="btn primary" data-sync-nuvem>' + ui.icon('refresh') + 'Sincronizar agora</button>' +
      '<button class="btn" id="btnCompartilhar">' + ui.icon('link') + 'Compartilhar com a outra pessoa</button>' +
      '<button class="btn" id="btnTrocarPlanilha">Trocar planilha</button>' +
      '<button class="btn danger" id="btnSairGoogle">Sair</button></div></section>';
  }
  function ligarOnline(view) {
    const q = (s) => view.querySelector(s), N = App.nuvem, G = App.google;
    const on = (s, fn) => { const b = q(s); if (b) b.addEventListener('click', (e) => { e.preventDefault(); fn(); }); };
    on('#btnClientId', () => { const v = q('#gClientId').value.trim(); if (!/\.apps\.googleusercontent\.com$/.test(v)) { ui.toast('Esse não parece um ID de cliente (termina com .apps.googleusercontent.com).', 'bad', 6000); return; } G.setClientId(v); location.reload(); });
    on('#btnTrocarClient', () => { G.setClientId(''); App.render(); });
    on('#btnSairGoogle', () => N.sair());
    const gp = q('#gravarPlanilhaN'); if (gp) gp.addEventListener('change', async (e) => { await App.store.setMeta('gravarNaPlanilha', e.target.checked); if (e.target.checked) N.sincronizar(); });
    const aa = q('#autoAplicarN'); if (aa) aa.addEventListener('change', (e) => App.store.setMeta('syncAutoAplicar', e.target.checked));
    on('#btnCompartilhar', () => {
      ui.modal({ titulo: 'Compartilhar com a outra pessoa', corpo: '<p class="prose small">Dá permissão de edição na planilha e no arquivo de dados do painel. A pessoa recebe um e-mail do Google. Ela também precisa estar na lista de "usuários de teste" do projeto no Google Cloud (passo 2 do guia).</p>' +
        '<label class="field"><span>E-mail Google da pessoa</span><input id="emailComp" type="email" placeholder="nome@gmail.com"></label>',
      botoes: [{ texto: 'Cancelar' }, { texto: 'Compartilhar', classe: 'primary', acao: async (m) => {
        const em = document.getElementById('emailComp').value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { ui.toast('Digite um e-mail válido.', 'bad'); return false; }
        try { await N.compartilhar(em); ui.toast('Compartilhado com ' + em + '.', 'good'); } catch (e) { ui.toast(e.message, 'bad', 8000); return false; }
      } }] });
    });
    on('#btnTrocarPlanilha', async () => {
      let lista = []; try { lista = await N.buscarPlanilhas(); } catch (e) { ui.toast(e.message, 'bad'); return; }
      const m = ui.modal({ titulo: 'Escolher a planilha no Drive', corpo: lista.length ? '<div class="table-wrap"><table><tbody>' + lista.map((f, i) => '<tr><td>' + U.esc(f.name) + '<div class="hint">alterada em ' + new Date(f.modifiedTime).toLocaleString('pt-BR') + '</div></td><td class="num"><button class="btn sm" data-i="' + i + '">Usar esta</button></td></tr>').join('') + '</tbody></table></div>' : '<p>Nenhum arquivo .xlsx encontrado no seu Drive.</p>', botoes: [{ texto: 'Fechar' }] });
      document.querySelectorAll('.modal [data-i]').forEach((b) => b.addEventListener('click', async () => { const f = lista[+b.dataset.i]; m.fechar(); await N.trocarPlanilha(f.id, f.name); App.render(); ui.toast('Usando ' + f.name + '.', 'good'); }));
    });
  }
  App.views.config = {
    render(view) {
      const st = App.store.state; const ult = App.store.getMeta('ultimaImportacao', null);
      const hist = (App.store.getMeta('historicoImportacao', []) || []).slice().reverse();
      const ign = App.store.getMeta('importIgnorados', []);
      const sync = App.sync;
      const usos = U.groupBy(st.lancamentos, (l) => l.categoria);
      view.innerHTML = secaoOnline() +
        '<div class="grid g2">' +
        '<section class="panel"><h2>Importar planilha Excel</h2><p class="prose small">Escolha o arquivo <b>PLANILHA FINANCEIRA - IASMYM E TIAGO.xlsx</b> (ou uma versão atualizada). Antes de gravar, você vê o que mudou e a conferência com os totais da planilha. Importar de novo não duplica nada.</p>' +
        '<input type="file" id="arqImport" accept=".xlsx,.xlsm,.xls" hidden><button class="btn primary" id="btnImport">' + ui.icon('upload') + 'Escolher planilha</button>' +
        (ult ? '<p class="hint">Última importação: ' + U.dataHoraBR(ult.quando) + (ult.arquivo ? ' · ' + U.esc(ult.arquivo) : '') + '</p>' : '') + '</section>' +
        '<section class="panel"><h2>Sincronização com a planilha</h2>' + (sync.suportado()
          ? '<p class="prose small">Vincule o arquivo .xlsx que o <b>Google Drive para computador</b> mantém na pasta "Meu Drive". Com esta página aberta: ' +
            '<b>1)</b> o que vocês mudarem na planilha aparece aqui em até 30 segundos; <b>2)</b> o que vocês mudarem aqui (contas pagas, compras, empréstimos) é gravado na planilha alguns segundos depois, e o Drive sobe a planilha sozinho.</p>' +
            '<div class="actions" style="justify-content:flex-start;flex-wrap:wrap">' + (sync.nome() ? '<span class="pill ' + (sync.ativo() ? 'good' : 'warn') + '">' + U.esc(sync.nome()) + (sync.ativo() ? (sync.podeGravar() && sync.gravacaoLigada() ? ' · sincronizando' : ' · só leitura') : ' · precisa de permissão') + '</span>' : '') +
            (sync.nome() && !sync.ativo() ? '<button class="btn primary" id="btnReconectar">' + ui.icon('refresh') + 'Reconectar</button>' : '') +
            '<button class="btn" id="btnVincular">' + ui.icon('link') + (sync.nome() ? 'Trocar arquivo' : 'Vincular arquivo') + '</button>' +
            (sync.nome() ? '<button class="btn" id="btnVerificar">Verificar agora</button><button class="btn danger" id="btnDesvincular">Desvincular</button>' : '') + '</div>' +
            (sync.nome() && sync.ativo() && !sync.podeGravar() ? '<div class="banner warn" style="margin-top:10px">' + ui.icon('alert') + '<div><b>Só leitura</b>O navegador não deu permissão para gravar. Clique em "Reconectar" e escolha "Editar" / "Salvar alterações".</div></div>' : '') +
            '<label class="check" style="margin-top:10px"><input type="checkbox" id="gravarPlanilha"' + (sync.gravacaoLigada() ? ' checked' : '') + '> Gravar na planilha as mudanças feitas no painel</label>' +
            '<label class="check" style="margin-top:6px"><input type="checkbox" id="autoAplicar"' + (App.store.getMeta('syncAutoAplicar', true) ? ' checked' : '') + '> Trazer as mudanças da planilha sem perguntar (desmarcado: mostra a prévia antes)</label>' +
            (sync.nome() ? '<div class="actions" style="justify-content:flex-start;margin-top:10px"><button class="btn sm" id="btnGravarAgora">' + ui.icon('upload') + 'Gravar na planilha agora</button></div>' : '') +
            (sync.erroGravacao() ? '<p class="neg small">Último erro ao gravar: ' + U.esc(sync.erroGravacao()) + '</p>' : '') +
            '<details class="box" style="margin-top:10px"><summary>O que o painel grava na planilha</summary><div class="small prose" style="margin-top:8px"><ul>' +
            '<li><b>Parcelas no cartão</b> (empréstimo no cartão, compras parceladas): somadas na célula do cartão e do mês, na aba PLANILHA FINANCEIRA. Ex.: Thais dez/26 = fatura + parcela.</li>' +
            '<li><b>Receitas criadas no painel</b> (ex.: valor recebido de empréstimo): somadas em RENDA EXTRA, no mês.</li>' +
            '<li><b>Valores que você editar</b> aqui em lançamentos da planilha: gravados na célula de origem. Excluir um lançamento da planilha limpa a célula.</li>' +
            '<li><b>Aba nova "CONTROLE DO DASHBOARD"</b>: todos os lançamentos com a situação (Pago/Pendente). Você pode mudar a situação lá, e o painel traz a mudança.</li>' +
            '<li>Compras no Pix/débito e contas sem linha na planilha ficam só na aba de controle.</li></ul>' +
            '<p>Só as células que mudam são alteradas: cores, formatos, comentários e fórmulas continuam. Os totais com fórmula são recalculados ao abrir a planilha. Antes de gravar, o painel sempre lê a planilha e traz o que mudou nela, para não apagar edição de ninguém.</p></div></details>' +
            ((App.store.getMeta('historicoGravacao', []) || []).length ? '<details class="box" style="margin-top:8px"><summary>Últimas gravações</summary><ul class="small" style="margin:6px 0 0;padding-left:18px">' +
              (App.store.getMeta('historicoGravacao', []) || []).slice().reverse().slice(0, 10).map((h) => '<li>' + U.dataHoraBR(h.quando) + ': ' + (h.celulas.length ? h.celulas.map((c) => U.esc(c.aba) + ' ' + c.ref + ' (' + U.esc(c.label) + ' ' + U.mesLabel(c.mes) + ') ' + U.brl(c.de) + ' → ' + U.brl(c.para)).join('; ') : 'aba de controle atualizada') + '</li>').join('') + '</ul></details>' : '')
          : '<div class="banner warn">' + ui.icon('info') + '<div><b>Este navegador não permite vigiar um arquivo</b>A atualização automática funciona no Google Chrome e no Microsoft Edge (no computador). Aqui, use "Escolher planilha" sempre que a planilha mudar.</div></div>') +
        '<details class="box" style="margin-top:12px"><summary>E o Google Sheets / Google Drive?</summary><div class="small prose" style="margin-top:8px">' +
        '<p>Uma página aberta direto do computador não entra na sua conta Google sozinha. O caminho é o <b>Google Drive para computador</b> (gratuito): ele mantém a planilha do Drive numa pasta do PC (normalmente <b>G:\\Meu Drive</b>).</p>' +
        '<ol><li>Instale o Google Drive para computador e entre com a conta Google dona da planilha.</li><li>Aqui, clique em "Vincular arquivo" e escolha <b>Meu Drive → PLANILHA FINANCEIRA - IASMYM E TIAGO.xlsx</b>. Quando o navegador perguntar, permita <b>editar</b>.</li>' +
        '<li>Pronto: mudanças nos dois sentidos. Cada vez que abrir o navegador, clique uma vez em "Atualizar planilha" (o navegador pede a permissão de novo).</li></ol>' +
        '<p><b>Atenção:</b> não vincule um arquivo da pasta Downloads. Uma cópia baixada não recebe as alterações feitas no Drive, e o que o painel gravar nela não sobe para o Drive.</p>' +
        '<p>Sem o Drive para computador: baixe a planilha (Arquivo → Fazer download → Microsoft Excel) e use "Escolher planilha". Nesse caso o painel só lê; para levar as mudanças do painel, use "Exportar para Excel".</p></div></details></section></div>' +

        '<div class="grid g2"><section class="panel"><h2>Exportar e fazer backup</h2><div class="actions" style="justify-content:flex-start;flex-wrap:wrap">' +
        '<button class="btn" id="btnExport"' + (st.lancamentos.length ? '' : ' disabled') + '>' + ui.icon('download') + 'Exportar para Excel</button>' +
        '<button class="btn" id="btnBackup">' + ui.icon('download') + 'Baixar backup</button>' +
        '<input type="file" id="arqRestore" accept=".json" hidden><button class="btn" id="btnRestore">' + ui.icon('upload') + 'Restaurar backup</button></div>' +
        '<p class="hint">O Excel exportado traz resumo mensal, todos os lançamentos, cartões, dívidas, pagamentos e a projeção. O backup (.json) guarda tudo, inclusive configurações, e serve para restaurar ou levar para outro computador.' +
        (App.store.getMeta('ultimoBackup') ? ' Último backup: ' + U.dataHoraBR(App.store.getMeta('ultimoBackup')) + '.' : ' <span class="wrn">Nenhum backup feito ainda.</span>') + '</p>' +
        '<p class="hint">Os dados ficam guardados neste navegador (IndexedDB). Limpar os dados de navegação do navegador apaga tudo: mantenha um backup.</p></section>' +

        '<section class="panel"><h2>Ajustes</h2><div class="form-grid">' +
        ui.field('Gasto variável previsto por mês', ui.moneyInput('gastoVariavelPrevisto', App.store.getMeta('gastoVariavelPrevisto', 0) || ''), 'Mercado, transporte, farmácia, lazer. Usado na projeção dos meses sem gastos variáveis lançados.') +
        ui.field('Reserva / poupança atual', ui.moneyInput('reservaInicial', App.store.getMeta('reservaInicial', 0) || ''), 'Quanto vocês têm guardado hoje (a planilha tem o campo POUPANÇA vazio).') +
        '</div><button class="btn primary" id="btnAjustes" style="margin-top:12px">Salvar ajustes</button></section></div>' +

        '<section class="panel"><div class="panel-head"><h2 style="margin:0">Categorias</h2><button class="btn sm" id="novaCat">' + ui.icon('plus') + 'Nova categoria</button></div>' +
        '<div class="table-wrap"><table><thead><tr><th>Categoria</th><th>Entra em</th><th class="num">Lançamentos</th><th></th></tr></thead><tbody>' +
        st.categorias.slice().sort((a, b) => (a.grupo === b.grupo ? a.nome.localeCompare(b.nome) : Object.keys(C.GRUPOS).indexOf(a.grupo) - Object.keys(C.GRUPOS).indexOf(b.grupo))).map((c) =>
          '<tr><td>' + U.esc(c.nome) + '</td><td>' + C.GRUPOS[c.grupo] + '</td><td class="num">' + ((usos[c.nome] || []).length) + '</td><td class="actions"><button class="btn sm" data-ecat="' + c.id + '">' + ui.icon('edit') + '</button><button class="btn sm danger" data-dcat="' + c.id + '">' + ui.icon('trash') + '</button></td></tr>').join('') +
        '</tbody></table></div></section>' +

        '<div class="grid g2"><section class="panel"><h2>Histórico de importações</h2>' + (hist.length ? '<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Arquivo</th><th class="num">Novos</th><th class="num">Alterados</th><th class="num">Removidos</th></tr></thead><tbody>' +
          hist.map((h) => '<tr><td>' + U.dataHoraBR(h.quando) + '</td><td>' + U.esc(h.arquivo) + '</td><td class="num">' + h.novos + '</td><td class="num">' + h.alterados + '</td><td class="num">' + h.removidos + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">Nenhuma importação ainda.</p>') +
        (ign.length ? '<p class="hint">' + ign.length + ' lançamento(s) da planilha excluídos por você não voltam nas importações. <button class="btn sm" id="btnIgn">Permitir que voltem</button></p>' : '') + '</section>' +
        '<section class="panel"><h2>Apagar dados</h2><p class="small prose">Apaga lançamentos, cartões, dívidas, cenários e configurações deste navegador. A planilha original não é alterada. Faça um backup antes.</p><button class="btn danger" id="btnLimpar">' + ui.icon('trash') + 'Apagar todos os dados</button></section></div>';

      const q = (s) => view.querySelector(s);
      q('#btnImport').addEventListener('click', () => q('#arqImport').click());
      ligarOnline(view);
      q('#arqImport').addEventListener('change', async (e) => {
        const f = e.target.files[0]; e.target.value = ''; if (!f) return;
        try { const wb = await App.Importer.lerArquivo(f); App.abrirPreviaImportacao(wb, f.name); }
        catch (err) { console.error(err); ui.toast('Não consegui ler o arquivo: ' + err.message, 'bad', 7000); }
      });
      const on = (id, fn) => { const el = q(id); if (el) el.addEventListener('click', fn); };
      on('#btnVincular', () => sync.vincular());
      on('#btnReconectar', () => sync.reconectar());
      on('#btnVerificar', () => sync.verificar(true));
      on('#btnDesvincular', () => sync.desvincular());
      const aa = q('#autoAplicar'); if (aa) aa.addEventListener('change', (e) => App.store.setMeta('syncAutoAplicar', e.target.checked));
      const gp = q('#gravarPlanilha'); if (gp) gp.addEventListener('change', async (e) => { await App.store.setMeta('gravarNaPlanilha', e.target.checked); if (e.target.checked) sync.gravar(true); });
      on('#btnGravarAgora', () => sync.gravar(true));
      on('#btnExport', exportarExcel);
      on('#btnBackup', backup);
      on('#btnRestore', () => q('#arqRestore').click());
      q('#arqRestore').addEventListener('change', async (e) => {
        const f = e.target.files[0]; e.target.value = ''; if (!f) return;
        let data; try { data = JSON.parse(await f.text()); } catch (err) { ui.toast('Arquivo de backup inválido.', 'bad'); return; }
        if (!data || data.app !== 'financas-iasmym-tiago') { ui.toast('Este arquivo não é um backup deste sistema.', 'bad'); return; }
        if (!(await ui.confirmar('Restaurar backup', 'Substituir todos os dados atuais pelos do backup de ' + (data.geradoEm ? U.dataHoraBR(Date.parse(data.geradoEm)) : '?') + ' (' + (data.lancamentos || []).length + ' lançamentos)?', 'Restaurar', true))) return;
        await App.store.restore(data); App.sel.mes = App.mesPadrao(); ui.toast('Backup restaurado.', 'good');
      });
      on('#btnAjustes', async () => {
        const gv = U.parseValor(view.querySelector('[name=gastoVariavelPrevisto]').value || '0'), ri = U.parseValor(view.querySelector('[name=reservaInicial]').value || '0');
        if (isNaN(gv) || gv < 0 || isNaN(ri) || ri < 0) { ui.toast('Confira os valores.', 'bad'); return; }
        await App.store.setMeta('gastoVariavelPrevisto', U.round2(gv)); await App.store.setMeta('reservaInicial', U.round2(ri)); ui.toast('Ajustes salvos.', 'good');
      });
      on('#novaCat', () => editarCategoria(null));
      view.querySelectorAll('[data-ecat]').forEach((b) => b.addEventListener('click', () => editarCategoria(st.categorias.find((c) => c.id === b.dataset.ecat))));
      view.querySelectorAll('[data-dcat]').forEach((b) => b.addEventListener('click', () => excluirCategoria(st.categorias.find((c) => c.id === b.dataset.dcat))));
      on('#btnIgn', async () => { await App.store.setMeta('importIgnorados', []); ui.toast('Na próxima importação eles voltam.', 'good'); });
      on('#btnLimpar', async () => { if (await ui.confirmar('Apagar todos os dados', 'Isto apaga tudo deste navegador e não pode ser desfeito. Continuar?', 'Apagar tudo', true)) { await App.store.limparTudo(); App.sel.mes = null; ui.toast('Dados apagados.'); } });
    },
  };
})(window.App = window.App || {});
