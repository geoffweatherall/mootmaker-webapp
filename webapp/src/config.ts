// The single place every other module reads runtime config from - see vite-env.d.ts for why this
// comes from `window.__MOOTMAKER_CONFIG__` rather than `import.meta.env`.
export const runtimeConfig: MootmakerRuntimeConfig = window.__MOOTMAKER_CONFIG__
