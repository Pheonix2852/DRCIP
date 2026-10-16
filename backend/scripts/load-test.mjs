import 'dotenv/config';

const HELP = [
  'DRCIP load and stress harness (zero dependencies, Node >= 18 global fetch)',
  '',
  'Run from backend/:   node scripts/load-test.mjs [options]',
  '',
  'Options:',
  '  --base URL            target base, default http://localhost:5000',
  '  --email EMAIL         default ADMIN_EMAIL, else admin@drcip.local',
  '  --password PASS       default ADMIN_PASSWORD from backend/.env',
  '  --concurrency LIST    levels, default 5,10,25,50',
  '  --read-seconds N      seconds per read phase, default 5',
  '  --creates N           incidents created across all phases, default 60',
  '  --race N              attempt count for resource/completion races, default 25',
  '  --skip-races          run load phases only',
  '  --json                print RESULT_JSON_START/END block',
  '  --help                this text',
  '',
  'Phases: read load per concurrency level, incident-creation load per level,',
  'then deterministic races (resource double allocation, team double deploy,',
  'shelter capacity overflow, concurrent assignment completion).',
  'Restores resource/team/shelter state by cancelling harness assignments.',
  'Incidents have no DELETE endpoint, so LOAD-TEST incidents stay in the dev DB.',
].join('\n');

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : dflt;
};

if (args.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}

const BASE = String(opt('--base', process.env.LOAD_BASE || 'http://localhost:5000')).replace(/\/+$/, '');
const EMAIL = String(opt('--email', process.env.ADMIN_EMAIL || 'admin@drcip.local'));
const PASSWORD = String(opt('--password', process.env.ADMIN_PASSWORD || ''));
const LEVELS = String(opt('--concurrency', '5,10,25,50'))
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);
const READ_SECONDS = Math.max(1, Number(opt('--read-seconds', '5')) || 5);
const TOTAL_CREATES = Math.max(1, Number(opt('--creates', '60')) || 60);
const RACE_N = Math.max(2, Number(opt('--race', '25')) || 25);
const SKIP_RACES = args.includes('--skip-races');
const AS_JSON = args.includes('--json');

if (!PASSWORD) {
  console.error('Missing password. Run from backend/ so .env loads, or pass --password / set ADMIN_PASSWORD.');
  process.exit(1);
}

const DISASTER_TYPES = [
  'FLOOD',
  'CYCLONE',
  'FIRE',
  'EARTHQUAKE',
  'LANDSLIDE',
  'MEDICAL_EMERGENCY',
  'ROAD_BLOCKAGE',
  'BUILDING_COLLAPSE',
];

const READ_ENDPOINTS = [
  ['GET', '/health'],
  ['GET', '/api/v1/incidents?limit=20&page=1&sort=newest'],
  ['GET', '/api/v1/incidents?limit=20&status=REPORTED&search=LOAD'],
  ['GET', '/api/v1/incidents?limit=20&page=2&sort=oldest'],
  ['GET', '/api/v1/resources?limit=50'],
  ['GET', '/api/v1/teams?limit=20'],
  ['GET', '/api/v1/shelters?limit=20'],
  ['GET', '/api/v1/assignments?limit=20'],
  ['GET', '/api/v1/notifications?limit=20'],
  ['GET', '/api/v1/audit-logs?limit=20'],
];

async function req(method, path, { token, body } = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    return { status: res.status, ms: performance.now() - t0, body: parsed };
  } catch (err) {
    return {
      status: 0,
      ms: performance.now() - t0,
      body: null,
      net: String(err?.cause?.code || err?.message || err),
    };
  }
}

const errorCode = (r) => r.body?.error?.code || (r.status ? String(r.status) : 'NETWORK');

async function login() {
  const r = await req('POST', '/api/v1/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  if (r.status !== 200 || !r.body?.data?.access_token) {
    console.error(`Login failed against ${BASE} as ${EMAIL}: status=${r.status} body=${JSON.stringify(r.body)}`);
    process.exit(1);
  }
  return r.body.data.access_token;
}

