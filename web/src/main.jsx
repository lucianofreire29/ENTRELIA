import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createUserWithEmailAndPassword, onAuthStateChanged, reload, sendEmailVerification,
  sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut,
} from 'firebase/auth';
import { auth, configured, googleProvider } from './firebase';
import { request, upload } from './api';
import { sampleProfessionals, initialEvent, eventTypes, needOptions, brazilStates } from './sample';
import './style.css';

const blankProfile = { slug: '', nome_publico: '', titulo: '', descricao: '', categoria: 'promoter', cidade: '', uf: '' };
const firebaseMessages = {
  'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
  'auth/invalid-email': 'Digite um e-mail válido.',
  'auth/invalid-credential': 'E-mail ou senha inválidos.',
  'auth/weak-password': 'Use uma senha de pelo menos 6 caracteres.',
  'auth/popup-closed-by-user': 'A janela de login foi fechada.',
  'auth/popup-blocked': 'Permita pop-ups para entrar com Google.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco.',
  'auth/unauthorized-domain': 'Este domínio precisa ser autorizado no Firebase Authentication.',
};
const errorMessage = (error) => firebaseMessages[error?.code] || error?.message || 'Tente novamente.';
const money = (value) => value ? (value.toLowerCase().startsWith('r$') ? value : 'R$ ' + value) : 'A combinar';
const dateLabel = (value) => value ? new Date(value + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Data a definir';

function Logo({ onClick }) {
  return <button className="logo" onClick={onClick} aria-label="Entrelia, início"><span className="logo-symbol" aria-hidden="true"><i /></span><span>entrelia</span></button>;
}
function Avatar({ person, size = 'normal' }) {
  return <span className={'person-avatar ' + size + ' ' + (person?.cor || 'violet')}>
    {person?.foto_url ? <img src={person.foto_url} alt="" /> : <span>{person?.nome_publico?.split(' ').map(s => s[0]).slice(0, 2).join('') || 'E'}</span>}
  </span>;
}
function Notice({ error, notice }) {
  return <>{error && <div className="alert error" role="alert">{error}</div>}{notice && <div className="alert success" role="status">{notice}</div>}</>;
}
function App() {
  const [page, setPage] = useState('home');
  const [identity, setIdentity] = useState(undefined);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [categories, setCategories] = useState([]);
  const [account, setAccount] = useState(null);
  const [profileForm, setProfileForm] = useState(blankProfile);
  const [filters, setFilters] = useState({ categoria: 'promoter', cidade: '', uf: '' });
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState(null);
  const [event, setEvent] = useState(initialEvent);
  const [searchTypes, setSearchTypes] = useState(['Corporativo']);
  const [searchRating, setSearchRating] = useState(true);
  const [requestTab, setRequestTab] = useState('Todas');
  const [profileTab, setProfileTab] = useState('Sobre');

  useEffect(() => {
    if (!auth) { setIdentity(null); return; }
    return onAuthStateChanged(auth, user => setIdentity(user ? {
      uid: user.uid, email: user.email, verified: user.emailVerified,
      name: user.displayName || user.email?.split('@')[0],
    } : null));
  }, []);
  useEffect(() => { request('/api/categories').then(setCategories).catch(() => {}); }, []);
  useEffect(() => {
    if (!identity?.verified) { setAccount(null); return; }
    let active = true;
    request('/api/me', { authenticated: true }).then(data => { if (active) setAccount(data); })
      .catch(err => { if (active) setError(errorMessage(err)); });
    return () => { active = false; };
  }, [identity?.uid, identity?.verified]);

  function go(next) { setPage(next); setError(''); setNotice(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function run(action) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function doSearch(e) {
    e?.preventDefault();
    go('search');
    await run(async () => {
      const params = new URLSearchParams({ ...filters, page: '1' });
      setResults(await request('/api/professionals?' + params));
      setSearched(true);
    });
  }
  async function openProfile(person) {
    setSelected(person);
    go('profile');
    if (!person.demo) await run(async () => setSelected(await request('/api/professionals/' + encodeURIComponent(person.slug))));
  }
  async function submitAuth(e) {
    e.preventDefault();
    if (!configured) { setError('O Firebase ainda não está configurado.'); return; }
    await run(async () => {
      if (authMode === 'reset') {
        await sendPasswordResetEmail(auth, email);
        setNotice('Se houver uma conta com este e-mail, você receberá instruções para redefinir a senha.');
      } else if (authMode === 'register') {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(user);
        setIdentity({ uid: user.uid, email: user.email, verified: false, name: fullName || user.email.split('@')[0] });
        setNotice('Enviamos um link de confirmação para o seu e-mail.');
      } else {
        const { user } = await signInWithEmailAndPassword(auth, email, password);
        setIdentity({ uid: user.uid, email: user.email, verified: user.emailVerified, name: user.displayName || user.email.split('@')[0] });
        if (page === 'request-auth') go('request-review'); else go('home');
      }
    });
  }
  async function checkEmail() {
    await run(async () => {
      await reload(auth.currentUser);
      const user = auth.currentUser;
      setIdentity({ uid: user.uid, email: user.email, verified: user.emailVerified, name: user.displayName || user.email.split('@')[0] });
      if (!user.emailVerified) setNotice('Ainda não encontramos a confirmação. Abra o link recebido e tente novamente.');
      else go(page === 'request-auth' ? 'request-review' : 'home');
    });
  }
  async function editProfile() {
    if (!identity) { setAuthMode('login'); go('auth'); return; }
    if (!identity.verified) { go('auth'); return; }
    await run(async () => {
      const p = account?.profissional;
      if (p) {
        const detail = await request('/api/professionals/' + encodeURIComponent(p.slug));
        setProfileForm({ slug: p.slug, nome_publico: p.nome_publico, titulo: p.titulo,
          descricao: p.descricao || '', categoria: detail.categorias?.[0]?.slug || 'promoter',
          cidade: detail.areas?.[0]?.cidade || '', uf: detail.areas?.[0]?.uf || '' });
      } else setProfileForm(blankProfile);
      go('publish');
    });
  }
  async function saveProfile(e) {
    e.preventDefault();
    await run(async () => {
      await request('/api/me/professional', { method: 'PUT', authenticated: true, body: JSON.stringify(profileForm) });
      setAccount(await request('/api/me', { authenticated: true }));
      setNotice('Perfil publicado com sucesso.');
    });
  }
  async function sendImage(e, kind) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Escolha uma imagem JPEG, PNG ou WebP de até 5 MB.'); return;
    }
    await run(async () => {
      await upload('/api/me/professional/' + kind, file);
      setAccount(await request('/api/me', { authenticated: true }));
      setNotice('Imagem enviada com sucesso.');
    });
  }
  const person = selected || sampleProfessionals[0];
  const city = filters.cidade || 'São Paulo';
  const visibleResults = searched ? results : sampleProfessionals;
  const isPreview = !searched;
  function eventSummary() {
    return <>
      <InfoRow label="Evento">{event.nome || 'Seu evento'}</InfoRow>
      <InfoRow label="Quando">{dateLabel(event.data)} · {event.inicio || 'Horário a definir'}{event.termino ? ' às ' + event.termino : ''}</InfoRow>
      <InfoRow label="Onde">{[event.espaco, event.cidade, event.uf].filter(Boolean).join(' · ') || 'Local a definir'}</InfoRow>
      <InfoRow label="Público e equipe">{event.publico || 'Público a definir'} · {event.quantidade || '1'} promoter</InfoRow>
      <InfoRow label="Orçamento estimado">{money(event.orcamento)}</InfoRow>
    </>;
  }
  function professionalSummary() {
    return <div className="person-summary"><Avatar person={person} /><div><strong>{person.nome_publico}</strong><span>Promoter · {person.cidade || person.areas?.[0]?.cidade || 'Eventos'}</span>{person.nota && <small>★ {person.nota} avaliações</small>}</div></div>;
  }
  function filterFields() {
    return <form className="search-form" onSubmit={doSearch}>
      <label>Profissão<select value={filters.categoria} onChange={e => setFilters({ ...filters, categoria: e.target.value })}>
        {(categories.length ? categories : [{ slug: 'promoter', nome: 'Promoter' }]).map(c => <option key={c.slug} value={c.slug}>{c.nome}</option>)}
      </select></label>
      <label>Cidade<input value={filters.cidade} onChange={e => setFilters({ ...filters, cidade: e.target.value })} placeholder="São Paulo" /></label>
      <label>UF<select value={filters.uf} onChange={e => setFilters({ ...filters, uf: e.target.value })}><option value="">Todas</option>{brazilStates.map(uf => <option key={uf}>{uf}</option>)}</select></label>
      <button className="button" disabled={busy}>Buscar <span aria-hidden="true">⌕</span></button>
    </form>;
  }

  return <div className="app-shell">
    <header className="site-header"><div className="site-header-inner">
      <Logo onClick={() => go('home')} />
      <nav aria-label="Navegação principal">
        <button className={['search','profile'].includes(page) ? 'active' : ''} onClick={() => go('search')}>Explorar profissionais</button>
        <button className={page === 'publish' ? 'active' : ''} onClick={editProfile}>Sou profissional</button>
        {identity?.verified && <button className={['requests','conversation','request-sent'].includes(page) ? 'active' : ''} onClick={() => go('requests')}>Minhas solicitações</button>}
      </nav>
      {identity ? <div className="account-menu"><span className="account-initial">{identity.name?.[0]?.toUpperCase()}</span><span>{identity.name}</span><button onClick={() => run(async () => { await signOut(auth); go('home'); })}>Sair</button></div>
        : <button className="header-login" onClick={() => { setAuthMode('login'); go('auth'); }}>Entrar</button>}
    </div></header>

    <main>
      {page === 'home' && <>
        <section className="home-hero"><div className="container hero-layout">
          <div className="hero-copy"><div className="breadcrumb">Início&nbsp; / &nbsp;Explorar profissionais</div>
            <span className="kicker">CONEXÕES QUE FAZEM ACONTECER</span>
            <h1>Seu evento começa<br />com as <em>pessoas<br />certas.</em></h1>
            <p>Encontre profissionais para tirar seu evento do papel. Conheça perfis, explore trabalhos e faça novas conexões.</p>
            <button className="button big" onClick={() => go('search')}>Encontrar profissionais</button>
          </div>
          <div className="hero-art" aria-hidden="true"><div className="art-orbit" /><div className="art-card"><span className="art-star">✳</span><span className="art-rule" /><span className="art-line long" /><span className="art-line" /><span className="art-pills"><i /><i /><i /></span></div><span className="art-chip top">✦ &nbsp; Novas conexões</span><span className="art-chip bottom">✦ &nbsp; Seu próximo evento</span></div>
        </div></section>
        <section className="container home-discover"><span className="kicker small">DESCUBRA TALENTOS</span><h2>Profissionais para cada momento</h2>{filterFields()}</section>
      </>}

      {page === 'search' && <>
        <section className="search-intro"><div className="container"><div className="breadcrumb">Início&nbsp; / &nbsp;Explorar profissionais</div>
          <h1>Encontre o promoter do seu evento</h1><p>Compare experiências, conheça os perfis e converse com quem combina com a sua ideia.</p>
          {filterFields()}<div className="category-pills"><span className="pill selected">Promoters</span><span>Recepcionistas · Em breve</span><span>Garçons · Em breve</span></div>
        </div></section>
        <div className="container results-layout"><aside className="filters-panel"><div className="filters-head"><strong>Filtros</strong><button onClick={() => { setSearchTypes([]); setSearchRating(false); }}>Limpar</button></div>
          <fieldset><legend>Tipo de evento</legend>{['Corporativo','Feiras e congressos','Festas e celebrações','Ações promocionais'].map(type => <label className="check-row" key={type}><input type="checkbox" checked={searchTypes.includes(type)} onChange={() => setSearchTypes(searchTypes.includes(type) ? searchTypes.filter(x => x !== type) : [...searchTypes,type])} />{type}</label>)}</fieldset>
          <fieldset><legend>Data do evento</legend><input type="date" value={event.data} onChange={e => setEvent({ ...event, data: e.target.value })} /><small>A disponibilidade será confirmada pelo profissional.</small></fieldset>
          <fieldset><legend>Especialidades</legend>{needOptions.map(type => <label className="check-row" key={type}><input type="checkbox" checked={event.necessidades.includes(type)} onChange={() => setEvent({ ...event, necessidades: event.necessidades.includes(type) ? event.necessidades.filter(x => x !== type) : [...event.necessidades,type] })} />{type}</label>)}</fieldset>
          <fieldset><legend>Avaliações</legend><label className="check-row"><input type="checkbox" checked={searchRating} onChange={e => setSearchRating(e.target.checked)} />4 estrelas ou mais</label></fieldset>
          <button className="button full" onClick={() => setNotice('Os filtros de evento são uma prévia; a busca real usa profissão, cidade e UF.')}>Aplicar filtros</button>
        </aside><section className="results-content"><div className="results-top"><div><h2>{searched ? visibleResults.length + ' profissionais encontrados' : '4 promoters em ' + city}</h2><p>Perfis para eventos corporativos</p></div><span>Ordenar por: <strong>Relevância ⌄</strong></span></div>
          {isPreview && <div className="preview-note">Perfis de exemplo do design. Faça uma busca para ver profissionais publicados de verdade.</div>}
          <Notice error={error} notice={notice} />
          <div className="profile-cards">{visibleResults.map(item => <article className="profile-card" key={item.slug}>
            <div className={'profile-card-photo ' + (item.cor || 'violet')}>{item.foto_url ? <img src={item.foto_url} alt="" /> : <span>{item.nome_publico?.split(' ').map(x => x[0]).slice(0,2).join('')}</span>}<span className="verified">Perfil profissional</span></div>
            <div className="card-title"><h3>{item.nome_publico}</h3>{item.nota && <span>★ {item.nota}</span>}</div>
            <small>{item.cidade || filters.cidade || 'Eventos'}{item.uf ? ', ' + item.uf : ''} · {item.experiencia || 'Perfil publicado'}</small><strong className="card-specialty">{item.titulo}</strong><p>{item.resumo || item.descricao || 'Conheça o trabalho deste profissional.'}</p>
            <div className="card-bottom"><div><small>A partir de</small><strong>{item.preco ? item.preco + ' / evento' : 'Sob consulta'}</strong></div><button className="outline-button" onClick={() => openProfile(item)}>Ver perfil &nbsp;↗</button></div>
          </article>)}</div>
          {searched && !visibleResults.length && <div className="empty-state">Nenhum perfil encontrado. Experimente outra cidade ou UF.</div>}
          <p className="fine-print">Valores de referência. O orçamento final depende das necessidades e da duração do evento.</p>
        </section></div>
      </>}

      {page === 'profile' && <div className="container profile-page">
        <div className="breadcrumb"><button onClick={() => go('search')}>Explorar profissionais</button> / &nbsp;{person.nome_publico}</div>
        {person.demo && <div className="preview-note">Este perfil é uma prévia visual. Para ver perfis reais, use a busca.</div>}
        <div className="profile-banner"><Avatar person={person} size="huge" /><div className="profile-ident"><div className="tags"><span>Perfil profissional</span>{person.experiencia && <span>{person.experiencia}</span>}</div><h1>{person.nome_publico}</h1><p>{person.titulo || 'Profissional de eventos'}</p><small>{person.cidade || person.areas?.[0]?.cidade || 'Eventos'}{person.uf ? ', ' + person.uf : ''} · Atende a região</small>{person.nota && <strong>★ {person.nota} avaliações</strong>}</div>{person.demo && <div className="profile-stat"><strong>80+</strong><span>eventos realizados</span><b>Português e inglês</b><span>Atendimento bilíngue</span></div>}</div>
        <div className="profile-layout"><div className="profile-main"><div className="tabs">{['Sobre','Portfólio','Avaliações'].map(tab => <button className={profileTab === tab ? 'active' : ''} key={tab} onClick={() => setProfileTab(tab)}>{tab}</button>)}</div>
          {profileTab === 'Sobre' && <><section className="profile-section"><h2>{person.demo ? 'Prazer, sou a Camila!' : 'Sobre ' + person.nome_publico}</h2><p>{person.descricao || 'Conheça a experiência e o trabalho deste profissional de eventos.'}</p>{person.demo && <><p>Minha experiência inclui abordagem de público, apresentação de produtos e apoio a ativações. Gosto de entender o objetivo de cada projeto para representar sua marca com cuidado e naturalidade.</p><div className="tags">{needOptions.map(x => <span key={x}>{x}</span>)}</div></>}</section>
            {person.demo && <section className="profile-section"><h2>Experiência que faz a diferença</h2><strong>Promoter independente · 2020 — atual</strong><p>Mais de 80 eventos de marcas de beleza, tecnologia e bem-estar. Apoio à experiência do público e à organização de ativações.</p></section>}</>}
          {(profileTab === 'Sobre' || profileTab === 'Portfólio') && <section className="profile-section"><h2>Um pouco do meu trabalho</h2><div className="portfolio-list">{person.portfolio?.length ? person.portfolio.map((photo,i) => <figure key={photo.secure_url}><img src={photo.secure_url} alt={photo.descricao || 'Trabalho ' + (i+1)} /><figcaption>{photo.descricao || 'Evento realizado'}</figcaption></figure>) : <p className="empty-state">As fotos do portfólio aparecerão aqui quando forem publicadas.</p>}</div></section>}
          {(profileTab === 'Sobre' || profileTab === 'Avaliações') && <section className="profile-section"><h2>Quem já fez acontecer comigo</h2><p className="muted">Avaliações verificadas ficarão disponíveis quando esta etapa for implementada.</p></section>}
        </div><aside className="quote-panel"><small>{person.preco ? 'Valor de exemplo' : 'Orçamento'}</small><h2>{person.preco ? 'A partir de ' + person.preco : 'A combinar'}</h2>{person.demo && <p>por evento · até 5 horas de atuação</p>}<hr /><h3>Vamos falar sobre o seu evento?</h3><p>Preencha os detalhes para visualizar como seria uma solicitação de orçamento.</p><button className="button full" onClick={() => go('request-event')}>Simular solicitação &nbsp;↗</button><small>Prévia visual: nada será enviado.</small><div className="soft-note">ⓘ &nbsp; A solicitação não garante disponibilidade nem confirma a contratação.</div></aside></div>
      </div>}

      {(page === 'auth' || page === 'request-auth') && <div className="container auth-page">
        {page === 'request-auth' && <><div className="breadcrumb">Solicitar orçamento &nbsp;/ &nbsp;Acesso ou cadastro</div><h1>Uma conta para continuar a conexão</h1><p>Cadastre-se como contratante para acompanhar o seu pedido.</p><Steps current={2} /></>}
        <div className={page === 'request-auth' ? 'auth-layout' : 'auth-centered'}><div className="form-card">
          {!identity ? <><div className="auth-switch"><button className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Criar conta</button><button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Entrar</button></div>
            <h2>{authMode === 'register' ? 'Seu próximo evento começa aqui' : authMode === 'reset' ? 'Recuperar senha' : 'Que bom ter você por aqui'}</h2><p>{authMode === 'register' ? 'Crie sua conta de contratante. É grátis.' : 'Acesse sua conta para continuar no Entrelia.'}</p>
            <form className="field-stack" onSubmit={submitAuth}>{authMode === 'register' && <label>Nome completo *<input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Seu nome" autoComplete="name" /></label>}
              <label>E-mail *<input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@exemplo.com" autoComplete="email" /></label>
              {authMode === 'register' && page === 'request-auth' && <label>Celular *<input required type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-9999" autoComplete="tel" /></label>}
              {authMode !== 'reset' && <label>Senha *<input required type="password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} /></label>}
              <button className="button full" disabled={busy || !configured}>{authMode === 'register' ? 'Criar conta' : authMode === 'reset' ? 'Enviar instruções' : 'Entrar com e-mail'}</button>
            </form>{authMode !== 'reset' && <><div className="or-line">ou continue com</div><button className="outline-button full" disabled={busy || !configured} onClick={() => run(async () => { await signInWithPopup(auth, googleProvider); go(page === 'request-auth' ? 'request-review' : 'home'); })}>Entrar com Google</button></>}
            <div className="auth-help">{authMode === 'login' && <button onClick={() => setAuthMode('reset')}>Esqueci minha senha</button>}{authMode === 'reset' && <button onClick={() => setAuthMode('login')}>Voltar para entrar</button>}</div>
          </> : !identity.verified ? <><h2>Confirme seu e-mail</h2><p>Enviamos um link para <strong>{identity.email}</strong>. Abra o link e volte aqui.</p><button className="button full" disabled={busy} onClick={checkEmail}>Já confirmei meu e-mail</button><button className="text-link" disabled={busy} onClick={() => run(async () => { await sendEmailVerification(auth.currentUser); setNotice('Enviamos um novo link.'); })}>Reenviar link</button></>
            : <><h2>Olá, {identity.name}!</h2><p>Sua conta está pronta para continuar.</p><button className="button full" onClick={() => go(page === 'request-auth' ? 'request-review' : 'home')}>Continuar</button><button className="text-link" onClick={editProfile}>Gerenciar meu perfil profissional</button></>}
          {!configured && <div className="alert error">Firebase não configurado neste ambiente.</div>}<Notice error={error} notice={notice} />
        </div>{page === 'request-auth' && <aside className="auth-aside"><div className="soft-note">♢ &nbsp; Seus dados do evento estão preservados durante esta navegação.</div><div className="form-card"><h3>Seu pedido está quase pronto</h3>{professionalSummary()}<hr />{eventSummary()}</div></aside>}</div>
        {page === 'request-auth' && <button className="text-link back-link" onClick={() => go('request-event')}>← Voltar aos detalhes do evento</button>}
      </div>}

      {page === 'publish' && <div className="container publish-page"><div className="breadcrumb">Minha conta &nbsp;/ &nbsp;Perfil profissional</div><h1>Seu perfil profissional</h1><p>Conte o que você faz e onde atende. Seus dados aparecem na busca quando publicados.</p><Notice error={error} notice={notice} />
        <div className="publish-layout"><form className="form-card field-stack" onSubmit={saveProfile}>
          <h2>Apresente seu trabalho</h2><label>Nome público *<input required minLength="2" maxLength="150" value={profileForm.nome_publico} onChange={e => setProfileForm({ ...profileForm, nome_publico: e.target.value })} /></label>
          <label>Endereço do perfil *<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength="100" value={profileForm.slug} onChange={e => setProfileForm({ ...profileForm, slug: e.target.value.toLowerCase() })} placeholder="seu-nome" /></label>
          <label>Título *<input required minLength="2" maxLength="160" value={profileForm.titulo} onChange={e => setProfileForm({ ...profileForm, titulo: e.target.value })} placeholder="Promoter para eventos" /></label>
          <label>Sobre você<textarea rows="6" maxLength="5000" value={profileForm.descricao} onChange={e => setProfileForm({ ...profileForm, descricao: e.target.value })} /></label>
          <div className="field-row"><label>Profissão<select value={profileForm.categoria} onChange={e => setProfileForm({ ...profileForm, categoria: e.target.value })}>{(categories.length ? categories : [{ slug:'promoter', nome:'Promoter' }]).map(c => <option key={c.slug} value={c.slug}>{c.nome}</option>)}</select></label><label>Cidade *<input required value={profileForm.cidade} onChange={e => setProfileForm({ ...profileForm, cidade: e.target.value })} /></label><label>UF *<input required pattern="[A-Z]{2}" maxLength="2" value={profileForm.uf} onChange={e => setProfileForm({ ...profileForm, uf: e.target.value.toUpperCase() })} /></label></div>
          <button className="button" disabled={busy}>Salvar e publicar</button>
        </form><aside className="form-card media-card"><h2>Seu portfólio</h2><p>Adicione uma foto de perfil e até 12 imagens do seu trabalho. JPEG, PNG ou WebP, até 5 MB.</p>
          {!account?.profissional ? <div className="soft-note">Salve seu perfil antes de enviar imagens.</div> : <><label className="upload-button">Enviar foto de perfil<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => sendImage(e,'avatar')} /></label><label className="upload-button">Adicionar ao portfólio<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || (account.portfolio?.length || 0) >= 12} onChange={e => sendImage(e,'portfolio')} /></label><div className="portfolio-list">{account.profissional.foto_url && <img src={account.profissional.foto_url} alt="Sua foto de perfil" />}{account.portfolio?.map(photo => <img key={photo.id} src={photo.secure_url} alt={photo.descricao || 'Imagem do portfólio'} />)}</div></>}
        </aside></div>
      </div>}

      {page === 'request-event' && <div className="container flow-page"><div className="breadcrumb">Explorar profissionais &nbsp;/ &nbsp;{person.nome_publico} &nbsp;/ &nbsp;Solicitar orçamento</div><h1>Conte como vai ser o seu evento</h1><p>Quanto mais detalhes, melhor a profissional poderá preparar uma proposta para você.</p><Steps current={1} />
        <div className="flow-layout"><form className="form-card event-form" onSubmit={e => { e.preventDefault(); go(identity?.verified ? 'request-review' : 'request-auth'); }}><h2><span className="step-number">01</span> O que você está planejando?</h2><small>Campos com * são obrigatórios.</small>
          <div className="field-stack"><label>Nome do evento *<input required value={event.nome} onChange={e => setEvent({ ...event, nome: e.target.value })} placeholder="Ex.: Lançamento Aurora" /></label><label>Tipo de evento *<select value={event.tipo} onChange={e => setEvent({ ...event, tipo: e.target.value })}>{eventTypes.map(x => <option key={x}>{x}</option>)}</select></label>
            <div className="field-row three"><label>Data *<input type="date" required value={event.data} onChange={e => setEvent({ ...event, data: e.target.value })} /></label><label>Início *<input type="time" required value={event.inicio} onChange={e => setEvent({ ...event, inicio: e.target.value })} /></label><label>Término *<input type="time" required value={event.termino} onChange={e => setEvent({ ...event, termino: e.target.value })} /></label></div><hr /><h3>Onde vai acontecer?</h3><div className="field-row"><label>Cidade *<input required value={event.cidade} onChange={e => setEvent({ ...event, cidade: e.target.value })} /></label><label>UF *<select required value={event.uf} onChange={e => setEvent({ ...event, uf: e.target.value })}><option value="">Selecione</option>{brazilStates.map(x => <option key={x}>{x}</option>)}</select></label></div><label>Nome do espaço *<input required value={event.espaco} onChange={e => setEvent({ ...event, espaco: e.target.value })} /></label><label>Endereço *<input required value={event.endereco} onChange={e => setEvent({ ...event, endereco: e.target.value })} /></label><hr /><h3>Qual apoio você precisa?</h3><div className="field-row"><label>Público estimado *<input required value={event.publico} onChange={e => setEvent({ ...event, publico: e.target.value })} placeholder="120 convidados" /></label><label>Quantidade de promoters *<input type="number" min="1" required value={event.quantidade} onChange={e => setEvent({ ...event, quantidade: e.target.value })} /></label></div><label>Necessidades do evento<div className="choice-row">{needOptions.map(x => <button type="button" key={x} className={'choice ' + (event.necessidades.includes(x) ? 'selected' : '')} onClick={() => setEvent({ ...event, necessidades: event.necessidades.includes(x) ? event.necessidades.filter(y => y !== x) : [...event.necessidades,x] })}>{event.necessidades.includes(x) ? '✓ ' : '+ '}{x}</button>)}</div></label><label>Mais detalhes *<textarea required rows="4" value={event.detalhes} onChange={e => setEvent({ ...event, detalhes: e.target.value })} placeholder="Conte o que a profissional precisa saber" /></label><label>Orçamento estimado (opcional)<input value={event.orcamento} onChange={e => setEvent({ ...event, orcamento: e.target.value })} placeholder="R$ 450 a R$ 600" /></label></div>
          <div className="form-actions"><button type="button" className="text-link" onClick={() => go('profile')}>← Voltar ao perfil</button><button className="button">Continuar para acesso &nbsp;→</button></div>
        </form><aside className="form-card flow-aside"><small>VOCÊ ESTÁ SOLICITANDO A</small>{professionalSummary()}<hr /><h3>Uma proposta feita para você</h3><p>{person.nome_publico} receberá os detalhes quando o envio estiver disponível.</p><div className="soft-note">♢ &nbsp; Ainda não será enviado. Você poderá conferir e editar tudo na próxima etapa.</div><small>Solicitar é grátis e não confirma a contratação.</small></aside></div>
      </div>}

      {page === 'request-review' && <div className="container flow-page"><div className="breadcrumb">Solicitar orçamento &nbsp;/ &nbsp;Revisão e envio</div><h1>Tudo certo para fazer essa conexão?</h1><p>Confira as informações. A profissional usará este resumo para avaliar a disponibilidade e preparar seu orçamento.</p><Steps current={3} />
        <div className="flow-layout"><div><div className="form-card review-card"><div className="review-heading"><h2>{event.nome || 'Seu evento'}</h2><button onClick={() => go('request-event')}>Editar evento</button></div><span className="pill selected">{event.tipo}</span><div className="summary-grid">{eventSummary()}</div><hr /><InfoRow label="Necessidades">{event.necessidades.join(', ') || 'A combinar'}</InfoRow><InfoRow label="Detalhes para a profissional">{event.detalhes || 'Nenhum detalhe informado'}</InfoRow></div><div className="form-card review-contact"><div className="review-heading"><h2>Seu contato</h2><button onClick={() => go('request-auth')}>Editar contato</button></div><p>{fullName || identity?.name || 'Seu nome'} · {identity?.email || email || 'E-mail a definir'}</p><p>{phone}</p></div><button className="text-link back-link" onClick={() => go('request-event')}>← Voltar aos detalhes</button></div>
          <aside className="form-card flow-aside"><small>QUEM VAI RECEBER</small>{professionalSummary()}<hr /><h3>O próximo passo é conversar</h3><p>Quando o envio estiver conectado, você poderá acompanhar a resposta e combinar os detalhes.</p><div className="soft-note">ⓘ &nbsp; Este fluxo é uma prévia visual. Nenhuma solicitação será enviada à profissional.</div><button className="button full" onClick={() => go('request-sent')}>Ver prévia da confirmação &nbsp;↗</button><small>Não há contratação automática.</small></aside></div>
      </div>}

      {page === 'request-sent' && <div className="container sent-page"><div className="success-icon">✓</div><h1>Prévia da confirmação</h1><p>Veja como a confirmação aparecerá quando o envio de solicitações estiver disponível.</p><span className="pill selected">Demonstração · nenhuma solicitação foi enviada</span><div className="sent-layout"><div className="form-card"><h2>O seu pedido</h2>{professionalSummary()}<hr />{eventSummary()}</div><div><div className="form-card"><h2>E agora, o que acontece?</h2><ol className="number-list"><li>A profissional analisa seu evento.</li><li>Vocês conversam pela Entrelia.</li><li>A decisão é de vocês.</li></ol></div><div className="soft-note">ⓘ &nbsp; O envio real e as mensagens dependem das próximas etapas da API.</div><button className="button full" onClick={() => go('requests')}>Ver prévia de minhas solicitações &nbsp;→</button><button className="text-link centered" onClick={() => go('search')}>Continuar explorando profissionais</button></div></div></div>}

      {page === 'requests' && <div className="container requests-page"><div className="breadcrumb">Minha conta &nbsp;/ &nbsp;Minhas solicitações</div><h1>Suas próximas conexões, em um só lugar</h1><p>Acompanhe os pedidos, veja as respostas e continue a conversa sobre os seus eventos.</p><div className="stats"><div><b>3</b><span>Solicitações no total</span></div><div><b>1</b><span>Com nova resposta</span></div><div><b>1</b><span>Aguardando resposta</span></div></div><div className="request-toolbar"><div>{['Todas','Respondidas','Aguardando','Encerradas'].map(x => <button key={x} className={'pill ' + (requestTab === x ? 'selected' : '')} onClick={() => setRequestTab(x)}>{x}</button>)}</div><button className="outline-button" onClick={() => go('search')}>Encontrar profissionais &nbsp;⌕</button></div><div className="preview-note">Exemplos do design. Solicitações reais ainda não estão conectadas à API.</div>
        <div className="request-list">{[
          { tab:'Respondidas', person:sampleProfessionals[0], title:'Lançamento Aurora', status:'Respondida', description:'Uma nova mensagem', button:'Abrir conversa' },
          { tab:'Aguardando', person:sampleProfessionals[1], title:'Encontro de parceiros Aurora', status:'Aguardando resposta', description:'Ainda sem retorno', button:'Ver solicitação' },
          { tab:'Encerradas', person:sampleProfessionals[2], title:'Ação de primavera', status:'Encerrada por você', description:'Evento encerrado pela organização', button:'Ver histórico' },
        ].filter(x => requestTab === 'Todas' || x.tab === requestTab).map(item => <article className="request-item" key={item.title}><Avatar person={item.person} size="large" /><div><span className="pill selected">{item.status}</span><h2>{item.title}</h2><p>{item.person.nome_publico} · Promoter · São Paulo/SP</p><small>{item.description}</small></div><button className="outline-button" onClick={() => { setSelected(item.person); go('conversation'); }}>{item.button} &nbsp;↗</button></article>)}</div><div className="soft-note">ⓘ &nbsp; Uma resposta não significa contratação. Use a conversa para alinhar disponibilidade, escopo e orçamento.</div></div>}

      {page === 'conversation' && <div className="container conversation-page"><div className="conversation-top"><button className="text-link" onClick={() => go('requests')}>← Minhas solicitações</button><span>Solicitação de exemplo · {event.nome || 'Lançamento Aurora'}</span></div><div className="conversation-layout"><section className="chat-card"><div className="chat-person">{professionalSummary()}<button className="text-link" onClick={() => go('profile')}>Ver perfil ↗</button></div><div className="messages"><div className="chat-date">17 de outubro de 2026</div><div className="chat-system">✧ &nbsp; Solicitação de exemplo · Esta conversa é apenas uma prévia visual.</div><div className="bubble mine">Oi, {person.nome_publico}! Estamos organizando um evento e gostaríamos de saber da sua disponibilidade.<small>Você · 14h32</small></div><div className="chat-date">18 de outubro de 2026</div><div className="bubble theirs">Obrigada pelo contato! Tenho disponibilidade nessa data. Podemos alinhar os detalhes da ativação?<small>{person.nome_publico} · 09h18</small></div><div className="bubble mine">Que bom! Enviaremos o briefing para combinarmos tudo.<small>Você · 09h20</small></div><div className="chat-date">Disponibilidade sinalizada. Orçamento ainda em alinhamento.</div></div><div className="chat-compose"><div><input disabled placeholder={'Escreva uma mensagem para ' + person.nome_publico + '...'} /><button className="button" disabled>Enviar ↗</button></div><small>Mensagens estarão disponíveis quando a API de solicitações e conversa for criada.</small></div></section><aside><div className="form-card"><h2>Resumo do pedido</h2><span className="pill selected">Prévia</span><h3>{event.nome || 'Lançamento Aurora'}</h3><p>{event.tipo}</p><hr />{eventSummary()}<button className="text-link" onClick={() => go('request-review')}>Ver solicitação completa →</button></div><div className="soft-note">ⓘ &nbsp; Ainda não é uma contratação. Disponibilidade, escopo, valor e condições precisam ser acordados.</div></aside></div></div>}
    </main>
    <footer className="site-footer"><div className="container footer-layout"><div><Logo onClick={() => go('home')} /><small>Conexões que fazem acontecer.</small></div><div><span>Termos e canais de suporte estarão disponíveis em breve.</span></div></div></footer>
  </div>;
}
function InfoRow({ label, children }) { return <div className="info-row"><small>{label}</small><span>{children}</span></div>; }
function Steps({ current }) { return <div className="steps">{['Detalhes do evento','Acesso ou cadastro','Revisão e envio'].map((x,i) => <span className={i+1 <= current ? 'active' : ''} key={x}><b>{i+1 < current ? '✓' : i+1}</b>{x}</span>)}</div>; }

createRoot(document.getElementById('root')).render(<App />);
