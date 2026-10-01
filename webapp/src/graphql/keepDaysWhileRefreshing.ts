/**
 * Keeps showing a day's last-known meetings while that day is being refetched.
 *
 * When another client changes a day (or this tab returns to the foreground, or reconnects), the
 * day is evicted from the cache and refetched - see realtime/useDaysInvalidated.ts. Until the
 * refetch lands, a multi-day query reads back *complete, minus that day*: the day simply vanishes
 * from `workspace.days`. Home and Person Calendar rendered exactly that, blanking the day's
 * meetings for a second or two on every live update (mootmaker-webapp#136), against the README's
 * "Progress indicators" rule: keep the last-known content up, with the progress bar over it.
 *
 * So while the query is loading, any requested day missing from `data` but present in
 * `previousData` is kept from `previousData`. Once loading settles, `data` is returned as is - by
 * then it holds every requested day the server has.
 */
export function keepDaysWhileRefreshing<
  Day extends { date: string },
  Data extends { workspace: { days: readonly Day[] } },
>(data: Data | undefined, previousData: Data | undefined, loading: boolean, requestedDates: readonly string[]): Data | undefined {
  if (!loading || !data || !previousData) return data
  const present = new Set(data.workspace.days.map((day) => day.date))
  const requested = new Set(requestedDates)
  const kept = previousData.workspace.days.filter((day) => requested.has(day.date) && !present.has(day.date))
  if (kept.length === 0) return data
  return { ...data, workspace: { ...data.workspace, days: [...data.workspace.days, ...kept] } }
}
