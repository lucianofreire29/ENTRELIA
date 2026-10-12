-- Continuacao de 001_estrutura.sql, apos o COMMIT desse arquivo.
BEGIN;
CREATE TABLE eventos.produtos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo text NOT NULL UNIQUE,
    nome text NOT NULL,
    tipo text NOT NULL CHECK (tipo IN ('contato','impulsionamento')),
    cobranca text NOT NULL CHECK (cobranca IN ('avulsa','assinatura')),
    escopo text NOT NULL CHECK (escopo IN ('profissional','plataforma','categoria')),
    preco_centavos integer CHECK (preco_centavos > 0),
    moeda char(3) NOT NULL DEFAULT 'BRL' CHECK (moeda='BRL'),
    periodicidade text CHECK (periodicidade IN ('mensal','anual')),
    duracao_dias integer CHECK (duracao_dias > 0),
    limite_contatos integer CHECK (limite_contatos > 0),
    manter_conversas boolean NOT NULL DEFAULT true,
    ativo boolean NOT NULL DEFAULT false,
    CHECK (NOT ativo OR preco_centavos IS NOT NULL),
    CHECK ((cobranca='assinatura') = (periodicidade IS NOT NULL)),
    CHECK ((tipo='contato' AND escopo IN ('profissional','plataforma')) OR
           (tipo='impulsionamento' AND escopo='categoria')),
    CHECK (tipo='contato' OR limite_contatos IS NULL),
    CHECK (cobranca<>'assinatura' OR duracao_dias IS NULL),
    CHECK (tipo<>'impulsionamento' OR cobranca<>'avulsa' OR duracao_dias IS NOT NULL)
);
COMMENT ON TABLE eventos.produtos IS 'Produtos da plataforma; nunca o valor do trabalho do profissional. Precos, prazos e limites ainda precisam de definicao comercial.';

CREATE TABLE eventos.assinaturas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid NOT NULL REFERENCES eventos.usuarios(id),
    produto_id uuid NOT NULL REFERENCES eventos.produtos(id),
    provedor text NOT NULL,
    assinatura_externa text NOT NULL,
    status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','ativa','inadimplente','cancelada','encerrada')),
    cancelar_ao_fim boolean NOT NULL DEFAULT false,
    criado_em timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provedor, assinatura_externa),
    UNIQUE (id, usuario_id, produto_id)
);
COMMENT ON TABLE eventos.assinaturas IS 'Relacao recorrente. Status ativa sozinho nao libera chat nem destaque: e preciso um periodo pago com beneficio valido.';

CREATE TABLE eventos.pedidos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid NOT NULL REFERENCES eventos.usuarios(id),
    produto_id uuid NOT NULL REFERENCES eventos.produtos(id),
    assinatura_id uuid,
    chave_idempotencia text NOT NULL UNIQUE,
    provedor text,
    fatura_externa text,
    tipo text NOT NULL,
    cobranca text NOT NULL,
    escopo text NOT NULL,
    valor_centavos integer NOT NULL CHECK (valor_centavos > 0),
    moeda char(3) NOT NULL DEFAULT 'BRL' CHECK (moeda='BRL'),
    duracao_dias integer,
    limite_contatos integer,
    manter_conversas boolean NOT NULL,
    profissional_alvo uuid REFERENCES eventos.profissionais(usuario_id),
    categoria_alvo uuid REFERENCES eventos.categorias(id),
    periodo_inicio timestamptz,
    periodo_fim timestamptz,
    status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','cancelado','reembolsado','contestado')),
    criado_em timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provedor, fatura_externa),
    UNIQUE (id, usuario_id),
    FOREIGN KEY (assinatura_id, usuario_id, produto_id) REFERENCES eventos.assinaturas(id, usuario_id, produto_id),
    CHECK ((provedor IS NULL) = (fatura_externa IS NULL)),
    CHECK ((cobranca='assinatura' AND assinatura_id IS NOT NULL AND periodo_inicio IS NOT NULL AND periodo_fim IS NOT NULL AND periodo_fim>periodo_inicio) OR
           (cobranca='avulsa' AND assinatura_id IS NULL AND periodo_inicio IS NULL AND periodo_fim IS NULL)),
    CHECK ((tipo='contato' AND categoria_alvo IS NULL AND
             ((escopo='profissional' AND profissional_alvo IS NOT NULL AND profissional_alvo<>usuario_id) OR
              (escopo='plataforma' AND profissional_alvo IS NULL))) OR
           (tipo='impulsionamento' AND escopo='categoria' AND profissional_alvo=usuario_id AND profissional_alvo IS NOT NULL AND categoria_alvo IS NOT NULL))
);
CREATE INDEX pedidos_por_usuario ON eventos.pedidos(usuario_id, criado_em DESC);

