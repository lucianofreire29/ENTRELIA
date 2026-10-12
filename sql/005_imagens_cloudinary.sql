-- Cloudinary guarda os arquivos; Neon guarda o identificador e a URL HTTPS.
-- Aplicar depois de 004_aceite_de_contato.sql.
BEGIN;

ALTER TABLE eventos.profissionais
    ADD COLUMN foto_url text,
    ADD CONSTRAINT foto_perfil_completa CHECK ((foto_chave IS NULL) = (foto_url IS NULL)),
    ADD CONSTRAINT foto_perfil_https CHECK (foto_url IS NULL OR foto_url LIKE 'https://res.cloudinary.com/%/image/upload/%');

COMMENT ON COLUMN eventos.profissionais.foto_chave IS 'Public ID da foto no Cloudinary. Salvar junto com foto_url depois de upload autorizado pelo backend.';

CREATE TABLE eventos.imagens_portfolio (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profissional_id uuid NOT NULL REFERENCES eventos.profissionais(usuario_id),
    public_id text NOT NULL UNIQUE CHECK (length(btrim(public_id)) > 0),
    secure_url text NOT NULL CHECK (secure_url LIKE 'https://res.cloudinary.com/%/image/upload/%'),
    descricao text NOT NULL DEFAULT '' CHECK (length(descricao) <= 300),
    posicao integer NOT NULL DEFAULT 0 CHECK (posicao >= 0),
    status text NOT NULL DEFAULT 'em_analise' CHECK (status IN ('em_analise','publicada','oculta')),
    criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX portfolio_publicado_por_profissional
    ON eventos.imagens_portfolio(profissional_id, posicao, criado_em)
    WHERE status = 'publicada';

COMMENT ON TABLE eventos.imagens_portfolio IS 'Somente metadados das imagens. O backend verifica Firebase, propriedade do perfil e resposta assinada do Cloudinary antes de gravar.';

REVOKE ALL ON eventos.imagens_portfolio FROM PUBLIC;
COMMIT;
