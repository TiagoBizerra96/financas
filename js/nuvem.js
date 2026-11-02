/* Versão online: sincroniza com o Google Drive.
 *  - Planilha: lida e gravada direto no Drive (mesmo importador e mesmo gravador da versão local, que preservam a formatação).
 *  - Arquivo de dados do painel (JSON no Drive, compartilhado entre os dois): pagamentos, dívidas, simulações, limites…
 *    Quando os dois mexem, vale a alteração mais recente de cada item; exclusões são anotadas para não voltarem.
 * A cada 30 s (com o app aberto), ao voltar para o app e alguns segundos depois de cada mudança. */
(function (App) {
  'use strict';
  const U = App.U, ui = App.ui, G = App.google;
  const NOME_DADOS = 'FINANÇAS IASMYM E TIAGO - dados do painel (não apagar).json';
  const NOME_PLANILHA = 'PLANILHA FINANCEIRA - IASMYM E TIAGO';
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  let sujoDados = false;
  let ativa = false, rodando = false, deNovo = false, sujo = false, timer = null, ultimo = null, erro = null, versoes = { planilha: null, dados: null };

  const cfg = () => App.store.getMeta('nuvem', {}) || {};
  const salvarCfg = (o) => App.store.setMetaSilencioso('nuvem', Object.assign({}, cfg(), o));

  /* ---------- dados do painel (JSON) ---------- */
  function pacote() {
    const st = App.store.state, meta = {};
    const ts = st.meta.metaTs || {};
    App.store.META_COMPARTILHADA.forEach((k) => { if (k in st.meta) meta[k] = { v: st.meta[k], t: ts[k] || 0 }; });
    return JSON.stringify({ app: 'financas-iasmym-tiago', formato: 2, atualizadoEm: Date.now(), por: (G.usuario() || {}).email || '',
      lancamentos: st.lancamentos, cartoes: st.cartoes, dividas: st.dividas, simulacoes: st.simulacoes, categorias: st.categorias, meta, excluidos: st.meta.excluidos || {} });
  }
  /** Junta os dados do outro aparelho com os deste: o registro alterado por último vence. */
  function mesclar(remoto) {
    const st = App.store.state, ops = [];
    const exLocal = st.meta.excluidos || {}, exRem = remoto.excluidos || {};
    App.store.SINCRONIZADOS.forEach((s) => {
      const locais = new Map(st[s].map((x) => [x.id, x]));
      (remoto[s] || []).forEach((r) => {
        const l = locais.get(r.id), ex = exLocal[r.id];
        if (ex && ex.t >= (r.atualizadoEm || 0)) return;                       // apagado aqui depois
        if (!l || (r.atualizadoEm || 0) > (l.atualizadoEm || 0)) ops.push({ store: s, item: r });
      });
      Object.keys(exRem).forEach((id) => { const e = exRem[id]; const l = locais.get(id); if (e.s === s && l && e.t > (l.atualizadoEm || 0)) ops.push({ store: s, del: true, id }); });
    });
    const ex = Object.assign({}, exLocal); let exMudou = false;
    Object.keys(exRem).forEach((id) => { if (!ex[id] || ex[id].t < exRem[id].t) { ex[id] = exRem[id]; exMudou = true; } });
    if (exMudou) ops.push({ store: 'meta', item: { id: 'excluidos', value: ex } });
    const ts = Object.assign({}, st.meta.metaTs || {}); let tsMudou = false;
    Object.keys(remoto.meta || {}).forEach((k) => { const r = remoto.meta[k]; if ((r.t || 0) > (ts[k] || 0)) { ops.push({ store: 'meta', item: { id: k, value: r.v } }); ts[k] = r.t; tsMudou = true; } });
    if (tsMudou) ops.push({ store: 'meta', item: { id: 'metaTs', value: ts } });
    return ops;
  }
  /** O arquivo remoto tem algo que este aparelho não tem? (para saber se precisa enviar) */
  function faltaNoRemoto(remoto) {
    const st = App.store.state;
    for (const s of App.store.SINCRONIZADOS) {
      const rem = new Map((remoto[s] || []).map((x) => [x.id, x.atualizadoEm || 0]));
      if (st[s].some((x) => !rem.has(x.id) || (x.atualizadoEm || 0) > rem.get(x.id))) return true;
    }
    const exR = remoto.excluidos || {}, exL = App.store.state.meta.excluidos || {};
    if (Object.keys(exL).some((id) => !exR[id] || exR[id].t < exL[id].t)) return true;
    const ts = App.store.state.meta.metaTs || {};
    return Object.keys(ts).some((k) => !(remoto.meta || {})[k] || remoto.meta[k].t < ts[k]);
  }

  /* ---------- localizar arquivos ---------- */
  async function acharPlanilha() {
    const c = cfg();
    if (c.planilhaId) { try { return await G.meta(c.planilhaId); } catch (e) { if (e.status !== 404) throw e; } }
    const achados = await G.buscar("name contains 'PLANILHA FINANCEIRA' and trashed = false and (mimeType = '" + XLSX_MIME + "')");
    const f = achados.find((x) => U.norm(x.name).indexOf(U.norm(NOME_PLANILHA)) === 0) || achados[0];
    if (!f) throw new Error('Não encontrei a planilha "' + NOME_PLANILHA + '.xlsx" no seu Drive. Escolha-a em Configurações → Online.');
    await salvarCfg({ planilhaId: f.id, planilhaNome: f.name });
    return G.meta(f.id);
  }
  async function acharDados(planilha) {
    const c = cfg();
    if (c.dadosId) { try { return await G.meta(c.dadosId); } catch (e) { if (e.status !== 404) throw e; } }
    const achados = await G.buscar("name = '" + NOME_DADOS.replace(/'/g, "\\'") + "' and trashed = false");
    if (achados[0]) { await salvarCfg({ dadosId: achados[0].id }); return G.meta(achados[0].id); }
    const novo = await G.criarArquivo(NOME_DADOS, pacote(), 'application/json', planilha && planilha.parents);
    await salvarCfg({ dadosId: novo.id });
    ui.toast('Criei no Drive o arquivo de dados do painel (ao lado da planilha). Compartilhe com a outra pessoa em Configurações → Online.', 'good', 8000);
    return G.meta(novo.id);
  }

  /* ---------- ciclo de sincronização ---------- */
  async function ciclo(forcar) {
    if (!ativa || !G.logado()) return;
    if (rodando) { deNovo = true; return; }
    rodando = true; deNovo = false;
    const envia = sujo || forcar; sujo = false;
    try {
      const planilha = await acharPlanilha();
      const dados = await acharDados(planilha);
      // 1) dados do outro aparelho
      if (forcar || dados.version !== versoes.dados) {
        const remoto = JSON.parse(await G.baixarTexto(dados.id) || '{}');
        const ops = mesclar(remoto);
        if (ops.length) await App.store.aplicarRemoto(ops);
        versoes.dados = dados.version;
        if (faltaNoRemoto(remoto)) sujoDados = true;
      }
      // 2) planilha: traz o que mudou nela
      let bytes = null;
      if (forcar || planilha.version !== versoes.planilha || envia) {
        bytes = await G.baixar(planilha.id);
        const wb = XLSX.read(bytes, { type: 'array' });
        const res = App.Importer.analisar(wb, App.store.getMeta('opcoesImportacao', {}) || {});
        const d = res.diff;
        const temMudanca = d.novos.length + d.alterados.length + d.removidos.length + (res.statusExterno || []).length;
        if (temMudanca) {
          if (!App.store.state.lancamentos.length || !App.store.getMeta('syncAutoAplicar', true)) { App.abrirPreviaImportacao(wb, planilha.name); bytes = null; }
          else { const reg = await App.Importer.aplicar(res, planilha.name + ' (Drive)'); ui.toast('Planilha atualizada pelo Drive: ' + reg.novos + ' novos, ' + reg.alterados + ' alterados, ' + reg.removidos + ' removidos.', 'good', 6000); sujoDados = true; }
        }
        versoes.planilha = planilha.version;
      }
      // 3) grava na planilha o que mudou no painel
      if (bytes && App.store.getMeta('gravarNaPlanilha', true) !== false && planilha.capabilities && planilha.capabilities.canEdit !== false) {
        const out = await App.Writer.gerar(bytes);
        if (out) {
          const r = await G.enviar(planilha.id, new Blob([out.bytes], { type: XLSX_MIME }), XLSX_MIME);
          versoes.planilha = r.version;
          await App.store.setMetaSilencioso('controleGravado', out.status);
          const hist = (App.store.getMeta('historicoGravacao', []) || []).slice(-29); hist.push({ quando: out.quando, celulas: out.mudancas, notas: out.notas });
          await App.store.setMetaSilencioso('historicoGravacao', hist);
          if (out.mudancas.length) ui.toast('Planilha gravada no Drive: ' + out.mudancas.length + ' célula(s) — ' + out.mudancas.slice(0, 3).map((m) => m.label + ' ' + U.mesLabel(m.mes) + ' ' + U.brl(m.para)).join('; '), 'good', 6000);
        }
      }
      // 4) envia os dados do painel
      if (envia || sujoDados) {
        const r = await G.enviar(dados.id, pacote(), 'application/json');
        versoes.dados = r.version; sujoDados = false;
      }
      ultimo = Date.now(); erro = null;
    } catch (e) {
      console.error(e); erro = e.message || String(e);
      if (e.precisaLogin) { erro = null; if (!G.jaEntrou()) { ativa = false; App.render(); } }
      else if (forcar) ui.toast(erro, 'bad', 8000);
      sujo = sujo || envia;
    } finally {
      rodando = false; App.atualizarRodape();
      if (deNovo) setTimeout(() => ciclo(false), 300);
    }
  }
  const agendar = U.debounce(() => ciclo(false), 2500);

  const N = {
    configurado: () => !!G.clientId() && G.disponivel(),
    ativa: () => ativa && G.logado(),
    ultimo: () => ultimo, erro: () => erro,
    cfg,
    status: () => (!N.configurado() ? '' : !G.logado() ? (G.jaEntrou() ? 'online: reconecta ao Google no próximo toque na tela' : 'online: entre com o Google') : 'online como ' + ((G.usuario() || {}).email || '') + (ultimo ? ' · sincronizado às ' + new Date(ultimo).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '') + (erro ? ' · ERRO: ' + erro : '')),
    async entrar() {
      try { await G.entrar(true); ativa = true; App.render(); await ciclo(true); App.render(); ui.toast('Conectado ao Google Drive como ' + G.usuario().email + '.', 'good'); }
      catch (e) { ui.toast('Não foi possível entrar: ' + e.message, 'bad', 8000); }
    },
    sair() { G.sair(); ativa = false; App.render(); },
    sincronizar: () => ciclo(true),
    async trocarPlanilha(id, nome) { await salvarCfg({ planilhaId: id, planilhaNome: nome }); versoes.planilha = null; await ciclo(true); },
    async compartilhar(email) {
      const c = cfg(); if (!c.dadosId || !c.planilhaId) throw new Error('Sincronize uma vez antes de compartilhar.');
      await G.compartilhar(c.dadosId, email); await G.compartilhar(c.planilhaId, email);
    },
    buscarPlanilhas: () => G.buscar("trashed = false and mimeType = '" + XLSX_MIME + "'"),
    iniciar() {
      if (!N.configurado()) return;
      // O login precisa de um toque (o navegador bloqueia a janela do Google sem clique): o painel mostra o botão "Entrar com Google".
      G.carregar().catch(() => {});
      // Sessão ainda válida guardada neste aparelho: já começa sincronizando, sem pedir nada.
      if (G.logado()) { ativa = true; setTimeout(() => ciclo(true).then(() => App.render()), 0); }
      // Renovação automática: o Google só libera a janela de acesso junto com um toque/clique.
      // Então, no primeiro toque depois que o acesso expira (ou quando faltam menos de 10 min), renova sozinho.
      const renovar = () => {
        if (!G.jaEntrou() || (G.logado() && G.minutosRestantes() >= 10)) return;
        G.entrar(false).then(() => { const era = ativa; ativa = true; return ciclo(!era).then(() => { if (!era) App.render(); }); }).catch((e) => console.warn('renovação do Google', e));
      };
      document.addEventListener('click', renovar, true);
      document.addEventListener('keydown', renovar, true);
      document.addEventListener('touchend', renovar, true);
      clearInterval(timer);
      timer = setInterval(() => { if (document.visibilityState === 'visible') ciclo(false); }, 30000);
      window.addEventListener('focus', () => ciclo(false));
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ciclo(false); });
      App.store.onChange((what) => { if (what === 'remoto' || what === 'init') return; if (ativa) { sujo = true; agendar(); } });
    },
    _mesclar: mesclar,
  };
  App.nuvem = N;
})(window.App = window.App || {});