CREATE FUNCTION eventos.copiar_produto_no_pedido() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p eventos.produtos%ROWTYPE;
BEGIN
    IF TG_OP='UPDATE' THEN
        IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN
            RAISE EXCEPTION 'Pedido imutavel; criar novo pedido para outro produto ou periodo';
        END IF;
        RETURN NEW;
    END IF;
    SELECT * INTO p FROM eventos.produtos WHERE id=NEW.produto_id;
    IF NOT FOUND OR NOT p.ativo THEN RAISE EXCEPTION 'Produto indisponivel'; END IF;
    NEW.tipo:=p.tipo; NEW.cobranca:=p.cobranca; NEW.escopo:=p.escopo;
    NEW.valor_centavos:=p.preco_centavos; NEW.moeda:=p.moeda;
    NEW.duracao_dias:=p.duracao_dias; NEW.limite_contatos:=p.limite_contatos;
    NEW.manter_conversas:=p.manter_conversas;
    RETURN NEW;
END $$;
CREATE TRIGGER copiar_produto BEFORE INSERT OR UPDATE ON eventos.pedidos FOR EACH ROW EXECUTE FUNCTION eventos.copiar_produto_no_pedido();

CREATE TABLE eventos.pagamentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id uuid NOT NULL REFERENCES eventos.pedidos(id),
    provedor text NOT NULL,
    pagamento_externo text NOT NULL,
    status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','autorizado','confirmado','recusado','cancelado','reembolsado','contestado')),
    valor_centavos integer NOT NULL CHECK (valor_centavos>0),
    moeda char(3) NOT NULL DEFAULT 'BRL' CHECK (moeda='BRL'),
    confirmado_em timestamptz,
    criado_em timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provedor, pagamento_externo),
    UNIQUE (id, pedido_id),
    CHECK (status<>'confirmado' OR confirmado_em IS NOT NULL)
);
CREATE UNIQUE INDEX um_pagamento_confirmado_por_pedido ON eventos.pagamentos(pedido_id) WHERE status='confirmado';
CREATE TABLE eventos.webhooks_pagamento (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provedor text NOT NULL,
    evento_externo text NOT NULL,
    tipo text NOT NULL,
    pagamento_id uuid REFERENCES eventos.pagamentos(id),
    status text NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido','processado','falhou','ignorado')),
    recebido_em timestamptz NOT NULL DEFAULT now(),
    processado_em timestamptz,
    tentativas integer NOT NULL DEFAULT 0 CHECK (tentativas>=0),
    UNIQUE (provedor, evento_externo)
);
COMMENT ON TABLE eventos.webhooks_pagamento IS 'Registrar somente depois de verificar autenticidade no backend. Reenvio do mesmo evento nao pode conceder o beneficio duas vezes.';

CREATE TABLE eventos.beneficios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id uuid NOT NULL UNIQUE,
    pagamento_id uuid NOT NULL UNIQUE,
    usuario_id uuid NOT NULL,
    tipo text NOT NULL,
    escopo text NOT NULL,
    profissional_alvo uuid REFERENCES eventos.profissionais(usuario_id),
    categoria_alvo uuid REFERENCES eventos.categorias(id),
    inicio timestamptz NOT NULL,
    fim timestamptz,
    limite_contatos integer,
    manter_conversas boolean NOT NULL,
    revogado_em timestamptz,
    criado_em timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (pedido_id, usuario_id) REFERENCES eventos.pedidos(id, usuario_id),
    FOREIGN KEY (pagamento_id, pedido_id) REFERENCES eventos.pagamentos(id, pedido_id),
    CHECK (fim IS NULL OR fim>inicio)
);
CREATE FUNCTION eventos.validar_beneficio_pago() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p eventos.pedidos%ROWTYPE; pg eventos.pagamentos%ROWTYPE;
BEGIN
    IF TG_OP='UPDATE' THEN
        IF (to_jsonb(NEW)-'revogado_em') IS DISTINCT FROM (to_jsonb(OLD)-'revogado_em') OR
           (OLD.revogado_em IS NOT NULL AND NEW.revogado_em IS DISTINCT FROM OLD.revogado_em) THEN
            RAISE EXCEPTION 'Beneficio imutavel; apenas revogacao e permitida';
        END IF;
        RETURN NEW;
    END IF;
    SELECT * INTO p FROM eventos.pedidos WHERE id=NEW.pedido_id FOR UPDATE;
    SELECT * INTO pg FROM eventos.pagamentos WHERE id=NEW.pagamento_id FOR UPDATE;
    IF p.id IS NULL OR pg.id IS NULL OR pg.pedido_id<>p.id OR p.status<>'pago' OR pg.status<>'confirmado' OR
       pg.valor_centavos<>p.valor_centavos OR pg.moeda<>p.moeda OR pg.confirmado_em IS NULL THEN
        RAISE EXCEPTION 'Beneficio exige pagamento confirmado e valor integral do pedido';
    END IF;
    NEW.usuario_id:=p.usuario_id; NEW.tipo:=p.tipo; NEW.escopo:=p.escopo;
    NEW.profissional_alvo:=p.profissional_alvo; NEW.categoria_alvo:=p.categoria_alvo;
    NEW.limite_contatos:=p.limite_contatos; NEW.manter_conversas:=p.manter_conversas;
    IF p.cobranca='assinatura' THEN
        NEW.inicio:=p.periodo_inicio; NEW.fim:=p.periodo_fim;
    ELSE
        NEW.inicio:=pg.confirmado_em;
        NEW.fim:=CASE WHEN p.duracao_dias IS NULL THEN NULL ELSE pg.confirmado_em + p.duracao_dias*interval '1 day' END;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER conceder_beneficio BEFORE INSERT OR UPDATE ON eventos.beneficios FOR EACH ROW EXECUTE FUNCTION eventos.validar_beneficio_pago();
