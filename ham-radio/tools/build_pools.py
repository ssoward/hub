#!/usr/bin/env python3
"""Build ham-radio/data/*.json and ham-radio/figures/*.png from the NCVEC pools.

The FCC amateur radio question pools are published by the NCVEC Question Pool
Committee as Word documents (plus a separate PDF of the diagrams), and each
pool is replaced on a rolling four-year cycle. This script fetches the current
documents, converts them to the JSON the trainer loads, and crops one PNG per
figure out of the diagram PDFs.

Usage:
    python3 ham-radio/tools/build_pools.py            # fetch + build everything
    python3 ham-radio/tools/build_pools.py --keep-work # leave the downloads in place

When a pool rolls over (Technician 2030, General 2027, Extra 2028), update the
URLs and the metadata in POOLS below and re-run. Everything else should hold:
the document format has been stable across pools.

Requires: Pillow (figures) and pdftoppm from poppler (`brew install poppler`).
"""

import argparse
import collections
import html
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                      # ham-radio/
DATA = os.path.join(ROOT, 'data')
FIGS = os.path.join(ROOT, 'figures')
WORK = os.path.join(HERE, '.work')

# ---------------------------------------------------------------------------
# Pool definitions. `doc` and `figs` are the NCVEC download URLs; `figure_map`
# says which figure sits where on each page of the diagram PDF ('TL'/'TR'/'BL'/
# 'BR' quadrants, or 'FULL' for a page holding a single figure).
# ---------------------------------------------------------------------------
POOLS = {
    'tech': {
        'meta': {
            'key': 'tech', 'code': 'T', 'name': 'Technician',
            'element': 'Element 2', 'pool': '2026-2030',
            'valid': 'July 1, 2026 - June 30, 2030',
            'exam': 35, 'pass': 26,
            'revision': 'Public release Feb 19, 2026',
            'source': 'https://ncvec.org/index.php/2026-2030-technician-question-pool',
        },
        'doc': 'https://ncvec.org/downloads/'
               '2026-2030 Technician Pool and Syllabus Public Release Feb 19 2026.docx',
        'figs': 'https://ncvec.org/downloads/TECH_2026/'
                '2026-2030 Technician Pool 3 Diagrams.pdf',
        'figure_map': {1: {'FULL': 'T-1'}, 2: {'FULL': 'T-2'}, 3: {'FULL': 'T-3'}},
        'figs_dpi': 300,
    },
    'general': {
        'meta': {
            'key': 'general', 'code': 'G', 'name': 'General',
            'element': 'Element 3', 'pool': '2023-2027',
            'valid': 'July 1, 2023 - June 30, 2027',
            'exam': 35, 'pass': 26,
            'revision': 'Public release with 6th errata, Feb 4, 2026',
            'source': 'https://ncvec.org/index.php/2023-2027-general-question-pool-release',
        },
        'doc': 'https://ncvec.org/downloads/'
               'General Class Pool and Syllabus 2023-2027 Public Release with 6th Errata Feb 4 2026.docx',
        'figs': 'http://www.ncvec.org/downloads/G7-1.pdf',
        'figure_map': {1: {'FULL': 'G7-1'}},
        'figs_dpi': 220,
    },
    'extra': {
        'meta': {
            'key': 'extra', 'code': 'E', 'name': 'Amateur Extra',
            'element': 'Element 4', 'pool': '2024-2028',
            'valid': 'July 1, 2024 - June 30, 2028',
            'exam': 50, 'pass': 37,
            'revision': 'Public release with 4th errata, Feb 4, 2026',
            'source': 'https://ncvec.org/index.php/2024-2028-extra-class-question-pool-release',
        },
        'doc': 'https://ncvec.org/downloads/'
               '2024-2028 Extra Class Question Pool and Syllabus Public Release with 4th Errata Feb 4 2026.docx',
        'figs': 'http://www.ncvec.org/downloads/Extra_Figures_2024-2028-1.pdf',
        'figure_map': {
            1: {'TL': 'E5-1', 'TR': 'E6-1', 'BL': 'E6-2', 'BR': 'E6-3'},
            2: {'TL': 'E7-1', 'TR': 'E7-2', 'BL': 'E7-3'},
            3: {'TL': 'E9-1', 'TR': 'E9-2', 'BL': 'E9-3'},
        },
        'figs_dpi': 220,
    },
}

# ---------------------------------------------------------------------------
# docx -> text
# ---------------------------------------------------------------------------

def docx_to_text(path):
    """Flatten a .docx to one line per paragraph."""
    xml = zipfile.ZipFile(path).read('word/document.xml').decode('utf-8')
    # Literal newlines in the XML would otherwise split a run mid-tag.
    xml = xml.replace('\r', '').replace('\n', '')
    xml = xml.replace('</w:p>', '\n').replace('<w:br/>', '\n').replace('<w:tab/>', '\t')
    # Drop self-closing tags: <w:t/> would read as an opening <w:t> below and
    # the lazy match would swallow every tag up to the next real </w:t>.
    xml = re.sub(r'<[^>]*/>', '', xml)
    out = []
    for chunk in xml.split('\n'):
        # `<w:t(?:\s...)?>` and not `<w:t[^>]*>`, which also matches <w:tabs>.
        out.append(''.join(re.findall(r'<w:t(?:\s[^>]*)?>(.*?)</w:t>', chunk, re.S)))
    return html.unescape('\n'.join(out))

