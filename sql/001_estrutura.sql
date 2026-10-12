-- Modelo v0.3: descoberta de profissionais, acesso pago ao chat e impulsionamento.
-- Instalar somente em banco vazio. Nao e migracao de uma base v0.1 existente.
-- Pagamentos referem-se exclusivamente aos produtos da plataforma.
BEGIN;
CREATE SCHEMA eventos;

CREATE TABLE eventos.usuarios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL CHECK (length(btrim(nome)) BETWEEN 2 AND 150),
    email text NOT NULL CHECK (email = lower(btrim(email)) AND position('@' IN email) > 1),
    telefone text,
    auth_provedor text,
    auth_subject text,
    status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','suspenso','anonimizado')),
    criado_em timestamptz NOT NULL DEFAULT now(),
    UNIQUE (email),
    UNIQUE (auth_provedor, auth_subject),
    CHECK ((auth_provedor IS NULL) = (auth_subject IS NULL))
);
COMMENT ON TABLE eventos.usuarios IS 'Conta privada. Uma pessoa pode contratar e atuar como profissional. Identidade e senha ficam no provedor de autenticacao a definir.';

CREATE TABLE eventos.empresas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_exibicao text NOT NULL CHECK (length(btrim(nome_exibicao)) BETWEEN 2 AND 150),
    razao_social text,
    criado_por uuid NOT NULL REFERENCES eventos.usuarios(id),
    status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','suspensa','arquivada')),
    criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE eventos.membros_empresa (
    empresa_id uuid NOT NULL REFERENCES eventos.empresas(id),
    usuario_id uuid NOT NULL REFERENCES eventos.usuarios(id),
    papel text NOT NULL CHECK (papel IN ('proprietario','gestor','recrutador')),
    ativo boolean NOT NULL DEFAULT true,
    criado_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (empresa_id, usuario_id)
);
CREATE INDEX membros_por_usuario ON eventos.membros_empresa(usuario_id) WHERE ativo;

CREATE TABLE eventos.categorias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    nome text NOT NULL UNIQUE,
    descricao text,
    ativa boolean NOT NULL DEFAULT false
);
CREATE TABLE eventos.profissionais (
    usuario_id uuid PRIMARY KEY REFERENCES eventos.usuarios(id),
    slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    nome_publico text NOT NULL CHECK (length(btrim(nome_publico)) BETWEEN 2 AND 150),
    titulo text NOT NULL CHECK (length(btrim(titulo)) BETWEEN 2 AND 160),
    descricao text NOT NULL DEFAULT '',
    foto_chave text,
    status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','em_analise','publicado','pausado','suspenso')),
    criado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN eventos.profissionais.foto_chave IS 'Chave do arquivo no armazenamento; nao salvar URL temporaria assinada.';

CREATE TABLE eventos.atuacoes_profissional (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profissional_id uuid NOT NULL REFERENCES eventos.profissionais(usuario_id),
    categoria_id uuid NOT NULL REFERENCES eventos.categorias(id),
    descricao text NOT NULL DEFAULT '',
    unidade_preco text NOT NULL DEFAULT 'a_combinar' CHECK (unidade_preco IN ('hora','turno','evento','a_combinar')),
    preco_referencia numeric(12,2),
    duracao_turno_minutos integer,
    moeda char(3) NOT NULL DEFAULT 'BRL' CHECK (moeda = 'BRL'),
    ativo boolean NOT NULL DEFAULT true,
    UNIQUE (profissional_id, categoria_id),
    UNIQUE (id, profissional_id, categoria_id),
    CHECK ((unidade_preco = 'a_combinar' AND preco_referencia IS NULL) OR
           (unidade_preco <> 'a_combinar' AND preco_referencia > 0 AND preco_referencia IS NOT NULL)),
    CHECK ((unidade_preco = 'turno' AND duracao_turno_minutos > 0 AND duracao_turno_minutos IS NOT NULL) OR
           (unidade_preco <> 'turno' AND duracao_turno_minutos IS NULL))
);
CREATE INDEX atuacoes_por_categoria ON eventos.atuacoes_profissional(categoria_id, preco_referencia) WHERE ativo;

CREATE TABLE eventos.areas_atendimento (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profissional_id uuid NOT NULL REFERENCES eventos.profissionais(usuario_id),
    cidade text NOT NULL CHECK (length(btrim(cidade)) > 0),
    uf char(2) NOT NULL CHECK (uf IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
    observacoes text
);
CREATE UNIQUE INDEX area_sem_duplicidade ON eventos.areas_atendimento(profissional_id, uf, lower(btrim(cidade)));
CREATE INDEX areas_por_local ON eventos.areas_atendimento(uf, lower(btrim(cidade)));


COMMIT;