CREATE VIEW eventos.beneficios_pagos AS
SELECT b.* FROM eventos.beneficios b
JOIN eventos.pedidos p ON p.id=b.pedido_id
JOIN eventos.pagamentos pg ON pg.id=b.pagamento_id AND pg.pedido_id=p.id
WHERE b.revogado_em IS NULL AND p.status='pago' AND pg.status='confirmado'
  AND pg.valor_centavos=p.valor_centavos AND pg.moeda=p.moeda;
CREATE VIEW eventos.beneficios_vigentes AS
SELECT * FROM eventos.beneficios_pagos WHERE inicio<=now() AND (fim IS NULL OR fim>now());

CREATE TABLE eventos.bloqueios (
    autor_id uuid NOT NULL REFERENCES eventos.usuarios(id),
    bloqueado_id uuid NOT NULL REFERENCES eventos.usuarios(id),
    criado_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (autor_id,bloqueado_id),
    CHECK (autor_id<>bloqueado_id)
);
CREATE TABLE eventos.conversas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid NOT NULL REFERENCES eventos.usuarios(id),
    profissional_id uuid NOT NULL REFERENCES eventos.profissionais(usuario_id),
    categoria_origem uuid NOT NULL REFERENCES eventos.categorias(id),
    status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','arquivada','bloqueada')),
    criado_em timestamptz NOT NULL DEFAULT now(),
    UNIQUE (usuario_id, profissional_id),
    CHECK (usuario_id<>profissional_id)
);
CREATE TABLE eventos.acessos_conversa (
    conversa_id uuid NOT NULL REFERENCES eventos.conversas(id),
    beneficio_id uuid NOT NULL REFERENCES eventos.beneficios(id),
    liberado_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (conversa_id,beneficio_id)
);
CREATE INDEX acessos_por_beneficio ON eventos.acessos_conversa(beneficio_id);
CREATE FUNCTION eventos.validar_liberacao_chat() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b eventos.beneficios%ROWTYPE; c eventos.conversas%ROWTYPE; utilizados integer;
BEGIN
    PERFORM 1 FROM eventos.beneficios WHERE id=NEW.beneficio_id FOR UPDATE;
    SELECT * INTO b FROM eventos.beneficios_vigentes WHERE id=NEW.beneficio_id;
    SELECT * INTO c FROM eventos.conversas WHERE id=NEW.conversa_id;
    IF b.id IS NULL OR c.id IS NULL OR b.tipo<>'contato' OR b.usuario_id<>c.usuario_id OR
       (b.escopo='profissional' AND b.profissional_alvo<>c.profissional_id) THEN
        RAISE EXCEPTION 'Acesso ao chat exige beneficio vigente do usuario para o profissional';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM eventos.profissionais p JOIN eventos.usuarios u ON u.id=p.usuario_id
        JOIN eventos.atuacoes_profissional a ON a.profissional_id=p.usuario_id
        JOIN eventos.categorias cat ON cat.id=a.categoria_id
        WHERE p.usuario_id=c.profissional_id AND p.status='publicado' AND u.status='ativo'
        AND a.categoria_id=c.categoria_origem AND a.ativo AND cat.ativa
    ) OR EXISTS (SELECT 1 FROM eventos.usuarios WHERE id=c.usuario_id AND status<>'ativo') THEN
        RAISE EXCEPTION 'Perfil ou categoria indisponivel para novo contato';
    END IF;
    IF EXISTS (SELECT 1 FROM eventos.bloqueios WHERE
        (autor_id=c.usuario_id AND bloqueado_id=c.profissional_id) OR
        (autor_id=c.profissional_id AND bloqueado_id=c.usuario_id)) THEN
        RAISE EXCEPTION 'Contato bloqueado';
    END IF;
    SELECT count(*) INTO utilizados FROM eventos.acessos_conversa WHERE beneficio_id=b.id;
    IF b.limite_contatos IS NOT NULL AND utilizados>=b.limite_contatos THEN RAISE EXCEPTION 'Limite de contatos atingido'; END IF;
    NEW.liberado_em:=now();
    RETURN NEW;