# ---------------------------------------------------------------------------
# text -> questions
# ---------------------------------------------------------------------------

Q_RE = re.compile(r'^([TGE]\d[A-Z]\d\d)\s*\(([A-D])\)\s*(?:\[(.+?)\])?\s*$')
ANS_RE = re.compile(r'^([A-D])\.\s*(\S.*)$')
SUB_RE = re.compile(r'^SUBELEMENT\s+([TGE]\d)\s*[-–—]\s*(.+?)\s*[-–—]?\s*'
                    r'\[(\d+)\s+exam questions?\s*[-–—]\s*(\d+)\s+groups?\]', re.I)
GRP_RE = re.compile(r'^([TGE]\d[A-Z])\s+(\S.+)$')
FIG_RE = re.compile(r'[Ff]igure\s+([TGE]\d?-?\d)')


def syllabus_key(ident):
    """Sort key putting subelement 0 (safety) last, as the syllabus does.

    Question ids look like T1A01: class letter, subelement digit, group letter,
    number. Plain string order would file T0 (safety) ahead of T1, so the exam,
    the deck picker, and the browse list would all open on the safety rules.
    """
    digit = ident[1]
    return (10 if digit == '0' else int(digit), ident[2:])


SMALL_WORDS = {'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor',
               'of', 'on', 'or', 'the', 'to', 'vs', 'with'}
ACRONYMS = {'rf', 'hf', 'vhf', 'uhf', 'ac', 'dc', 'fcc', 'id', 'tv', 'emi', 'ic'}


def title_case(s):
    """Title-case the ALL-CAPS subelement names from the documents.

    str.title() would produce "Commission'S Rules" and "Antennas And Feed
    Lines", so capitalize only the first letter of each word and keep the
    small connecting words lowercase unless they lead.
    """
    words = s.split()
    out = []
    for i, w in enumerate(words):
        low = w.lower()
        if low in ACRONYMS:
            out.append(low.upper())
        elif i and low in SMALL_WORDS:
            out.append(low)
        else:
            out.append(low[:1].upper() + low[1:])
    return ' '.join(out)


def norm(s):
    s = (s.replace('’', "'").replace('‘', "'")
          .replace('“', '"').replace('”', '"')
          .replace(' ', ' '))
    return re.sub(r'\s+', ' ', s).strip()


def parse_pool(text):
    lines = [l.rstrip() for l in text.split('\n')]
    # Each document opens with errata sections that quote whole revised
    # questions, then a syllabus, then the pool itself. Only the pool body may
    # be parsed for questions, and it starts at the LAST "SUBELEMENT ?1" header.
    starts = [n for n, l in enumerate(lines)
              if re.match(r'^SUBELEMENT\s+[TGE]1\s*[-–—]', l.strip())]
    if not starts:
        raise SystemExit('could not find the pool body')
    head, body = lines[:starts[-1]], lines[starts[-1]:]

    subs, groups, questions = {}, {}, []

    def take_subelement(line):
        m = SUB_RE.match(line)
        if m:
            subs.setdefault(m.group(1), {
                'id': m.group(1), 'name': title_case(norm(m.group(2))),
                'exam': int(m.group(3)), 'groups': int(m.group(4)),
            })

    # The syllabus headers carry the same counts as the body headers, and the
    # syllabus is where subelement names are spelled out in full.
    for line in head:
        take_subelement(line.strip())

    i = 0
    while i < len(body):
        line = body[i].strip()
        take_subelement(line)

        m = Q_RE.match(line)
        if m:
            qid, ans, refs = m.group(1), m.group(2), m.group(3)
            i += 1
            qtext = []
            while i < len(body) and not ANS_RE.match(body[i].strip()):
                if body[i].strip():
                    qtext.append(body[i].strip())
                i += 1
            choices = {}
            while i < len(body):
                s = body[i].strip()
                am = ANS_RE.match(s)
                if am:
                    letter, parts = am.group(1), [am.group(2)]
                    i += 1
                    while i < len(body):  # wrapped choice text
                        nxt = body[i].strip()
                        if not nxt or nxt == '~~' or ANS_RE.match(nxt) or Q_RE.match(nxt):
                            break
                        parts.append(nxt)
                        i += 1
                    choices[letter] = norm(' '.join(parts))
                elif s == '~~':
                    i += 1
                    break
                elif not s:
                    i += 1
                else:
                    break
            if len(choices) != 4:
                raise SystemExit(f'{qid}: expected 4 choices, got {sorted(choices)}')
            q = norm(' '.join(qtext))
            rec = {'id': qid, 'a': ans, 'q': q,
                   'c': [choices[l] for l in 'ABCD']}
            if refs:
                rec['r'] = norm(refs)
            fm = FIG_RE.search(q + ' ' + ' '.join(choices.values()))
            if fm:
                fig = fm.group(1)
                if '-' not in fig and len(fig) == 3:   # "E73" typo for E7-3
                    fig = fig[:2] + '-' + fig[2]
                rec['f'] = fig
            questions.append(rec)
            continue

        gm = GRP_RE.match(line)
        if gm and re.fullmatch(r'[TGE]\d[A-Z]', gm.group(1)):
            groups.setdefault(gm.group(1), {'id': gm.group(1), 'name': norm(gm.group(2))})
        i += 1

    return subs, groups, questions

