import fs from 'fs';
import path from 'path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

// One-page summary for non-technical readers: plain-report/index.html
// "What we checked" comes from each test's checks() note; "What happened" is the real error of this run

const OUTPUT_DIR = 'plain-report';

const AREAS: Record<string, string> = {
    UI: 'Website',
    API: 'Server (API)',
    Integration: 'Website and server together',
    Mocks: 'Website with simulated server responses',
};

interface Row {
    area: string;
    group: string;
    title: string;
    checks: string;
    status: 'passed' | 'failed' | 'skipped';
    retried: boolean;
    happened: string[];
    details: string;
    screenshot?: string;
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stripAnsi(text: string): string {
    return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function whatHappened(message: string): string {
    /** First line of the error, plus Expected/Received when the first line does not already say what was expected */
    const lines = stripAnsi(message).split('\n').map(l => l.trim()).filter(Boolean);
    const first = lines[0].replace(/^Error:\s*/, '');
    if (/expected/i.test(first)) return first;
    const comparison = lines.filter(l => /^(Expected|Received)( value| array| pattern| string| substring)?:/.test(l));
    return [first, ...comparison].join(' · ');
}

class PlainReporter implements Reporter {
    private rows = new Map<string, Row>();

    onTestEnd(test: TestCase, result: TestResult): void {
        // A retry replaces the earlier attempt, so only the final outcome is reported
        const [prefix, group = test.parent.title] = test.parent.title.split(' | ');
        const status = result.status === 'passed' ? 'passed' : result.status === 'skipped' ? 'skipped' : 'failed';
        const happened = result.status === 'timedOut'
            ? [`The test ran out of time (${result.duration / 1000}s) before it could finish.`]
            : result.errors.map(e => whatHappened(e.message ?? e.value ?? 'Unknown error'));

        this.rows.set(test.id, {
            area: AREAS[prefix] ?? prefix,
            group,
            title: test.title,
            checks: test.annotations.find(a => a.type === 'checks')?.description ?? '',
            status,
            retried: result.retry > 0,
            happened,
            details: result.errors.map(e => stripAnsi(e.message ?? e.value ?? '')).join('\n\n'),
            screenshot: result.attachments.find(a => a.name === 'screenshot' && a.path)?.path,
        });
    }

    onEnd(result: FullResult): void {
        fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
        fs.mkdirSync(path.join(OUTPUT_DIR, 'screenshots'), { recursive: true });

        // Copy screenshots next to the report: test-results/ is wiped on the next run
        const rows = [...this.rows.values()];
        rows.forEach((row, i) => {
            if (!row.screenshot || !fs.existsSync(row.screenshot)) return delete row.screenshot;
            const file = `screenshots/${i}.png`;
            fs.copyFileSync(row.screenshot, path.join(OUTPUT_DIR, file));
            row.screenshot = file;
        });

        fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), this.page(rows, result));
        console.log(`\nPlain-language report: ${path.join(OUTPUT_DIR, 'index.html')}`);
    }

