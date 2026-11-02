/* Armazenamento persistente em IndexedDB + estado em memória.
 * Todas as gravações passam por App.store, que atualiza o banco, o estado e avisa as telas. */
(function (App) {
  'use strict';
  const DB_NAME = 'financas-iasmym-tiago';
  const DB_VERSION = 1;
  const STORES = ['lancamentos', 'cartoes', 'dividas', 'simulacoes', 'categorias', 'meta'];
  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('Este navegador não tem IndexedDB.')); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        STORES.forEach((s) => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); });
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(stores, mode) { return db.transaction(stores, mode); }
  function done(t) { return new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transação cancelada')); }); }

  function getAll(store) {
    return new Promise((resolve, reject) => {
      const r = tx([store], 'readonly').objectStore(store).getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  }

  const state = { lancamentos: [], cartoes: [], dividas: [], simulacoes: [], categorias: [], meta: {} };
  const SINCRONIZADOS = ['lancamentos', 'cartoes', 'dividas', 'simulacoes', 'categorias'];
  /** Configurações que valem para os dois usuários (vão para o arquivo de dados na nuvem). */
  const META_COMPARTILHADA = ['gastoVariavelPrevisto', 'reservaInicial', 'aliasesCartao', 'importIgnorados', 'opcoesImportacao', 'controleGravado', 'gravarNaPlanilha', 'syncAutoAplicar'];
  let origemAtual = null; // 'remoto' enquanto aplica dados vindos do outro aparelho
  const carimbar = (storeName, items) => { if (origemAtual !== 'remoto' && SINCRONIZADOS.includes(storeName)) { const t = Date.now(); items.forEach((it) => { it.atualizadoEm = t; }); } };
  async function anotarExclusoes(storeName, ids) {
    if (origemAtual === 'remoto' || !SINCRONIZADOS.includes(storeName) || !ids.length) return;
    const ex = Object.assign({}, state.meta.excluidos || {}); const t = Date.now();
    ids.forEach((id) => { ex[id] = { s: storeName, t }; });
    const tr = db.transaction(['meta'], 'readwrite'); tr.objectStore('meta').put({ id: 'excluidos', value: ex });
    await new Promise((res) => { tr.oncomplete = res; tr.onerror = res; });
    state.meta.excluidos = ex;
  }
  const listeners = [];

  const store = {
    state,
    async init() {
      await open();
      for (const s of STORES) {
        const rows = await getAll(s);
        if (s === 'meta') { state.meta = {}; rows.forEach((r) => { state.meta[r.id] = r.value; }); }
        else state[s] = rows;
      }
      if (!state.categorias.length) await store.putMany('categorias', App.Categorias.padrao());
    },
    onChange(fn) { listeners.push(fn); },
    ultimaGravacao: null,
    emit(what) { if (what !== 'init') store.ultimaGravacao = Date.now(); listeners.forEach((fn) => { try { fn(what); } catch (e) { console.error(e); } }); },

    /** Grava (cria ou substitui) vários registros de uma vez numa só transação. */
    async putMany(storeName, items, silent) {
      carimbar(storeName, items);
      const t = tx([storeName], 'readwrite'); const os = t.objectStore(storeName);
      items.forEach((it) => os.put(it));
      await done(t);
      const arr = state[storeName];
      const idx = new Map(arr.map((x, i) => [x.id, i]));
      items.forEach((it) => { if (idx.has(it.id)) arr[idx.get(it.id)] = it; else { idx.set(it.id, arr.length); arr.push(it); } });
      if (!silent) store.emit(storeName);
    },
    async put(storeName, item) { return store.putMany(storeName, [item]); },
    async removeMany(storeName, ids, silent) {
      const t = tx([storeName], 'readwrite'); const os = t.objectStore(storeName);
      ids.forEach((id) => os.delete(id));
      await done(t);
      const set = new Set(ids);
      state[storeName] = state[storeName].filter((x) => !set.has(x.id));
      await anotarExclusoes(storeName, ids);
      if (!silent) store.emit(storeName);
    },
    async remove(storeName, id) { return store.removeMany(storeName, [id]); },
    async setMeta(key, value) {
      const t = tx(['meta'], 'readwrite'); t.objectStore('meta').put({ id: key, value });
      if (META_COMPARTILHADA.includes(key) && origemAtual !== 'remoto') { const ts = Object.assign({}, state.meta.metaTs || {}); ts[key] = Date.now(); t.objectStore('meta').put({ id: 'metaTs', value: ts }); state.meta.metaTs = ts; }
      await done(t); state.meta[key] = value; store.emit('meta');
    },
    getMeta(key, def) { return key in state.meta ? state.meta[key] : def; },

    /** Aplica num único passo as mudanças de uma importação (gravações e exclusões). */
    async aplicarLote(ops) {
      const names = [...new Set(ops.map((o) => o.store))];
      if (!names.length) return;
      if (origemAtual !== 'remoto') {
        const t0 = Date.now(); const ts = Object.assign({}, state.meta.metaTs || {});
        ops.forEach((o) => { if (!o.del && SINCRONIZADOS.includes(o.store)) o.item.atualizadoEm = t0; if (!o.del && o.store === 'meta' && META_COMPARTILHADA.includes(o.item.id)) ts[o.item.id] = t0; });
        if (ops.some((o) => o.store === 'meta' && META_COMPARTILHADA.includes(o.item && o.item.id))) { ops.push({ store: 'meta', item: { id: 'metaTs', value: ts } }); if (!names.includes('meta')) names.push('meta'); }
      }
      const t = tx(names, 'readwrite');
      ops.forEach((o) => { const os = t.objectStore(o.store); if (o.del) os.delete(o.id); else os.put(o.item); });
      await done(t);
      ops.forEach((o) => {
        const arr = state[o.store];
        if (o.del) { const i = arr.findIndex((x) => x.id === o.id); if (i > -1) arr.splice(i, 1); }
        else if (o.store === 'meta') state.meta[o.item.id] = o.item.value;
        else { const i = arr.findIndex((x) => x.id === o.item.id); if (i > -1) arr[i] = o.item; else arr.push(o.item); }
      });
      await anotarExclusoes('_lote', []);
      const delPorStore = {}; ops.filter((o) => o.del).forEach((o) => { (delPorStore[o.store] = delPorStore[o.store] || []).push(o.id); });
      for (const s of Object.keys(delPorStore)) await anotarExclusoes(s, delPorStore[s]);
      store.emit(origemAtual === 'remoto' ? 'remoto' : 'lote');
    },
    /** Aplica dados vindos do outro aparelho sem mudar as datas nem anotar exclusões. */
    async aplicarRemoto(ops) { origemAtual = 'remoto'; try { await store.aplicarLote(ops); } finally { origemAtual = null; } },
    META_COMPARTILHADA, SINCRONIZADOS,

    /** Cópia completa de todos os dados (para backup). */
    dump() {
      return { app: 'financas-iasmym-tiago', versao: 1, geradoEm: new Date().toISOString(),
        lancamentos: state.lancamentos, cartoes: state.cartoes, dividas: state.dividas, simulacoes: state.simulacoes,
        categorias: state.categorias, meta: Object.keys(state.meta).filter((k) => k !== 'arquivoVinculado').map((k) => ({ id: k, value: state.meta[k] })) };
    },
    /** Substitui todos os dados pelos do backup. */
    async restore(data) {
      if (!data || data.app !== 'financas-iasmym-tiago') throw new Error('Este arquivo não é um backup deste sistema.');
      const t = tx(STORES, 'readwrite');
      STORES.forEach((s) => t.objectStore(s).clear());
      STORES.forEach((s) => (data[s] || []).forEach((it) => t.objectStore(s).put(it)));
      await done(t);
      await store.init();
      store.emit('restore');
    },
    async limparTudo() {
      const t = tx(STORES, 'readwrite'); STORES.forEach((s) => t.objectStore(s).clear()); await done(t);
      Object.keys(state).forEach((k) => { state[k] = k === 'meta' ? {} : []; });
      await store.putMany('categorias', App.Categorias.padrao(), true);
      store.emit('restore');
    },
    /** Grava um valor de configuração sem redesenhar as telas (uso interno da sincronização). */
    async setMetaSilencioso(key, value) { const t = tx(['meta'], 'readwrite'); t.objectStore('meta').put({ id: key, value }); await done(t); state.meta[key] = value; },
    /** Guarda objetos que não são JSON (ex.: o "handle" de arquivo vinculado). */
    async setRaw(key, value) { const t = tx(['meta'], 'readwrite'); t.objectStore('meta').put({ id: key, value }); await done(t); state.meta[key] = value; },
  };

  App.store = store;
})(window.App = window.App || {});
