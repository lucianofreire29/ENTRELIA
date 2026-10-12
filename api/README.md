# API do Entrelia

API Node.js para o primeiro fluxo do produto: login Firebase, perfil profissional no Neon, busca pública e imagens no Cloudinary. Requer as cinco migrações SQL na raiz do repositório. O navegador recebe apenas os dados públicos; a API usa conexão ao banco e credenciais dos serviços no servidor.

## Configuração

1. Use Node.js 20 ou mais recente; nesta pasta, execute `npm install`.
2. Copie `.env.example` para `.env` e preencha as variáveis. O Node pode carregar o arquivo com `node --env-file=.env src/server.mjs`; no ambiente hospedado, configure as variáveis no próprio serviço.
3. `DATABASE_URL` deve apontar para a branch **development** do projeto Neon `entrelia`. Para tráfego da API, use a conexão pooled.
4. O projeto Firebase existente é `entrelia-17696`. E-mail/senha e Google estão habilitados no painel. Use esses provedores no app Web e use uma conta de serviço via `GOOGLE_APPLICATION_CREDENTIALS` no servidor. O cliente envia o ID token Firebase no cabeçalho `Authorization: Bearer <token>`; o servidor verifica o token e o e-mail confirmado.
5. Configure as três variáveis Cloudinary no servidor. Os presets assinados `entrelia_perfil` e `entrelia_portfolio` já existem; o segredo da API nunca vai para o cliente.
6. Defina `ALLOWED_ORIGINS` como uma lista de origens web separadas por vírgula e inicie com `npm start` (ou `npm run dev`).

## Rotas iniciais

| Método | Rota | Função |
|---|---|---|
| GET | `/healthz` | Sinal de vida |
| GET | `/api/categories` | Categorias ativas |
| GET | `/api/professionals?categoria=promoter&uf=CE&cidade=Fortaleza&page=1` | Busca pública |
| GET | `/api/professionals/:slug` | Perfil público e portfólio |
| GET | `/api/me` | Conta e perfil do usuário autenticado |
| PUT | `/api/me/professional` | Cria ou atualiza perfil, categoria e cidade |
| POST | `/api/me/professional/avatar` | Imagem de perfil |
| POST | `/api/me/professional/portfolio` | Imagem de portfólio |

O `PUT` recebe JSON com `slug`, `nome_publico`, `titulo`, `descricao`, `categoria`, `cidade` e `uf`. Uploads recebem `multipart/form-data` com uma única parte chamada `imagem` (JPEG, PNG ou WebP, até 5 MB). A busca só mostra perfis publicados em categorias ativas. A API publica o portfólio no upload nesta primeira versão; antes de abrir o cadastro ao público, adicionar moderação e controles de abuso.

Use `npm test` para validar entrada e arquivos. A integração real requer credenciais Firebase e Cloudinary e acesso à branch development do Neon. Pedidos de contato, cobrança e chat ainda não têm rotas nesta API.
