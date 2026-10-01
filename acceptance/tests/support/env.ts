/** Every value the suite needs is exported by acceptance/run.sh from SSM; see deploy/ssm-config.sh. */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set - run the suite through acceptance/run.sh, which sets it.`)
  }
  return value
}

/** Unique enough to keep one run's names apart from another's in the same environment. */
export function uniqueId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 10_000)}`
}