async function list(token, path) {
  const r = await req('GET', path, { token });
  const d = r.body?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.items)) return d.items;
  return [];
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function latencyStats(lat) {
  const sorted = [...lat].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    avg_ms: +(sum / (sorted.length || 1)).toFixed(1),
    p50_ms: +percentile(sorted, 50).toFixed(1),
    p95_ms: +percentile(sorted, 95).toFixed(1),
    p99_ms: +percentile(sorted, 99).toFixed(1),
    max_ms: +(sorted[sorted.length - 1] || 0).toFixed(1),
  };
}

async function runPhase(label, concurrency, op, { seconds = 0, total = 0 } = {}) {
  const statuses = Object.create(null);
  const lat = [];
  let count = 0;
  let net = 0;
  let remaining = total;
  const startMs = Date.now();
  const endMs = seconds ? startMs + seconds * 1000 : 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        if (endMs && Date.now() >= endMs) return;
        if (total) {
          if (remaining <= 0) return;
          remaining -= 1;
        }
        const r = await op();
        count += 1;
        lat.push(r.ms);
        if (r.status === 0) net += 1;
        else statuses[r.status] = (statuses[r.status] || 0) + 1;
      }
    }),
  );

  const elapsedMs = Date.now() - startMs;
  const codes = Object.keys(statuses);
  const countIn = (lo, hi) => codes.reduce((acc, c) => (Number(c) >= lo && Number(c) <= hi ? acc + statuses[c] : acc), 0);

  return {
    phase: label,
    concurrency,
    requests: count,
    duration_s: +(elapsedMs / 1000).toFixed(2),
    rps: +(count / Math.max(elapsedMs / 1000, 0.001)).toFixed(1),
    ...latencyStats(lat),
    s2xx: countIn(200, 299),
    s4xx: countIn(400, 499),
    s5xx: countIn(500, 599),
    net_errors: net,
    statuses: { ...statuses },
  };
}

async function runRace(label, attempts, op) {
  const lat = [];
  const failures = Object.create(null);
  const results = [];
  let successes = 0;
  let net = 0;
  let s5xx = 0;
  const startMs = Date.now();

  const raw = await Promise.all(Array.from({ length: attempts }, (_, i) => op(i)));
  for (const r of raw) {
    results.push(r);
    lat.push(r.ms);
    if (r.status === 0) {
      net += 1;
      failures.NETWORK = (failures.NETWORK || 0) + 1;
      continue;
    }
    if (r.status >= 200 && r.status < 300) {
      successes += 1;
    } else {
      if (r.status >= 500) s5xx += 1;
      const code = errorCode(r);
      failures[code] = (failures[code] || 0) + 1;
    }
  }

  const elapsedMs = Date.now() - startMs;
  return {
    label,
    attempts,
    successes,
    failures_by_code: { ...failures },
    s5xx,
    net_errors: net,
    duration_s: +(elapsedMs / 1000).toFixed(2),
    ...latencyStats(lat),
    results,
  };
}

function padRow(cells, widths) {
  return cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
}

