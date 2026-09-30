"""Summarise test-output/results.json: per scenario x method x view, how often each transient was painted."""
import json
import statistics
import sys
from collections import defaultdict

results = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'test-output/results.json'))

groups = defaultdict(list)
for r in results:
    groups[(r['scenario'], r['method'])].append(r)

for (scenario, method), runs in groups.items():
    errors = [r['error'] for r in runs if r.get('error')]
    print(f"\n=== {scenario} [{method}]  reps={len(runs)}" + (f"  ERRORS={len(errors)}: {errors[0][:150]}" if errors else ''))
    views = defaultdict(list)
    for r in runs:
        for v in r['views']:
            views[v['view']].append(v)
    for view, vs in views.items():
        by_key = defaultdict(list)
        for v in vs:
            for t in v['transientsPainted']:
                if t['key'].startswith('watch:') and t['key'] != 'watch:any':
                    continue
                by_key[t['key']].append(t)
        parts = []
        for key, ts in sorted(by_key.items()):
            durs = [t['durationMs'] for t in ts]
            unfinished = sum(1 for d in durs if d < 0)
            finished = [d for d in durs if d >= 0]
            prog = sum(1 for t in ts if t['progressShown'])
            eg = ts[0]
            parts.append(
                f"{key} {eg['before']}->{eg['extreme']}->{eg['after']} in {len(ts)}/{len(vs)}"
                + (f" median {int(statistics.median(finished))}ms" if finished else '')
                + (f" UNSETTLED x{unfinished}" if unfinished else '')
                + f" progress {prog}/{len(ts)}"
            )
        finals = []
        for v in vs:
            f = {k.replace('watch:', '').split(' ')[-1] if k.startswith('watch:') else k: n for k, n in v['finalSig'].items() if k != 'progress'}
            finals.append(f)
        final_str = json.dumps(finals[0]) if all(f == finals[0] for f in finals) else ' | '.join(json.dumps(f) for f in finals)
        bc = [v['broadcastAfterMs'] for v in vs]
        print(f"  {view:15} {'; '.join(parts) if parts else 'clean'}")
        print(f"  {'':15} final {final_str}  bcast {bc}")
