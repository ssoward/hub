/* ============================================================
   ham.js — Ham Radio Exam Trainer

   Three modes over one question pool: flash cards with a Leitner-box
   scheduler, a full-length practice exam built the way a real one is
   (one question drawn from each question group), and a browsable pool.

   Progress lives in localStorage under HAM_KEY, keyed by license class:
     { tech: { q: { T1A01: {b,n,w,s}, ... }, exams: [ {d,score,total,ms} ] } }
   where b = Leitner box (0-5), n = times answered, w = times missed,
   s = starred. Nothing leaves the browser.
   ============================================================ */
(function () {
  'use strict';

  var HAM_KEY = 'hamradio.v1';
  var POOL_KEYS = ['tech', 'general', 'extra'];
  var MASTERED_BOX = 4;              // box 4+ counts as mastered
  var MAX_BOX = 5;
  var BOX_WEIGHT = [6, 5, 4, 3, 2, 1];   // lower boxes come up more often
  var UNSEEN_WEIGHT = 4;

  // ---------------------------------------------------------------- helpers

  function h(tag, attrs, kids) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'onclick') node.addEventListener('click', v);
        else if (k === 'onchange') node.addEventListener('change', v);
        else if (k === 'oninput') node.addEventListener('input', v);
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      });
    }
    (kids || []).forEach(function (kid) {
      if (kid === null || kid === undefined || kid === false) return;
      node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    });
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function fmtDuration(ms) {
    var s = Math.round(ms / 1000);
    var m = Math.floor(s / 60);
    return m + 'm ' + String(s % 60).padStart(2, '0') + 's';
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString(undefined,
      { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ------------------------------------------------------------ persistence

  var store = load();

  function load() {
    try {
      var raw = localStorage.getItem(HAM_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      POOL_KEYS.forEach(function (k) {
        if (!parsed[k] || typeof parsed[k] !== 'object') parsed[k] = {};
        if (!parsed[k].q || typeof parsed[k].q !== 'object') parsed[k].q = {};
        if (!Array.isArray(parsed[k].exams)) parsed[k].exams = [];
      });
      return parsed;
    } catch (e) {
      // Private-mode browsers can throw on access; study without persistence.
      var empty = {};
      POOL_KEYS.forEach(function (k) { empty[k] = { q: {}, exams: [] }; });
      return empty;
    }
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(HAM_KEY, JSON.stringify(store)); } catch (e) { /* full or blocked */ }
    }, 250);
  }

  function progress() { return store[app.poolKey].q; }

  function recordOf(id) {
    var p = progress();
    if (!p[id]) p[id] = { b: 0, n: 0, w: 0, s: 0 };
    return p[id];
  }

  function grade(id, correct) {
    var r = recordOf(id);
    r.n++;
    if (correct) {
      r.b = Math.min(MAX_BOX, (r.b || 0) + 1);
    } else {
      r.w++;
      r.b = 0;
    }
    save();
  }

  // ------------------------------------------------------------- app state

  var app = {
    poolKey: 'tech',
    mode: 'flash',
    pools: {},          // poolKey -> parsed JSON
    session: { right: 0, asked: 0, streak: 0, best: 0 },
    flash: { deck: [], idx: -1, current: null, revealed: false, recent: [] },
    exam: null
  };

  var els = {
    summary: document.getElementById('pool-summary'),
    flashStats: document.getElementById('flash-stats'),
    flashScope: document.getElementById('flash-scope'),
    flashFilter: document.getElementById('flash-filter'),
    flashReset: document.getElementById('flash-reset'),
    flashHolder: document.getElementById('flash-holder'),
    meterMastered: document.getElementById('meter-mastered'),
    meterLearning: document.getElementById('meter-learning'),
    meterText: document.getElementById('meter-text'),
    examHolder: document.getElementById('exam-holder'),
    browseSearch: document.getElementById('browse-search'),
    browseSub: document.getElementById('browse-sub'),
    browseCount: document.getElementById('browse-count'),
    browseHolder: document.getElementById('browse-holder'),
    poolButtons: Array.prototype.slice.call(document.querySelectorAll('[data-pool]')),
    tabs: Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'))
  };

  function pool() { return app.pools[app.poolKey]; }

  function question(id) { return pool().byId[id]; }

  // ------------------------------------------------------------ data loading

  function fetchPool(key) {
    if (app.pools[key]) return Promise.resolve(app.pools[key]);
    return fetch('data/' + key + '.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        data.byId = {};
        data.questions.forEach(function (q) { data.byId[q.id] = q; });
        data.groupName = {};
        data.groups.forEach(function (g) { data.groupName[g.id] = g.name; });
        data.subName = {};
        data.subelements.forEach(function (s) { data.subName[s.id] = s.name; });
        data.groupsBySub = {};
        data.groups.forEach(function (g) {
          (data.groupsBySub[g.id.slice(0, 2)] = data.groupsBySub[g.id.slice(0, 2)] || []).push(g.id);
        });
        data.idsByGroup = {};
        data.questions.forEach(function (q) {
          var g = q.id.slice(0, 3);
          (data.idsByGroup[g] = data.idsByGroup[g] || []).push(q.id);
        });
        app.pools[key] = data;
        return data;
      });
  }

  // --------------------------------------------------------------- decks

  // Deck scope: 'all', a subelement id ('T1'), or a group id ('T1A').
  function deckIds(scope) {
    var qs = pool().questions;
    if (!scope || scope === 'all') return qs.map(function (q) { return q.id; });
    return qs.filter(function (q) { return q.id.indexOf(scope) === 0; })
      .map(function (q) { return q.id; });
  }

  function filterIds(ids, filter) {
    var p = progress();
    if (filter === 'unseen') return ids.filter(function (id) { return !p[id] || !p[id].n; });
    if (filter === 'weak') {
      return ids.filter(function (id) { return p[id] && p[id].w > 0 && p[id].b < MASTERED_BOX; });
    }
    if (filter === 'starred') return ids.filter(function (id) { return p[id] && p[id].s; });
    return ids;
  }

  function pickNext() {
    var deck = app.flash.deck;
    if (!deck.length) return null;
    if (els.flashFilter.value === 'order') {
      app.flash.idx = (app.flash.idx + 1) % deck.length;
      return deck[app.flash.idx];
    }
    // Weighted draw favouring low boxes and unseen questions, skipping the
    // handful most recently shown so a small deck does not repeat immediately.
    var recent = app.flash.recent;
    var skip = Math.min(recent.length, Math.max(0, deck.length - 1));
    var recentSet = {};
    recent.slice(recent.length - skip).forEach(function (id) { recentSet[id] = true; });
    var p = progress();
    var pool_ = [], weights = [], total = 0;
    deck.forEach(function (id) {
      if (recentSet[id]) return;
      var rec = p[id];
      var w = !rec || !rec.n ? UNSEEN_WEIGHT : BOX_WEIGHT[Math.min(rec.b, MAX_BOX)];
      if (rec && rec.s) w += 2;                        // starred comes up more
      pool_.push(id); weights.push(w); total += w;
    });
    if (!pool_.length) return deck[Math.floor(Math.random() * deck.length)];
    var roll = Math.random() * total;
    for (var i = 0; i < pool_.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return pool_[i];
    }
    return pool_[pool_.length - 1];
  }

  function rebuildDeck(keepCurrent) {
    var ids = filterIds(deckIds(els.flashScope.value), els.flashFilter.value);
    app.flash.deck = ids;
    app.flash.idx = -1;
    app.flash.recent = [];
    if (!keepCurrent || ids.indexOf(app.flash.current) === -1) {
      app.flash.current = pickNext();
      app.flash.revealed = false;
    }
    renderFlash();
  }

  function advance() {
    var next = pickNext();
    if (next) {
      app.flash.recent.push(next);
      if (app.flash.recent.length > 10) app.flash.recent.shift();
    }
    app.flash.current = next;
    app.flash.revealed = false;
    renderFlash();
  }

  // ---------------------------------------------------------- flash rendering

  function choiceList(q, opts) {
    opts = opts || {};
    var correct = 'ABCD'.indexOf(q.a);
    return h('ul', { class: 'hr-choices' }, q.c.map(function (text, i) {
      var isCorrect = i === correct;
      var cls = 'hr-choice';
      if (opts.reveal && isCorrect) cls += ' correct';
      else if (opts.reveal && opts.chosen === i) cls += ' chosen-wrong';
      else if (opts.reveal) cls += ' muted';
      return h('li', { class: cls }, [
        h('span', { class: 'hr-letter', text: 'ABCD'[i] + '.' }),
        h('span', { text: text }),
        opts.reveal && isCorrect ? h('span', { class: 'visually-hidden', text: ' (correct answer)' }) : null
      ]);
    }));
  }

  function figureFor(q) {
    if (!q.f) return null;
    return h('figure', { class: 'hr-figure' }, [
      h('img', { src: 'figures/' + q.f + '.png', alt: 'NCVEC diagram, figure ' + q.f, loading: 'lazy' }),
      h('figcaption', { text: 'Figure ' + q.f })
    ]);
  }

  function refsFor(q) {
    if (!q.r) return null;
    return h('p', { class: 'hr-refs' }, [
      document.createTextNode('FCC rule reference: '),
      h('code', { text: q.r })
    ]);
  }

  function renderFlash() {
    if (!app.pools[app.poolKey]) return;
    renderFlashStats();
    var holder = els.flashHolder;
    clear(holder);

    if (!app.flash.deck.length) {
      holder.appendChild(h('div', { class: 'hr-empty' }, [emptyDeckMessage()]));
      return;
    }
    var id = app.flash.current;
    if (!id) { app.flash.current = id = pickNext(); }
    var q = question(id);
    if (!q) { holder.appendChild(h('div', { class: 'hr-empty', text: 'Question not found.' })); return; }

    var rec = progress()[id];
    var box = rec ? rec.b : 0;
    var revealed = app.flash.revealed;

    var star = h('button', {
      type: 'button', class: 'hr-star', 'aria-pressed': rec && rec.s ? 'true' : 'false',
      'aria-label': rec && rec.s ? 'Remove star' : 'Star this question',
      title: 'Star this question (S)',
      onclick: function () {
        var r = recordOf(id);
        r.s = r.s ? 0 : 1;
        save();
        renderFlash();
      }
    }, [rec && rec.s ? '★' : '☆']);

    var head = h('div', { class: 'hr-card-head' }, [
      h('span', { class: 'hr-qid', text: q.id }),
      h('span', { class: 'hr-group-name', text: pool().groupName[q.id.slice(0, 3)] || '' }),
      h('span', {
        class: 'hr-box',
        title: 'Answered right ' + plural(box, 'time') + ' in a row' +
               (rec && rec.w ? ', missed ' + plural(rec.w, 'time') : '')
      }, ['Box ' + box + '/' + MAX_BOX]),
      star
    ]);

    var body = [head, h('p', { class: 'hr-question', text: q.q }), figureFor(q)];

    if (revealed) {
      body.push(h('div', { class: 'hr-answer-block', 'aria-live': 'polite' }, [
        choiceList(q, { reveal: true }),
        refsFor(q)
      ]));
      body.push(h('div', { class: 'hr-actions' }, [
        h('button', {
          type: 'button', class: 'btn btn-bad',
          onclick: function () { answerFlash(false); }
        }, ['Missed it']),
        h('button', {
          type: 'button', class: 'btn btn-good',
          onclick: function () { answerFlash(true); }
        }, ['Got it']),
        h('button', {
          type: 'button', class: 'btn btn-ghost',
          onclick: function () { advance(); }
        }, ['Skip →'])
      ]));
    } else {
      body.push(h('div', { class: 'hr-actions' }, [
        h('button', {
          type: 'button', class: 'btn btn-primary', id: 'flash-reveal',
          onclick: function () { app.flash.revealed = true; renderFlash(); }
        }, ['Show answer']),
        h('button', {
          type: 'button', class: 'btn btn-ghost',
          onclick: function () { advance(); }
        }, ['Skip →'])
      ]));
    }

    holder.appendChild(h('div', { class: 'hr-card' }, body));
  }

  function emptyDeckMessage() {
    var f = els.flashFilter.value;
    if (f === 'unseen') return 'Nothing left unseen in this deck — every question here has come up at least once.';
    if (f === 'weak') return 'No trouble spots in this deck. Missed questions land here until you get them right again.';
    if (f === 'starred') return 'No starred questions in this deck yet. Star a card with the ☆ button or the S key.';
    return 'This deck is empty.';
  }

  function answerFlash(correct) {
    grade(app.flash.current, correct);
    app.session.asked++;
    if (correct) {
      app.session.right++;
      app.session.streak++;
      app.session.best = Math.max(app.session.best, app.session.streak);
    } else {
      app.session.streak = 0;
    }
    // A question that just left the deck (e.g. filtered to "unseen") should
    // not linger, so rebuild while keeping the weighted draw moving forward.
    var filter = els.flashFilter.value;
    if (filter === 'unseen' || filter === 'weak' || filter === 'starred') {
      var next = pickNext();
      app.flash.deck = filterIds(deckIds(els.flashScope.value), filter);
      app.flash.current = app.flash.deck.indexOf(next) !== -1 ? next : pickNext();
      app.flash.revealed = false;
      renderFlash();
    } else {
      advance();
    }
  }

  function renderFlashStats() {
    var deck = app.flash.deck;
    var p = progress();
    var seen = 0, mastered = 0;
    deck.forEach(function (id) {
      var r = p[id];
      if (r && r.n) seen++;
      if (r && r.b >= MASTERED_BOX) mastered++;
    });

    clear(els.flashStats);
    [
      ['Deck', deck.length, ''],
      ['Seen', seen + ' / ' + deck.length, ''],
      ['Mastered', mastered + ' (' + pct(mastered, deck.length) + '%)', mastered ? 'good' : ''],
      ['This session', app.session.asked ? app.session.right + ' / ' + app.session.asked : '—', ''],
      ['Streak', app.session.streak + (app.session.best > app.session.streak ? ' (best ' + app.session.best + ')' : ''), app.session.streak >= 5 ? 'good' : '']
    ].forEach(function (row) {
      els.flashStats.appendChild(
        h('span', { class: 'hr-stat' + (row[2] ? ' ' + row[2] : '') }, [
          row[0] + ' ', h('strong', { text: String(row[1]) })
        ]));
    });

    els.meterMastered.style.width = pct(mastered, deck.length) + '%';
    els.meterLearning.style.width = pct(seen - mastered, deck.length) + '%';
    els.meterText.textContent = deck.length
      ? mastered + ' of ' + deck.length + ' mastered — a question is mastered after ' +
        MASTERED_BOX + ' right answers in a row'
      : '';
  }

  // -------------------------------------------------------------- practice exam

  function buildExam() {
    var data = pool();
    var items = [];
    data.groups.forEach(function (g) {
      var ids = data.idsByGroup[g.id] || [];
      if (!ids.length) return;
      var id = ids[Math.floor(Math.random() * ids.length)];
      items.push({ id: id, order: shuffle([0, 1, 2, 3]), chosen: null });
    });
    return {
      items: items,
      idx: 0,
      started: Date.now(),
      finished: null,
      submitted: false
    };
  }

  function renderExam() {
    if (!app.pools[app.poolKey]) return;
    clear(els.examHolder);
    if (!app.exam) return renderExamIntro();
    if (app.exam.submitted) return renderExamResults();
    return renderExamQuestion();
  }

  function renderExamIntro() {
    var m = pool().meta;
    var history = store[app.poolKey].exams;
    var best = history.reduce(function (b, e) { return Math.max(b, e.score); }, 0);

    var intro = h('div', { class: 'hr-exam-intro' }, [
      h('h2', { class: 'section-title', text: m.name + ' practice exam' }),
      h('ul', { class: 'hr-rules' }, [
        h('li', {}, [m.exam + ' questions — one drawn at random from each of the ' +
          pool().groups.length + ' question groups, exactly how ' + m.element +
          ' exams are built.']),
        h('li', {}, ['Answer choices are shuffled, so the letters differ from the printed pool.']),
        h('li', {}, [m.pass + ' correct (' + pct(m.pass, m.exam) + '%) is a pass.']),
        h('li', {}, ['No time limit — the clock only tells you how long you took.']),
        h('li', {}, ['Every answer feeds your flash-card progress, and missed questions ' +
          'go back to box 0.'])
      ]),
      h('div', { class: 'hr-actions' }, [
        h('button', {
          type: 'button', class: 'btn btn-primary',
          onclick: function () { app.exam = buildExam(); renderExam(); }
        }, ['Start a ' + m.exam + '-question exam'])
      ])
    ]);
    els.examHolder.appendChild(intro);

    if (history.length) {
      var rows = history.slice().reverse().slice(0, 8).map(function (e) {
        var passed = e.score >= m.pass;
        return h('tr', { class: passed ? '' : 'short' }, [
          h('td', { text: fmtDate(e.d) }),
          h('td', { class: 'num', text: e.score + ' / ' + e.total }),
          h('td', { class: 'num', text: pct(e.score, e.total) + '%' }),
          h('td', { text: passed ? 'Pass' : 'Below ' + m.pass }),
          h('td', { class: 'num', text: e.ms ? fmtDuration(e.ms) : '—' })
        ]);
      });
      els.examHolder.appendChild(h('div', { class: 'hr-table-wrap', style: 'margin-top: var(--sp-8)' }, [
        h('table', { class: 'hr-table' }, [
          h('caption', { text: 'Your last exams on this pool — best score ' + best + ' / ' + m.exam }),
          h('thead', {}, [h('tr', {}, [
            h('th', { text: 'Date' }), h('th', { text: 'Score' }),
            h('th', { text: 'Percent' }), h('th', { text: 'Result' }),
            h('th', { text: 'Time' })
          ])]),
          h('tbody', {}, rows)
        ])
      ]));
    }
  }

  function renderExamQuestion() {
    var ex = app.exam;
    var item = ex.items[ex.idx];
    var q = question(item.id);
    var answered = ex.items.filter(function (i) { return i.chosen !== null; }).length;

    var stats = h('div', { class: 'hr-stats' }, [
      h('span', { class: 'hr-stat' }, ['Question ', h('strong', { text: (ex.idx + 1) + ' / ' + ex.items.length })]),
      h('span', { class: 'hr-stat' }, ['Answered ', h('strong', { text: String(answered) })]),
      h('span', { class: 'hr-stat' }, ['Subelement ', h('strong', { text: q.id.slice(0, 2) })])
    ]);

    var choices = h('ul', { class: 'hr-choices' }, item.order.map(function (origIdx, displayIdx) {
      var selected = item.chosen === origIdx;
      var li = h('li', { class: 'hr-choice selectable' + (selected ? ' selected' : '') }, []);
      var input = h('input', {
        type: 'radio', name: 'exam-choice', id: 'choice-' + displayIdx,
        checked: selected || null,
        onchange: function () { item.chosen = origIdx; renderExam(); }
      });
      li.appendChild(input);
      li.appendChild(h('label', { for: 'choice-' + displayIdx, style: 'display:flex; gap:var(--sp-3); cursor:pointer; flex:1 1 auto' }, [
        h('span', { class: 'hr-letter', text: 'ABCD'[displayIdx] + '.' }),
        h('span', { text: q.c[origIdx] })
      ]));
      return li;
    }));

    var card = h('div', { class: 'hr-card' }, [
      h('div', { class: 'hr-card-head' }, [
        h('span', { class: 'hr-qid', text: q.id }),
        h('span', { class: 'hr-group-name', text: pool().subName[q.id.slice(0, 2)] || '' })
      ]),
      h('p', { class: 'hr-question', text: q.q }),
      figureFor(q),
      choices,
      h('div', { class: 'hr-actions' }, [
        h('button', {
          type: 'button', class: 'btn btn-ghost', disabled: ex.idx === 0 || null,
          onclick: function () { ex.idx = Math.max(0, ex.idx - 1); renderExam(); }
        }, ['← Previous']),
        h('button', {
          type: 'button', class: 'btn btn-primary',
          disabled: ex.idx === ex.items.length - 1 || null,
          onclick: function () { ex.idx = Math.min(ex.items.length - 1, ex.idx + 1); renderExam(); }
        }, ['Next →']),
        h('button', {
          type: 'button', class: 'btn btn-good',
          onclick: submitExam
        }, ['Grade my exam']),
        h('button', {
          type: 'button', class: 'btn btn-ghost',
          onclick: function () {
            if (confirm('Abandon this exam? Answers so far are already counted toward your flash-card progress.')) {
              app.exam = null; renderExam();
            }
          }
        }, ['Abandon'])
      ])
    ]);

    var navGrid = h('div', { class: 'hr-nav-grid' }, ex.items.map(function (it, i) {
      return h('button', {
        type: 'button',
        class: (it.chosen !== null ? 'answered' : '') + (i === ex.idx ? ' current' : ''),
        'aria-label': 'Go to question ' + (i + 1) + (it.chosen !== null ? ', answered' : ', unanswered'),
        'aria-current': i === ex.idx ? 'true' : null,
        onclick: function () { ex.idx = i; renderExam(); }
      }, [String(i + 1)]);
    }));

    els.examHolder.appendChild(stats);
    els.examHolder.appendChild(card);
    els.examHolder.appendChild(h('p', { class: 'hr-legend' }, [
      h('span', {}, [h('span', { class: 'kbd', text: '1' }), '–', h('span', { class: 'kbd', text: '4' }), ' pick an answer']),
      h('span', {}, [h('span', { class: 'kbd', text: '←' }), ' / ', h('span', { class: 'kbd', text: '→' }), ' move between questions'])
    ]));
    els.examHolder.appendChild(navGrid);
  }

  function submitExam() {
    var ex = app.exam;
    var unanswered = ex.items.filter(function (i) { return i.chosen === null; }).length;
    if (unanswered && !confirm(plural(unanswered, 'question') + ' still unanswered. ' +
        'They will be scored as wrong. Grade the exam anyway?')) {
      return;
    }
    ex.finished = Date.now();
    ex.submitted = true;

    var score = 0;
    ex.items.forEach(function (item) {
      var q = question(item.id);
      var correct = item.chosen !== null && item.chosen === 'ABCD'.indexOf(q.a);
      item.correct = correct;
      if (correct) score++;
      if (item.chosen !== null) grade(item.id, correct);
      else { var r = recordOf(item.id); r.b = 0; save(); }
    });
    ex.score = score;

    store[app.poolKey].exams.push({
      d: new Date().toISOString(), score: score, total: ex.items.length,
      ms: ex.finished - ex.started
    });
    if (store[app.poolKey].exams.length > 50) store[app.poolKey].exams.shift();
    save();
    renderExam();
    window.scrollTo({ top: document.querySelector('.hr-controls').offsetTop, behavior: 'smooth' });
  }

  function renderExamResults() {
    var ex = app.exam;
    var m = pool().meta;
    var passed = ex.score >= m.pass;

    els.examHolder.appendChild(h('div', { class: 'hr-verdict ' + (passed ? 'pass' : 'fail') }, [
      h('span', { class: 'hr-verdict-score', text: ex.score + ' / ' + ex.items.length }),
      h('div', { class: 'hr-verdict-detail' }, [
        h('p', {}, [h('strong', { text: passed ? 'Pass' : 'Not yet a pass' }),
          ' — ' + pct(ex.score, ex.items.length) + '%, and ' + m.pass +
          ' of ' + m.exam + ' is the passing mark for the ' + m.name + ' exam.']),
        h('p', { text: 'Finished in ' + fmtDuration(ex.finished - ex.started) + '.' })
      ])
    ]));

    // Per-subelement breakdown: where the misses cluster is what to study next.
    var bySub = {};
    ex.items.forEach(function (item) {
      var s = item.id.slice(0, 2);
      bySub[s] = bySub[s] || { right: 0, total: 0 };
      bySub[s].total++;
      if (item.correct) bySub[s].right++;
    });
    var rows = pool().subelements.filter(function (s) { return bySub[s.id]; }).map(function (s) {
      var b = bySub[s.id];
      return h('tr', { class: b.right < b.total ? 'short' : '' }, [
        h('td', { text: s.id }),
        h('td', { class: 'name', text: s.name }),
        h('td', { class: 'num', text: b.right + ' / ' + b.total }),
        h('td', { class: 'num', text: pct(b.right, b.total) + '%' })
      ]);
    });
    els.examHolder.appendChild(h('div', { class: 'hr-table-wrap' }, [
      h('table', { class: 'hr-table' }, [
        h('caption', { text: 'Score by subelement' }),
        h('thead', {}, [h('tr', {}, [
          h('th', { text: 'ID' }), h('th', { text: 'Subelement' }),
          h('th', { text: 'Right' }), h('th', { text: 'Percent' })
        ])]),
        h('tbody', {}, rows)
      ])
    ]));

    els.examHolder.appendChild(h('div', { class: 'hr-actions', style: 'margin: var(--sp-6) 0' }, [
      h('button', {
        type: 'button', class: 'btn btn-primary',
        onclick: function () { app.exam = buildExam(); renderExam(); }
      }, ['Take another exam']),
      h('button', {
        type: 'button', class: 'btn btn-ghost',
        onclick: function () {
          els.flashFilter.value = 'weak';
          els.flashScope.value = 'all';
          setMode('flash');
          rebuildDeck(false);
        }
      }, ['Drill what I missed']),
      h('button', {
        type: 'button', class: 'btn btn-ghost',
        onclick: function () { app.exam = null; renderExam(); }
      }, ['Back to exam setup'])
    ]));

    var missed = ex.items.filter(function (i) { return !i.correct; });
    els.examHolder.appendChild(h('h3', { style: 'margin-bottom: var(--sp-4)' }, [
      missed.length ? 'Review the ' + plural(missed.length, 'question') + ' you missed'
                    : 'Nothing missed — a clean sweep'
    ]));
    if (missed.length) {
      els.examHolder.appendChild(h('div', { class: 'hr-review' }, missed.map(function (item) {
        var q = question(item.id);
        return h('div', { class: 'hr-card' }, [
          h('div', { class: 'hr-card-head' }, [
            h('span', { class: 'hr-qid', text: q.id }),
            h('span', { class: 'hr-group-name', text: pool().groupName[q.id.slice(0, 3)] || '' })
          ]),
          h('p', { class: 'hr-question', text: q.q }),
          figureFor(q),
          choiceList(q, { reveal: true, chosen: item.chosen }),
          item.chosen === null ? h('p', { class: 'hr-refs', text: 'You left this one blank.' }) : null,
          refsFor(q)
        ]);
      })));
    }
  }

  // -------------------------------------------------------------------- browse

  function renderBrowse() {
    if (!app.pools[app.poolKey]) return;
    var data = pool();
    var term = els.browseSearch.value.trim().toLowerCase();
    var subFilter = els.browseSub.value;
    clear(els.browseHolder);

    var matches = data.questions.filter(function (q) {
      if (subFilter !== 'all' && q.id.slice(0, 2) !== subFilter) return false;
      if (!term) return true;
      return q.id.toLowerCase().indexOf(term) !== -1 ||
             q.q.toLowerCase().indexOf(term) !== -1 ||
             q.c.some(function (c) { return c.toLowerCase().indexOf(term) !== -1; });
    });

    els.browseCount.textContent = term || subFilter !== 'all'
      ? plural(matches.length, 'question') + ' match — of ' + data.questions.length + ' in the pool'
      : data.questions.length + ' questions across ' + data.subelements.length +
        ' subelements and ' + data.groups.length + ' groups';

    if (!matches.length) {
      els.browseHolder.appendChild(h('div', { class: 'hr-empty', text: 'No questions match that search.' }));
      return;
    }

    var byGroup = {};
    matches.forEach(function (q) {
      var g = q.id.slice(0, 3);
      (byGroup[g] = byGroup[g] || []).push(q);
    });

    // A search result should be readable at a glance, so open the subelements
    // when the list is short; the full pool stays collapsed.
    var openAll = !!term || subFilter !== 'all';

    data.subelements.forEach(function (s) {
      var groups = (data.groupsBySub[s.id] || []).filter(function (g) { return byGroup[g]; });
      if (!groups.length) return;
      var count = groups.reduce(function (n, g) { return n + byGroup[g].length; }, 0);
      var p = progress();
      var mastered = 0;
      groups.forEach(function (g) {
        byGroup[g].forEach(function (q) {
          if (p[q.id] && p[q.id].b >= MASTERED_BOX) mastered++;
        });
      });

      var details = h('details', { class: 'hr-sub', open: openAll || null }, [
        h('summary', {}, [
          h('span', { class: 'hr-qid', text: s.id }),
          h('span', { text: s.name }),
          h('span', { class: 'hr-sub-meta', text: plural(count, 'question') + ' · ' + s.exam +
            ' on the exam · ' + pct(mastered, count) + '% mastered' })
        ])
      ]);

      var body = h('div', { class: 'hr-sub-body' }, []);
      var filled = false;
      function fill() {
        if (filled) return;
        filled = true;
        groups.forEach(function (g) {
          body.appendChild(h('div', { class: 'hr-grp' }, [
            h('div', { class: 'hr-grp-head' }, [
              h('h4', { text: g }),
              h('p', { text: data.groupName[g] || '' })
            ]),
            h('div', { class: 'hr-q-list' }, byGroup[g].map(function (q) {
              return h('div', { class: 'hr-q-item' }, [
                h('div', { class: 'hr-q-head' }, [
                  h('span', { class: 'hr-qid', text: q.id }),
                  h('span', { class: 'hr-q-text', text: q.q })
                ]),
                figureFor(q),
                choiceList(q, { reveal: true }),
                refsFor(q)
              ]);
            }))
          ]));
        });
      }
      // Render a subelement's questions the first time it is opened: the Extra
      // pool is 599 questions and building them all up front is wasted work.
      if (openAll) fill();
      details.addEventListener('toggle', function () { if (details.open) fill(); });
      details.appendChild(body);
      els.browseHolder.appendChild(details);
    });
  }

  // ------------------------------------------------------------------ chrome

  function renderSummary() {
    var m = pool().meta;
    clear(els.summary);
    els.summary.appendChild(document.createTextNode(
      m.name + ' (' + m.element + ') · ' + pool().questions.length +
      ' questions in the ' + m.pool + ' pool, valid ' + m.valid + ' · ' +
      m.exam + '-question exam, ' + m.pass + ' to pass · '));
    els.summary.appendChild(h('a', { href: m.source, rel: 'noopener', text: m.revision + ' from the NCVEC' }));
  }

  function renderScopeOptions() {
    var data = pool();
    var sel = els.flashScope;
    var previous = sel.value;
    clear(sel);
    sel.appendChild(h('option', { value: 'all', text: 'Whole pool — ' + data.questions.length + ' questions' }));
    data.subelements.forEach(function (s) {
      var n = data.questions.filter(function (q) { return q.id.slice(0, 2) === s.id; }).length;
      var grp = h('optgroup', { label: s.id + ' — ' + s.name });
      grp.appendChild(h('option', { value: s.id, text: 'All of ' + s.id + ' (' + n + ')' }));
      (data.groupsBySub[s.id] || []).forEach(function (g) {
        var gn = (data.idsByGroup[g] || []).length;
        grp.appendChild(h('option', {
          value: g,
          text: g + ' — ' + (data.groupName[g] || '').slice(0, 60) + ' (' + gn + ')'
        }));
      });
      sel.appendChild(grp);
    });
    sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === previous; })
      ? previous : 'all';

    var bsel = els.browseSub;
    clear(bsel);
    bsel.appendChild(h('option', { value: 'all', text: 'All subelements' }));
    data.subelements.forEach(function (s) {
      bsel.appendChild(h('option', { value: s.id, text: s.id + ' — ' + s.name }));
    });
  }

  function setMode(mode) {
    app.mode = mode;
    els.tabs.forEach(function (t) {
      var on = t.id === 'tab-' + mode;
      t.setAttribute('aria-selected', String(on));
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    // A deep link such as #tech/exam sets the mode before the pool has
    // loaded; setPool renders the active mode once the fetch resolves.
    if (app.pools[app.poolKey]) {
      if (mode === 'exam') renderExam();
      else if (mode === 'browse') renderBrowse();
      else renderFlash();
    }
    writeHash();
  }

  function setPool(key) {
    app.poolKey = key;
    els.poolButtons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.pool === key));
    });
    app.exam = null;
    app.session = { right: 0, asked: 0, streak: 0, best: 0 };
    els.summary.textContent = 'Loading the ' + key + ' question pool…';
    fetchPool(key).then(function () {
      renderSummary();
      renderScopeOptions();
      rebuildDeck(false);
      if (app.mode === 'exam') renderExam();
      else if (app.mode === 'browse') renderBrowse();
      writeHash();
    }).catch(function (err) {
      clear(els.summary);
      els.summary.appendChild(h('strong', { text: 'Could not load the question pool. ' }));
      els.summary.appendChild(document.createTextNode(
        'The pool files are fetched over HTTP, so opening this page straight off ' +
        'the filesystem will not work — serve the site (npm start) and reload. (' +
        err.message + ')'));
    });
  }

  // Hash routing so a deck can be linked: #tech/flash, #extra/browse
  function writeHash() {
    var want = '#' + app.poolKey + '/' + app.mode;
    if (location.hash !== want) history.replaceState(null, '', want);
  }

  function readHash() {
    var parts = (location.hash || '').replace(/^#/, '').split('/');
    var key = POOL_KEYS.indexOf(parts[0]) !== -1 ? parts[0] : 'tech';
    var mode = ['flash', 'exam', 'browse'].indexOf(parts[1]) !== -1 ? parts[1] : 'flash';
    return { key: key, mode: mode };
  }

  // ------------------------------------------------------------------- events

  els.poolButtons.forEach(function (b) {
    b.addEventListener('click', function () { setPool(b.dataset.pool); });
  });
  els.tabs.forEach(function (t) {
    t.addEventListener('click', function () { setMode(t.id.replace('tab-', '')); });
  });
  els.flashScope.addEventListener('change', function () { rebuildDeck(false); });
  els.flashFilter.addEventListener('change', function () { rebuildDeck(false); });
  els.flashReset.addEventListener('click', function () {
    var m = pool().meta;
    if (!confirm('Clear all saved progress and exam history for the ' + m.name +
                 ' pool? This cannot be undone.')) return;
    store[app.poolKey] = { q: {}, exams: [] };
    save();
    app.session = { right: 0, asked: 0, streak: 0, best: 0 };
    app.exam = null;
    rebuildDeck(false);
    if (app.mode === 'exam') renderExam();
    if (app.mode === 'browse') renderBrowse();
  });
  els.browseSearch.addEventListener('input', function () { renderBrowse(); });
  els.browseSub.addEventListener('change', function () { renderBrowse(); });

  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' ||
              t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!app.pools[app.poolKey]) return;

    if (app.mode === 'flash') {
      if (!app.flash.current) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!app.flash.revealed) { app.flash.revealed = true; renderFlash(); }
        return;
      }
      if (e.key === '1' && app.flash.revealed) { e.preventDefault(); answerFlash(false); return; }
      if (e.key === '2' && app.flash.revealed) { e.preventDefault(); answerFlash(true); return; }
      if (e.key === 'ArrowRight' || e.key === 'n') { e.preventDefault(); advance(); return; }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        var r = recordOf(app.flash.current);
        r.s = r.s ? 0 : 1;
        save();
        renderFlash();
      }
      return;
    }

    if (app.mode === 'exam' && app.exam && !app.exam.submitted) {
      var ex = app.exam;
      var item = ex.items[ex.idx];
      if ('1234'.indexOf(e.key) !== -1) {
        e.preventDefault();
        item.chosen = item.order[Number(e.key) - 1];
        renderExam();
        return;
      }
      if (e.key === 'ArrowRight') { e.preventDefault(); ex.idx = Math.min(ex.items.length - 1, ex.idx + 1); renderExam(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); ex.idx = Math.max(0, ex.idx - 1); renderExam(); }
    }
  });

  window.addEventListener('hashchange', function () {
    var want = readHash();
    if (want.key !== app.poolKey) setPool(want.key);
    if (want.mode !== app.mode) setMode(want.mode);
  });

  // --------------------------------------------------------------------- boot

  var initial = readHash();
  app.mode = initial.mode;
  setMode(initial.mode);
  setPool(initial.key);

  // Exposed for the smoke test in ham-radio/tools/smoke-test.mjs.
  window.__ham = app;
})();
