// Validates every GraphQL operation in the real-environment test suites against the API's schema
// (mootmaker-webapp#62).
//
// WHY THIS EXISTS. `codegen:check` covers webapp/src only. The acceptance suite at the repository
// root writes its operations by hand, and nothing checked them until a test ran against a deployed
// environment. That already cost #55: six sites still called deleted root fields, and one of them,
// L.90's authorization spot-check, did not fail at all. `data.rooms` came back null, `?? []` made
// it an empty list, and an authorization test passed while asserting nothing.
//
// HOW IT FINDS THEM. Every operation in those suites is written as a gql`...` tagged template (see
// acceptance/tests/support/gql.ts), and this script parses the suites with the TypeScript compiler
// to collect them. It fails on:
//   - a gql template the schema rejects;
//   - a gql template with ${} interpolation, which cannot be checked statically (use variables);
//   - any OTHER string that looks like an operation, so an untagged one cannot slip past unchecked.
//
// WHERE THE SCHEMA COMES FROM. Exactly as codegen.ts: the sibling mootmaker-api checkout when it is
// present, the published @mootmaker/schema package otherwise (CI).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { buildSchema, parse, validate } from 'graphql'
import ts from 'typescript'

const webappDir = resolve(import.meta.dirname, '..')
const repoRoot = resolve(webappDir, '..')
const SUITES = ['acceptance', 'e2e', 'support'].map((dir) => join(repoRoot, dir))

const SIBLING_SCHEMA = join(repoRoot, '../mootmaker-api/api/mootmaker.graphql')
const PUBLISHED_SCHEMA = join(webappDir, 'node_modules/@mootmaker/schema/mootmaker.graphql')
const schemaPath = existsSync(SIBLING_SCHEMA) ? SIBLING_SCHEMA : PUBLISHED_SCHEMA
const schema = buildSchema(readFileSync(schemaPath, 'utf8'))

// An operation keyword, an optional name, optional variable definitions, then the selection set.
// Anchored at the start so prose that merely mentions "query" does not match.
const LOOKS_LIKE_OPERATION = /^\s*(query|mutation|subscription)\b\s*\w*\s*(\([^)]*\))?\s*\{/

function* typeScriptFiles(dir) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'test-output' || name === 'test-results') continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* typeScriptFiles(path)
    else if (name.endsWith('.ts')) yield path
  }
}

const problems = []
let checked = 0

for (const file of SUITES.flatMap((dir) => [...typeScriptFiles(dir)])) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const where = (node) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart())
    return `${relative(repoRoot, file)}:${line + 1}`
  }

  const visit = (node) => {
    if (ts.isTaggedTemplateExpression(node) && node.tag.getText() === 'gql') {
      if (!ts.isNoSubstitutionTemplateLiteral(node.template)) {
        problems.push(`${where(node)}: gql template uses \${} interpolation - pass values as variables`)
      } else {
        checked++
        try {
          for (const error of validate(schema, parse(node.template.text))) {
            problems.push(`${where(node)}: ${error.message}`)
          }
        } catch (error) {
          problems.push(`${where(node)}: ${error.message}`)
        }
      }
      return // its literal is accounted for; do not report it again as untagged
    }
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      LOOKS_LIKE_OPERATION.test(node.text)
    ) {
      problems.push(`${where(node)}: GraphQL operation is not tagged gql\`...\`, so it is not checked`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

console.log(`Schema: ${relative(repoRoot, schemaPath)}`)
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s) with the test suites' GraphQL:\n`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
if (checked === 0) {
  // A guard that finds nothing to check is indistinguishable from a broken guard.
  console.error('Found no gql operations at all - is the script looking in the right place?')
  process.exit(1)
}
console.log(`${checked} operation(s) in the test suites are valid against the schema.`)
