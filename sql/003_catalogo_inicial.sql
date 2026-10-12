BEGIN;
INSERT INTO eventos.categorias(slug,nome,ativa) VALUES
('promoter','Promoter',true),('seguranca','Seguranca',false),('cerimonialista','Cerimonialista',false),
('garcom','Garcom',false),('copeiro','Copeiro',false),('estoquista','Estoquista',false);

-- Produtos ficam INATIVOS. R$60 e apenas o exemplo de Luciano, nao um preco aprovado.
-- Demais precos e duracoes comerciais permanecem sem definicao.
-- Hipotese revisavel: avulso abre um profissional; assinatura abre varios;
-- conversas ja liberadas continuam apos o fim normal do passe, salvo revogacao.
INSERT INTO eventos.produtos(codigo,nome,tipo,cobranca,escopo,preco_centavos,periodicidade,limite_contatos,manter_conversas) VALUES
('contato-avulso-rascunho','Contato avulso - rascunho','contato','avulsa','profissional',6000,NULL,1,true),
('passe-mensal-rascunho','Passe de contatos - rascunho','contato','assinatura','plataforma',NULL,'mensal',NULL,true),
('destaque-mensal-rascunho','Destaque mensal - rascunho','impulsionamento','assinatura','categoria',NULL,'mensal',NULL,false);
-- O produto avulso de destaque sera cadastrado quando sua duracao for definida.
COMMIT;
