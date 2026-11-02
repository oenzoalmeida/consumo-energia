'use strict';

const EnergyCloud = (() => {
  const API = 'https://consumo-energia-backend.vercel.app';
  let currentUser = null;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });

  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação');
    return data;
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `.energy-auth{position:fixed;inset:0;z-index:99999;background:#f4f7fb;display:grid;place-items:center;padding:20px;font-family:Arial,sans-serif}.energy-auth-card{width:min(100%,430px);background:#fff;border:1px solid #dce4ed;border-radius:20px;padding:28px;box-shadow:0 22px 60px rgba(20,40,70,.12)}.energy-auth-card h1{margin:0 0 8px;font-size:28px}.energy-auth-card>p{margin:0 0 20px;color:#64748b;line-height:1.45}.energy-tabs{display:flex;gap:8px;margin-bottom:14px}.energy-tabs button,.energy-form button{border:0;border-radius:10px;padding:12px 14px;font-weight:700;cursor:pointer}.energy-tabs button{flex:1;background:#eef3f8}.energy-tabs button.active,.energy-form button{background:#1d4ed8;color:#fff}.energy-form{display:grid;grid-template-columns:1fr;gap:6px}.energy-label{font-size:13px;font-weight:600;color:#334155;margin-top:6px}.energy-form input{padding:13px 14px;border:1px solid #cbd5e1;border-radius:10px;font:inherit}.energy-hidden{display:none!important}.energy-msg{min-height:20px;margin:10px 0 0;color:#b42318;font-size:14px}.energy-account{position:fixed;right:16px;top:16px;z-index:9000;background:#fff;border:1px solid #dce4ed;border-radius:999px;padding:7px 8px 7px 12px;display:flex;gap:8px;align-items:center;box-shadow:0 8px 24px rgba(20,40,70,.08);font-size:13px}.energy-account button{border:0;border-radius:999px;padding:7px 10px;cursor:pointer}.energy-del{color:#b42318}.energy-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}.energy-notice{margin:6px 0 0;color:#475569;font-size:12px;line-height:1.45}.energy-notice.energy-hidden{display:none};.energy-notice a{color:#1d4ed8}@media(max-width:640px){.energy-account{position:static;margin:8px auto;width:max-content;max-width:calc(100% - 24px)}}`;
    document.head.appendChild(style);
  }

  function accountPill() {
    if (!currentUser || document.querySelector('.energy-account')) return;
    const el = document.createElement('div');
    el.className = 'energy-account';
    el.innerHTML = `<span>${String(currentUser.name).replace(/[&<>"']/g,'')}</span><button type="button">Sair</button><button type="button" class="energy-del" title="Excluir conta">Excluir conta</button>`;
    el.querySelector('button').onclick = async () => { try { await request('/api/auth/logout',{method:'POST'}); } catch {} location.reload(); };
    el.querySelector('.energy-del').onclick = async () => {
      if (!confirm('Excluir sua conta e todos os dados da sua simulação? Esta ação é definitiva.')) return;
      if (!confirm('Confirma novamente? Os dados não poderão ser recuperados.')) return;
      try { await request('/api/account',{method:'DELETE'}); } catch {}
      location.reload();
    };
    document.body.prepend(el);
  }

  function gate() {
    let mode = 'login';
    const el = document.createElement('div');
    el.className = 'energy-auth';
    el.innerHTML = `<section class="energy-auth-card" role="dialog" aria-modal="true" aria-label="Acesso ao Consumo de Energia 2.0"><h1>Consumo de Energia 2.0</h1><p>Entre para salvar suas simulações em uma área exclusiva.</p><div class="energy-tabs"><button id="e-login" class="active" type="button" aria-pressed="true">Entrar</button><button id="e-register" type="button" aria-pressed="false">Criar conta</button></div><form id="e-form" class="energy-form"><label class="energy-sr" for="e-name">Seu nome</label><input id="e-name" class="energy-hidden" type="text" placeholder="Seu nome" autocomplete="name"><label class="energy-sr" for="e-email">E-mail</label><input id="e-email" type="email" placeholder="E-mail" autocomplete="email" required><label class="energy-sr" for="e-password">Senha</label><input id="e-password" type="password" placeholder="Senha" autocomplete="current-password" required><button id="e-submit" type="submit">Entrar</button></form><p id="e-notice" class="energy-notice energy-hidden">Seus dados são usados apenas para autenticação e para salvar a sua simulação. Saiba mais na <a href="./privacidade.html">Política de Privacidade</a>.</p><p id="e-msg" class="energy-msg"></p></section>`;
    document.body.appendChild(el);
    el.querySelector('#e-email').focus();
    const name = el.querySelector('#e-name'), login = el.querySelector('#e-login'), register = el.querySelector('#e-register'), submit = el.querySelector('#e-submit'), password = el.querySelector('#e-password'), msg = el.querySelector('#e-msg'), notice = el.querySelector('#e-notice');
    const setMode = m => { mode=m; const r=m==='register'; login.classList.toggle('active',!r); register.classList.toggle('active',r); login.setAttribute('aria-pressed',String(!r)); register.setAttribute('aria-pressed',String(r)); name.classList.toggle('energy-hidden',!r); notice.classList.toggle('energy-hidden',!r); submit.textContent=r?'Criar conta':'Entrar'; password.autocomplete=r?'new-password':'current-password'; msg.textContent=''; };
    login.onclick=()=>setMode('login'); register.onclick=()=>setMode('register');
    el.querySelector('#e-form').onsubmit = async event => {
      event.preventDefault(); msg.textContent='';
      try {
        const body={email:el.querySelector('#e-email').value.trim(),password:password.value}; if(mode==='register') body.name=name.value.trim();
        const result=await request(`/api/auth/${mode==='register'?'register':'login'}`,{method:'POST',body:JSON.stringify(body)}); currentUser=result.user;
        if(currentUser.mustChange){ el.remove(); forceChange(); return; }
        if(currentUser.role==='ADMIN'){ location.href='./admin.html'; return; }
        el.remove(); accountPill(); resolveReady(currentUser);
      } catch(err){ msg.textContent=err.message; }
    };
  }

  function forceChange() {
    const el = document.createElement('div');
    el.className = 'energy-auth';
    el.innerHTML = `<section class="energy-auth-card" role="dialog" aria-modal="true" aria-label="Troca de senha obrigatória"><h1>Crie sua senha definitiva</h1><p>Por segurança, você precisa trocar a senha temporária antes de continuar.</p><form id="e-force" class="energy-form"><label class="energy-label" for="e-current">Senha temporária</label><input id="e-current" type="password" placeholder="Digite a senha temporária" autocomplete="current-password" required><label class="energy-label" for="e-new">Nova senha (mín. 12 caracteres)</label><input id="e-new" type="password" placeholder="Digite a nova senha" autocomplete="new-password" required><label class="energy-label" for="e-confirm">Confirmar nova senha</label><input id="e-confirm" type="password" placeholder="Repita a nova senha" autocomplete="new-password" required><button id="e-force-submit" type="submit">Definir nova senha</button></form><p id="e-force-msg" class="energy-msg"></p></section>`;
    document.body.appendChild(el);
    el.querySelector('#e-current').focus();
    el.querySelector('#e-force').onsubmit = async event => {
      event.preventDefault();
      const msg = el.querySelector('#e-force-msg');
      msg.textContent = '';
      const current = el.querySelector('#e-current').value, next = el.querySelector('#e-new').value, confirm = el.querySelector('#e-confirm').value;
      if (next !== confirm) { msg.textContent = 'As senhas novas não coincidem'; return; }
      try {
        const result = await request('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password: current, new_password: next }) });
        currentUser = result.user;
        el.remove();
        if (currentUser.role === 'ADMIN') { location.href = './admin.html'; return; }
        accountPill(); resolveReady(currentUser);
      } catch (err) { msg.textContent = err.message; }
    };
  }

  async function init() {
    injectStyles();
    try {
      const result=await request('/api/auth/me'); currentUser=result.user;
      if(currentUser.mustChange){ forceChange(); return; }
      if(currentUser.role==='ADMIN'){ location.href='./admin.html'; return; }
      accountPill(); resolveReady(currentUser);
    } catch { gate(); }
  }
  async function load(){ await ready; const r=await request('/api/data'); return r.data || {}; }
  async function save(data){ await ready; await request('/api/data',{method:'PUT',body:JSON.stringify({data})}); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
  return { API, ready, request, load, save, get user(){return currentUser;} };
})();
