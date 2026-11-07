// Run: node src/peaceofmine_operator/test/test_search_alert.cjs
// Operator search alert (dashboard/app.js, between the search-alert markers).
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../dashboard/app.js'), 'utf8');
const block = source.slice(source.indexOf('// search-alert:start'), source.indexOf('// search-alert:end'));
const api = new Function(`${block}; return {stepSearchAlert, clampSearchAlertLevel, SEARCH_ALERT_DEFAULT_LEVEL};`)();
const {stepSearchAlert, clampSearchAlertLevel} = api;

function expect(ok, message) { if (!ok) throw new Error(message); }
const base = {enabled: true, level: 60, live: true, suppressed: false};
function run(samples, start = {phase: 'idle'}) {
  let alert = start;
  let fires = 0;
  for (const [now, signal, extra] of samples) {
    const step = stepSearchAlert(alert, {...base, ...extra, signal, now});
    alert = step.alert;
    if (step.fired) fires += 1;
  }
  return {alert, fires};
}

// Level is a percent of the mine level: 20–100 in steps of 5, default 60.
expect(api.SEARCH_ALERT_DEFAULT_LEVEL === 60, 'default alert level is 60%');
expect(clampSearchAlertLevel(5) === 20 && clampSearchAlertLevel(250) === 100, 'level is kept between 20% and 100%');
expect(clampSearchAlertLevel(62) === 60 && clampSearchAlertLevel('abc') === 60, 'level snaps to 5% steps and falls back to default');

// Fires once the reading stays at or above the level for 150 ms.
expect(run([[0, 70], [100, 70]]).fires === 0, 'a spike shorter than 150 ms does not alert');
expect(run([[0, 70], [150, 70]]).fires === 1, 'a reading held at the level for 150 ms alerts');
expect(run([[0, 59], [200, 59]]).fires === 0, 'a reading below the level never alerts');

// One alert per target: no repeat while the signal stays high or dips briefly.
expect(run([[0, 70], [150, 70], [400, 80], [600, 50], [1000, 70], [1200, 70]]).fires === 1,
  'staying near the target does not repeat the alert');
// Re-arms after 1.5 s clearly below the level (5 points under it).
expect(run([[0, 70], [150, 70], [300, 50], [1900, 50], [2000, 70], [2200, 70]]).fires === 2,
  'a new target after 1.5 s below the level alerts again');
expect(run([[0, 70], [150, 70], [300, 57], [2000, 57], [2100, 70], [2300, 70]]).fires === 1,
  'hovering just under the level does not re-arm the alert');

// Never alerts while it is off, the detector is stale, or a confirm/probe run is active.
expect(run([[0, 90, {enabled: false}], [200, 90, {enabled: false}]]).fires === 0, 'disabled alert stays silent');
expect(run([[0, 90, {live: false}], [200, 90, {live: false}]]).fires === 0, 'stale detector data never alerts');
expect(run([[0, 90, {suppressed: true}], [200, 90, {suppressed: true}]]).fires === 0, 'no alert during confirm or probe runs');
const peak = run([[0, 70], [150, 70], [300, 95], [400, 65]]).alert.peak;
expect(peak === 95, 'the alert remembers the peak signal');

console.log('search alert tests passed');
