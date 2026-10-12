# Entrelia Web

Primeira interface React/Vite do Entrelia. Usa Firebase Authentication para e-mail/senha e Google, envia o ID token à API, permite busca pública, criação de perfil e upload de imagens. A API e o banco ficam no servidor.

## Rodar localmente

1. Registre um **app Web** no projeto Firebase `entrelia-17696` e copie os valores do objeto de configuração para `web/.env` seguindo `.env.example`. Esses identificadores do cliente são públicos; não coloque credenciais de conta de serviço nem segredo do Cloudinary aqui.
2. No Firebase Authentication, confira se `localhost` está em **Domínios autorizados**. Para um domínio de produção, adicione somente o domínio usado pelo site.
3. Configure a API conforme `api/README.md`, incluindo `ALLOWED_ORIGINS=http://localhost:5173`, `DATABASE_URL` da branch development, credenciais Firebase Admin e Cloudinary.
4. Na pasta `web`, execute `npm install` e `npm run dev` e abra `http://localhost:5173`.

O cadastro por e-mail pede confirmação antes da API criar a conta no Neon. O login Google usa pop-up. A API valida o token e exige `email_verified`. A conta pode buscar e publicar um perfil profissional. Pedidos de contato, pagamentos e chat ainda não foram implementados.

O objeto de configuração Web do Firebase ainda precisa ser obtido no console. Sem ele a interface mostra um aviso de configuração e não oferece login. O teste ponta a ponta também depende das credenciais privadas da API e de um servidor em execução.
