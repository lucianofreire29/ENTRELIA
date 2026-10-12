import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Banco em memoria, provedor ficticio, nenhuma cobranca ou integracao externa.
const db=new PGlite();
const report=['Modelo v0.3 | PGlite 0.5.8 | dados sinteticos | '+new Date().toISOString()];
let n=0, sequence=0;
const ok=(s)=>{const line=`OK ${++n}: ${s}`; report.push(line); console.log(line);};
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
const rejects=async(sql,args,pattern)=>assert.rejects(()=>db.query(sql,args),pattern);
try {
  for(const file of ['001_estrutura.sql','002_acesso_e_monetizacao.sql','003_catalogo_inicial.sql','004_aceite_de_contato.sql'])
    await db.exec(await readFile(new URL('../sql/'+file,import.meta.url),'utf8'));
  assert.equal((await one("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='eventos' AND table_type='BASE TABLE'")).n,22);
  assert.equal((await one("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='eventos' AND table_name IN ('eventos','contratacoes','propostas','necessidades_evento')")).n,0);
  assert.equal((await one('SELECT count(*)::int n FROM eventos.produtos WHERE ativo')).n,0);
  ok('22 tabelas; sem contratos, agenda ou propostas de servico; produtos comerciais inativos');

  const ids=[];
  for(let i=0;i<5;i++)ids.push((await one('INSERT INTO eventos.usuarios(nome,email) VALUES ($1,$2) RETURNING id',['Pessoa Teste '+i,`pessoa${i}@example.test`])).id);
  const [cliente,p1,p2,p3,intruso]=ids;
  const cat=(await one("SELECT id FROM eventos.categorias WHERE slug='promoter'")).id;
  for(const [i,id] of ids.slice(0,4).entries()){
    await db.query("INSERT INTO eventos.profissionais(usuario_id,slug,nome_publico,titulo,status) VALUES ($1,$2,'Profissional ficticio','Promoter de teste','publicado')",[id,`profissional-${i}`]);
    await db.query('INSERT INTO eventos.atuacoes_profissional(profissional_id,categoria_id) VALUES ($1,$2)',[id,cat]);
  }
  const unit=(await one("SELECT id FROM eventos.produtos WHERE codigo='contato-avulso-rascunho'")).id;
  const pass=(await one("SELECT id FROM eventos.produtos WHERE codigo='passe-mensal-rascunho'")).id;
  const boost=(await one("SELECT id FROM eventos.produtos WHERE codigo='destaque-mensal-rascunho'")).id;
  await rejects('INSERT INTO eventos.pedidos(usuario_id,produto_id,profissional_alvo,chave_idempotencia) VALUES ($1,$2,$3,$4)',[cliente,unit,p1,'inativo'],/indisponivel/);
  // Precos abaixo sao fixtures, sem efeito no catalogo que sera entregue.
  await db.exec("UPDATE eventos.produtos SET ativo=true,preco_centavos=6000");
  async function conversation(user,pro,accept=true) {
    const contact=await one('INSERT INTO eventos.pedidos_contato(usuario_id,profissional_id,categoria_id,mensagem_inicial) VALUES ($1,$2,$3,$4) RETURNING id',[user,pro,cat,'Gostaria de conversar sobre seus servicos.']);
    if(accept) await db.query("UPDATE eventos.pedidos_contato SET status='aceito',respondido_por=$2 WHERE id=$1",[contact.id,pro]);
    return (await one('INSERT INTO eventos.conversas(usuario_id,profissional_id,categoria_origem,pedido_contato_id) VALUES ($1,$2,$3,$4) RETURNING id',[user,pro,cat,contact.id])).id;
  }
  const c1=await conversation(cliente,p1);
  const c2=await conversation(cliente,p2);
  const c3=await conversation(cliente,p3);
  await rejects('INSERT INTO eventos.mensagens(conversa_id,remetente_id,texto) VALUES ($1,$2,$3)',[c1,cliente,'Sem acesso'],/nao autorizada/);
  ok('Uma conta busca e publica perfil; criar conversa ou ter perfil nao libera mensagens');

  async function order(user,product,target=null,category=null,period=null) {
    let sub=null;
    if(period) sub=(await one("INSERT INTO eventos.assinaturas(usuario_id,produto_id,provedor,assinatura_externa,status) VALUES ($1,$2,'fake',$3,'ativa') RETURNING id",[user,product,'sub-'+(++sequence)])).id;
    const productType=(await one('SELECT tipo FROM eventos.produtos WHERE id=$1',[product])).tipo;
    const contact=productType==='contato' ? await one('SELECT id FROM eventos.pedidos_contato WHERE usuario_id=$1 AND ($2::uuid IS NULL OR profissional_id=$2) ORDER BY criado_em DESC LIMIT 1',[user,target]) : null;
    return one('INSERT INTO eventos.pedidos(usuario_id,produto_id,profissional_alvo,categoria_alvo,chave_idempotencia,assinatura_id,periodo_inicio,periodo_fim,pedido_contato_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [user,product,target,category,'order-'+(++sequence),sub,period?.[0]??null,period?.[1]??null,contact?.id??null]);
  }
  async function payment(o,amount=6000,status='confirmado') {
    return one("INSERT INTO eventos.pagamentos(pedido_id,provedor,pagamento_externo,status,valor_centavos,confirmado_em) VALUES ($1,'fake',$2,$3,$4,now()) RETURNING *",[o.id,'payment-'+(++sequence),status,amount]);
  }
  async function grant(o,pg) {
    return one('INSERT INTO eventos.beneficios(pedido_id,pagamento_id) VALUES ($1,$2) RETURNING *',[o.id,pg.id]);
  }
  async function paid(o) {
    const pg=await payment(o);
    await db.query("UPDATE eventos.pedidos SET status='pago' WHERE id=$1",[o.id]);
    return {pg,b:await grant(o,pg)};
  }
  async function access(c,b) {return db.query('INSERT INTO eventos.acessos_conversa(conversa_id,beneficio_id) VALUES ($1,$2)',[c,b.id]);}
  const o1=await order(cliente,unit,p1);
  const pg1=await payment(o1,6000,'autorizado');
  await db.query("UPDATE eventos.pedidos SET status='pago' WHERE id=$1",[o1.id]);
  await assert.rejects(()=>grant(o1,pg1),/pagamento confirmado/);
  await db.query("UPDATE eventos.pagamentos SET status='confirmado',valor_centavos=100 WHERE id=$1",[pg1.id]);
  await assert.rejects(()=>grant(o1,pg1),/valor integral/);
  await db.query('UPDATE eventos.pagamentos SET valor_centavos=6000 WHERE id=$1',[pg1.id]);
  const b1=await grant(o1,pg1);
  await access(c1,b1);
  await assert.rejects(()=>access(c2,b1),/Acesso ao chat/);
  await db.query("INSERT INTO eventos.mensagens(conversa_id,remetente_id,texto) VALUES ($1,$2,'Ola'),($1,$3,'Podemos conversar')",[c1,cliente,p1]);
  await rejects("INSERT INTO eventos.mensagens(conversa_id,remetente_id,texto) VALUES ($1,$2,'Intrusao')",[c1,intruso],/nao autorizada/);
  ok('Avulso exige pagamento integral confirmado, libera somente o alvo e permite resposta gratuita do profissional');

  await db.query("INSERT INTO eventos.webhooks_pagamento(provedor,evento_externo,tipo,pagamento_id) VALUES ('fake','evt-1','pago',$1)",[pg1.id]);
  await rejects("INSERT INTO eventos.webhooks_pagamento(provedor,evento_externo,tipo) VALUES ('fake','evt-1','pago')",[],/unique constraint/i);
  await assert.rejects(()=>grant(o1,pg1),/unique constraint/i);
  await rejects('INSERT INTO eventos.pedidos(usuario_id,produto_id,profissional_alvo,chave_idempotencia,pedido_contato_id) VALUES ($1,$2,$3,$4,$5)',[cliente,unit,p1,o1.chave_idempotencia,o1.pedido_contato_id],/unique constraint/i);
  await rejects('UPDATE eventos.pedidos SET valor_centavos=1 WHERE id=$1',[o1.id],/imutavel/);
  await rejects('UPDATE eventos.conversas SET profissional_id=$2 WHERE id=$1',[c1,p3],/imutaveis/);
  ok('Duplicatas de webhook, beneficio e checkout sao barradas; preco e participantes ficam preservados');

  await db.query("UPDATE eventos.pagamentos SET status='reembolsado' WHERE id=$1",[pg1.id]);
  assert.equal((await one('SELECT eventos.chat_pode_enviar($1,$2) AS pode',[c1,cliente])).pode,false);
  await rejects("INSERT INTO eventos.mensagens(conversa_id,remetente_id,texto) VALUES ($1,$2,'Apos reembolso')",[c1,cliente],/nao autorizada/);
  ok('Reembolso interrompe novas mensagens mesmo quando o beneficio tinha prazo indeterminado');

  const now=Date.now();
  const period=[new Date(now-3600000).toISOString(),new Date(now+86400000).toISOString()];
  await db.query('UPDATE eventos.produtos SET limite_contatos=2 WHERE id=$1',[pass]);
  const op=await order(cliente,pass,null,null,period);
  assert.equal((await one('SELECT eventos.chat_pode_enviar($1,$2) AS pode',[c2,cliente])).pode,false);
  const {b:bp}=await paid(op);
  await access(c2,bp); await access(c3,bp);
  await assert.rejects(()=>access(c1,bp),/Limite de contatos/);
  const future=new Date(now+2*86400000).toISOString();
  assert.equal((await one('SELECT eventos.chat_pode_enviar($1,$2,$3::timestamptz) AS pode',[c2,cliente,future])).pode,true);
  ok('Assinatura so libera com periodo pago; limite configuravel funciona; politica proposta preserva chats ja abertos');

  const past=[new Date(now-3*86400000).toISOString(),new Date(now-2*86400000).toISOString()];
  const expiredOrder=await order(cliente,pass,null,null,past);
  const {b:expired}=await paid(expiredOrder);
  await assert.rejects(()=>access(c1,expired),/Acesso ao chat/);
  await db.query('INSERT INTO eventos.bloqueios(autor_id,bloqueado_id) VALUES ($1,$2)',[p2,cliente]);
  assert.equal((await one('SELECT eventos.chat_pode_enviar($1,$2) AS pode',[c2,cliente])).pode,false);
  ok('Passe expirado nao abre novos contatos; bloqueio entre participantes interrompe mensagens');

  const ob=await order(p1,boost,p1,cat,period);
  const {b:bb,pg:pgb}=await paid(ob);
  await db.query('INSERT INTO eventos.impulsionamentos(beneficio_id,profissional_id,categoria_id,cidade,uf) VALUES ($1,$2,$3,$4,$5)',[bb.id,p1,cat,'Fortaleza','CE']);
  assert.equal((await one('SELECT count(*)::int n FROM eventos.impulsionamentos_vigentes WHERE beneficio_id=$1',[bb.id])).n,1);
  const oldBoost=await order(p3,boost,p3,cat,past);
  const {b:oldBenefit}=await paid(oldBoost);
  await db.query('INSERT INTO eventos.impulsionamentos(beneficio_id,profissional_id,categoria_id) VALUES ($1,$2,$3)',[oldBenefit.id,p3,cat]);
  assert.equal((await one('SELECT count(*)::int n FROM eventos.impulsionamentos_vigentes WHERE beneficio_id=$1',[oldBenefit.id])).n,0);
  await db.query("UPDATE eventos.pagamentos SET status='contestado' WHERE id=$1",[pgb.id]);
  assert.equal((await one('SELECT count(*)::int n FROM eventos.impulsionamentos_vigentes WHERE beneficio_id=$1',[bb.id])).n,0);
  ok('Destaque vale somente no periodo pago; expiracao e contestacao removem sua elegibilidade');

  const avulsoBoost=(await one("INSERT INTO eventos.produtos(codigo,nome,tipo,cobranca,escopo,preco_centavos,duracao_dias,ativo,manter_conversas) VALUES ('teste-avulso','Fixture','impulsionamento','avulsa','categoria',6000,7,true,false) RETURNING id")).id;
  const ob2=await order(p3,avulsoBoost,p3,cat);
  const {b:bb2}=await paid(ob2);
  assert.equal((new Date(bb2.fim)-new Date(bb2.inicio))/86400000,7);
  await assert.rejects(()=>order(cliente,avulsoBoost,p3,cat),/check constraint/i);
  await db.query('INSERT INTO eventos.avaliacoes(conversa_id,autor_id,nota) VALUES ($1,$2,5)',[c1,cliente]);
  await rejects('INSERT INTO eventos.avaliacoes(conversa_id,autor_id,nota) VALUES ($1,$2,5)',[c3,cliente],/contato com resposta/);
  ok('Impulsionamento avulso possui duracao; um usuario nao compra destaque para perfil alheio; avaliacao exige resposta');

  const waiting=await conversation(intruso,p2,false);
  const waitingRequest=(await one('SELECT pedido_contato_id FROM eventos.conversas WHERE id=$1',[waiting])).pedido_contato_id;
  const waitingOrder=await order(intruso,unit,p2);
  const preauth=await payment(waitingOrder,6000,'autorizado');
  await rejects("UPDATE eventos.pagamentos SET status='confirmado',confirmado_em=now() WHERE id=$1",[preauth.id],/aceite previo/);
  await rejects("UPDATE eventos.pedidos SET status='pago' WHERE id=$1",[waitingOrder.id],/exige aceite/);
  await rejects("UPDATE eventos.pedidos_contato SET status='aceito',respondido_por=$2 WHERE id=$1",[waitingRequest,cliente],/Somente o profissional/);
  await db.query("UPDATE eventos.pedidos_contato SET status='recusado',respondido_por=$2 WHERE id=$1",[waitingRequest,p2]);
  await rejects("UPDATE eventos.pagamentos SET status='confirmado',confirmado_em=now() WHERE id=$1",[preauth.id],/aceite previo/);
  ok('Pedido pendente ou recusado nao permite confirmar cobranca; terceiro nao pode aceitar');

  const accepted=await conversation(intruso,p3,false);
  const acceptedRequest=(await one('SELECT pedido_contato_id FROM eventos.conversas WHERE id=$1',[accepted])).pedido_contato_id;
  await db.query("UPDATE eventos.pedidos_contato SET status='aceito',respondido_por=$2 WHERE id=$1",[acceptedRequest,p3]);
  const acceptedOrder=await order(intruso,unit,p3);
  await payment(acceptedOrder,6000,'recusado');
  assert.equal((await one('SELECT eventos.chat_pode_enviar($1,$2) AS pode',[accepted,intruso])).pode,false);
  const {b:acceptedBenefit}=await paid(acceptedOrder);
  await access(accepted,acceptedBenefit);
  assert.equal((await one('SELECT eventos.chat_pode_enviar($1,$2) AS pode',[accepted,intruso])).pode,true);
  await rejects("UPDATE eventos.pedidos_contato SET status='recusado' WHERE id=$1",[acceptedRequest],/nao pode mudar/);
  ok('Aceite nao basta: falha no pagamento mantem chat fechado; confirmacao posterior libera');

  await db.query("INSERT INTO eventos.profissionais(usuario_id,slug,nome_publico,titulo,status) VALUES ($1,'novo-profissional','Novo perfil','Promoter','publicado')",[intruso]);
  await db.query('INSERT INTO eventos.atuacoes_profissional(profissional_id,categoria_id) VALUES ($1,$2)',[intruso,cat]);
  const existingPassOrder=await order(cliente,pass,null,null,period);
  const {b:existingPass}=await paid(existingPassOrder);
  const nextChat=await conversation(cliente,intruso,false);
  await assert.rejects(()=>access(nextChat,existingPass),/exige aceite deste profissional/);
  const countBefore=(await one('SELECT count(*)::int n FROM eventos.pagamentos')).n;
  const nextRequest=(await one('SELECT pedido_contato_id FROM eventos.conversas WHERE id=$1',[nextChat])).pedido_contato_id;
  await db.query("UPDATE eventos.pedidos_contato SET status='aceito',respondido_por=$2 WHERE id=$1",[nextRequest,intruso]);
  await access(nextChat,existingPass);
  assert.equal((await one('SELECT count(*)::int n FROM eventos.pagamentos')).n,countBefore);
  ok('Assinante com passe valido aguarda aceite de cada profissional e abre chat sem nova cobranca');

  report.push(`RESULTADO: ${n}/${n} cenarios aprovados.`);
  report.push('Limites: PostgreSQL embarcado; sem gateway real, API, autenticacao, frontend, teste de concorrencia distribuida ou cobranca.');
  report.push('A simulacao futura de chat usa parametro interno de leitura; insercao de mensagens usa obrigatoriamente now().');
  console.log(report.slice(-3).join('\n'));
  await writeFile(new URL('../VALIDACAO.txt',import.meta.url),report.join('\n')+'\n');
} finally {await db.close();}
