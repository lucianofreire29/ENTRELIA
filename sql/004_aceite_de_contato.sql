-- Aceite significa permissao para conversar, nunca aceitacao de trabalho/contrato.
-- Aplicar apos 001, 002 e 003. Pacote destinado a banco de desenvolvimento vazio.
BEGIN;
CREATE TABLE eventos.pedidos_contato (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id uuid NOT NULL REFERENCES eventos.usuarios(id),
    profissional_id uuid NOT NULL,
    categoria_id uuid NOT NULL,
    mensagem_inicial text NOT NULL CHECK (length(btrim(mensagem_inicial)) BETWEEN 1 AND 2000),
    status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aceito','recusado','cancelado','expirado')),
    respondido_por uuid REFERENCES eventos.usuarios(id),
    respondido_em timestamptz,
    expira_em timestamptz,
    criado_em timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (profissional_id,categoria_id) REFERENCES eventos.atuacoes_profissional(profissional_id,categoria_id),
    UNIQUE (id,usuario_id),
    UNIQUE (id,usuario_id,profissional_id,categoria_id),
    CHECK (usuario_id<>profissional_id),
    CHECK (expira_em IS NULL OR expira_em>criado_em),
    CHECK ((status IN ('aceito','recusado') AND respondido_por IS NOT NULL AND respondido_por=profissional_id AND respondido_em IS NOT NULL) OR
           (status NOT IN ('aceito','recusado') AND respondido_por IS NULL AND respondido_em IS NULL))
);
CREATE UNIQUE INDEX um_contato_aberto_por_par ON eventos.pedidos_contato(usuario_id,profissional_id) WHERE status IN ('pendente','aceito');
CREATE INDEX contatos_recebidos ON eventos.pedidos_contato(profissional_id,status,criado_em DESC);
CREATE FUNCTION eventos.validar_decisao_contato() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='INSERT' THEN
        IF NEW.status<>'pendente' THEN RAISE EXCEPTION 'Contato deve iniciar pendente'; END IF;
        IF NOT EXISTS (
            SELECT 1 FROM eventos.profissionais p JOIN eventos.usuarios u ON u.id=p.usuario_id
            JOIN eventos.atuacoes_profissional a ON a.profissional_id=p.usuario_id
            JOIN eventos.categorias c ON c.id=a.categoria_id
            WHERE p.usuario_id=NEW.profissional_id AND p.status='publicado' AND u.status='ativo'
              AND a.categoria_id=NEW.categoria_id AND a.ativo AND c.ativa
        ) OR EXISTS (SELECT 1 FROM eventos.usuarios WHERE id=NEW.usuario_id AND status<>'ativo') THEN
            RAISE EXCEPTION 'Perfil indisponivel para pedido de contato';
        END IF;
        IF EXISTS (SELECT 1 FROM eventos.bloqueios WHERE
            (autor_id=NEW.usuario_id AND bloqueado_id=NEW.profissional_id) OR
            (autor_id=NEW.profissional_id AND bloqueado_id=NEW.usuario_id)) THEN
            RAISE EXCEPTION 'Contato bloqueado';
        END IF;
        RETURN NEW;
    END IF;
    IF (to_jsonb(NEW)-ARRAY['status','respondido_por','respondido_em']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['status','respondido_por','respondido_em']) THEN
        RAISE EXCEPTION 'Participantes e mensagem inicial do pedido sao imutaveis';
    END IF;
    IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
    IF OLD.status<>'pendente' OR NEW.status='pendente' THEN
        RAISE EXCEPTION 'Pedido de contato encerrado nao pode mudar de decisao';
    END IF;
    IF NEW.status IN ('aceito','recusado') THEN
        IF NEW.respondido_por IS DISTINCT FROM OLD.profissional_id THEN
            RAISE EXCEPTION 'Somente o profissional destinatario decide o contato';
        END IF;
        IF OLD.expira_em IS NOT NULL AND OLD.expira_em<=now() THEN RAISE EXCEPTION 'Pedido de contato expirado'; END IF;
        NEW.respondido_em:=now();
    ELSIF NEW.status='expirado' AND (OLD.expira_em IS NULL OR OLD.expira_em>now()) THEN
        RAISE EXCEPTION 'Pedido ainda nao expirou';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER decidir_contato BEFORE INSERT OR UPDATE ON eventos.pedidos_contato FOR EACH ROW EXECUTE FUNCTION eventos.validar_decisao_contato();

