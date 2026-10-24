# Histórico de hospedagem

Este documento preserva as instruções anteriores de migração de Render para Cloudflare Pages. Elas descrevem um ambiente antigo e não devem ser usadas como configuração atual. O frontend atual está no Firebase Hosting, e a API usa a Vercel. Consulte o [README](../README.md) para a configuração mantida.

## Deploy do frontend no Cloudflare Pages (opcional, sem custo)

O frontend é 100% portável: todo o acesso à API passa por `auth.js`, que chama o backend por URL
absoluta (`https://consumo-energia-backend.vercel.app`, constante `API`), então **nenhuma
mudança de código** é necessária. O backend já envia o cookie de sessão com
`SameSite=None; Secure` fixo, então login cross-site funciona sem alteração. O backend é API pura
(não serve estáticos), separação já existente na arquitetura atual.

| Aspecto | Hoje (front no Render static) | Front no Pages + backend no Render free |
|---|---|---|
| Carregamento da página | Site estático no Render (CDN, já sem cold start) | Imediato (edge Cloudflare, sem cold start) |
| Primeira chamada de API após o backend dormir | Cold start do backend Node (~13–24s) | **Continua sentindo o cold start do backend** (~13–24s no primeiro login/GET após 15 min de inatividade) |
| Custo | R$ 0 | R$ 0 (Pages free) |
| DNS próprio | Não exigido | Não exigido (`*.pages.dev`) |

A migração melhora apenas o carregamento da página. O backend Node continua
no Render free, adormece após 15 minutos e a primeira ação que toca a API continua esperando o
serviço acordar. Nada no Render é apagado nesta migração.

### Passo a passo (dashboard Cloudflare, sem CLI)

**Passo 1.** Cloudflare Dashboard → **Workers & Pages** → *Create* → **Pages** → *Connect to Git* →
autorize e selecione este repositório.

**Passo 2.** *Project name:* `consumo-energia` (o domínio fica `consumo-energia.pages.dev`).

**Passo 3.** *Build configuration*:

**Framework preset:** `None`.

**Build command:** vazio (é um site estático, sem build).

**Build output directory:** `/` (raiz do repositório).

**Passo 4.** *Save and Deploy*. O front sobe em `https://consumo-energia.pages.dev`.

### CORS do backend durante o cutover (Render + Cloudflare Pages no ar)

O backend aceita `FRONTEND_URL` com **uma única origem** (comportamento original, default:
`https://consumo-energia-2.web.app`) ou com uma **lista de origens separadas por vírgula**.
Para o período de transição, com o front antigo no Render e o novo no Cloudflare Pages
simultaneamente no ar, configure as duas origens (Render → serviço do backend → Environment):

```text
FRONTEND_URL=https://consumo-energia-2.web.app,https://consumo-energia.pages.dev
```

Com a lista, a resposta CORS reflete a origem da requisição quando ela está na lista (nunca `*`, pois os endpoints usam cookies com `credentials: true`). Origem fora da lista não recebe cabeçalho `Access-Control-Allow-Origin`.

Com um único valor em `FRONTEND_URL`, o comportamento é exatamente o mesmo de antes (origin fixa).

Cookies não mudam: `SameSite=None; Secure` continua igual para as duas origens.

Após o cutover (front do Render desativado), deixe apenas `FRONTEND_URL=https://consumo-energia.pages.dev`.

