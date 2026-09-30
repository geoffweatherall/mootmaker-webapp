import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { book, meetingById, requireEnv, respond, rooms, signIn, sleep, updateMeeting, type Booked } from './harness'

/**
 * Investigation: what happens to an edit form that is open while someone else changes the same
 * meeting. updateMeeting is a full field replacement, so the question is whether the form's save
 * silently puts back what the other change took away.
 */

function localDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('concurrent edits', async ({ browser }) => {
  const outDir = `${process.cwd()}/test-output/concurrent`
  mkdirSync(outDir, { recursive: true })
  const A = await signIn(browser, 'A', requireEnv('E2E_USER_EMAIL'), requireEnv('E2E_USER_PASSWORD'))
  // The same person on a second device.
  const A2 = await signIn(browser, 'A2', requireEnv('E2E_USER_EMAIL'), requireEnv('E2E_USER_PASSWORD'))
  const B = await signIn(browser, 'B', requireEnv('PROBE_B_EMAIL'), requireEnv('PROBE_B_PASSWORD'))
  const allRooms = await rooms(A)
  const date = localDate(1)

  const openForm = async (m: Booked) => {
    await A.page.goto(`/meetings/${m.id}/edit`)
    await expect(A.page.getByLabel('Subject')).toHaveValue(m.subject, { timeout: 30_000 })
  }
  const saveWithNewSubject = async (subject: string) => {
    await A.page.getByLabel('Subject').fill(subject)
    await A.page.getByRole('button', { name: 'Save' }).click()
    await A.page.waitForURL(/\/availability/, { timeout: 30_000 }).catch(() => {})
  }

  // 1. Second device removes an attendee while the first device's form is open.
  {
    const tag = `Probe concurrent-1-${Date.now() % 100000}`
    const m = await book(A, allRooms, date, tag, [B.personId], 3)
    await openForm(m)
    const errors = await updateMeeting(A2, m.id, {
      roomId: m.roomId, organiserId: m.organiserId, attendeeIds: [], subject: m.subject,
      startTime: m.startTime, endTime: m.endTime,
    })
    expect(errors).toEqual([])
    await sleep(6_000)
    await A.page.screenshot({ path: `${outDir}/1-form-after-other-device-removed-attendee.png`, fullPage: true })
    const attendeesShownInForm = await A.page.getByLabel('Attendees').locator('xpath=ancestor::*[contains(@class,"MuiAutocomplete-root")][1]').innerText()
    await saveWithNewSubject(`${tag} renamed`)
    await A.page.screenshot({ path: `${outDir}/1-after-save.png` })
    const after = await meetingById(A, m.id)
    console.log(`1. form still showed attendees: ${JSON.stringify(attendeesShownInForm)}`)
    console.log(`   after save: subject=${after?.subject} attendees=${JSON.stringify(after?.attendees.map((x) => x.person.id))}`)
    console.log(`   B (${B.personId}) was removed by the other device; back after save? ${after?.attendees.some((x) => x.person.id === B.personId)}`)
  }

  // 2. Second device moves the meeting 30 minutes later while the form is open.
  {
    const tag = `Probe concurrent-2-${Date.now() % 100000}`
    const m = await book(A, allRooms, date, tag, [B.personId], 9)
    await openForm(m)
    const later = (t: string) =>
      t.replace(/T(\d\d):(\d\d)/, (_s, h, mm) => {
        const minutes = Number(h) * 60 + Number(mm) + 30
        return `T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
      })
    const errors = await updateMeeting(A2, m.id, {
      roomId: m.roomId, organiserId: m.organiserId, attendeeIds: m.attendeeIds, subject: m.subject,
      startTime: later(m.startTime), endTime: later(m.endTime),
    })
    console.log(`2. other device's move: ${errors.length ? errors.join(',') : 'ok'} (${m.startTime} -> ${later(m.startTime)})`)
    await sleep(6_000)
    await A.page.screenshot({ path: `${outDir}/2-form-after-other-device-moved-it.png`, fullPage: true })
    await saveWithNewSubject(`${tag} renamed`)
    await A.page.screenshot({ path: `${outDir}/2-after-save.png` })
    const after = await meetingById(A, m.id)
    console.log(`   after save: subject=${after?.subject} start=${after?.startTime}  (move kept? ${after?.startTime === later(m.startTime)})`)
  }

  // 3. An attendee responds while the organiser's form is open.
  {
    const tag = `Probe concurrent-3-${Date.now() % 100000}`
    const m = await book(A, allRooms, date, tag, [B.personId], 15)
    await openForm(m)
    expect(await respond(B, m.id, 'NotGoing')).toEqual([])
    await sleep(6_000)
    await saveWithNewSubject(`${tag} renamed`)
    const after = await meetingById(A, m.id)
    console.log(`3. B responded NotGoing while A's form was open; after A's save B's status = ${after?.attendees.find((x) => x.person.id === B.personId)?.status}`)
  }

  // 4. The meeting is cancelled (by the second device) while the form is open.
  {
    const tag = `Probe concurrent-4-${Date.now() % 100000}`
    const m = await book(A, allRooms, date, tag, [B.personId], 21)
    await openForm(m)
    const { cancelMeeting } = await import('./harness')
    expect(await cancelMeeting(A2, m.id)).toEqual([])
    await sleep(6_000)
    await A.page.screenshot({ path: `${outDir}/4-form-after-cancel-elsewhere.png`, fullPage: true })
    await A.page.getByLabel('Subject').fill(`${tag} renamed`)
    await A.page.getByRole('button', { name: 'Save' }).click()
    await sleep(4_000)
    await A.page.screenshot({ path: `${outDir}/4-after-save.png`, fullPage: true })
    console.log(`4. url after save: ${A.page.url()}; meeting now: ${JSON.stringify(await meetingById(A, m.id))}`)
  }
})
