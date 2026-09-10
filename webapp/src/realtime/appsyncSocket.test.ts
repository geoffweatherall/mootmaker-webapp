import { describe, expect, it } from 'vitest'
import { realtimeUrlFor } from './appsyncSocket'

const HEADER = 'aGVhZGVy'

/**
 * The path differs by host, and both halves were verified against a real AppSync API rather than
 * read from documentation. Getting it wrong does not degrade - the socket never connects at all,
 * and the app silently stops receiving updates while looking perfectly healthy.
 */
describe('realtimeUrlFor', () => {
  it('serves realtime at /graphql/realtime on a custom domain', () => {
    const url = realtimeUrlFor('https://api.example.mootmaker.com/graphql', HEADER)

    expect(url).toContain('wss://api.example.mootmaker.com/graphql/realtime?')
    expect(url).toContain(`header=${HEADER}`)
  })

  it('serves realtime at /graphql on the raw AppSync host, and swaps the subdomain', () => {
    const url = realtimeUrlFor('https://abc123.appsync-api.us-east-1.amazonaws.com/graphql', HEADER)

    expect(url).toContain('wss://abc123.appsync-realtime-api.us-east-1.amazonaws.com/graphql?')
    // Specifically NOT /graphql/realtime here - that is the custom-domain path, and using it
    // against the raw host fails to connect.
    expect(url).not.toContain('/graphql/realtime')
  })

  it('always carries an encoded payload parameter, which AppSync requires', () => {
    const url = realtimeUrlFor('https://api.example.mootmaker.com/graphql', HEADER)

    expect(url).toContain(`payload=${btoa('{}')}`)
  })
})