async function main() {
  const startedAt = new Date().toISOString();
  const token = await login();
  console.log(`target=${BASE} user=${EMAIL} concurrency_levels=${LEVELS.join(',')}`);

  const phases = [];
  const races = [];
  const restoreChecks = [];
  const harnessAssignments = [];
  let incidentCreateSeq = 0;
  let readCursor = 0;
  let failed = false;

  const incidentPayload = (description) => ({
    disaster_type: DISASTER_TYPES[incidentCreateSeq % DISASTER_TYPES.length],
    description,
    latitude: 22.4 + Math.random() * 0.4,
    longitude: 88.05 + Math.random() * 0.55,
    people_affected: 1 + Math.floor(Math.random() * 50),
    emergency_contact_number: '9800000000',
  });

  console.log(`\nREAD PHASES (${READ_SECONDS}s each)`);
  const headerW = [16, 4, 6, 8, 8, 8, 8, 8, 8, 5, 5, 5, 4];
  console.log(
    padRow(
      ['phase', 'C', 'reqs', 'dur_s', 'rps', 'avg_ms', 'p95_ms', 'p99_ms', 'max_ms', '2xx', '4xx', '5xx', 'net'],
      headerW,
    ),
  );

  for (const c of LEVELS) {
    const p = await runPhase(
      'read',
      c,
      async () => {
        const [method, path] = READ_ENDPOINTS[readCursor++ % READ_ENDPOINTS.length];
        return req(method, path, { token });
      },
      { seconds: READ_SECONDS },
    );
    phases.push(p);
    console.log(
      padRow(
        [p.phase, p.concurrency, p.requests, p.duration_s, p.rps, p.avg_ms, p.p95_ms, p.p99_ms, p.max_ms, p.s2xx, p.s4xx, p.s5xx, p.net_errors],
        headerW,
      ),
    );
    if (p.s4xx > 0 || p.s5xx > 0 || p.net_errors > 0) failed = true;
  }

  console.log(`\nINCIDENT CREATION PHASES (total ${TOTAL_CREATES})`);
  console.log(
    padRow(
      ['phase', 'C', 'reqs', 'dur_s', 'rps', 'avg_ms', 'p95_ms', 'p99_ms', 'max_ms', '2xx', '4xx', '5xx', 'net'],
      headerW,
    ),
  );
  const perLevel = Math.ceil(TOTAL_CREATES / LEVELS.length);
  for (const c of LEVELS) {
    const p = await runPhase(
      'create',
      c,
      async () => {
        incidentCreateSeq += 1;
        return req('POST', '/api/v1/incidents', {
          token,
          body: incidentPayload(`LOAD-TEST incident #${incidentCreateSeq} (load harness)`),
        });
      },
      { total: perLevel },
    );
    phases.push(p);
    console.log(
      padRow(
        [p.phase, p.concurrency, p.requests, p.duration_s, p.rps, p.avg_ms, p.p95_ms, p.p99_ms, p.max_ms, p.s2xx, p.s4xx, p.s5xx, p.net_errors],
        headerW,
      ),
    );
    if (p.s2xx !== p.requests || p.net_errors > 0) failed = true;
  }

  const createdIncidents = incidentCreateSeq;

  const printRace = (r) => {
    console.log(
      `  ${r.label.padEnd(34)} attempts=${String(r.attempts).padStart(3)} success=${String(r.successes).padStart(3)} ` +
        `p95=${String(r.p95_ms).padStart(7)}ms 5xx=${r.s5xx} net=${r.net_errors} failures=${JSON.stringify(r.failures_by_code)} ` +
        `=> ${r.verdict}`,
    );
  };

  const cancelAssignment = async (id) =>
    req('PATCH', `/api/v1/assignments/${id}/status`, { token, body: { status: 'CANCELLED', notes: 'LOAD-TEST cleanup' } });

  const trackAssignment = (r) => {
    const id = r.body?.data?.id;
    if (id) harnessAssignments.push(id);
    return id;
  };

  const fetchResource = async (id) => (await list(token, '/api/v1/resources?limit=100')).find((x) => x.id === id);
  const fetchTeam = async (id) => (await list(token, '/api/v1/teams?limit=100')).find((x) => x.id === id);
  const fetchShelter = async (id) => (await list(token, '/api/v1/shelters?limit=100')).find((x) => x.id === id);

  if (SKIP_RACES) {
    console.log('\nRACE SCENARIOS skipped (--skip-races)');
  } else {
    console.log('\nRACE SCENARIOS');
    const raceIncident = await req('POST', '/api/v1/incidents', {
      token,
      body: incidentPayload('LOAD-TEST race harness incident'),
    });
    incidentCreateSeq += 1;
    const raceIncidentId = raceIncident.body?.data?.incident_id;
    if (!raceIncidentId) {
      console.log(`  could not create race incident: status=${raceIncident.status}`);
      failed = true;
    } else {
      const assignUrl = `/api/v1/incidents/${raceIncidentId}/assignments`;

      const resourceList = await list(token, '/api/v1/resources?limit=100');
      const allocTarget = resourceList.find((x) => x.status === 'AVAILABLE' && Number(x.quantity) >= 1);
      if (!allocTarget) {
        races.push({ label: 'resource-double-allocation', skipped: 'no AVAILABLE resource' });
        console.log('  resource-double-allocation SKIPPED (no AVAILABLE resource)');
      } else {
        const rr = await runRace('resource-double-allocation', RACE_N, () =>
          req('POST', assignUrl, {
            token,
            body: {
              notes: 'LOAD-TEST double-allocation race',
              items: [{ resource_type: allocTarget.resource_type, resource_id: allocTarget.id, quantity: 1 }],
            },
          }),
        );
        const winner = rr.results.find((r) => r.status === 201);
        const winnerId = winner ? trackAssignment(winner) : null;
        const unexpected = Object.keys(rr.failures_by_code).filter((c) => c !== 'RESOURCE_UNAVAILABLE');
        let verdict = 'PASS';
        if (rr.net_errors > 0 || rr.s5xx > 0 || rr.successes !== 1 || unexpected.length > 0) verdict = 'FAIL';
        if (verdict === 'FAIL') failed = true;
        let restore = 'n/a';
        if (winnerId) {
          const cancel = await cancelAssignment(winnerId);
          const after = await fetchResource(allocTarget.id);
          restore = `${cancel.status === 200 ? 'cancelled' : `cancel=${cancel.status}`}/${after?.status || 'missing'}`;
          restoreChecks.push({ target: allocTarget.id, expected: 'AVAILABLE', actual: after?.status || 'missing', ok: after?.status === 'AVAILABLE' });
          if (after?.status !== 'AVAILABLE') failed = true;
        }
        const entry = { ...rr, verdict, race_type: 'double_allocation', restore };
        delete entry.results;
        races.push(entry);
        printRace({ ...entry, label: `resource-double-allocation[${allocTarget.id}]` });
        console.log(`    restore=${restore} (expected exactly 1 winner, rest RESOURCE_UNAVAILABLE)`);
      }

      const teamList = await list(token, '/api/v1/teams?limit=100');
      const deployTarget = teamList.find((x) => x.status === 'ACTIVE');
      if (!deployTarget) {
        races.push({ label: 'team-double-deploy', skipped: 'no ACTIVE team' });
        console.log('  team-double-deploy SKIPPED (no ACTIVE team)');
      } else {
        const tr = await runRace('team-double-deploy', Math.min(10, RACE_N), () =>
          req('POST', assignUrl, {
            token,
            body: { notes: 'LOAD-TEST team deploy race', items: [{ team_id: deployTarget.id, quantity: 1 }] },
          }),
        );
        const winner = tr.results.find((r) => r.status === 201);
        const winnerId = winner ? trackAssignment(winner) : null;
        const unexpected = Object.keys(tr.failures_by_code).filter((c) => c !== 'TEAM_UNAVAILABLE');
        let verdict = 'PASS';
        if (tr.net_errors > 0 || tr.s5xx > 0 || tr.successes !== 1 || unexpected.length > 0) verdict = 'FAIL';
        if (verdict === 'FAIL') failed = true;
        let restore = 'n/a';
        if (winnerId) {
          const cancel = await cancelAssignment(winnerId);
          const after = await fetchTeam(deployTarget.id);
          restore = `${cancel.status === 200 ? 'cancelled' : `cancel=${cancel.status}`}/${after?.status || 'missing'}`;
          restoreChecks.push({ target: deployTarget.id, expected: 'ACTIVE', actual: after?.status || 'missing', ok: after?.status === 'ACTIVE' });
          if (after?.status !== 'ACTIVE') failed = true;
        }
        const entry = { ...tr, verdict, race_type: 'double_deploy', restore };
        delete entry.results;
        races.push(entry);
        printRace({ ...entry, label: `team-double-deploy[${deployTarget.id}]` });
        console.log(`    restore=${restore} (expected exactly 1 winner, rest TEAM_UNAVAILABLE)`);
      }

      const shelterList = await list(token, '/api/v1/shelters?limit=100');
      const shelterTarget = shelterList
        .filter((x) => x.status === 'AVAILABLE')
        .map((x) => ({ ...x, free: Number(x.total_capacity) - Number(x.current_occupancy) }))
        .sort((a, b) => b.free - a.free)[0];
      if (!shelterTarget || shelterTarget.free < 2) {
        races.push({ label: 'shelter-capacity-overflow', skipped: 'no shelter with free capacity' });
        console.log('  shelter-capacity-overflow SKIPPED (no shelter with free capacity)');
      } else {
        const slots = Math.floor(shelterTarget.free / 2) + 1;
        const attempts = 8;
        const sr = await runRace('shelter-capacity-overflow', attempts, () =>
          req('POST', assignUrl, {
            token,
            body: {
              notes: 'LOAD-TEST shelter capacity race',
              items: [{ shelter_id: shelterTarget.id, quantity: slots }],
            },
          }),
        );
        for (const r of sr.results) if (r.status === 201) trackAssignment(r);
        const expectedMax = Math.floor(shelterTarget.free / slots);
        const allocated = sr.successes * slots;
        const after = await fetchShelter(shelterTarget.id);
        const finalOccupancy = Number(after?.current_occupancy ?? -1);
        const overAllocated = allocated > shelterTarget.free || finalOccupancy > Number(shelterTarget.total_capacity);
        let verdict = 'PASS';
        if (sr.net_errors > 0 || sr.s5xx > 0 || overAllocated) verdict = 'FAIL';
        else if (sr.successes === 0) verdict = 'FAIL';
        else if (sr.successes < expectedMax) verdict = 'FINDING';
        if (verdict === 'FAIL') failed = true;
        const restore = `${shelterTarget.current_occupancy}->${finalOccupancy}/${shelterTarget.total_capacity} (orig ${shelterTarget.current_occupancy})`;
        restoreChecks.push({
          target: shelterTarget.id,
          expected: String(shelterTarget.current_occupancy),
          actual: String(finalOccupancy),
          ok: false,
        });
        const entry = { ...sr, verdict, race_type: 'shelter_capacity', allocated_slots: allocated, free_slots: shelterTarget.free, final_occupancy: finalOccupancy, restore };
        delete entry.results;
        races.push(entry);
        printRace({ ...entry, label: `shelter-capacity-overflow[${shelterTarget.id}]` });
        console.log(
          `    free=${shelterTarget.free} slot_per_attempt=${slots} allocated=${allocated} final_occupancy=${finalOccupancy} expected_max_successes=${expectedMax}`,
        );
      }

      const completionTarget =
        (await list(token, '/api/v1/resources?limit=100')).find((x) => x.status === 'AVAILABLE' && Number(x.quantity) >= 1) || allocTarget;
      if (!completionTarget) {
        races.push({ label: 'assignment-completion-race', skipped: 'no AVAILABLE resource' });
        console.log('  assignment-completion-race SKIPPED (no AVAILABLE resource)');
      } else {
        const create = await req('POST', assignUrl, {
          token,
          body: {
            notes: 'LOAD-TEST completion race',
            items: [{ resource_type: completionTarget.resource_type, resource_id: completionTarget.id, quantity: 1 }],
          },
        });
        const completionId = trackAssignment(create);
        if (!completionId) {
          races.push({ label: 'assignment-completion-race', skipped: `setup assignment failed status=${create.status}` });
          console.log(`  assignment-completion-race SKIPPED (setup failed status=${create.status} code=${errorCode(create)})`);
        } else {
          const start = await req('PATCH', `/api/v1/assignments/${completionId}/status`, {
            token,
            body: { status: 'IN_PROGRESS', notes: 'LOAD-TEST completion race start' },
          });
          if (start.status !== 200) {
            races.push({ label: 'assignment-completion-race', skipped: `IN_PROGRESS failed status=${start.status}` });
            console.log(`  assignment-completion-race SKIPPED (IN_PROGRESS status=${start.status})`);
          } else {
            const cr = await runRace('assignment-completion-race', Math.min(25, RACE_N), () =>
              req('PATCH', `/api/v1/assignments/${completionId}/status`, {
                token,
                body: { status: 'COMPLETED', notes: 'LOAD-TEST concurrent completion' },
              }),
            );
            const unexpected = Object.keys(cr.failures_by_code).filter((c) => c !== 'INVALID_TRANSITION');
            let verdict = 'PASS';
            if (cr.net_errors > 0 || cr.s5xx > 0 || cr.successes !== 1 || unexpected.length > 0) verdict = 'FAIL';
            else if (cr.successes > 1) verdict = 'FINDING';
            if (cr.successes > 1) verdict = 'FINDING';
            if (verdict === 'FAIL') failed = true;
            const after = await fetchResource(completionTarget.id);
            restoreChecks.push({ target: completionTarget.id, expected: 'AVAILABLE', actual: after?.status || 'missing', ok: after?.status === 'AVAILABLE' });
            if (after?.status !== 'AVAILABLE') failed = true;
            const entry = { ...cr, verdict, race_type: 'concurrent_completion', assignment: completionId, resource_restored: after?.status || 'missing' };
            delete entry.results;
            races.push(entry);
            printRace({ ...entry, label: 'assignment-completion-race' });
            console.log(
              `    resource_after=${after?.status || 'missing'} (expected exactly 1 COMPLETED, rest INVALID_TRANSITION; >1 success = concurrent-transition finding)`,
            );
          }
        }
      }
    }
  }

  console.log('\nCLEANUP');
  let cancelled = 0;
  let stillOpen = 0;
  for (const id of harnessAssignments) {
    const detail = await req('GET', `/api/v1/assignments/${id}`, { token });
    const status = detail.body?.data?.status;
    if (status === 'ASSIGNED' || status === 'IN_PROGRESS') {
      const c = await cancelAssignment(id);
      if (c.status === 200) cancelled += 1;
      else {
        stillOpen += 1;
        console.log(`  cancel ${id} failed status=${c.status}`);
      }
    }
  }
  for (const check of restoreChecks) {
    if (check.target?.startsWith('SHL-')) {
      const after = await fetchShelter(check.target);
      const current = String(after?.current_occupancy ?? 'missing');
      check.actual = current;
      check.ok = current === check.expected;
      if (!check.ok) failed = true;
    }
  }
  console.log(`  assignments created=${harnessAssignments.length} cancelled=${cancelled} open_after=${stillOpen}`);
  for (const c of restoreChecks) {
    console.log(`  restore ${c.target}: expected=${c.expected} actual=${c.actual} ${c.ok ? 'OK' : 'MISMATCH'}`);
  }
  console.log(`  residual LOAD-TEST incidents left in DB: ${createdIncidents} (+1 race incident if used) — no DELETE endpoint exists`);

  const totalRequests = phases.reduce((a, p) => a + p.requests, 0);
  const total4xx = phases.reduce((a, p) => a + p.s4xx, 0);
  const total5xx = phases.reduce((a, p) => a + p.s5xx, 0);
  const totalNet = phases.reduce((a, p) => a + p.net_errors, 0);

  console.log('\nSUMMARY');
  console.log(`  load requests=${totalRequests} 4xx=${total4xx} 5xx=${total5xx} network_errors=${totalNet}`);
  console.log(`  races=${races.map((r) => `${r.skipped ? `${r.label}:SKIPPED` : `${r.label}:${r.verdict}`}`).join(', ') || 'none'}`);
  console.log(`  restore_checks=${restoreChecks.filter((c) => c.ok).length}/${restoreChecks.length} ok`);
  const verdict = failed || total5xx > 0 || total4xx > 0 || totalNet > 0 ? 'ATTENTION' : 'CLEAN';
  console.log(`  harness verdict=${verdict}`);

  const report = {
    target: BASE,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    options: {
      concurrency: LEVELS,
      read_seconds: READ_SECONDS,
      creates: TOTAL_CREATES,
      race_attempts: RACE_N,
      skip_races: SKIP_RACES,
    },
    incidents_created: createdIncidents + 1,
    phases,
    races,
    restore_checks: restoreChecks,
    totals: { requests: totalRequests, s4xx: total4xx, s5xx: total5xx, network_errors: totalNet, cancelled_assignments: cancelled, open_after_cleanup: stillOpen },
    verdict,
  };

  if (AS_JSON) {
    console.log('\nRESULT_JSON_START');
    console.log(JSON.stringify(report, null, 2));
    console.log('RESULT_JSON_END');
  }

  process.exit(verdict === 'CLEAN' && races.every((r) => r.verdict === 'PASS' || r.skipped) ? 0 : 1);
}

main().catch((err) => {
  console.error('Harness crashed:', err);
  process.exit(1);
});