# ---------------------------------------------------------------------------
# figures
# ---------------------------------------------------------------------------

def build_figures(pdf, figure_map, dpi):
    from PIL import Image

    def render(page):
        out = os.path.join(WORK, 'page')
        subprocess.run(['pdftoppm', '-r', str(dpi), '-f', str(page), '-l', str(page),
                        '-png', '-singlefile', pdf, out], check=True)
        return Image.open(out + '.png').convert('RGB')

    def trim(img, pad=16):
        mask = img.convert('L').point(lambda v: 255 if v < 240 else 0)
        box = mask.getbbox()
        if not box:
            return img
        w, h = img.size
        return img.crop((max(0, box[0] - pad), max(0, box[1] - pad),
                         min(w, box[2] + pad), min(h, box[3] + pad)))

    written = []
    for page, spots in figure_map.items():
        im = render(page)
        W, H = im.size
        for spot, name in spots.items():
            if spot == 'FULL':
                crop = im
            else:
                # Quadrant layout under a title band, inset off the printed
                # divider lines between quadrants.
                ys = (int(H * 0.14), int(H * 0.53)) if spot[0] == 'T' else (int(H * 0.56), H)
                xs = (0, int(W * 0.48)) if spot[1] == 'L' else (int(W * 0.52), W)
                crop = im.crop((xs[0], ys[0], xs[1], ys[1]))
            crop = trim(crop).convert('L')
            if crop.width > 900:
                crop = crop.resize((900, round(crop.height * 900 / crop.width)),
                                   Image.LANCZOS)
            path = os.path.join(FIGS, name + '.png')
            crop.save(path, optimize=True)
            written.append(name)
    return written

# ---------------------------------------------------------------------------

def fetch(url, dest):
    if os.path.exists(dest):
        return dest
    safe = urllib.parse.quote(url, safe=':/?&=%')
    print(f'  fetching {os.path.basename(dest)}')
    # ncvec.org answers 403 to the default urllib agent.
    req = urllib.request.Request(safe, headers={
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': '*/*',
    })
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, 'wb') as f:
        shutil.copyfileobj(r, f)
    return dest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--keep-work', action='store_true',
                    help='keep the downloaded NCVEC documents in tools/.work')
    ap.add_argument('--pools', nargs='*', choices=sorted(POOLS), default=sorted(POOLS))
    args = ap.parse_args()

    os.makedirs(WORK, exist_ok=True)
    os.makedirs(DATA, exist_ok=True)
    os.makedirs(FIGS, exist_ok=True)

    for key in args.pools:
        spec = POOLS[key]
        print(f'{key}:')
        doc = fetch(spec['doc'], os.path.join(WORK, key + '.docx'))
        subs, groups, questions = parse_pool(docx_to_text(doc))

        seen = collections.Counter(q['id'] for q in questions)
        dupes = [q for q, n in seen.items() if n > 1]
        if dupes:
            raise SystemExit(f'{key}: duplicate question ids {dupes}')
        used = sorted({q['id'][:3] for q in questions})
        missing = [g for g in used if g not in groups]
        if missing:
            raise SystemExit(f'{key}: no group heading for {missing}')

        pdf = fetch(spec['figs'], os.path.join(WORK, key + '-figs.pdf'))
        figs = build_figures(pdf, spec['figure_map'], spec['figs_dpi'])
        referenced = sorted({q['f'] for q in questions if 'f' in q})
        unknown = [f for f in referenced if f not in figs]
        if unknown:
            raise SystemExit(f'{key}: questions reference missing figures {unknown}')

        out = {
            'meta': spec['meta'],
            'subelements': [subs[s] for s in sorted(subs, key=syllabus_key)],
            'groups': [groups[g] for g in sorted(used, key=syllabus_key)],
            'questions': sorted(questions, key=lambda q: syllabus_key(q['id'])),
        }
        path = os.path.join(DATA, key + '.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(out, f, separators=(',', ':'), ensure_ascii=False)
        print(f'  {len(questions)} questions, {len(used)} groups, '
              f'{len(subs)} subelements, figures {figs} -> {os.path.relpath(path, ROOT)}')

    if not args.keep_work:
        shutil.rmtree(WORK, ignore_errors=True)
    print('done')


if __name__ == '__main__':
    sys.exit(main())
