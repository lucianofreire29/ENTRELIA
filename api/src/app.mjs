import express from 'express';
import multer from 'multer';
import { imageType, InputError, profileInput, searchInput } from './validation.mjs';

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

export function createApp({ db, verifyToken, media, allowedOrigins = [] }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '32kb' }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  }).single('imagem');
  const receiveImage = (req, res, next) => upload(req, res, (err) => err ? next(err) : next());

  const requireUser = async (req, _res, next) => {
    try {
    const match = /^Bearer ([^\s]+)$/i.exec(req.get('authorization') ?? '');
    if (!match) throw new InputError('Faça login para continuar.', 401);
    let identity;
    try { identity = await verifyToken(match[1]); }
    catch { throw new InputError('Sessão inválida ou expirada.', 401); }
    const email = identity.email?.trim().toLowerCase();
    if (!identity.uid || !email || !identity.email_verified) throw new InputError('Confirme seu e-mail no Firebase antes de continuar.', 403);
    const displayName = (identity.name || email.split('@')[0]).trim().slice(0, 150);
    const name = displayName.length >= 2 ? displayName : 'Usuário';
    const result = await db.query(`
      INSERT INTO eventos.usuarios (nome,email,auth_provedor,auth_subject)
      VALUES ($1,$2,'firebase',$3)
      ON CONFLICT (auth_provedor,auth_subject) DO UPDATE SET email=EXCLUDED.email
      RETURNING id,nome,email,status
    `, [name, email, identity.uid]);
    if (result.rows[0].status !== 'ativo') throw new InputError('Conta indisponível.', 403);
    req.user = result.rows[0];
    next();
    } catch (error) { next(error); }
  };

  async function withTransaction(fn) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const value = await fn(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  function verifiedUpload(result) {
    if (!result?.public_id || !result.secure_url?.startsWith(`https://res.cloudinary.com/${media.cloudName}/image/upload/`)) {
      throw new Error('Resposta inesperada do armazenamento de imagens');
    }
    return { public_id: result.public_id, secure_url: result.secure_url };
  }

  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  app.get('/api/categories', asyncRoute(async (_req, res) => {
    const { rows } = await db.query('SELECT slug,nome FROM eventos.categorias WHERE ativa ORDER BY nome');
    res.json(rows);
  }));

  app.get('/api/professionals', asyncRoute(async (req, res) => {
    const q = searchInput(req.query);
    const { rows } = await db.query(`
      SELECT p.slug,p.nome_publico,p.titulo,p.descricao,p.foto_url
      FROM eventos.profissionais p JOIN eventos.usuarios u ON u.id=p.usuario_id
      WHERE p.status='publicado' AND u.status='ativo'
        AND EXISTS (
          SELECT 1 FROM eventos.atuacoes_profissional a JOIN eventos.categorias c ON c.id=a.categoria_id
          WHERE a.profissional_id=p.usuario_id AND a.ativo AND c.ativa AND ($1='' OR c.slug=$1)
        )
        AND EXISTS (
          SELECT 1 FROM eventos.areas_atendimento area WHERE area.profissional_id=p.usuario_id
            AND ($2='' OR area.uf=$2) AND ($3='' OR lower(area.cidade)=lower($3))
        )
      ORDER BY p.criado_em DESC,p.usuario_id LIMIT 20 OFFSET $4
    `, [q.categoria, q.uf, q.cidade, q.offset]);
    res.json(rows);
  }));

  app.get('/api/professionals/:slug', asyncRoute(async (req, res) => {
    const { rows } = await db.query(`
      SELECT p.usuario_id,p.slug,p.nome_publico,p.titulo,p.descricao,p.foto_url
      FROM eventos.profissionais p JOIN eventos.usuarios u ON u.id=p.usuario_id
      WHERE p.slug=$1 AND p.status='publicado' AND u.status='ativo'
    `, [req.params.slug]);
    if (!rows.length) throw new InputError('Profissional não encontrado.', 404);
    const [categories, areas, images] = await Promise.all([
      db.query(`SELECT c.slug,c.nome FROM eventos.atuacoes_profissional a JOIN eventos.categorias c ON c.id=a.categoria_id
        WHERE a.profissional_id=$1 AND a.ativo AND c.ativa ORDER BY c.nome`, [rows[0].usuario_id]),
      db.query('SELECT cidade,uf FROM eventos.areas_atendimento WHERE profissional_id=$1 ORDER BY uf,cidade', [rows[0].usuario_id]),
      db.query(`SELECT secure_url,descricao FROM eventos.imagens_portfolio
        WHERE profissional_id=$1 AND status='publicada' ORDER BY posicao,criado_em`, [rows[0].usuario_id]),
    ]);
    const { usuario_id, ...publicProfile } = rows[0];
    res.json({ ...publicProfile, categorias: categories.rows, areas: areas.rows, portfolio: images.rows });
  }));

  app.get('/api/me', requireUser, asyncRoute(async (req, res) => {
    const [profile, images] = await Promise.all([
      db.query('SELECT slug,nome_publico,titulo,descricao,foto_url,status FROM eventos.profissionais WHERE usuario_id=$1', [req.user.id]),
      db.query('SELECT id,secure_url,descricao,posicao,status FROM eventos.imagens_portfolio WHERE profissional_id=$1 ORDER BY posicao,criado_em', [req.user.id]),
    ]);
    res.json({ usuario: req.user, profissional: profile.rows[0] ?? null, portfolio: images.rows });
  }));

  app.put('/api/me/professional', requireUser, asyncRoute(async (req, res) => {
    const data = profileInput(req.body);
    const profile = await withTransaction(async (client) => {
      const category = await client.query('SELECT id FROM eventos.categorias WHERE slug=$1 AND ativa', [data.categoria]);
      if (!category.rows.length) throw new InputError('Categoria indisponível.', 400);
      const { rows } = await client.query(`
        INSERT INTO eventos.profissionais (usuario_id,slug,nome_publico,titulo,descricao,status)
        VALUES ($1,$2,$3,$4,$5,'publicado')
        ON CONFLICT (usuario_id) DO UPDATE SET slug=EXCLUDED.slug,nome_publico=EXCLUDED.nome_publico,
          titulo=EXCLUDED.titulo,descricao=EXCLUDED.descricao,status='publicado'
        WHERE eventos.profissionais.status<>'suspenso'
        RETURNING usuario_id,slug,nome_publico,titulo,descricao,foto_url,status
      `, [req.user.id, data.slug, data.nome_publico, data.titulo, data.descricao]);
      if (!rows.length) throw new InputError('Perfil profissional suspenso.', 403);
      await client.query(`INSERT INTO eventos.atuacoes_profissional(profissional_id,categoria_id)
        VALUES($1,$2) ON CONFLICT(profissional_id,categoria_id) DO UPDATE SET ativo=true`, [req.user.id, category.rows[0].id]);
      await client.query(`INSERT INTO eventos.areas_atendimento(profissional_id,cidade,uf)
        VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [req.user.id, data.cidade, data.uf]);
      return rows[0];
    });
    res.json(profile);
  }));

  app.post('/api/me/professional/avatar', requireUser, receiveImage, asyncRoute(async (req, res) => {
    imageType(req.file);
    const { rows: existing } = await db.query('SELECT foto_chave FROM eventos.profissionais WHERE usuario_id=$1 AND status<>\'suspenso\'', [req.user.id]);
    if (!existing.length) throw new InputError('Crie seu perfil profissional primeiro.', 404);
    const asset = verifiedUpload(await media.upload(req.file.buffer, 'entrelia_perfil'));
    try {
      const { rows } = await db.query(`UPDATE eventos.profissionais SET foto_chave=$2,foto_url=$3
        WHERE usuario_id=$1 AND status<>'suspenso' RETURNING foto_url`, [req.user.id, asset.public_id, asset.secure_url]);
      if (!rows.length) throw new InputError('Perfil indisponível.', 409);
      if (existing[0].foto_chave && existing[0].foto_chave !== asset.public_id) {
        media.remove(existing[0].foto_chave).catch((error) => console.error('Falha ao remover imagem antiga:', error));
      }
      res.json(rows[0]);
    } catch (error) {
      await media.remove(asset.public_id).catch(() => {});
      throw error;
    }
  }));

  app.post('/api/me/professional/portfolio', requireUser, receiveImage, asyncRoute(async (req, res) => {
    imageType(req.file);
    const { rows } = await db.query(`SELECT p.status,(SELECT count(*)::int FROM eventos.imagens_portfolio i WHERE i.profissional_id=p.usuario_id) AS total
      FROM eventos.profissionais p WHERE p.usuario_id=$1`, [req.user.id]);
    if (!rows.length || rows[0].status === 'suspenso') throw new InputError('Crie seu perfil profissional primeiro.', 404);
    if (rows[0].total >= 12) throw new InputError('Limite de 12 imagens no portfólio.', 409);
    const asset = verifiedUpload(await media.upload(req.file.buffer, 'entrelia_portfolio'));
    try {
      const saved = await db.query(`INSERT INTO eventos.imagens_portfolio(profissional_id,public_id,secure_url,status)
        VALUES($1,$2,$3,'publicada') RETURNING id,secure_url,status`, [req.user.id, asset.public_id, asset.secure_url]);
      res.status(201).json(saved.rows[0]);
    } catch (error) {
      await media.remove(asset.public_id).catch(() => {});
      throw error;
    }
  }));

  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Imagem maior que 5 MB.' : 'Envie apenas uma imagem.' });
    if (error instanceof InputError) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(409).json({ error: 'E-mail, slug ou imagem já cadastrado.' });
    if (error.code === '23514' || error.code === '23503') return res.status(400).json({ error: 'Dados incompatíveis com o cadastro.' });
    console.error(error);
    res.status(500).json({ error: 'Falha interna. Tente novamente.' });
  });
  return app;
}