    private page(rows: Row[], result: FullResult): string {
        const count = (status: Row['status']) => rows.filter(r => r.status === status).length;
        const section = (status: Row['status'], heading: string, intro: string) => {
            const matching = rows.filter(r => r.status === status);
            if (!matching.length) return '';
            const areas = [...new Set(matching.map(r => r.area))];
            return `<section data-status="${status}"><h2>${heading} (${matching.length})</h2><p class="intro">${intro}</p>` + areas.map(area =>
                `<h3>${escapeHtml(area)}</h3>` + matching.filter(r => r.area === area).map(r => this.card(r)).join('')).join('') + '</section>';
        };
        const filter = (value: string, label: string, total: number) =>
            `<button type="button" data-filter="${value}" aria-pressed="false">${label} <span>${total}</span></button>`;

        return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>BookCart Test Results</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --text:#1d2330; --muted:#5b6475; --pass:#1f7a3d; --pass-bg:#e7f5ec; --fail:#b42318; --fail-bg:#fdecea; --skip:#6b7280; --border:#e3e6eb; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width:960px; margin:0 auto; padding:24px 16px 64px; }
  h1 { margin:0 0 4px; } h2 { margin:40px 0 4px; } h3 { margin:24px 0 8px; color:var(--muted); font-size:15px; text-transform:uppercase; letter-spacing:.04em; }
  .meta, .intro { color:var(--muted); margin:0 0 12px; }
  .totals { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:12px; margin:20px 0; }
  .total { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:14px 16px; }
  .total b { display:block; font-size:32px; line-height:1.1; }
  .total.pass b { color:var(--pass); } .total.fail b { color:var(--fail); } .total.skip b { color:var(--skip); }
  .howto { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:12px 16px; }
  .howto p { margin:4px 0; }
  .card { background:var(--card); border:1px solid var(--border); border-left:5px solid var(--border); border-radius:10px; padding:14px 16px; margin:10px 0; }
  .card.passed { border-left-color:var(--pass); } .card.failed { border-left-color:var(--fail); } .card.skipped { border-left-color:var(--skip); }
  .card .top { display:flex; gap:10px; align-items:baseline; justify-content:space-between; flex-wrap:wrap; }
  .card .name { font-weight:600; } .card .group { color:var(--muted); font-size:14px; }
  .badge { font-size:13px; font-weight:600; padding:2px 10px; border-radius:999px; white-space:nowrap; }
  .badge.passed { background:var(--pass-bg); color:var(--pass); } .badge.failed { background:var(--fail-bg); color:var(--fail); } .badge.skipped { background:#eef0f3; color:var(--skip); }
  .label { font-size:13px; font-weight:600; color:var(--muted); margin-top:10px; }
  .happened { background:var(--fail-bg); border-radius:8px; padding:8px 12px; margin-top:4px; overflow-wrap:anywhere; }
  .happened div + div { margin-top:6px; }
  .shot img { max-width:min(100%, 480px); border:1px solid var(--border); border-radius:6px; margin-top:6px; }
  .filters { position:sticky; top:0; z-index:1; display:flex; gap:8px; flex-wrap:wrap; padding:12px 0; background:var(--bg); }
  .filters button { font:inherit; font-weight:600; padding:6px 16px; border-radius:999px; border:1px solid var(--border); background:var(--card); color:var(--text); cursor:pointer; }
  .filters button span { color:var(--muted); font-weight:400; margin-left:4px; }
  .filters button[aria-pressed="true"] { background:var(--text); border-color:var(--text); color:#fff; }
  .filters button[aria-pressed="true"] span { color:#d6dae2; }
  section[hidden] { display:none; }
  details { margin-top:10px; color:var(--muted); font-size:14px; } pre { white-space:pre-wrap; overflow-wrap:anywhere; background:#f1f3f6; padding:10px; border-radius:6px; }
</style></head>
<body><main>
<h1>BookCart test results</h1>
<p class="meta">Run finished ${new Date().toLocaleString('en-GB')} · overall result: <b>${result.status === 'passed' ? 'all checks passed' : 'some checks failed'}</b></p>
<div class="totals">
  <div class="total"><b>${rows.length}</b>checks run</div>
  <div class="total pass"><b>${count('passed')}</b>passed</div>
  <div class="total fail"><b>${count('failed')}</b>failed</div>
  ${count('skipped') ? `<div class="total skip"><b>${count('skipped')}</b>not run</div>` : ''}
</div>
<div class="howto">
  <p><b>How to read this page.</b> Each check describes one thing the shop should do and what counts as a pass.</p>
  <p><b>Failed</b> means the live website or server did not behave that way. "What happened" shows what it did instead, taken from this run.</p>
  <p><b>Passed</b> means the shop behaved exactly as described under "What we checked".</p>
</div>
<nav class="filters" aria-label="Filter checks by result">
  ${filter('all', 'All', rows.length)}${filter('passed', 'Passed', count('passed'))}${filter('failed', 'Failed', count('failed'))}${count('skipped') ? filter('skipped', 'Not run', count('skipped')) : ''}
</nav>
${section('failed', 'What is failing', 'These checks found a problem in the live shop.')}
${section('passed', 'What is passing', 'These checks confirmed the shop works as described.')}
${section('skipped', 'Not run', 'These checks were skipped in this run.')}
<script>
  // Show one result group at a time; the choice lives in the URL (#passed / #failed) so it can be shared
  const buttons = document.querySelectorAll('[data-filter]');
  const sections = document.querySelectorAll('section[data-status]');
  function apply() {
    const wanted = location.hash.slice(1) || 'all';
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === wanted)));
    sections.forEach(s => { s.hidden = wanted !== 'all' && s.dataset.status !== wanted; });
  }
  buttons.forEach(b => b.addEventListener('click', () => {
    history.replaceState(null, '', b.dataset.filter === 'all' ? location.pathname : '#' + b.dataset.filter);
    apply();
  }));
  window.addEventListener('hashchange', apply);
  apply();
</script>
</main></body></html>`;
    }

    private card(row: Row): string {
        const badge = { passed: 'Passed', failed: 'Failed', skipped: 'Not run' }[row.status];
        return `<div class="card ${row.status}">
  <div class="top"><div><div class="name">${escapeHtml(row.title)}</div><div class="group">${escapeHtml(row.group)}</div></div>
  <span class="badge ${row.status}">${badge}${row.retried && row.status === 'passed' ? ' (on retry)' : ''}</span></div>
  <div class="label">What we checked</div><div>${escapeHtml(row.checks || 'No description.')}</div>
  ${row.status === 'failed' ? `<div class="label">What happened</div><div class="happened">${row.happened.map(h => `<div>${escapeHtml(h)}</div>`).join('')}</div>` : ''}
  ${row.screenshot ? `<div class="shot"><div class="label">Screenshot at the moment it failed</div><a href="${row.screenshot}"><img src="${row.screenshot}" alt="Screenshot of the failure" loading="lazy"></a></div>` : ''}
  ${row.status === 'failed' && row.details ? `<details><summary>Technical details</summary><pre>${escapeHtml(row.details)}</pre></details>` : ''}
</div>`;
    }
}

export default PlainReporter;