ALTER TABLE eventos.pedidos ADD COLUMN pedido_contato_id uuid;
ALTER TABLE eventos.pedidos ADD CONSTRAINT pedido_contato_do_comprador
    FOREIGN KEY (pedido_contato_id,usuario_id) REFERENCES eventos.pedidos_contato(id,usuario_id);
ALTER TABLE eventos.pedidos ADD CONSTRAINT compra_vinculada_a_contato
    CHECK ((tipo='contato' AND pedido_contato_id IS NOT NULL) OR (tipo='impulsionamento' AND pedido_contato_id IS NULL));

CREATE FUNCTION eventos.pedido_tem_aceite(pedido uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
SELECT EXISTS (
    SELECT 1 FROM eventos.pedidos p
    LEFT JOIN eventos.pedidos_contato c ON c.id=p.pedido_contato_id AND c.usuario_id=p.usuario_id
    WHERE p.id=pedido AND (p.tipo='impulsionamento' OR
        (p.tipo='contato' AND c.status='aceito' AND
          (p.escopo='plataforma' OR p.profissional_alvo=c.profissional_id)))
);
$$;
CREATE FUNCTION eventos.validar_cobranca_aceita() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='INSERT' THEN
        IF NEW.status<>'pendente' THEN RAISE EXCEPTION 'Compra deve iniciar pendente'; END IF;
    ELSIF NEW.status='pago' AND NOT eventos.pedido_tem_aceite(NEW.id) THEN
        RAISE EXCEPTION 'Cobranca de contato exige aceite do profissional destinatario';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER z_validar_compra BEFORE INSERT OR UPDATE ON eventos.pedidos FOR EACH ROW EXECUTE FUNCTION eventos.validar_cobranca_aceita();

CREATE FUNCTION eventos.validar_pagamento_aceito() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE instante_aceite timestamptz;
BEGIN
    IF NEW.status='confirmado' THEN
        IF NOT eventos.pedido_tem_aceite(NEW.pedido_id) THEN
            RAISE EXCEPTION 'Pagamento de contato exige aceite previo do destinatario';
        END IF;
        SELECT c.respondido_em INTO instante_aceite FROM eventos.pedidos p
        JOIN eventos.pedidos_contato c ON c.id=p.pedido_contato_id WHERE p.id=NEW.pedido_id;
        IF instante_aceite IS NOT NULL AND NEW.confirmado_em<instante_aceite THEN
            RAISE EXCEPTION 'Pagamento confirmado antes do aceite deve ser reconciliado';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER validar_pagamento BEFORE INSERT OR UPDATE ON eventos.pagamentos FOR EACH ROW EXECUTE FUNCTION eventos.validar_pagamento_aceito();

ALTER TABLE eventos.conversas ADD COLUMN pedido_contato_id uuid NOT NULL;
ALTER TABLE eventos.conversas ADD CONSTRAINT conversa_do_contato
    FOREIGN KEY (pedido_contato_id,usuario_id,profissional_id,categoria_origem)
    REFERENCES eventos.pedidos_contato(id,usuario_id,profissional_id,categoria_id);
CREATE FUNCTION eventos.validar_aceite_da_conversa() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM eventos.conversas c JOIN eventos.pedidos_contato p ON p.id=c.pedido_contato_id
        WHERE c.id=NEW.conversa_id AND p.status='aceito'
    ) THEN RAISE EXCEPTION 'Chat exige aceite deste profissional, mesmo com passe pago'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER a_validar_aceite BEFORE INSERT ON eventos.acessos_conversa FOR EACH ROW EXECUTE FUNCTION eventos.validar_aceite_da_conversa();

REVOKE ALL ON ALL TABLES IN SCHEMA eventos FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA eventos FROM PUBLIC;
COMMIT;
