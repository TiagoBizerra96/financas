/* Sincronização nos dois sentidos com o arquivo .xlsx do computador (File System Access API: Chrome e Edge).
 * - Lê: confere a cada 30 s se o arquivo mudou e reimporta só as diferenças.
 * - Grava: alguns segundos depois de cada mudança no painel, lê o arquivo (trazendo antes o que mudou nele) e grava
 *   as células alteradas e a aba de controle. Com o Google Drive para computador, o arquivo sobe sozinho para o Drive. */
(function (App) {
  'use strict';
  const U = App.U, ui = App.ui;
  const INTERVALO = 30000;
  let handle = null, ativo = false, timer = null, verificando = false, podeGravar = false, gravando = false, pendente = false, ultimaGravacao = null, erroGravacao = null;

  const sync = {
    suportado: () => typeof window.showOpenFilePicker === 'function',
    nome: () => (handle ? handle.name : App.store.getMeta('arquivoVinculadoNome', '')),
    ativo: () => ativo,
    podeGravar: () => ativo && podeGravar,
    gravacaoLigada: () => App.store.getMeta('gravarNaPlanilha', true) !== false,
    ultimaGravacao: () => ultimaGravacao, erroGravacao: () => erroGravacao,
    status: () => (handle ? (ativo ? (podeGravar && sync.gravacaoLigada() ? 'sincronizando com ' : 'lendo ') + handle.name + (ultimaGravacao ? ' · gravada às ' + new Date(ultimaGravacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '') + (erroGravacao ? ' · ERRO ao gravar' : '')
      : 'planilha vinculada (clique em Atualizar planilha para reconectar)') : ''),

    async iniciar() {
      if (!sync.suportado()) return;
      handle = App.store.getMeta('arquivoVinculado', null);
      if (!handle || typeof handle.queryPermission !== 'function') { handle = null; return; }
      try {
        if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') { podeGravar = true; comecar(); }
        else if ((await handle.queryPermission({ mode: 'read' })) === 'granted') comecar();
      } catch (e) { console.warn(e); }
      App.atualizarRodape();
    },
    async vincular() {
      try {
        const [h] = await window.showOpenFilePicker({ multiple: false, types: [{ description: 'Planilha Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }] });
        handle = h;
        podeGravar = await pedirGravacao();
        await App.store.setRaw('arquivoVinculado', h);
        await App.store.setMeta('arquivoVinculadoNome', h.name);
        await App.store.setMeta('arquivoVinculadoModificado', 0);
        comecar();
        await sync.verificar(true);
        App.render();
      } catch (e) { if (e.name !== 'AbortError') ui.toast('Não foi possível vincular: ' + e.message, 'bad'); }
    },
    async reconectar() {
      if (!handle) return sync.vincular();
      try {
        podeGravar = await pedirGravacao();
        if (podeGravar || (await handle.requestPermission({ mode: 'read' })) === 'granted') { comecar(); await sync.verificar(true); App.render(); if (podeGravar) agendarGravacao(); }
        else ui.toast('Permissão negada.', 'bad');
      }
      catch (e) { ui.toast('Não foi possível reconectar: ' + e.message, 'bad'); }
    },
    async desvincular() {
      parar(); handle = null; podeGravar = false;
      await App.store.setRaw('arquivoVinculado', null); await App.store.setMeta('arquivoVinculadoNome', '');
      App.render();
    },
    /** Confere se o arquivo mudou; se mudou (ou forçar), lê e aplica as diferenças. */
    async verificar(forcar) {
      if (!handle || !ativo || verificando) return;
      verificando = true;
      try {
        const f = await handle.getFile();
        const ult = App.store.getMeta('arquivoVinculadoModificado', 0);
        if (!forcar && f.lastModified <= ult) return;
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        await App.store.setMeta('arquivoVinculadoModificado', f.lastModified);
        const opts = App.store.getMeta('opcoesImportacao', {});
        if (!App.store.getMeta('syncAutoAplicar', true) || !App.store.state.lancamentos.length) { App.abrirPreviaImportacao(wb, f.name); return; }
        const res = App.Importer.analisar(wb, opts);
        const d = res.diff;
        if (!res.abas.some((a) => a.tipo !== 'ignorada')) { ui.toast('O arquivo vinculado mudou, mas não reconheci as abas. Nada foi alterado.', 'bad', 7000); return; }
        if (!(d.novos.length + d.alterados.length + d.removidos.length + (res.statusExterno || []).length)) { if (forcar) ui.toast('A planilha não tem mudanças novas para trazer.'); if (forcar && podeGravar) agendarGravacao(); return; }
        const reg = await App.Importer.aplicar(res, f.name + ' (automático)');
        if (podeGravar && sync.gravacaoLigada()) agendarGravacao(); // regrava o que o painel soma nas células (ex.: parcelas de empréstimo)
        if (res.statusExterno && res.statusExterno.length) ui.toast(res.statusExterno.length + ' situação(ões) alterada(s) na aba de controle foram trazidas para o painel.', 'good', 6000);
        ui.toast('Planilha atualizada (' + U.dataHoraBR(f.lastModified) + '): ' + reg.novos + ' novos, ' + reg.alterados + ' alterados, ' + reg.removidos + ' removidos.', 'good', 7000);
      } catch (e) {
        console.error(e);
        if (e.name === 'NotAllowedError') { parar(); ui.toast('O navegador pediu permissão de novo para ler a planilha. Vá em Configurações → Reconectar.', 'bad', 8000); }
        else if (e.name === 'NotFoundError') { parar(); ui.toast('O arquivo vinculado não foi encontrado (mudou de pasta?). Vincule de novo em Configurações.', 'bad', 8000); }
        else ui.toast('Não consegui ler a planilha vinculada: ' + e.message, 'bad', 7000);
      } finally { verificando = false; App.atualizarRodape(); }
    },
  };
  async function pedirGravacao() {
    try { return typeof handle.createWritable === 'function' && (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'; } catch (e) { return false; }
  }
  /** Grava as mudanças do painel na planilha. Antes, traz o que mudou no arquivo, para nunca sobrescrever uma edição feita fora. */
  sync.gravar = async (avisar) => {
    if (!handle || !ativo || !podeGravar || !sync.gravacaoLigada()) { if (avisar) ui.toast('Vincule a planilha em Configurações para gravar nela.', 'bad'); return; }
    if (gravando || verificando) { pendente = true; return; }
    gravando = true; pendente = false;
    try {
      const f = await handle.getFile();
      const bytes = new Uint8Array(await f.arrayBuffer());
      const wbAtual = XLSX.read(bytes, { type: 'array' });
      const res = App.Importer.analisar(wbAtual, App.store.getMeta('opcoesImportacao', {}) || {});
      const d = res.diff;
      if (d.novos.length + d.alterados.length + d.removidos.length + (res.statusExterno || []).length) {
        // O arquivo tem mudanças que o painel ainda não tem: traz primeiro (ou mostra a prévia, se você pediu confirmação)
        if (!App.store.getMeta('syncAutoAplicar', true)) { App.abrirPreviaImportacao(wbAtual, f.name); return; }
        const reg = await App.Importer.aplicar(res, f.name + ' (antes de gravar)');
        ui.toast('Mudanças da planilha trazidas antes de gravar: ' + reg.novos + ' novos, ' + reg.alterados + ' alterados, ' + reg.removidos + ' removidos.', 'good', 6000);
      }
      const out = await App.Writer.gerar(bytes);
      if (!out) { if (avisar) ui.toast('A planilha já está igual ao painel.'); erroGravacao = null; return; }
      const w = await handle.createWritable();
      await w.write(new Blob([out.bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      await w.close();
      const nf = await handle.getFile();
      await App.store.setMetaSilencioso('arquivoVinculadoModificado', nf.lastModified);
      await App.store.setMetaSilencioso('controleGravado', out.status);
      const hist = (App.store.getMeta('historicoGravacao', []) || []).slice(-29);
      hist.push({ quando: out.quando, celulas: out.mudancas, notas: out.notas });
      await App.store.setMetaSilencioso('historicoGravacao', hist);
      ultimaGravacao = out.quando; erroGravacao = null;
      if (avisar || out.mudancas.length) ui.toast('Planilha gravada' + (out.mudancas.length ? ': ' + out.mudancas.length + ' célula(s) atualizada(s) — ' + out.mudancas.slice(0, 3).map((m) => m.label + ' ' + U.mesLabel(m.mes) + ' ' + U.brl(m.para)).join('; ') + (out.mudancas.length > 3 ? '…' : '') : ' (aba de controle atualizada).'), 'good', 6000);
    } catch (e) {
      console.error(e); erroGravacao = e.message || String(e);
      if (e.name === 'NoModificationAllowedError' || /lock|in use|being used/i.test(e.message)) ui.toast('Não consegui gravar: a planilha está aberta e travada em outro programa (Excel?). Feche e clique em Atualizar planilha.', 'bad', 9000);
      else if (e.name === 'NotAllowedError') { podeGravar = false; ui.toast('O navegador pediu permissão para gravar de novo. Clique em Atualizar planilha.', 'bad', 8000); }
      else ui.toast('Não consegui gravar na planilha: ' + e.message, 'bad', 8000);
    } finally { gravando = false; App.atualizarRodape(); if (pendente) agendarGravacao(); }
  };
  const agendarGravacao = U.debounce(() => sync.gravar(false), 2500);
  sync.agendarGravacao = agendarGravacao;

  /** Só para testes automáticos: usa um arquivo simulado no lugar do escolhido pelo usuário. */
  sync._usarHandle = (h, gravar) => { handle = h; podeGravar = !!gravar; comecar(); };

  function comecar() {
    ativo = true; clearInterval(timer);
    timer = setInterval(() => { if (document.visibilityState === 'visible') sync.verificar(false); }, INTERVALO);
    sync.verificar(false);
  }
  function parar() { ativo = false; clearInterval(timer); }
  window.addEventListener('focus', () => { if (ativo) sync.verificar(false); });
  // Cada mudança no painel agenda uma gravação na planilha
  document.addEventListener('DOMContentLoaded', () => App.store.onChange((what) => { if (what !== 'restore' && ativo && podeGravar && sync.gravacaoLigada() && !verificando) agendarGravacao(); }));
  App.sync = sync;
})(window.App = window.App || {});
