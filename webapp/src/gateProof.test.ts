import { describe, expect, it } from 'vitest'

// Temporary. Deliberately fails, to prove that branch protection actually blocks a merge
// rather than merely running the check (see the Definition of done in
// mootmaker/designs/ci-cd-pipeline.md). This file is never merged - the PR carrying it is
// closed once the block is confirmed.
describe('required check gate', () => {
  it('deliberately fails', () => {
    expect(1).toBe(2)
  })
})
