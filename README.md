# mootmaker-webapp

The web app for [Mootmaker](https://github.com/geoffweatherall/mootmaker): a React single-page app that
signs users in with Cognito and talks to [mootmaker-api](https://github.com/geoffweatherall/mootmaker-api)'s
GraphQL API straight from the browser. It is served as static files from S3 behind CloudFront, so like
the rest of the system it costs nothing while idle.

It also publishes `mobile-config.json`, which the Android app reads to find an environment's API. How
the web app fits into the whole system is in the hub's
[system overview](https://github.com/geoffweatherall/mootmaker/blob/main/docs/overview/system.md).

| Read | For |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Code layout, routes, auth, the Apollo cache and live updates, UI rules every page follows, hosting |
| [testing-strategy.md](testing-strategy.md) | Unit, mocked integration and acceptance tests |
| [acceptance/README.md](acceptance/README.md) | Writing and running acceptance tests against a deployed environment |

## Layout

| Path | What |
|---|---|
| `webapp/` | The app: React 19, TypeScript, MUI 9, Apollo Client 4, Vite. Its own `package.json`, with its unit tests (`src/**/*.test.ts`) and mocked integration tests (`tests/`) |
| `acceptance/` | Playwright tests against a real deployed environment, and `test-cases/`, a designed test case for every use case |
| `support/` | Helpers for the acceptance suite, such as creating confirmed Cognito accounts |
| `deploy/terraform/` | The S3 bucket, CloudFront distribution, certificate and DNS record for one environment |
| `deploy/ssm-config.sh` | Reads an environment's API settings from SSM, for the deploy and the acceptance runner |
| `deploy/verify-schema-compatibility.sh` | Refuses to deploy against an API that does not serve the fields this build uses |
| `deploy.sh`, `undeploy.sh` | Deploy and remove one environment |

There are two `package.json` files: the repository root (the acceptance suite) and `webapp/` (the app).
Run `npm install` in both.

## Running it locally

```bash
cd webapp
npm install
cp .env.example .env     # fill in from SSM: /mootmaker/<env>/api/graphql-url, cognito/user-pool-id,
                         # cognito/webapp-client-id, demo-user/email, demo-user/password
npm run dev              # http://localhost:5173 against that environment's API
npm run dev:mock         # or against the mocked API and mocked Cognito the integration tests use
```

| Command (in `webapp/`) | Does |
|---|---|
| `npm run build` | Typecheck and build `dist/`. The build holds no configuration; it works for any environment |
| `npm run lint` | oxlint |
| `npm run test:unit` | Vitest unit tests |
| `npm run test:integration` | Playwright against the mocked API |
| `npm run codegen` | Regenerate `src/graphql/generated/` from the API schema. Run after changing any operation |

## Deploying

```bash
./deploy.sh <env>                # build, apply Terraform, upload, invalidate CloudFront
./deploy.sh <env> --skip-build   # deploy the existing webapp/dist (the release does this)
./undeploy.sh <env>              # remove it; prompts. --yes skips the prompt and refuses test and production
```

The API must already be deployed to the environment: the deploy reads its settings from SSM, refuses
to deploy if the API does not serve the schema this build was compiled against, and writes
`env-config.js` and `mobile-config.json` next to the site. Hostnames are `www.<env>.mootmaker.com`, or
`www.mootmaker.com` for `production`, which changes only through a
[release](https://github.com/geoffweatherall/mootmaker/blob/main/docs/overview/delivery.md).

## Testing

```bash
cd webapp && npm run test:unit && npm run test:integration
./acceptance/run.sh          # from the repository root: a fresh environment, the suite, teardown
./acceptance/run.sh <env>    # or against an environment you already have
```

See [testing-strategy.md](testing-strategy.md). When something is wrong in a deployed environment,
start from the hub's [runbooks](https://github.com/geoffweatherall/mootmaker/blob/main/docs/runbooks/README.md).
