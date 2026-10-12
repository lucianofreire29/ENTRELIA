import test from 'node:test';
import assert from 'node:assert/strict';
import { imageType, profileInput, searchInput } from '../src/validation.mjs';

const validProfile = {
  slug: 'ana-promoter', nome_publico: 'Ana Silva', titulo: 'Promoter de eventos',
  descricao: 'Atendimento em eventos', categoria: 'promoter', cidade: 'Fortaleza', uf: 'CE',
};

test('perfil aceita dados completos e normaliza slug e UF', () => {
  assert.deepEqual(profileInput({ ...validProfile, slug: ' Ana-Promoter ', uf: 'ce' }), validProfile);
});

test('perfil rejeita slug impróprio e categoria vazia', () => {
  assert.throws(() => profileInput({ ...validProfile, slug: '../ana' }), /Slug inválido/);
  assert.throws(() => profileInput({ ...validProfile, categoria: '' }), /Categoria inválida/);
});

test('busca limita paginação e sanitiza filtros', () => {
  assert.deepEqual(searchInput({ categoria: ' Promoter ', uf: 'ce', cidade: ' Fortaleza ', page: '3' }),
    { categoria: 'promoter', uf: 'CE', cidade: 'Fortaleza', offset: 40 });
  assert.throws(() => searchInput({ page: '-1' }), /Página inválida/);
});

test('upload aceita imagem com assinatura e MIME correspondentes', () => {
  assert.equal(imageType({ mimetype: 'image/png', buffer: Buffer.from([137,80,78,71,13,10,26,10,0]) }), 'image/png');
  assert.throws(() => imageType({ mimetype: 'image/png', buffer: Buffer.from('arquivo de texto') }), /Formato inválido/);
  assert.throws(() => imageType({ mimetype: 'image/jpeg', buffer: Buffer.from('') }), /Envie uma imagem/);
});
