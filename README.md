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

## Frontend no Cloudflare Pages (alternativa)

O frontend pode ser publicado como site estático no Cloudflare Pages. Essa alternativa não foi adotada pela configuração atual do repositório: o frontend permanece no Firebase Hosting e a API na Vercel.

A interface chama `https://consumo-energia-backend.vercel.app` por URL absoluta. Trocar a hospedagem do frontend exige permitir a nova origem em `FRONTEND_URL` no projeto do backend na Vercel. A alternativa não elimina eventuais inicializações a frio da função serverless.

### Configuração do frontend

| Campo | Valor |
|---|---|
| Diretório raiz | Raiz do repositório |
| Framework | Nenhum |
| Comando de build | Vazio |
| Diretório de publicação | `/` |

Conecte o repositório no Cloudflare Pages e use os valores acima. O domínio gerado deve ser usado na configuração de CORS. Nenhuma publicação ou troca de domínio é feita pelos exemplos deste README.

### CORS durante uma troca de hospedagem

O backend aceita uma origem ou uma lista de origens separadas por vírgula em `FRONTEND_URL`. Durante a transição, configure a origem atual e o domínio realmente criado no Pages:

```text
FRONTEND_URL=https://consumo-energia-2.web.app,https://<projeto>.pages.dev
```

A resposta CORS permite somente as origens configuradas, com suporte aos cookies da sessão. Os cookies em produção usam `SameSite=None; Secure`. Atualize as variáveis do backend na Vercel e faça redeploy antes de validar o login no novo frontend.

Após confirmar o funcionamento, mantenha apenas as origens ainda utilizadas. As instruções do ambiente antigo foram preservadas em [Histórico de hospedagem](docs/hospedagem-historica.md).

## Limitações conhecidas

Sem verificação de e-mail e sem recuperação de senha.

Sem rate limiting nas rotas de autenticação.

A simulação mantém um único cenário por usuário (sem histórico).

## Avisos específicos

Os cálculos são **estimativas** baseadas na potência nominal informada e na tarifa definida pelo usuário. Não consideram bandeiras tarifárias, impostos nem o histórico real da unidade consumidora, e não substituem a fatura da distribuidora.

## Autor

Enzo Almeida
