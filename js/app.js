/* Inicialização, navegação entre as seções e atualização automática das telas quando os dados mudam. */
(function (App) {
  'use strict';
  const U = App.U, ui = App.ui;
  App.views = App.views || {};
  const TITULOS = { dashboard: 'Dashboard', mensal: 'Análise mensal', contas: 'Contas a pagar', cartoes: 'Cartões e empréstimos', dividas: 'Simulador de dívidas',
    simulador: 'Simulador financeiro', simcartao: 'Simulador de cartão de crédito', lancamentos: 'Contas e despesas', projecao: 'Projeção anual', config: 'Configurações' };
  App.sel = { mes: null };
  let rotaAtual = null;

  /** Mês padrão: o mês atual; se não houver dados nele, o mês com dados mais próximo. */
  App.mesPadrao = () => {
    const meses = App.F.mesesComDados(); const hoje = U.mesAtual();
    if (!meses.length || meses.includes(hoje)) return hoje;
    return meses.reduce((a, b) => (Math.abs(U.mesDiff(hoje, b)) < Math.abs(U.mesDiff(hoje, a)) ? b : a));
  };
  App.navegar = (rota) => { if (location.hash !== '#' + rota) location.hash = rota; else render(); };

  function render() {
    const rota = (location.hash || '#dashboard').slice(1).split('?')[0];
    const nome = App.views[rota] ? rota : 'dashboard';
    if (!App.sel.mes) App.sel.mes = App.mesPadrao();
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === nome));
    document.getElementById('pageTitle').textContent = TITULOS[nome];
    document.title = TITULOS[nome] + ' · Finanças Iasmym e Tiago';
    const view = document.getElementById('view'), acoes = document.getElementById('topActions');
    const mudouRota = rotaAtual !== nome;
    const scroll = mudouRota ? 0 : window.scrollY;
    acoes.innerHTML = '';
    App.charts.destruirTodos();
    try { App.views[nome].render(view, acoes); }
    catch (e) { console.error(e); view.innerHTML = '<div class="banner bad">' + ui.icon('alert') + '<div><b>Algo deu errado ao montar esta tela.</b>' + U.esc(e.message) + '</div></div>'; }
    finally {
      // Botão "Atualizar planilha" em todas as telas
      if (nome !== 'config') {
        const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.id = 'btnAtualizarPlanilha';
        b.innerHTML = ui.icon('refresh') + 'Atualizar planilha'; b.title = 'Lê a planilha de novo e aplica só o que mudou';
        b.addEventListener('click', App.atualizarPlanilha); acoes.insertBefore(b, acoes.firstChild);
      }
    }
    ui.hydrateIcons(view); ui.hydrateIcons(acoes);
    App.charts.limpar();
    if (mudouRota) { view.focus({ preventScroll: true }); window.scrollTo(0, 0); } else window.scrollTo(0, scroll);
    rotaAtual = nome;
    atualizarRodape();
    fecharMenu();
  }
  App.render = render;

  function atualizarRodape() {
    const ult = App.store.getMeta('ultimaImportacao', null);
    const el = document.getElementById('syncInfo');
    const N = App.nuvem, emNuvem = N && N.configurado();
    const vinc = emNuvem ? N.status() : App.sync && App.sync.status();
    const gr = App.store.ultimaGravacao;
    el.innerHTML = '<div>✓ Tudo é salvo automaticamente ' + (emNuvem && N.ativa() ? 'neste aparelho e no Google Drive' : 'neste navegador') + (gr ? ' (última alteração às ' + new Date(gr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ')' : '') + '</div>' +
      '<div style="margin-top:4px">' + (ult ? 'Planilha importada em ' + U.dataHoraBR(ult.quando) : 'Nenhuma planilha importada') + (vinc ? ' · ' + U.esc(vinc) : '') + '</div>';
  }
  /** Atualiza a partir da planilha: arquivo vinculado (Chrome/Edge) ou escolher o arquivo de novo. */
  App.atualizarPlanilha = async () => {
    const N = App.nuvem;
    if (N && N.configurado()) { if (!N.ativa()) await N.entrar(); else { await N.sincronizar(); ui.toast('Sincronizado com o Google Drive.', 'good'); } return; }
    const s = App.sync;
    if (s && s.suportado() && s.nome()) { if (!s.ativo()) await s.reconectar(); else await s.verificar(true); return; }
    const inp = document.getElementById('arqGlobal');
    inp.onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try { App.abrirPreviaImportacao(await App.Importer.lerArquivo(f), f.name); } catch (err) { ui.toast('Não consegui ler o arquivo: ' + err.message, 'bad', 7000); }
    };
    ui.toast('Escolha a planilha atualizada (.xlsx). Se ela está no Google Drive, baixe antes: Arquivo → Fazer download → Microsoft Excel.', '', 8000);
    inp.click();
  };
  /** Avisos de atualização da planilha e de backup (Dashboard e Contas a pagar). */
  App.avisosPlanilha = () => {
    const s = App.sync, ult = App.store.getMeta('ultimaImportacao', null), bk = App.store.getMeta('ultimoBackup', 0);
    let h = '';
    const N = App.nuvem;
    if (N && N.configurado()) {
      if (!N.ativa()) h += '<div class="banner warn">' + ui.icon('link') + '<div><b>Entre com sua conta Google para sincronizar</b>Assim o painel lê e grava a planilha no Google Drive e vocês dois veem os mesmos dados. <button class="btn sm primary" data-entrar-google style="margin-left:6px">Entrar com Google</button></div></div>';
      else if (N.erro()) h += '<div class="banner bad">' + ui.icon('alert') + '<div><b>Problema ao sincronizar com o Drive</b>' + U.esc(N.erro()) + ' <button class="btn sm" data-sync-nuvem style="margin-left:6px">Tentar de novo</button></div></div>';
      return h;
    }
    if (s && s.nome() && !s.ativo() && s.suportado()) h += '<div class="banner warn">' + ui.icon('link') + '<div><b>A planilha vinculada precisa ser reconectada</b>O navegador pede permissão de novo a cada vez que abre. Clique em "Atualizar planilha" no topo para reconectar e trazer as alterações.</div></div>';
    else if (!(s && s.ativo())) h += '<div class="banner info">' + ui.icon('refresh') + '<div><b>Painel e planilha ainda não estão sincronizados</b>' +
      (ult ? 'Os dados aqui são da importação de ' + U.dataHoraBR(ult.quando) + '. ' : '') + 'Para as mudanças irem e voltarem sozinhas, vincule a planilha da pasta do Google Drive para computador em <a href="#config">Configurações</a>. ' +
      'Sem isso, use "Atualizar planilha" no topo com a planilha baixada do Drive.</div></div>';
    else if (s.ativo() && !s.podeGravar()) h += '<div class="banner warn">' + ui.icon('alert') + '<div><b>A planilha está vinculada só para leitura</b>As mudanças do painel não estão indo para a planilha. Em <a href="#config">Configurações</a>, clique em "Reconectar" e permita editar.</div></div>';
    if (App.store.state.lancamentos.length && (!bk || Date.now() - bk > 7 * 864e5)) h += '<div class="banner warn">' + ui.icon('download') + '<div><b>' + (bk ? 'Último backup há ' + Math.floor((Date.now() - bk) / 864e5) + ' dias' : 'Nenhum backup feito ainda') + '</b>Os dados ficam salvos neste navegador. Um backup protege contra limpeza do navegador ou troca de computador. <button class="btn sm" data-backup style="margin-left:6px">Fazer backup agora</button></div></div>';
    return h;
  };
  document.addEventListener('click', (e) => {
    if (!e.target.closest) return;
    if (e.target.closest('[data-backup]')) App.backup();
    if (e.target.closest('[data-entrar-google]')) App.nuvem.entrar();
    if (e.target.closest('[data-sync-nuvem]')) App.nuvem.sincronizar();
    if (e.target.closest('[data-instalar]')) App.instalar();
  });

  /* ---------- app instalável (PWA) ---------- */
  let pedidoInstalar = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedidoInstalar = e; if (rotaAtual === 'config') render(); });
  App.podeInstalar = () => !!pedidoInstalar;
  App.instalado = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  App.instalar = async () => {
    if (pedidoInstalar) { pedidoInstalar.prompt(); const r = await pedidoInstalar.userChoice; pedidoInstalar = null; if (r.outcome === 'accepted') ui.toast('App instalado! Ele aparece na tela inicial.', 'good'); return; }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    ui.modal({ titulo: 'Instalar o app', corpo: '<p class="prose">' + (ios ? 'No iPhone, abra este site no <b>Safari</b>, toque no botão <b>Compartilhar</b> (quadrado com seta para cima) e escolha <b>Adicionar à Tela de Início</b>.'
      : 'No Android (Chrome), toque nos <b>três pontinhos</b> e escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>. No computador (Chrome/Edge), clique no ícone de instalar na barra de endereço.') + '</p>', botoes: [{ texto: 'Entendi', classe: 'primary' }] });
  };
  function registrarSW() {
    if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ui.toast('Nova versão do app disponível — feche e abra de novo (ou recarregue a página) para usar.', 'good', 10000); });
      });
    }).catch((e) => console.warn('Service worker não registrado', e));
  }
  App.atualizarRodape = atualizarRodape;

  function fecharMenu() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('scrim').classList.remove('show'); }

  async function iniciar() {
    ui.hydrateIcons(document);
    document.getElementById('menuBtn').addEventListener('click', () => { document.getElementById('sidebar').classList.add('open'); document.getElementById('scrim').classList.add('show'); });
    document.getElementById('scrim').addEventListener('click', fecharMenu);
    try { await App.store.init(); }
    catch (e) {
      document.getElementById('view').innerHTML = '<div class="banner bad">' + ui.icon('alert') + '<div><b>Não foi possível abrir o banco de dados do navegador.</b>' + U.esc(e.message) +
        '<br>Use o Chrome, Edge ou Firefox atualizados e não use janela anônima/privada.</div></div>';
      return;
    }
    // Qualquer gravação redesenha a tela atual (debounce para lotes).
    App.store.onChange(U.debounce(() => { if (!document.querySelector('.modal-back')) render(); else App._pendente = true; }, 60));
    new MutationObserver(() => { if (App._pendente && !document.querySelector('.modal-back')) { App._pendente = false; render(); } })
      .observe(document.getElementById('modalRoot'), { childList: true });
    window.addEventListener('hashchange', render);
    render();
    if (App.nuvem && App.nuvem.configurado()) App.nuvem.iniciar();
    else if (App.sync) App.sync.iniciar();
    registrarSW();
  }
  document.addEventListener('DOMContentLoaded', iniciar);
})(window.App = window.App || {});