END $$;
CREATE TRIGGER liberar_chat BEFORE INSERT ON eventos.acessos_conversa FOR EACH ROW EXECUTE FUNCTION eventos.validar_liberacao_chat();

CREATE FUNCTION eventos.chat_pode_enviar(conversa uuid, remetente uuid, referencia timestamptz DEFAULT now()) RETURNS boolean
LANGUAGE sql STABLE AS $$
SELECT EXISTS (
    SELECT 1 FROM eventos.conversas c
    JOIN eventos.usuarios u ON u.id=c.usuario_id AND u.status='ativo'
    JOIN eventos.usuarios up ON up.id=c.profissional_id AND up.status='ativo'
    JOIN eventos.profissionais p ON p.usuario_id=c.profissional_id AND p.status<>'suspenso'
    WHERE c.id=conversa AND c.status='ativa' AND remetente IN (c.usuario_id,c.profissional_id)
    AND NOT EXISTS (SELECT 1 FROM eventos.bloqueios bl WHERE
        (bl.autor_id=c.usuario_id AND bl.bloqueado_id=c.profissional_id) OR
        (bl.autor_id=c.profissional_id AND bl.bloqueado_id=c.usuario_id))
    AND EXISTS (
        SELECT 1 FROM eventos.acessos_conversa a JOIN eventos.beneficios_pagos b ON b.id=a.beneficio_id
        WHERE a.conversa_id=c.id AND b.tipo='contato' AND b.usuario_id=c.usuario_id
        AND (b.escopo='plataforma' OR b.profissional_alvo=c.profissional_id)
        AND b.inicio<=referencia AND a.liberado_em>=b.inicio AND (b.fim IS NULL OR a.liberado_em<b.fim)
        AND (b.manter_conversas OR b.fim IS NULL OR b.fim>referencia)
    )
);
$$;
CREATE TABLE eventos.mensagens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversa_id uuid NOT NULL REFERENCES eventos.conversas(id),
    remetente_id uuid NOT NULL REFERENCES eventos.usuarios(id),
    texto text NOT NULL CHECK (length(btrim(texto)) BETWEEN 1 AND 10000),
    criado_em timestamptz NOT NULL DEFAULT now(),
    lida_em timestamptz
);
CREATE INDEX mensagens_por_conversa ON eventos.mensagens(conversa_id,criado_em,id);
CREATE FUNCTION eventos.validar_mensagem() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT eventos.chat_pode_enviar(NEW.conversa_id,NEW.remetente_id) THEN
        RAISE EXCEPTION 'Mensagem nao autorizada: participante, pagamento ou acesso invalido';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER enviar_mensagem BEFORE INSERT ON eventos.mensagens FOR EACH ROW EXECUTE FUNCTION eventos.validar_mensagem();

CREATE FUNCTION eventos.preservar_participantes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN
        RAISE EXCEPTION 'Participantes e origem da conversa sao imutaveis';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER preservar_conversa BEFORE UPDATE ON eventos.conversas FOR EACH ROW EXECUTE FUNCTION eventos.preservar_participantes();
CREATE FUNCTION eventos.preservar_acesso() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Liberacao e imutavel; criar nova liberacao ou revogar o beneficio';
END $$;
CREATE TRIGGER preservar_liberacao BEFORE UPDATE ON eventos.acessos_conversa FOR EACH ROW EXECUTE FUNCTION eventos.preservar_acesso();
CREATE FUNCTION eventos.preservar_mensagem() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (to_jsonb(NEW)-'lida_em') IS DISTINCT FROM (to_jsonb(OLD)-'lida_em') THEN
        RAISE EXCEPTION 'Mensagem e remetente sao imutaveis';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER preservar_mensagem BEFORE UPDATE ON eventos.mensagens FOR EACH ROW EXECUTE FUNCTION eventos.preservar_mensagem();

