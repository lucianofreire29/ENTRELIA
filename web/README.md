# Entrelia Web

Primeira interface React/Vite do Entrelia. Usa Firebase Authentication para e-mail/senha e Google, envia o ID token à API, permite busca pública, criação de perfil e upload de imagens. A API e o banco ficam no servidor.

## Rodar localmente

1. O app Web já foi registrado no Firebase `entrelia-17696`; sua configuração pública está em `src/firebase.js`. Não coloque credenciais de conta de serviço nem segredo do Cloudinary no frontend.
2. No Firebase Authentication, confira se `localhost` está em **Domínios autorizados**. Para um domínio de produção, adicione somente o domínio usado pelo site.
3. Configure a API conforme `api/README.md`, incluindo `ALLOWED_ORIGINS=http://localhost:5173`, `DATABASE_URL` da branch development, credenciais Firebase Admin e Cloudinary. Se a API usar outra URL, copie `.env.example` para `.env` e ajuste `VITE_API_BASE_URL`.
4. Na pasta `web`, execute `npm install` e `npm run dev` e abra `http://localhost:5173`.

O cadastro por e-mail pede confirmação antes da API criar a conta no Neon. O login Google usa pop-up. A API valida o token e exige `email_verified`. A conta pode buscar e publicar um perfil profissional. Pedidos de contato, pagamentos e chat ainda não foram implementados.

O teste ponta a ponta depende das credenciais privadas da API e de um servidor em execução. A configuração pública do Firebase não concede acesso ao Neon ou Cloudinary.
