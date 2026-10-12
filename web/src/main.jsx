import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createUserWithEmailAndPassword, onAuthStateChanged, reload, sendEmailVerification,
  sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut,
} from 'firebase/auth';
import { auth, configured, googleProvider } from './firebase';
import { request, upload } from './api';
import './style.css';

const emptyProfile = { slug: '', nome_publico: '', titulo: '', descricao: '', categoria: 'promoter', cidade: '', uf: '' };
const firebaseMessages = {
  'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
  'auth/invalid-email': 'Digite um e-mail válido.',
  'auth/invalid-credential': 'E-mail ou senha inválidos.',
  'auth/weak-password': 'Use uma senha mais forte, com pelo menos 6 caracteres.',
  'auth/popup-closed-by-user': 'A janela de login foi fechada.',
  'auth/popup-blocked': 'O navegador bloqueou a janela de login. Permita pop-ups para este site.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente novamente.',
  'auth/unauthorized-domain': 'Adicione este domínio aos domínios autorizados do Firebase Authentication.',
};
const messageOf = (error) => firebaseMessages[error?.code] || error?.message || 'Tente novamente.';

function App() {
  const [identity, setIdentity] = useState(undefined);
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [section, setSection] = useState('search');
  const [account, setAccount] = useState(null);
  const [profile, setProfile] = useState(emptyProfile);
  const [categories, setCategories] = useState([]);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({ categoria: 'promoter', cidade: '', uf: '' });
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (user) => setIdentity(user ? {
      uid: user.uid, email: user.email, verified: user.emailVerified,
      name: user.displayName || user.email?.split('@')[0],
    } : null));
  }, []);

  useEffect(() => {
    request('/api/categories').then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (!identity?.verified) { setAccount(null); return; }
    let active = true;
    request('/api/me', { authenticated: true })
      .then((data) => { if (active) setAccount(data); })
      .catch((err) => { if (active) setError(messageOf(err)); });
    return () => { active = false; };
  }, [identity?.uid, identity?.verified]);

  useEffect(() => {
    if (section === 'publish') document.getElementById('publicar')?.scrollIntoView({ behavior: 'smooth' });
  }, [section]);

  async function run(action) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }

  async function submitAuth(event) {
    event.preventDefault();
    await run(async () => {
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email);
        setNotice('Se houver uma conta com este e-mail, você receberá as instruções para redefinir a senha.');
      } else if (mode === 'register') {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(user);
        setIdentity({ uid: user.uid, email: user.email, verified: false, name: user.email.split('@')[0] });
        setNotice('Enviamos um link de confirmação para o seu e-mail.');
      } else {
        const { user } = await signInWithEmailAndPassword(auth, email, password);
        setIdentity({ uid: user.uid, email: user.email, verified: user.emailVerified, name: user.displayName || user.email.split('@')[0] });
      }
    });
  }

  async function checkEmail() {
    await run(async () => {
      await reload(auth.currentUser);
      setIdentity({ uid: auth.currentUser.uid, email: auth.currentUser.email,
        verified: auth.currentUser.emailVerified, name: auth.currentUser.displayName || auth.currentUser.email.split('@')[0] });
      if (!auth.currentUser.emailVerified) setNotice('Ainda não encontramos a confirmação. Abra o link recebido e tente novamente.');
    });
  }

  async function search(event) {
    event?.preventDefault();
    await run(async () => {
      const params = new URLSearchParams({ ...filters, page: '1' });
      setResults(await request(`/api/professionals?${params}`));
      setSelected(null); setSearched(true);
    });
  }

  async function openProfile(slug) {
    await run(async () => setSelected(await request(`/api/professionals/${encodeURIComponent(slug)}`)));
  }

  async function editProfile() {
    await run(async () => {
      const p = account?.profissional;
      if (p) {
        const published = await request(`/api/professionals/${encodeURIComponent(p.slug)}`);
        setProfile({ slug: p.slug, nome_publico: p.nome_publico, titulo: p.titulo,
          descricao: p.descricao || '', categoria: published.categorias?.[0]?.slug || 'promoter',
          cidade: published.areas?.[0]?.cidade || '', uf: published.areas?.[0]?.uf || '' });
      } else setProfile(emptyProfile);
      setSection('publish');
    });
  }

  async function saveProfile(event) {
    event.preventDefault();
    await run(async () => {
      await request('/api/me/professional', { method: 'PUT', authenticated: true, body: JSON.stringify(profile) });
      setAccount(await request('/api/me', { authenticated: true }));
      setNotice('Perfil publicado com sucesso.');
    });
  }

  async function sendImage(event, kind) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Escolha uma imagem JPEG, PNG ou WebP de até 5 MB.'); return;
    }
    await run(async () => {
      await upload(`/api/me/professional/${kind}`, file);
      setAccount(await request('/api/me', { authenticated: true }));
      setNotice('Imagem enviada com sucesso.');
    });
  }

  const userReady = Boolean(identity?.verified);
  return <>
    <header className="topbar"><div className="topbar-inner">
      <button className="brand" onClick={() => { setSection('search'); setSelected(null); }} aria-label="Entrelia, início"><span className="brand-mark">✦</span> entrelia<span className="brand-dot">.</span></button>
      <nav aria-label="Navegação principal">
        <button className={section === 'search' ? 'active' : ''} onClick={() => setSection('search')}>Explorar profissionais</button>
        {userReady && <button className={section === 'publish' ? 'active' : ''} onClick={editProfile}>Meu perfil profissional</button>}
      </nav>
      <div className="account-action">{identity ? <><span className="user-name">Olá, {identity.name}</span><button className="small-outline" onClick={() => run(() => signOut(auth))}>Sair</button></> : <button className="small-outline" onClick={() => document.getElementById('access')?.scrollIntoView({ behavior: 'smooth' })}>Entrar</button>}</div>
    </div></header>

    <main>
      <section className="hero"><div className="wrap hero-grid"><div>
        <span className="eyebrow"><span className="spark">✦</span> CONEXÕES QUE FAZEM ACONTECER</span>
        <h1>Seu evento começa com as <em>pessoas certas.</em></h1>
        <p>Encontre profissionais para tirar seu evento do papel. Conheça perfis, explore trabalhos e faça novas conexões.</p>
        <button className="primary" onClick={() => document.getElementById('explorar')?.scrollIntoView({ behavior: 'smooth' })}>Encontrar profissionais <span aria-hidden="true">↗</span></button>
      </div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="hero-card"><span className="card-star">✳</span><span className="card-rule"/><span className="card-line wide"/><span className="card-line"/><span className="card-pills"><i/><i/><i/></span></div><div className="floating-chip chip-one">✦ &nbsp; Novas conexões</div><div className="floating-chip chip-two">★ &nbsp; Seu próximo evento</div></div></div></section>

      <section id="explorar" className="wrap discovery"><div className="section-heading"><div><span className="eyebrow">DESCUBRA TALENTOS</span><h2>Profissionais para cada momento</h2><p>Começamos com promoters. Novas áreas de eventos chegam em breve.</p></div><span className="section-icon" aria-hidden="true">↗</span></div>
        <form className="filter-bar" onSubmit={search}>
          <label>Profissão<select value={filters.categoria} onChange={e => setFilters({ ...filters, categoria: e.target.value })}>{categories.length ? categories.map(c => <option key={c.slug} value={c.slug}>{c.nome}</option>) : <option value="promoter">Promoter</option>}</select></label>
          <label>Cidade<input value={filters.cidade} onChange={e => setFilters({ ...filters, cidade: e.target.value })} placeholder="Ex.: Fortaleza" /></label>
          <label>UF<input value={filters.uf} onChange={e => setFilters({ ...filters, uf: e.target.value.toUpperCase() })} maxLength="2" placeholder="CE" /></label>
          <button className="primary" disabled={busy}>Buscar <span aria-hidden="true">→</span></button>
        </form>
        {searched && <div className="results"><h3>{results.length ? `${results.length} profissional(is) encontrado(s)` : 'Nenhum perfil encontrado por enquanto'}</h3><div className="result-grid">{results.map(p => <button className="result-card" key={p.slug} onClick={() => openProfile(p.slug)}><div className="avatar">{p.foto_url ? <img src={p.foto_url} alt=""/> : p.nome_publico?.slice(0, 1)}</div><div><strong>{p.nome_publico}</strong><span>{p.titulo}</span></div><b aria-hidden="true">↗</b></button>)}</div></div>}
        {selected && <article className="detail"><button className="text-button" onClick={() => setSelected(null)}>← Voltar aos resultados</button><div className="detail-head"><div className="avatar large">{selected.foto_url ? <img src={selected.foto_url} alt=""/> : selected.nome_publico?.slice(0, 1)}</div><div><span className="eyebrow">PERFIL PROFISSIONAL</span><h2>{selected.nome_publico}</h2><p>{selected.titulo}</p></div></div><p>{selected.descricao}</p><p className="muted">{selected.areas?.map(a => `${a.cidade}, ${a.uf}`).join(' · ')}</p><div className="portfolio-grid">{selected.portfolio?.map((photo, i) => <img key={i} src={photo.secure_url} alt={photo.descricao || `Trabalho ${i + 1}`} />)}</div><p className="muted">Pedidos de contato serão liberados em uma próxima etapa.</p></article>}
      </section>

      <section className="access-section" id="access"><div className="wrap access-grid"><div className="access-copy"><span className="eyebrow">FAÇA PARTE</span><h2>Um lugar para encontrar. E para <em>ser encontrado.</em></h2><p>Com a mesma conta, você pode explorar profissionais e criar seu próprio perfil para mostrar seu trabalho.</p><div className="feature"><span>01</span><div><strong>Encontre talentos</strong><small>Conheça perfis e portfólios de profissionais.</small></div></div><div className="feature"><span>02</span><div><strong>Mostre seu trabalho</strong><small>Publique seu perfil e suas melhores imagens.</small></div></div></div>
        <div className="panel">
          {!configured ? <><h3>Configuração do Firebase pendente</h3><p>Adicione as variáveis do app Web em <code>web/.env</code> para habilitar o login.</p></> : !identity ? <><span className="eyebrow">SUA CONTA ENTRE LIA</span><h3>{mode === 'register' ? 'Crie sua conta' : mode === 'reset' ? 'Recuperar senha' : 'Boas-vindas de volta'}</h3><p>{mode === 'register' ? 'Comece sua jornada no Entrelia.' : 'Entre para criar ou gerenciar seu perfil.'}</p><form className="auth-form" onSubmit={submitAuth}><label>E-mail<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@exemplo.com" /></label>{mode !== 'reset' && <label>Senha<input type="password" minLength={6} required autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" /></label>}<button className="primary full" disabled={busy}>{mode === 'register' ? 'Criar conta' : mode === 'reset' ? 'Enviar instruções' : 'Entrar com e-mail'}</button></form>{mode !== 'reset' && <><div className="divider">ou continue com</div><button className="google" disabled={busy} onClick={() => run(() => signInWithPopup(auth, googleProvider))}><span className="google-g">G</span> Google</button></>}<div className="auth-links">{mode !== 'login' && <button onClick={() => { setMode('login'); setError(''); }}>Já tenho conta</button>}{mode === 'login' && <><button onClick={() => { setMode('register'); setError(''); }}>Criar conta</button><button onClick={() => { setMode('reset'); setError(''); }}>Esqueci minha senha</button></>}</div></> : !identity.verified ? <><span className="eyebrow">QUASE LÁ</span><h3>Confirme seu e-mail</h3><p>Enviamos um link para <strong>{identity.email}</strong>. Após abrir o link, volte e confira a confirmação.</p><button className="primary full" disabled={busy} onClick={checkEmail}>Já confirmei meu e-mail</button><button className="text-button" disabled={busy} onClick={() => run(async () => { await sendEmailVerification(auth.currentUser); setNotice('Enviamos um novo link de confirmação.'); })}>Reenviar link</button></> : <><span className="eyebrow">CONTA CONECTADA</span><h3>Olá, {identity.name}!</h3><p>Seu acesso está pronto. Publique seu perfil para aparecer nas buscas.</p><button className="primary full" onClick={editProfile}>{account?.profissional ? 'Editar meu perfil' : 'Criar perfil profissional'} <span aria-hidden="true">↗</span></button></>}
          {error && <p className="alert error" role="alert">{error}</p>}{notice && <p className="alert success" role="status">{notice}</p>}
        </div></div></section>

      {userReady && section === 'publish' && <section className="wrap publish" id="publicar"><div className="section-heading"><div><span className="eyebrow">SEU ESPAÇO</span><h2>Perfil profissional</h2><p>Conte o que você faz e onde atende.</p></div></div>{error && <p className="alert error" role="alert">{error}</p>}{notice && <p className="alert success" role="status">{notice}</p>}<div className="publish-grid"><form className="profile-form" onSubmit={saveProfile}><label>Nome público<input required minLength="2" maxLength="150" value={profile.nome_publico} onChange={e => setProfile({ ...profile, nome_publico: e.target.value })} placeholder="Como quer ser apresentado" /></label><label>Endereço do perfil<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength="100" value={profile.slug} onChange={e => setProfile({ ...profile, slug: e.target.value.toLowerCase() })} placeholder="seu-nome" /></label><label>Título<input required minLength="2" maxLength="160" value={profile.titulo} onChange={e => setProfile({ ...profile, titulo: e.target.value })} placeholder="Promoter para eventos e ativações" /></label><label>Sobre você<textarea maxLength="5000" rows="5" value={profile.descricao} onChange={e => setProfile({ ...profile, descricao: e.target.value })} placeholder="Fale sobre sua experiência e trabalho" /></label><div className="form-row"><label>Profissão<select value={profile.categoria} onChange={e => setProfile({ ...profile, categoria: e.target.value })}>{categories.length ? categories.map(c => <option key={c.slug} value={c.slug}>{c.nome}</option>) : <option value="promoter">Promoter</option>}</select></label><label>Cidade<input required maxLength="120" value={profile.cidade} onChange={e => setProfile({ ...profile, cidade: e.target.value })} placeholder="Fortaleza" /></label><label>UF<input required pattern="[A-Z]{2}" maxLength="2" value={profile.uf} onChange={e => setProfile({ ...profile, uf: e.target.value.toUpperCase() })} placeholder="CE" /></label></div><button className="primary" disabled={busy}>Salvar e publicar</button></form><aside className="media-panel"><h3>Seu portfólio</h3><p>Adicione uma foto de perfil e até 12 imagens do seu trabalho. JPEG, PNG ou WebP, até 5 MB.</p>{!account?.profissional ? <p className="muted">Salve o perfil antes de enviar imagens.</p> : <><label className="upload-label">Enviar foto de perfil<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => sendImage(e, 'avatar')} /></label><label className="upload-label">Adicionar ao portfólio<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || (account.portfolio?.length ?? 0) >= 12} onChange={e => sendImage(e, 'portfolio')} /></label><div className="portfolio-grid">{account.profissional.foto_url && <img src={account.profissional.foto_url} alt="Sua foto de perfil" />}{account.portfolio?.map(photo => <img key={photo.id} src={photo.secure_url} alt={photo.descricao || 'Imagem do portfólio'} />)}</div></>}</aside></div></section>}
    </main><footer><div className="wrap footer-inner"><strong>✦ entrelia.</strong><span>Conexões para eventos que acontecem.</span></div></footer>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
