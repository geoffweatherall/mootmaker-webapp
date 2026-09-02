import type { CodegenConfig } from '@graphql-codegen/cli'

/**
 * Generates typed GraphQL operations from the API's schema, replacing the hand-maintained
 * `src/graphql/types.ts` mirror that nothing enforced.
 *
 * Where the schema comes from (see mootmaker/designs/graphql-schema-sharing.md, Decision 7):
 *
 * - **Locally**, the sibling `mootmaker-api` checkout. The sibling layout is already mandated by
 *   this project (deploy.sh resolves `../mootmaker-api` today), so developing against an
 *   in-progress schema change needs no publish round trip and no install step. `npm link` was
 *   considered and rejected: it is global machine state invisible to the repository, which any
 *   later `npm install` silently reverts.
 * - **In CI**, the published package, because a runner checks out one repository and the sibling
 *   path does not exist there.
 *
 * One differing value, chosen by whether the sibling path is actually present, so neither case
 * needs a flag remembered by a human.
 */
import { existsSync } from 'node:fs'

const SIBLING_SCHEMA = '../../mootmaker-api/api/mootmaker.graphql'
const PUBLISHED_SCHEMA = 'node_modules/@mootmaker/schema/mootmaker.graphql'

const schema = existsSync(SIBLING_SCHEMA) ? SIBLING_SCHEMA : PUBLISHED_SCHEMA

const config: CodegenConfig = {
  schema,
  documents: ['src/**/*.ts', 'src/**/*.tsx', '!src/graphql/generated/**'],
  ignoreNoDocuments: true,
  generates: {
    'src/graphql/generated/': {
      preset: 'client',
      presetConfig: {
        // The operations live in queries.ts/mutations.ts as gql`` documents and are imported by
        // name; fragment masking would require every call site to unwrap results through
        // useFragment, which is a much larger change for no benefit at this size.
        fragmentMasking: false,
      },
      config: {
        // The API's scalars are plain strings (ISO-8601 local date-times with no offset - see the
        // schema's own field docs), so mapping them to anything cleverer would misrepresent them.
        scalars: { ID: 'string' },
        // This project compiles with verbatimModuleSyntax, which rejects a value import used only
        // as a type - so the generated files have to import TypedDocumentNode as `import type`.
        useTypeImports: true,
      },
    },
  },
}

export default config
