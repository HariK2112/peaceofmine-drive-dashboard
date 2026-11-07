// Preview-only pretend car. Loaded only with ?mock=1 and never served by the
// car (operator_web_node.py does not allow-list this file). It replaces the
// /ws WebSocket with a local source that emits `state` messages shaped like
// operator_control_node.py + web_bridge.py telemetry.
(() => {
  const RealWebSocket = window.WebSocket;
  const started = performance.now();
  const detectorHistory = [];
  const pressureHistory = Array(150).fill(0.05);
  const mock = {owner: false, armed: false, sweep: false, linear: 0, angular: 0, pose: {x: 0, y: 0, yaw: 0},
    inspection: {phase: 'IDLE', active: false, message: '', completed: 0, total: 0, confirmed_angle_deg: null, points: []},
    phaseAt: 0, depth: 0, cycle: false};
  // Show the pretend probe camera (served by the preview at /camera/camera_probe).
  try {
    const key = 'peaceofmine.operator.preferences';
    const prefs = JSON.parse(localStorage.getItem(key) || '{}') || {};
    prefs.cameras = Object.assign({forward: 'virtual'}, prefs.cameras);
    if (!prefs.cameras.auxiliary || prefs.cameras.auxiliary === 'off') prefs.cameras.auxiliary = 'raspberry:camera_probe';
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch {}

  // Pretend inspection: confirm takes 4 s, then 5 probe points of 2 s each.
  function stepInspection(t) {
    const i = mock.inspection, dt = t - mock.phaseAt;
    if (i.phase === 'CONFIRMING') {
      i.progress = Math.min(2, dt / 2);
      if (dt >= 4) Object.assign(i, {phase: 'CONFIRMED', active: false, message: '', confirmed_angle_deg: 6, probe_reachable: true, progress: 2});
    } else if (i.phase === 'PROBING') {
      const point = Math.floor(dt / 2), within = (dt % 2) / 2;
      mock.cycle = point < 5;
      mock.depth = mock.cycle ? 60 * Math.sin(Math.PI * within) : 0;
      mock.cyclePhase = within < 0.5 ? 'DESCENDING' : 'RETRACTING';
      while (i.points.length < Math.min(point, 5)) {
        const n = i.points.length;
        i.points.push({angle_deg: i.confirmed_angle_deg - 10 + 5 * n, status: n === 2 ? 'CONTACT' : 'CLEAR', depth_mm: n === 2 ? 38 : 60});
      }
      i.completed = i.points.length; i.progress = i.completed;
      if (point >= 5) Object.assign(i, {phase: 'COMPLETE', active: false, message: 'Probe scan complete · 1 contact.'});
    }
  }

  function telemetry() {
    const t = (performance.now() - started) / 1000;
    const angle = mock.sweep ? 40 * Math.sin(t * 1.2) : 0;
    const nearTarget = Math.exp(-((mock.pose.x - 8) ** 2) / 2);
    const filtered = 40 + 120 * nearTarget * Math.cos(angle * Math.PI / 180) ** 2 + 4 * Math.sin(t * 7);
    detectorHistory.push({at: t, adc: Math.round(filtered + 3 * Math.random()), filtered_adc: Math.round(filtered)});
    while (detectorHistory.length && t - detectorHistory[0].at > 30) detectorHistory.shift();
    const dt = 0.1;
    mock.pose.yaw += mock.angular * dt;
    mock.pose.x += mock.linear * Math.cos(mock.pose.yaw) * dt;
    mock.pose.y += mock.linear * Math.sin(mock.pose.yaw) * dt;
    const ratio = Math.max(0, Math.min(1, (filtered - 40) / 120));
    stepInspection(t);
    pressureHistory.push(mock.cycle ? 0.08 + mock.depth / 150 + 0.02 * Math.random() : 0.05 + 0.01 * Math.random());
    while (pressureHistory.length > 150) pressureHistory.shift();
    return {
      type: 'state',
      safety: {allowed: true, servo_allowed: true, mode: 'simulation', simulated: true, reason: 'Pretend car (preview)'},
      drive: {armed: mock.armed, deadman: false, publishing: mock.owner && (mock.linear !== 0 || mock.angular !== 0),
        command_source: 'browser', joy: {seen: false}, cmd_linear_x: mock.linear, cmd_angular_z: mock.angular,
        cmd_vel_topic: 'cmd_vel', timeout_ms: 300, client_count: 1, you_control_owner: mock.owner,
        control_owner_present: mock.owner, max_velocity_mps: 0.8, max_yaw_rate_rad_s: 1.4, pump_active: false},
      robot: {...mock.pose, speed_mps: Math.abs(mock.linear), stationary: mock.linear === 0, odometry_fresh: true, pose_fresh: true},
      detector: {signal_ratio: ratio, threshold_ratio: 0.6, detected: ratio > 0.6, fresh: true, fixture_angle_deg: angle,
        sweep_enabled: mock.sweep, sweep_speed_deg_s: 36, sweep_speed_min: 5, sweep_speed_max: 180, beam_half_angle_deg: 45,
        beam_min_angle_deg: -45, beam_max_angle_deg: 45, beam: [],
        sensor: {available: true, fresh: true, age_ms: 20, rate_hz: 50, received: Math.round(t * 50), invalid_lines: 0,
          reference_voltage: 3.3, baseline_adc: 40, packet: {filtered_adc: filtered, precise_adc: filtered, amplitude_adc: filtered}, full_response_adc: 200, port: '/dev/ttyMOCK',
          history_age_s: 0, history: detectorHistory.map(p => ({age_s: +(t - p.at).toFixed(3), adc: p.adc, filtered_adc: p.filtered_adc}))}},
      probe: {depth_mm: mock.depth, target_mm: mock.cycle ? 60 : 0, max_depth_mm: 110, pressure_ratio: mock.cycle ? 0.1 + mock.depth / 200 : 0.05,
        pressure_history: pressureHistory.slice(), fault: false, ready: true, active: mock.cycle, cycle_active: mock.cycle, cycle_phase: mock.cyclePhase, holding: false,
        adc_contact_state: {enabled: true, fresh: true, detected: false, value: 0.2, level: 1, direction: 'above'}},
      power: {battery: {available: true, present: true, stale: false, power_w: 38 + 6 * Math.sin(t / 3) + mock.linear * 40,
          current_a: 3.2, voltage_v: 11.9, remaining_pct: 72, temperature_c: 31, cell_delta_v: 0.012},
        history: Array.from({length: 30}, (_, i) => ({age_s: i * 2, watts: 38 + 6 * Math.sin((t - i * 2) / 3)})),
        esc: {available: true, stale: false, motors: [{id: 1, online: true, power_w: 12, current_a: 1, temperature_c: 34, rpm: 0, faults: 0}]}},
      actuators: {arm: {connected: true, arm_calibration: true, servo_id: 1, voltage: 11.8, current_a: 0.12, temperature_c: 33}},
      inspection: structuredClone(mock.inspection),
      cameras: {camera_probe: {label: 'camera / probe', topic: '/camera/probe/camera_info', fps: 15, frame_age_ms: 60, width: 944, height: 704}},
    };
  }

  class MockSocket extends EventTarget {
    constructor(url) {
      super();
      this.url = url; this.readyState = 0;
      setTimeout(() => {
        this.readyState = 1; this.onopen?.({});
        this.timer = setInterval(() => this.emit(telemetry()), 100);
      }, 300);
    }
    emit(message) { if (this.readyState === 1) this.onmessage?.({data: JSON.stringify(message)}); }
    send(raw) {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.type === 'latency_ping') return setTimeout(() => this.emit({type: 'latency_pong', probe_id: m.probe_id}), 18);
      if (m.type === 'take_control') { mock.owner = true; mock.armed = true; return; }
      if (m.type === 'release_control' || m.type === 'estop') { mock.owner = mock.armed = false; mock.linear = mock.angular = 0; mock.sweep = false; return; }
      if (m.type === 'drive' && mock.owner) { mock.linear = m.deadman ? m.linear_x : 0; mock.angular = m.deadman ? m.angular_z : 0; return; }
      if (m.type === 'sweep_enabled') { mock.sweep = !!m.enabled; return; }
      if (m.type === 'inspection') {
        const t = (performance.now() - started) / 1000;
        if (m.action === 'stop') Object.assign(mock.inspection, {phase: 'STOPPED', active: false, message: 'Inspection stopped.'}), mock.cycle = false, mock.depth = 0;
        if (m.action === 'confirm') Object.assign(mock.inspection, {phase: 'CONFIRMING', active: true, total: 2, completed: 0, progress: 0, points: [], message: ''});
        if (m.action === 'probe_scan') Object.assign(mock.inspection, {phase: 'PROBING', active: true, total: 5, completed: 0, progress: 0, points: [], message: ''});
        mock.phaseAt = t;
      }
    }
    close() { clearInterval(this.timer); if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({}); }
  }
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) MockSocket[k] = RealWebSocket[k];

  // /api/adc: ADS1115 sample batches (detector on MUX 6, probe contact on MUX 4).
  const adcConfig = {bus: 1, address: 72, rate: 128, pga: 1, mode: 'single', alert: 'disabled', polarity: 0, latch: false,
    queue: 1, low: -1000, high: 1000, interval_ms: 0,
    channels: Array.from({length: 8}, (_, i) => ({mux: i, enabled: i === 4 || i === 6, multiplier: 1, offset: 0}))};
  let adcSeq = 0, adcLast = performance.now() / 1000;
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = String(input?.url ?? input);
    if (!url.startsWith('/api/adc')) return realFetch(input, init);
    const now = performance.now() / 1000, samples = [];
    for (let t = adcLast + 0.02; t <= now; t += 0.02) {
      const near = Math.exp(-((mock.pose.x - 8) ** 2) / 2);
      const angle = mock.sweep ? 40 * Math.sin(t * 1.2) : 0;
      const volts = 0.45 + 1.4 * near * Math.cos(angle * Math.PI / 180) ** 2 + 0.03 * Math.sin(t * 9);
      samples.push({seq: ++adcSeq, time: t, mux: 6, raw: Math.round(volts * 8000), volts, scaled: volts, clipped: false});
      samples.push({seq: ++adcSeq, time: t, mux: 4, raw: 1600, volts: 0.2, scaled: 0.2, clipped: false});
      adcLast = t;
    }
    const body = {session: 'mock', revision: 1, applied: 1, running: true, connected: true, demo: true, error: null,
      registers: {config: 0x8583}, now, sequence: adcSeq, config: adcConfig,
      routes: ['none', 'none', 'none', 'none', 'probe', 'none', 'detector', 'none'],
      probe_trigger: {enabled: true, mux: 4, level: 1, direction: 'above', hysteresis: 0, debounce_ms: 0},
      probe_contact: {enabled: true, fresh: true, detected: false, mux: 4, value: 0.2, level: 1, direction: 'above'},
      samples};
    return Promise.resolve(new Response(JSON.stringify(body), {headers: {'Content-Type': 'application/json'}}));
  };

  window.WebSocket = function (url, protocols) {
    return /\/ws$/.test(String(url)) ? new MockSocket(url) : new RealWebSocket(url, protocols);
  };
  Object.assign(window.WebSocket, {CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3});
})();
