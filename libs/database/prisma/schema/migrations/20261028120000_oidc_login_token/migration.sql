-- One-time codes that hand an OpenID Connect sign-in to the web app
ALTER TYPE "token_type" ADD VALUE 'OIDC_LOGIN';
