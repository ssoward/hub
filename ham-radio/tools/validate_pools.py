#!/usr/bin/env python3
"""Check ham-radio/data/*.json against what the trainer assumes about it.

Run after build_pools.py, or any time the data is touched:

    python3 ham-radio/tools/validate_pools.py
"""

import collections
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# Deletions the NCVEC published against the current pools. Question numbers are
# never renumbered after a withdrawal, so these ids are permanent holes in the
# sequence and are expected to be absent.
WITHDRAWN = {
    'tech': set(),
    'general': {'G1A04', 'G1C08', 'G1C09', 'G1C10', 'G1E09',
                'G6B09', 'G8C01', 'G9C06', 'G9D13'},
    'extra': {'E2A13', 'E4D05', 'E6D07', 'E9E10'},
}


def main():
    failures = []

    def check(cond, msg):
        if not cond:
            failures.append(msg)

    for key in ('tech', 'general', 'extra'):
        path = os.path.join(ROOT, 'data', key + '.json')
        with open(path, encoding='utf-8') as f:
            pool = json.load(f)

        meta, subs, groups, qs = (pool['meta'], pool['subelements'],
                                  pool['groups'], pool['questions'])
        code = meta['code']

        for field in ('key', 'code', 'name', 'element', 'pool', 'valid',
                      'exam', 'pass', 'revision', 'source'):
            check(field in meta, f'{key}: meta is missing "{field}"')

        ids = [q['id'] for q in qs]
        check(len(set(ids)) == len(ids), f'{key}: duplicate question ids')

        group_ids = {g['id'] for g in groups}
        sub_ids = {s['id'] for s in subs}

        for q in qs:
            where = f'{key} {q["id"]}'
            check(re.fullmatch(rf'{code}\d[A-Z]\d\d', q['id']), f'{where}: malformed id')
            check(q['a'] in 'ABCD', f'{where}: answer is not A-D')
            check(bool(q['q'].strip()), f'{where}: empty question text')
            check(len(q['c']) == 4, f'{where}: {len(q["c"])} choices')
            check(all(c.strip() for c in q['c']), f'{where}: an empty choice')
            check(len(set(q['c'])) == 4, f'{where}: repeated choice text')
            check('<w:' not in q['q'] + ''.join(q['c']), f'{where}: raw docx markup leaked in')
            check(q['id'][:3] in group_ids, f'{where}: group {q["id"][:3]} not declared')
            check(q['id'][:2] in sub_ids, f'{where}: subelement {q["id"][:2]} not declared')
            if 'f' in q:
                fig = os.path.join(ROOT, 'figures', q['f'] + '.png')
                check(os.path.exists(fig), f'{where}: figure {q["f"]}.png is missing')

        # One exam question is drawn from each group, so the exam length must
        # equal the group count -- both per subelement and overall.
        per_group = collections.Counter(q['id'][:3] for q in qs)
        per_sub = collections.Counter(q['id'][:2] for q in qs)
        check(sum(s['exam'] for s in subs) == meta['exam'],
              f'{key}: subelement exam counts sum to '
              f'{sum(s["exam"] for s in subs)}, not {meta["exam"]}')
        check(sum(s['groups'] for s in subs) == len(groups),
              f'{key}: subelement group counts sum to '
              f'{sum(s["groups"] for s in subs)}, not {len(groups)}')
        check(len(groups) == meta['exam'],
              f'{key}: {len(groups)} groups for a {meta["exam"]}-question exam')
        for s in subs:
            check(s['exam'] == s['groups'],
                  f'{key} {s["id"]}: {s["exam"]} exam questions from {s["groups"]} groups')
            check(len([g for g in group_ids if g.startswith(s['id'])]) == s['groups'],
                  f'{key} {s["id"]}: declares {s["groups"]} groups, '
                  f'data has {len([g for g in group_ids if g.startswith(s["id"])])}')
            check(per_sub[s['id']] > 0, f'{key} {s["id"]}: no questions')
        for g in groups:
            check(bool(g['name'].strip()), f'{key} {g["id"]}: no group name')
            check(per_group[g['id']] > 0, f'{key} {g["id"]}: no questions')

        # Numbering runs 01..N inside a group, with published withdrawals the
        # only permitted gaps.
        by_group = collections.defaultdict(set)
        for qid in ids:
            by_group[qid[:3]].add(int(qid[3:]))
        for g, nums in by_group.items():
            gaps = {f'{g}{n:02d}' for n in range(1, max(nums) + 1)} - {
                f'{g}{n:02d}' for n in nums}
            unexpected = gaps - WITHDRAWN[key]
            check(not unexpected, f'{key}: unexplained numbering gaps {sorted(unexpected)}')

        print(f'{key}: {len(qs)} questions, {len(groups)} groups, {len(subs)} subelements, '
              f'{len({q["f"] for q in qs if "f" in q})} figures referenced, '
              f'{meta["exam"]}-question exam (pass {meta["pass"]})')

    # Every figure on disk should be used by some question.
    used = set()
    for key in ('tech', 'general', 'extra'):
        with open(os.path.join(ROOT, 'data', key + '.json'), encoding='utf-8') as f:
            used |= {q['f'] for q in json.load(f)['questions'] if 'f' in q}
    on_disk = {os.path.splitext(n)[0] for n in os.listdir(os.path.join(ROOT, 'figures'))
               if n.endswith('.png')}
    check(not (on_disk - used), f'unused figures: {sorted(on_disk - used)}')
    check(not (used - on_disk), f'missing figures: {sorted(used - on_disk)}')

    if failures:
        print(f'\nFAIL ({len(failures)})')
        for f in failures[:40]:
            print(' -', f)
        return 1
    print('\nOK')
    return 0


if __name__ == '__main__':
    sys.exit(main())
