"""Exercise the actual map, geographic markers and GNSS Setup without external tiles."""
from pathlib import Path
import re
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest

DASHBOARD = Path(__file__).resolve().parents[1] / 'dashboard'


@unittest.skipUnless(shutil.which('chromium'), 'requires Chromium')
class BrowserFieldTest(unittest.TestCase):
    def test_field(self):
        page = (DASHBOARD / 'index.html').read_text().split('  <script>')[0]
        page = re.sub(r'<link rel="stylesheet" href="assets/([^"]+)">', lambda match:
                      '<style>' + (DASHBOARD / match[1]).read_text() + '</style>', page)
        page += '<script>' + (DASHBOARD / 'leaflet.js').read_text() + '</script>'
        page += """<script>
        // Render the full Leaflet vector map, while keeping every tile request offline.
        L.TileLayer.prototype.createTile = () => document.createElement('canvas');
        const state = {settings:{gnss:{target_accuracy_m:1,max_wait_s:5}}, connected:true, drive:{you_control_owner:false}};
        const logs = []; window.operatorFieldLog = rows => logs.push(rows);
        let sent; const send = message => { sent = message; };
        let next, data = {fix:null,trail:[],receiver:'Waiting for receiver',entries:[],revision:'a'};
        window.fetch = async () => Response.json(data);
        let ready; const initialized = new Promise(resolve => ready=resolve);
        window.setTimeout = (fn, delay) => { if (delay === 1000) { next=fn; ready(); } };
        </script>"""
        page += '<script>' + (DASHBOARD / 'field-map.js').read_text() + '</script>'
        page += """<script>window.addEventListener('load', async () => {
          const el = id => document.getElementById(id);
          const check = (ok, message) => { if (!ok) throw Error(message); };
          try {
            await initialized;
            check(!el('gnss-map-empty').hidden && el('map-follow').disabled, 'initial missing fix');
            data = {fix:{latitude:0,longitude:0,horizontal_accuracy_m:.42,fix:'RTK float',satellites:20},
              trail:[[1,0,0],[2,0,.00001]],device:'/dev/ttyAMA0',receiver:'RTK float',revision:'b',
              entries:[{id:'m',kind:'pump_mark',latitude:0,longitude:0,gps_status:'uncertain',horizontal_accuracy_m:4}]};
            await next();
            check(el('gnss-map-empty').hidden && !el('map-follow').disabled, 'first zero-coordinate fix initializes map');
            check(el('gnss-map').querySelectorAll('svg path').length >= 4, 'trail, car, radius and ground mark are drawn');
            check(el('gnss-accuracy').textContent==='0.42 m' && logs.at(-1)[0].id==='m', 'accuracy and shared log');
            check(el('gnss-save').disabled, 'spectator');
            state.drive.you_control_owner=true; await next(); el('gnss-wait').value=0; el('gnss-save').click();
            check(sent?.section==='gnss' && sent.value.max_wait_s===0, 'zero wait submitted through settings');
            el('map-follow').click(); check(el('map-follow').getAttribute('aria-pressed')==='false', 'follow toggle');
            el('map-mode').value='local'; el('map-mode').onchange(); check(!el('map-view').hidden && el('gnss-map').hidden,'local grid fallback');
            data={fix:null,trail:data.trail,receiver:'Stale fix'}; await next();
            check(el('gnss-map-status').textContent==='Stale fix' && el('gnss-accuracy').textContent==='—','stale position');
            document.body.textContent='FIELD PASSED';
          } catch (error) { document.body.textContent='FIELD FAILED '+error.stack; }
        });</script>"""
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'field.html'
            path.write_text(page)
            process = subprocess.run(['chromium', '--headless', '--no-sandbox', '--disable-gpu',
                                      '--user-data-dir=' + directory + '/profile', '--virtual-time-budget=3000',
                                      '--dump-dom', path.as_uri()], capture_output=True, text=True, timeout=60)
        body = process.stdout.split('<body>')[-1]
        self.assertIn('FIELD PASSED</body>', body, body[-1500:] + process.stderr[-1000:])
