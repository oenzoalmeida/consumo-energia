# Consumo de Energia 2.0

Aplicação web para simular consumo de energia elétrica, estimar custos e comparar aparelhos, com autenticação, persistência por usuário e painel administrativo.

## Demonstração

**Aplicação:** https://consumo-energia-2.web.app

## Credencial demo

> **Nota:** as credenciais abaixo são públicas para fins de demonstração. Os dados da conta demo podem ser alterados por outros visitantes.

| Perfil | E-mail | Senha |
|---|---|---|
| Usuário | `demo@consumoenergia.app` | `ConsumoEnergia@2026` |

O acesso administrativo é interno e não possui credencial pública.

## Sobre

Evolução de um projeto acadêmico de cálculo de consumo de energia. O usuário cadastra aparelhos (potência, horas e dias de uso) e a tarifa, e o sistema estima consumo mensal em kWh, custo e projeção anual, com classificação por faixas de consumo.

## Funcionalidades principais

- Cadastro e login de usuários com sessão por cookie HttpOnly.
- Cadastro de aparelhos e tarifa por usuário.
- Estimativa de consumo (kWh), custo mensal e projeção anual.
- Classificação do consumo e destaque do maior consumidor.
- Dados salvos por usuário (um cenário por conta).
- Painel administrativo de gestão de contas.
- Exclusão definitiva da conta pela própria interface.

## Tecnologias

**Frontend:** HTML5, CSS3, JavaScript.

**Backend:** Node.js, Express, JWT.

**Banco de dados:** PostgreSQL (Neon).

**Infraestrutura:** Firebase Hosting (frontend) + Vercel (backend serverless).

## Perfis de acesso

**Usuário (USER):** gerencia a própria simulação e pode excluir a própria conta.

**Administrador (ADMIN):** lista contas e ativa/desativa usuários. Credencial não pública.

## Segurança e privacidade

Senhas com hash scrypt (sal aleatório) e comparação em tempo constante. Nenhum segredo de produção versionado.

Sessão por JWT em cookie HttpOnly/Secure/SameSite. CORS restrito ao domínio do frontend.

Consultas SQL parametrizadas. Saídas do frontend escapadas.

Sem analytics, rastreamento ou cookies de terceiros (apenas o cookie de sessão).

Termos de Uso e Política de Privacidade disponíveis na aplicação.

## Executando localmente

O backend requer `DATABASE_URL` e `JWT_SECRET`. As variáveis `PORT` e `FRONTEND_URL` são opcionais.

```bash
cd backend
npm install
npm start
```

Frontend: abra `index.html` via um servidor estático local. A URL da API é definida em `auth.js` (`const API`). Ajuste esse valor se necessário.

## Testes

O CI verifica a sintaxe dos arquivos JavaScript (`node --check`) e a integridade dos arquivos essenciais. Não há suíte de testes automatizados funcionais.

## Deploy

**Frontend:** Firebase Hosting (`https://consumo-energia-2.web.app`).

**Backend:** função serverless Node na Vercel (`https://consumo-energia-backend.vercel.app`).

**Banco:** PostgreSQL gerenciado no Neon.

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

## Limitações conhecidas

Sem verificação de e-mail e sem recuperação de senha.

Sem rate limiting nas rotas de autenticação.

A simulação mantém um único cenário por usuário (sem histórico).

## Avisos específicos

Os cálculos são **estimativas** baseadas na potência nominal informada e na tarifa definida pelo usuário. Não consideram bandeiras tarifárias, impostos nem o histórico real da unidade consumidora, e não substituem a fatura da distribuidora.

## Autor

Enzo Almeida