CREATE TABLE eventos.impulsionamentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    beneficio_id uuid NOT NULL UNIQUE REFERENCES eventos.beneficios(id),
    profissional_id uuid NOT NULL,
    categoria_id uuid NOT NULL,
    cidade text,
    uf char(2),
    status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','pausado','encerrado')),
    criado_em timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (profissional_id,categoria_id) REFERENCES eventos.atuacoes_profissional(profissional_id,categoria_id),
    CHECK (cidade IS NULL OR uf IS NOT NULL),
    CHECK (uf IS NULL OR uf IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'))
);
CREATE FUNCTION eventos.validar_impulsionamento() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b eventos.beneficios%ROWTYPE;
BEGIN
    SELECT * INTO b FROM eventos.beneficios_pagos WHERE id=NEW.beneficio_id;
    IF b.id IS NULL OR b.tipo<>'impulsionamento' OR b.profissional_alvo<>NEW.profissional_id OR
       b.usuario_id<>NEW.profissional_id OR b.categoria_alvo<>NEW.categoria_id OR b.fim IS NULL THEN
        RAISE EXCEPTION 'Impulsionamento exige beneficio pago proprio, categoria correta e prazo';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER criar_impulsionamento BEFORE INSERT OR UPDATE ON eventos.impulsionamentos FOR EACH ROW EXECUTE FUNCTION eventos.validar_impulsionamento();
CREATE VIEW eventos.impulsionamentos_vigentes AS
SELECT i.*,b.inicio,b.fim FROM eventos.impulsionamentos i
JOIN eventos.beneficios_vigentes b ON b.id=i.beneficio_id
JOIN eventos.profissionais p ON p.usuario_id=i.profissional_id AND p.status='publicado'
JOIN eventos.usuarios u ON u.id=p.usuario_id AND u.status='ativo'
JOIN eventos.atuacoes_profissional a ON a.profissional_id=i.profissional_id AND a.categoria_id=i.categoria_id AND a.ativo
JOIN eventos.categorias c ON c.id=i.categoria_id AND c.ativa
WHERE i.status='ativo';

CREATE TABLE eventos.favoritos (
    usuario_id uuid NOT NULL REFERENCES eventos.usuarios(id),
    profissional_id uuid NOT NULL REFERENCES eventos.profissionais(usuario_id),
    criado_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id,profissional_id),
    CHECK (usuario_id<>profissional_id)
);
CREATE TABLE eventos.avaliacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversa_id uuid NOT NULL UNIQUE REFERENCES eventos.conversas(id),
    autor_id uuid NOT NULL REFERENCES eventos.usuarios(id),
    nota smallint NOT NULL CHECK (nota BETWEEN 1 AND 5),
    comentario text NOT NULL DEFAULT '' CHECK (length(comentario)<=3000),
    status text NOT NULL DEFAULT 'em_analise' CHECK (status IN ('em_analise','publicada','oculta')),
    criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION eventos.validar_avaliacao_contato() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c eventos.conversas%ROWTYPE;
BEGIN
    SELECT * INTO c FROM eventos.conversas WHERE id=NEW.conversa_id;
    IF c.id IS NULL OR NEW.autor_id<>c.usuario_id OR NOT EXISTS
       (SELECT 1 FROM eventos.mensagens WHERE conversa_id=c.id AND remetente_id=c.profissional_id) THEN
        RAISE EXCEPTION 'Avaliacao exige contato com resposta do profissional e autor correto';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER avaliar_contato BEFORE INSERT OR UPDATE ON eventos.avaliacoes FOR EACH ROW EXECUTE FUNCTION eventos.validar_avaliacao_contato();
COMMENT ON TABLE eventos.avaliacoes IS 'Experiencia de contato. Nao comprova contratacao ou servico realizado; nao exibir selo de servico verificado.';
CREATE TABLE eventos.notificacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid NOT NULL REFERENCES eventos.usuarios(id),
    conversa_id uuid REFERENCES eventos.conversas(id),
    pedido_id uuid REFERENCES eventos.pedidos(id),
    tipo text NOT NULL CHECK (tipo IN ('pagamento_confirmado','acesso_liberado','nova_mensagem','assinatura','impulsionamento','moderacao')),
    titulo text NOT NULL,
    lida_em timestamptz,
    criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notificacoes_nao_lidas ON eventos.notificacoes(usuario_id,criado_em DESC) WHERE lida_em IS NULL;

REVOKE ALL ON SCHEMA eventos FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA eventos FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA eventos FROM PUBLIC;
COMMIT;
