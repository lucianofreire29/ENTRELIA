# Entrelia

Plataforma web para descobrir profissionais de eventos. Uma conta pode buscar profissionais e publicar um perfil. O contato começa com um pedido, depende do aceite do profissional e só libera o chat depois da confirmação de um acesso pago ou do uso de um passe vigente. A negociação do serviço acontece diretamente entre as pessoas.

## Banco de dados

PostgreSQL no Neon, projeto `entrelia`, banco `neondb`. O schema de negócio é `eventos`. O Firebase Authentication cuidará da identidade; a API fará a autorização e consultará o banco. Imagens ficam no Cloudinary, com identificadores e URLs registrados no Neon.

As migrações devem ser executadas **na ordem**, uma vez, em um banco vazio, usando uma conexão direta (sem `-pooler`):

1. `sql/001_estrutura.sql`: contas, empresas, categorias, profissionais e áreas.
2. `sql/002_acesso_e_monetizacao.sql`: catálogo comercial, pedidos, pagamentos, benefícios, chat, destaque e apoio.
3. `sql/003_catalogo_inicial.sql`: categorias iniciais e produtos de rascunho inativos.
4. `sql/004_aceite_de_contato.sql`: pedido de contato e aceite obrigatório antes da cobrança e do chat.
5. `sql/005_imagens_cloudinary.sql`: foto de perfil e portfólio com public ID e URL HTTPS.

`Promoter` é a única categoria ativa no catálogo inicial. Os produtos permanecem inativos; R$ 60 no SQL é apenas um exemplo, não um preço lançado. O schema não deve ser exposto ao navegador. A API inicial verifica o token Firebase e a identidade do usuário para editar perfis e enviar imagens. A autorização de pagamentos e chat será implementada nas próximas etapas.

Para executar os testes locais do modelo, use `npm install` e `npm test`. Eles exercitam regras SQL com PGlite e um provedor de pagamento fictício. Não validam Firebase, Cloudinary ou gateway reais.

## API inicial

O código e as instruções de configuração estão em [`api/README.md`](api/README.md). A primeira entrega inclui perfil profissional, busca pública e upload autenticado com os presets assinados `entrelia_perfil` e `entrelia_portfolio`.

## Aplicativo Web

A primeira interface React/Vite está em [`web/README.md`](web/README.md). Ela usa Firebase Authentication, consulta a API e permite publicar perfil e imagens. O registro do app Web no Firebase, a configuração local e o teste ponta a ponta ainda estão pendentes.

## Próximas implementações

Configuração real do Firebase Web e teste ponta a ponta; pedido/aceite; checkout e webhook idempotente; chat e moderação. Preços, prazos e limites comerciais seguem pendentes de decisão.
