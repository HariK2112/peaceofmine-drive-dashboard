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
    phaseAt: 0, depth: 0, cycle: false, calibrating: false, homing: 0, homed: false};
  window.__mockCar = mock; // preview-only handle for scripted checks
  const capture = {device:'auto', width:640, height:480, framerate:30, pixel_format:'mjpeg2rgb'};
  mock.settings = {
    gnss: {max_wait_s: 5, target_accuracy_m: 1},
    marking:{duration_s:2, idle_percent:0, active_percent:100, manual_percent:0},
    saved:true, driving:{input:'controller',forward_percent:100,reverse_percent:100},
    display:{mapping:'auto',sensitivity:100,wheel:{steering:0,throttle:1,brake:2,deadman:0,invertSteering:false,
      invertThrottle:true,invertBrake:true,deadzone:.05},searchAlert:{enabled:true,level:60,sound:true}},
    cameras:{forward:{source:'virtual',rotation:0},auxiliary:{source:'raspberry:camera_probe',rotation:0},
      capture:{forward:{...capture},auxiliary:{...capture}}}
  };
  mock.fieldEntries = [];
  const pump = {mode:'idle', until:0, output:0, lastRequest:null};
  function stopPump() {
    pump.mode = 'idle';
    pump.until = 0;
    pump.output = mock.owner && mock.armed ? mock.settings.marking.idle_percent : 0;
  }

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
    if (!mock.owner || pump.mode === 'idle' || performance.now() >= pump.until) stopPump();
    pressureHistory.push(mock.cycle ? 0.08 + mock.depth / 150 + 0.02 * Math.random() : 0.05 + 0.01 * Math.random());
    while (pressureHistory.length > 150) pressureHistory.shift();
    return {
      type: 'state',
      marking:{settings:{...mock.settings.marking},mode:pump.mode,output_percent:pump.output,last_shot_request:pump.lastRequest},
      pump_active:pump.mode !== 'idle',
      safety: {allowed: true, servo_allowed: true, mode: 'simulation', simulated: true, reason: 'Pretend car (preview)'},
      drive: {armed: mock.armed, px4_armed: null, input: mock.settings.driving.input, rc: {fresh: false}, deadman: false, publishing: mock.owner && (mock.linear !== 0 || mock.angular !== 0),
        command_source: 'browser', joy: {seen: false}, cmd_linear_x: mock.linear, cmd_angular_z: mock.angular,
        cmd_vel_topic: 'cmd_vel', timeout_ms: 300, client_count: 1, you_control_owner: mock.owner,
        control_owner_present: mock.owner, calibrating: mock.calibrating, max_velocity_mps: 0.8, max_yaw_rate_rad_s: 1.4, pump_active: pump.mode !== 'idle'},
      robot: {...mock.pose, speed_mps: Math.abs(mock.linear), stationary: mock.linear === 0, odometry_fresh: true, pose_fresh: true},
      detector: {signal_ratio: ratio, threshold_ratio: 1, detected: ratio >= 1, fresh: true, fixture_angle_deg: angle,
        sweep_enabled: mock.sweep, sweep_speed_deg_s: 36, sweep_speed_min: 5, sweep_speed_max: 180, beam_half_angle_deg: 45,
        beam_min_angle_deg: -45, beam_max_angle_deg: 45, beam: [],
        sensor: {available: true, fresh: true, age_ms: 20, rate_hz: 50, received: Math.round(t * 50), invalid_lines: 0,
          reference_voltage: 3.3, baseline_adc: 40, packet: {filtered_adc: filtered, precise_adc: filtered, amplitude_adc: filtered}, full_response_adc: 160, port: '/dev/ttyMOCK',
          history_age_s: 0, history: detectorHistory.map(p => ({age_s: +(t - p.at).toFixed(3), adc: p.adc, filtered_adc: p.filtered_adc}))}},
      probe: {depth_mm: mock.depth, target_mm: mock.cycle ? 60 : 0, max_depth_mm: 110, pressure_ratio: mock.cycle ? 0.1 + mock.depth / 200 : 0.05,
        pressure_history: pressureHistory.slice(), fault: false, ready: true, active: mock.cycle, cycle_active: mock.cycle, cycle_phase: mock.cyclePhase, holding: false,
        adc_contact_state: {enabled: true, fresh: true, detected: false, value: 0.2, level: 1, direction: 'above'}},
      power: {battery: {available: true, present: true, stale: false, power_w: 38 + 6 * Math.sin(t / 3) + mock.linear * 40,
          current_a: 3.2, voltage_v: 11.9, remaining_pct: 72, temperature_c: 31, cell_delta_v: 0.012},
        history: Array.from({length: 30}, (_, i) => ({age_s: i * 2, watts: 38 + 6 * Math.sin((t - i * 2) / 3)})),
        esc: {available: true, stale: false, motors: [{id: 1, online: true, power_w: 12, current_a: 1, temperature_c: 34, rpm: 0, faults: 0}]}},
      actuators: {arm: {connected: true, arm_calibration: true, servo_id: 1, voltage: 11.8, current_a: 0.12, temperature_c: 33},
        probe: {connected: true, servo_id: 2, serial_connected: true, position: 2048, goal_position: 2048, torque: false, reverse: false, position_mode: 'multi-turn',
          homing: mock.homing > 0, home_position: mock.homed ? 2048 : null, home_status: mock.homed ? 'Homed at top' : mock.homing ? 'Homing…' : 'Not homed', probe: {calibrated: true, max_depth_mm: 110}}},
      settings: structuredClone(mock.settings),
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
      if (m.type === 'take_control') { mock.owner = true; mock.armed = true; stopPump(); return; }
      if (m.type === 'release_control' || m.type === 'estop') { mock.owner = mock.armed = false; mock.linear = mock.angular = 0; mock.sweep = false; stopPump(); return; }
      if (!mock.owner) return;
      if (m.type === 'pump_mark' && !mock.calibrating && !mock.inspection.active && !mock.cycle && pump.mode === 'idle') {
        const settings = mock.settings.marking, fix = mock.fieldFix();
        Object.assign(pump, {mode:'shot', output:settings.active_percent,
          until:performance.now() + settings.duration_s * 1000, lastRequest:m.request_id});
        const within = fix && Number.isFinite(fix.horizontal_accuracy_m) && fix.horizontal_accuracy_m <= mock.settings.gnss.target_accuracy_m;
        mock.fieldEntries.unshift({id:m.request_id || String(Date.now()), timestamp:Date.now()/1000,
          kind:'pump_mark', status:'SHOT COMMANDED', statusType:'marked', ...settings, ...fix,
          x:mock.pose.x, y:mock.pose.y, heading_deg:mock.pose.yaw * 180 / Math.PI,
          gps_status:within ? 'within_target' : fix ? 'uncertain' : 'unavailable'});
        return;
      }
      if (m.type === 'pump_manual' && mock.calibrating && !mock.cycle) {
        const now = performance.now();
        if (m.action === 'start' && pump.mode === 'idle')
          Object.assign(pump, {mode:'manual', output:m.percent, until:now+250});
        if (pump.mode === 'manual' && m.action === 'renew' && now < pump.until) pump.until = now+250;
        if (pump.mode === 'manual' && m.action === 'stop') stopPump();
        return;
      }
      if (m.type === 'settings' && ['driving','display','cameras','gnss','marking'].includes(m.section)) {
        mock.settings[m.section] = m.value;
        this.emit({type:'settings_result',section:m.section,ok:true,message:'Saved in preview.'});
        return;
      }
      if (m.type === 'clear_log') mock.fieldEntries.length = 0;
      if (m.type === 'log_pose') mock.fieldEntries.unshift({...mock.pose,id:crypto.randomUUID(),timestamp:Date.now()/1000,status:'POSE LOGGED'});
      if (m.type === 'drive' && mock.owner) { mock.linear = m.deadman ? m.linear_x : 0; mock.angular = m.deadman ? m.angular_z : 0; return; }
      if (m.type === 'sweep_enabled') { mock.sweep = !!m.enabled; return; }
      if (m.type === 'calibration_begin' || m.type === 'calibration_end') { stopPump(); mock.calibrating = m.type === 'calibration_begin'; mock.homing = 0; return; }
      if (m.type === 'arm_servo' && m.role === 'probe' && m.action === 'home' && m.held) { mock.calibrating = true; if (++mock.homing > 15) mock.homed = true; return; }
      if (m.type === 'arm_servo' && m.action === 'stop') { mock.homing = 0; return; }
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
  const fieldTrail = [];
  mock.fieldFix = () => ({latitude: 59.35 + mock.pose.y / 111320, longitude: 18.07 + mock.pose.x / 56750,
    horizontal_accuracy_m: .4, satellites: 16, fix: 'Preview fix'});
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = String(input?.url ?? input);
    if (url.startsWith('/api/field')) {
      const fix = mock.fieldFix();
      const last = fieldTrail.at(-1);
      if (fix && (!last || last[1] !== fix.latitude || last[2] !== fix.longitude)) {
        fieldTrail.push([Date.now()/1000, fix.latitude, fix.longitude]);
        if (fieldTrail.length > 900) fieldTrail.shift();
      }
      const revision = JSON.stringify(mock.fieldEntries.map(entry => [entry.id, entry.gps_status]));
      return Promise.resolve(Response.json({device:'Preview', receiver:fix?.fix || 'No fix', fix,
        trail:fieldTrail, entries:mock.fieldEntries, revision}));
    }
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
