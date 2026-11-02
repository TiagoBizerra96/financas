/* Login com Google (Google Identity Services) e acesso à API do Google Drive, direto do navegador.
 * Precisa de um "ID do cliente OAuth" do projeto de vocês no Google Cloud (veja PUBLICAR-ONLINE.txt).
 * Nenhuma senha passa pelo sistema: o Google entrega um token temporário que só vale para o Drive. */
(function (App) {
  'use strict';
  const SCOPES = 'https://www.googleapis.com/auth/drive openid email profile';
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  let tokenClient = null, token = null, expira = 0, usuario = null, carregando = null, pendentes = [];

  const G = {
    clientId() {
      const cfg = window.FINANCAS_CONFIG || {};
      let local = ''; try { local = localStorage.getItem('financas.googleClientId') || ''; } catch (e) { /* sem localStorage */ }
      return (local || cfg.googleClientId || '').trim();
    },
    setClientId(id) { try { localStorage.setItem('financas.googleClientId', (id || '').trim()); } catch (e) { /* ignora */ } tokenClient = null; },
    disponivel() { return location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'; },
    logado() { return !!token && Date.now() < expira - 60000; },
    usuario() { return usuario; },

    /** Carrega a biblioteca do Google só quando é preciso. */
    carregar() {
      if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
      if (carregando) return carregando;
      carregando = new Promise((resolve, reject) => {
        const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
        s.onload = () => resolve(); s.onerror = () => { carregando = null; reject(new Error('Não foi possível carregar o login do Google. Verifique a internet.')); };
        document.head.appendChild(s);
      });
      return carregando;
    },
    /** Pede o token. interativo = abre a janela do Google (precisa de um clique do usuário). */
    async entrar(interativo) {
      const id = G.clientId(); if (!id) throw new Error('Falta o ID do cliente Google (Configurações → Online).');
      await G.carregar();
      return new Promise((resolve, reject) => {
        if (!tokenClient) {
          tokenClient = google.accounts.oauth2.initTokenClient({ client_id: id, scope: SCOPES, callback: () => {}, error_callback: (e) => { const p = pendentes.splice(0); p.forEach((x) => x.reject(new Error(e && e.message ? e.message : 'Login cancelado.'))); } });
        }
        tokenClient.callback = async (r) => {
          const p = pendentes.splice(0);
          if (r.error) { p.forEach((x) => x.reject(new Error(r.error_description || r.error))); return; }
          token = r.access_token; expira = Date.now() + (+r.expires_in || 3600) * 1000;
          try { const u = await G.req('GET', 'https://www.googleapis.com/oauth2/v3/userinfo'); usuario = { email: u.email, nome: u.name || u.email }; } catch (e) { usuario = usuario || { email: '', nome: '' }; }
          try { localStorage.setItem('financas.ultimoEmail', usuario.email || ''); } catch (e) { /* ignora */ }
          p.forEach((x) => x.resolve(usuario));
        };
        pendentes.push({ resolve, reject });
        let dica = ''; try { dica = localStorage.getItem('financas.ultimoEmail') || ''; } catch (e) { /* ignora */ }
        tokenClient.requestAccessToken({ prompt: interativo ? '' : 'none', hint: dica || undefined, login_hint: dica || undefined });
      });
    },
    sair() { if (token && window.google && google.accounts.oauth2.revoke) google.accounts.oauth2.revoke(token, () => {}); token = null; usuario = null; expira = 0; },

    /** Chamada à API. Renova o token sem janela quando possível. */
    async req(metodo, url, corpo, tipo, resposta) {
      if (!G.logado()) { try { await G.entrar(false); } catch (e) { const er = new Error('Entre com sua conta Google de novo.'); er.precisaLogin = true; throw er; } }
      const h = { Authorization: 'Bearer ' + token };
      if (tipo) h['Content-Type'] = tipo;
      const r = await fetch(url, { method: metodo, headers: h, body: corpo });
      if (r.status === 401) { token = null; const er = new Error('A sessão do Google expirou. Entre de novo.'); er.precisaLogin = true; throw er; }
      if (!r.ok) { let msg = r.status + ''; try { const j = await r.json(); msg = (j.error && j.error.message) || msg; } catch (e) { /* sem corpo */ } const er = new Error('Google Drive: ' + msg); er.status = r.status; throw er; }
      if (resposta === 'bytes') return new Uint8Array(await r.arrayBuffer());
      if (resposta === 'texto') return r.text();
      return r.status === 204 ? null : r.json();
    },
    buscar(q) { return G.req('GET', API + '/files?q=' + encodeURIComponent(q) + '&fields=files(id,name,modifiedTime,version,parents,owners(emailAddress),mimeType)&orderBy=modifiedTime desc&pageSize=20&supportsAllDrives=true&includeItemsFromAllDrives=true').then((r) => r.files || []); },
    meta(id) { return G.req('GET', API + '/files/' + id + '?fields=id,name,modifiedTime,version,parents,mimeType,capabilities(canEdit)&supportsAllDrives=true'); },
    baixar(id) { return G.req('GET', API + '/files/' + id + '?alt=media&supportsAllDrives=true', null, null, 'bytes'); },
    baixarTexto(id) { return G.req('GET', API + '/files/' + id + '?alt=media&supportsAllDrives=true', null, null, 'texto'); },
    enviar(id, conteudo, mime) { return G.req('PATCH', UPLOAD + '/files/' + id + '?uploadType=media&supportsAllDrives=true&fields=id,modifiedTime,version', conteudo, mime); },
    criarArquivo(nome, conteudo, mime, pastas) {
      const b = 'financas' + Date.now();
      const meta = JSON.stringify({ name: nome, mimeType: mime, parents: pastas && pastas.length ? pastas : undefined });
      const corpo = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + b + '\r\nContent-Type: ' + mime + '\r\n\r\n' + conteudo + '\r\n--' + b + '--';
      return G.req('POST', UPLOAD + '/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,modifiedTime,version,parents', corpo, 'multipart/related; boundary=' + b);
    },
    compartilhar(id, email) { return G.req('POST', API + '/files/' + id + '/permissions?sendNotificationEmail=true&supportsAllDrives=true', JSON.stringify({ type: 'user', role: 'writer', emailAddress: email }), 'application/json'); },
  };
  App.google = G;
})(window.App = window.App || {});
