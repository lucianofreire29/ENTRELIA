export class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const clean = (value) => typeof value === 'string' ? value.trim() : '';

export function profileInput(body) {
  const slug = clean(body?.slug).toLowerCase();
  const nome_publico = clean(body?.nome_publico);
  const titulo = clean(body?.titulo);
  const descricao = clean(body?.descricao);
  const categoria = clean(body?.categoria).toLowerCase();
  const cidade = clean(body?.cidade);
  const uf = clean(body?.uf).toUpperCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) throw new InputError('Slug inválido. Use letras minúsculas, números e hífens.');
  if (nome_publico.length < 2 || nome_publico.length > 150) throw new InputError('Nome público deve ter de 2 a 150 caracteres.');
  if (titulo.length < 2 || titulo.length > 160) throw new InputError('Título deve ter de 2 a 160 caracteres.');
  if (descricao.length > 5000) throw new InputError('Descrição deve ter no máximo 5000 caracteres.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(categoria)) throw new InputError('Categoria inválida.');
  if (!cidade || cidade.length > 120) throw new InputError('Cidade inválida.');
  if (!/^[A-Z]{2}$/.test(uf)) throw new InputError('UF inválida.');
  return { slug, nome_publico, titulo, descricao, categoria, cidade, uf };
}

export function imageType(file) {
  const bytes = file?.buffer;
  if (!bytes || bytes.length === 0) throw new InputError('Envie uma imagem.');
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && file.mimetype === 'image/jpeg') return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && file.mimetype === 'image/png') return 'image/png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && file.mimetype === 'image/webp') return 'image/webp';
  throw new InputError('Formato inválido. Envie JPEG, PNG ou WebP.');
}

export function searchInput(query = {}) {
  const categoria = clean(query.categoria).toLowerCase();
  const cidade = clean(query.cidade);
  const uf = clean(query.uf).toUpperCase();
  if (categoria && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(categoria)) throw new InputError('Categoria inválida.');
  if (cidade.length > 120 || (uf && !/^[A-Z]{2}$/.test(uf))) throw new InputError('Local inválido.');
  const page = Number(query.page ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000) throw new InputError('Página inválida.');
  return { categoria, cidade, uf, offset: (page - 1) * 20 };
}
