"""Exercise real ADS1115 settings and Chart.js overlays in Chromium."""
import copy
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest
from peaceofmine_operator.ads1115 import DEFAULTS
from peaceofmine_operator.camera_settings import DEFAULTS as CAMERA_DEFAULTS

DASHBOARD = Path(__file__).resolve().parents[1] / 'dashboard'


@unittest.skipUnless(shutil.which('chromium'), 'Chromium required')
class BrowserADCTest(unittest.TestCase):
    def test_settings_routing_and_sample_batches(self):
        config = copy.deepcopy(DEFAULTS)
        for channel in config['channels']:
            channel['enabled'] = channel['mux'] in (4, 6)
        value = dict(config=config, routes=['none']*4+['probe','none','detector','none'],
                     revision=1, applied=1, running=True, connected=True, demo=True,
                     error=None, registers={'config': 0x8583}, now=100, sequence=2,
                     probe_trigger=dict(enabled=False,mux=4,level=1.,direction='above',hysteresis=0.,debounce_ms=0.),
                     samples=[dict(seq=1, time=99.9, mux=6, raw=100, volts=.1, scaled=2, filtered_scaled=2, filtered_volts=.1, clipped=False),
                              dict(seq=2, time=99.9, mux=4, raw=200, volts=.2, scaled=3, filtered_scaled=3, filtered_volts=.2, clipped=False)])
        setup = '''
window.requestAnimationFrame = () => 0;
window.setInterval = () => 0;
window.setTimeout = (fn) => { if(fn.name === 'poll') window.nextPoll = fn; return 0; };
window.WebSocket = class {static OPEN=1; readyState=1; send(data) {window.sent.push(JSON.parse(data));}};
window.sent=[];
window.fetch = async () => ({ok:true, json:async () => window.adcResponse});
'''
        checks = '''
const assert = (v,label) => {if(!v) throw Error(label);};
for(let i=0;i<10;i++) await Promise.resolve();
state.connected=true; state.drive.you_control_owner=true;
$('probe-diagnostics').open=true;
$('settings').click(); document.querySelector('[data-settings-tab="adc"]').click();
await window.nextPoll();
assert($('adc-status').textContent.includes('DEMO'), 'demo is explicit: '+$('adc-status').textContent+' '+$('adc-error').textContent);
assert(document.querySelectorAll('[data-adc-channel]').length === 8, 'all mux inputs');
assert(!document.querySelector('[data-adc-channel] select') && $('settings-contact').contains($('adc-trigger-mux')) && $('settings-detector').contains($('metal-adc-input')), 'sensor tabs own their assignments');
assert($('adc-trigger-mux').value==='4', 'default probe trigger uses A0');
assert($('adc-readings').textContent.includes('Live'), 'live readings');
const draftField=document.querySelector('[data-adc-field="rate"]');
draftField.value='64'; await window.nextPoll();
assert(draftField.value==='64', 'poll preserves edits');
$('adc-apply').click();
assert(sent.at(-1).settings.config.rate===64, 'settings sent');
assert(sent.at(-1).settings.routes[6]==='detector' && sent.at(-1).settings.routes[4]==='probe', 'A2 detector and A0 probe routing');
operatorADCResult({ok:true});
document.querySelectorAll('[data-dock-pane]').forEach(pane => { pane.hidden = false; }); // charts live in dock tabs
drawPressureHistory(); drawDetectorDiagnostics(1000);
assert(probePressureChart.data.datasets.at(-1).label.includes('A0'), 'A0 probe trace');
assert(probePressureChart.data.datasets.at(-1).data[0].y===3, 'scaled probe value');
assert(detectorDiagnosticsChart.data.datasets.at(-1).label.includes('A2'), 'A2 detector trace');
assert(detectorDiagnosticsChart.data.datasets.at(-1).data[0].y===2, 'scaled detector value');
const routedAxis=detectorDiagnosticsChart.scales.ads1115;
assert(routedAxis.min>1.9 && routedAxis.max<2.1 && routedAxis.max-routedAxis.min>.03,'routed detector axis fits its measured signal with a noise floor');
adcResponse={...adcResponse,revision:2,applied:2,routes:['none','none','none','none','both','none','none','none'],sequence:3,
 samples:[{seq:3,time:100,mux:4,raw:300,volts:.3,scaled:7,filtered_scaled:7,filtered_volts:.3,clipped:true}]};
await window.nextPoll(); drawPressureHistory(); drawDetectorDiagnostics(2000);
assert(probePressureChart.data.datasets.length===3, 'old routing removed');
assert(probePressureChart.data.datasets.at(-1).data.length===1, 'revision clears old samples');
assert(probePressureChart.data.datasets.at(-1).data[0].y===7, 'new samples arrive');
assert($('adc-readings').textContent.includes('CLIPPED'), 'clipping shown');
adcResponse={...adcResponse,probe_trigger:{enabled:true,mux:4,level:6,direction:'above'},
 probe_contact:{enabled:true,fresh:true,detected:true,mux:4,value:7,level:6,direction:'above'},samples:[]};
await window.nextPoll(); drawPressureHistory();
assert(probePressureChart.data.datasets.at(-1).label.includes('Contact trigger'), 'probe threshold plotted');
assert(probePressureChart.data.datasets.at(-1).data[0].y===6, 'threshold uses scaled axis');
assert($('probe-adc-contact').textContent.includes('CONTACT'), 'contact indication');
adcResponse={...adcResponse,probe_contact:{...adcResponse.probe_contact,fresh:false,detected:null}};
await window.nextPoll();
assert($('probe-adc-contact').textContent.includes('Waiting for contact') && !$('probe-adc-contact').textContent.includes('CONTACT'),'stale sensor never reports contact');
assert(detectorDiagnosticsChart.data.datasets.at(-1).data[0].y===7, 'both destination');
adcResponse={...adcResponse,now:100.02,sequence:4,samples:[{seq:4,time:100.02,mux:4,raw:400,volts:.4,scaled:9,filtered_scaled:7.42,filtered_volts:.321,clipped:false}]};
await window.nextPoll();drawPressureHistory();drawDetectorDiagnostics(2100);
const filteredExpected=7.42;
const filterField=document.querySelector('[data-adc-field="filter_ms"]');
filterField.value='250';filterField.dispatchEvent(new Event('input'));
assert($('adc-filter-status').textContent.includes('Unsaved preview: 250 ms'),'draft and applied filters are identified');
filterField.value='100';filterField.dispatchEvent(new Event('input'));
assert(Math.abs(detectorDiagnosticsChart.data.datasets.at(-1).data.at(-1).y-filteredExpected)<1e-10,'detector overlay uses the filtered sample from the car');
assert(probePressureChart.data.datasets.find(d=>d.label.includes('ADS A0')).data.at(-1).y===detectorDiagnosticsChart.data.datasets.at(-1).data.at(-1).y,'probe plot also uses the display filter');
assert($('adc-readings').textContent.includes('9.0000'),'ADC readings retain raw scaled value');
adcResponse={...adcResponse,now:101,sequence:5,samples:[{seq:5,time:101,mux:4,raw:500,volts:.5,scaled:4,filtered_scaled:4,filtered_volts:.5,clipped:false}]};
await window.nextPoll();drawDetectorDiagnostics(2200);
assert(detectorDiagnosticsChart.data.datasets.at(-1).data.at(-1).y===4,'detector filter resets after sensor gap');
const updateChart = Chart.prototype.update;
let failContactChart = true;
Chart.prototype.update = function(...args) {
  if (this.canvas?.id === 'contact-history' && failContactChart) {
    failContactChart = false;
    throw Error('Interrupted chart initialization');
  }
  return updateChart.apply(this, args);
};
document.querySelector('[data-settings-tab="contact"]').click();
await window.nextPoll();
assert(!Chart.getChart('contact-history') && $('contact-chart-error').textContent.includes('Interrupted chart initialization'), 'failed initialization releases the registered canvas');
assert($('adc-status').textContent.includes('SAMPLING') && $('adc-error').textContent === '', 'render failure preserves ADC connection');
assert($('contact-live-volts').textContent === '0.5000 V' && $('adc-trigger-state').textContent.includes('Outside contact range'), 'live sensor and threshold comparison remain available while the chart retries');
Chart.prototype.update = updateChart;
const realNow = performance.now.bind(performance);
Object.defineProperty(performance,'now',{value:() => realNow()+1500,configurable:true});
operatorADCFrame();
delete performance.now;
assert($('contact-chart-error').hidden, 'chart recovers after a transient render failure');
const contactChart = Chart.getChart('contact-history');
assert(contactChart, 'contact chart created: '+JSON.stringify({open:$('settings-dialog').open,hidden:$('settings-contact').hidden,error:$('adc-error').textContent,canvases:Object.values(Chart.instances).map(c=>c.canvas?.id)}));
assert(contactChart.data.datasets[0].label.includes('filtered V') && contactChart.data.datasets[0].data.at(-1).y === .5, 'calibration plots car-filtered voltage on selected input');
assert(contactChart.data.datasets.at(-1).data.at(-1).y === 6, 'calibration charts voltage threshold');
$('probe-contact-volts').value='0.22';$('probe-contact-volts').dispatchEvent(new Event('input'));
$('probe-contact-direction').value='below';$('probe-contact-direction').dispatchEvent(new Event('change'));
await window.nextPoll();
assert($('probe-contact-volts').value==='0.22' && operatorContactBlock().includes('Save'),'contact voltage draft survives telemetry');
state.probe={ready:true,fault:false,depth_mm:0,max_depth_mm:120,active:false,holding:false,cycle_active:false,adc_contact_state:{enabled:true,fresh:true,detected:false}};
state.drive.armed=true;state.drive.calibrating=false;state.safety={servo_allowed:true,allowed:true};state.detector.sweep_enabled=false;
const beforeDirtyProbe=sent.length;startProbeCycle();
assert(sent.length===beforeDirtyProbe && $('notice').textContent.includes('Save'),'manual probe respects visible unsaved contact limit');
$('probe-contact-save').click();
assert(sent.at(-1).type==='adc' && sent.at(-1).settings.probe_trigger.enabled && sent.at(-1).settings.probe_trigger.level===.22 && sent.at(-1).settings.probe_trigger.direction==='below','main contact limit saves through ADC settings and enables detection');
assert($('probe-contact-volts').disabled && operatorContactBlock().includes('saving'),'pending contact save is explicit');
operatorADCResult({ok:true});
adcResponse={...adcResponse,revision:3,applied:3,probe_trigger:{...adcResponse.probe_trigger,enabled:true,level:.22,direction:'below'},samples:[]};
await window.nextPoll();
assert(!$('probe-contact-volts').disabled && Number($('probe-contact-volts').value)===.22 && !operatorContactBlock(),'saved main contact voltage restored');
const negativeConfig=structuredClone(adcResponse.config);negativeConfig.channels[4].multiplier=-2;negativeConfig.channels[4].offset=1;
adcResponse={...adcResponse,revision:4,applied:4,config:negativeConfig,probe_trigger:{...adcResponse.probe_trigger,level:.56,direction:'above'},samples:[]};
await window.nextPoll();
assert(Math.abs(Number($('probe-contact-volts').value)-.22)<1e-8 && $('probe-contact-direction').value==='below','negative scaling restores physical volts and comparison direction');
$('probe-contact-volts').value='.23';$('probe-contact-volts').dispatchEvent(new Event('input'));
$('probe-contact-direction').value='above';$('probe-contact-direction').dispatchEvent(new Event('change'));$('probe-contact-save').click();
assert(Math.abs(sent.at(-1).settings.probe_trigger.level-.54)<1e-10 && sent.at(-1).settings.probe_trigger.direction==='below','negative scaling saves opposite scaled comparison correctly');
operatorADCResult({ok:false,message:'Save failed'});
assert(Number($('probe-contact-volts').value)===.23 && $('probe-contact-feedback').textContent.includes('Save failed') && operatorContactBlock().includes('Save'),'failed contact save retains draft and blocks unsaved probing');

$('contact-revert').click();
assert(!$('settings-adc').contains($('adc-trigger-enabled')) && !$('probe-task').contains($('probe-contact-direction')),'contact editors have one owner');
$('adc-trigger-mux').value='6'; $('adc-trigger-mux').dispatchEvent(new Event('change')); $('probe-contact-save').click();
assert(sent.at(-1).settings.probe_trigger.mux===6 && sent.at(-1).settings.routes[6]==='probe' && sent.at(-1).settings.routes[4]==='detector','changing contact input keeps detector assignment');
operatorADCResult({ok:false,message:'Test rollback'}); $('contact-revert').click();
document.querySelector('[data-settings-tab="detector"]').click();
$('metal-adc-input').value='6'; $('metal-adc-input').dispatchEvent(new Event('change')); $('metal-adc-save').click();
assert(sent.at(-1).settings.routes[6]==='detector' && sent.at(-1).settings.routes[4]==='probe' && sent.at(-1).settings.probe_trigger.mux===4,'detector input editor preserves probe assignment');
operatorADCResult({ok:false,message:'Test rollback'});
document.querySelector('[data-settings-tab="adc"]').click();
const triggerBeforeApply=structuredClone(adcResponse.probe_trigger);
$('adc-revert').click();$('adc-apply').click();
assert(sent.at(-1).settings.probe_trigger.level===triggerBeforeApply.level && sent.at(-1).settings.probe_trigger.direction===triggerBeforeApply.direction,'advanced ADC saves preserve the canonical contact threshold: '+JSON.stringify({last:sent.at(-1),feedback:$('adc-feedback').textContent,disabled:$('adc-apply').disabled,owner:state.drive.you_control_owner,connected:state.connected}));
operatorADCResult({ok:true});
const importedADC={config:structuredClone(adcResponse.config),routes:adcResponse.routes,probe_trigger:{...adcResponse.probe_trigger,level:.67,direction:'above'}};
Object.defineProperty($('adc-file'),'files',{configurable:true,value:[{text:async()=>JSON.stringify(importedADC)}]});
await $('adc-file').onchange();$('adc-apply').click();
assert(sent.at(-1).settings.probe_trigger.level===.67 && sent.at(-1).settings.probe_trigger.direction==='above','import preserves threshold and direction without duplicate fields');
operatorADCResult({ok:true});
$('adc-revert').click();$('adc-apply').click();
assert(sent.at(-1).settings.probe_trigger.level===adcResponse.probe_trigger.level && sent.at(-1).settings.probe_trigger.direction===adcResponse.probe_trigger.direction,'revert drops imported threshold override');
operatorADCResult({ok:true});
$('adc-revert').click(); assert(document.querySelector('[data-adc-channel="4"] td:last-child').textContent.includes('Metal detector + probe contact'), 'revert loads shared settings');
state.settings={cameras:structuredClone(cameraDefaults),saved:true};
state.settings.cameras.forward.rotation=90;
operatorSettingsState(state.settings);
assert(preferences.cameraRotation.forward===90, 'robot camera rotation restored');
$('forward-capture-width').value='800'; $('camera-save-shared').click();
assert(sent.at(-1).type==='settings' && sent.at(-1).value.capture.forward.width===800, 'camera settings go through ROS gateway');
preferences.cameras.forward='laptop-private-id';
state.settings.cameras.forward.rotation=180; operatorSettingsState(state.settings);
assert(preferences.cameras.forward==='laptop-private-id', 'laptop device selection remains local');
$('camera-save-shared').click();
assert(sent.at(-1).value.forward.source==='virtual', 'laptop ID never stored on robot');
state.drive.you_control_owner=false; operatorSettingsState(state.settings);
assert($('camera-save-shared').disabled, 'spectator cannot save robot defaults');
await window.nextPoll();
assert($('adc-apply').disabled && !$('adc-run'), 'spectators cannot configure; acquisition has no start/stop button');
assert($('adc-status').textContent.includes('SAMPLING'), 'spectators still receive live ADC readings');
window.fetch=async()=>{throw Error('offline');}; await window.nextPoll();
assert($('adc-status').textContent==='DISCONNECTED', 'network failure surfaced');
document.body.textContent='ADC BROWSER TESTS PASSED';
'''
        html = re.sub(r'<script src="/?assets/[^"]+"></script>', '', (DASHBOARD/'index.html').read_text())
        html = re.sub(r'<link rel="stylesheet" href="/?assets/style.css">', lambda _:  '<style>'+(DASHBOARD/'style.css').read_text()+'</style>', html)
        scripts = setup + 'window.adcResponse='+json.dumps(value)+';\nwindow.cameraDefaults='+json.dumps(CAMERA_DEFAULTS)+';\n'
        scripts += '\n'.join((DASHBOARD/name).read_text() for name in ('chart-4.4.8.umd.js','keydrown-1.3.0.js','actuator-settings.js','app.js','adc.js','camera-config.js'))
        html += '<script>(async()=>{try{'+scripts+checks+"}catch(e){document.body.textContent='FAILED: '+e.stack;}})();</script>"
        with tempfile.TemporaryDirectory() as tmp:
            page=Path(tmp)/'test.html'; page.write_text(html)
            result=subprocess.run(['chromium','--headless','--no-sandbox','--disable-gpu',
                                   '--user-data-dir='+tmp+'/profile','--dump-dom',page.as_uri()],
                                  capture_output=True,text=True,timeout=60)
        self.assertIn('ADC BROWSER TESTS PASSED</body>',re.sub(r'<head>.*?</head>', '', result.stdout, flags=re.S),re.sub(r'<head>.*?</head>', '', result.stdout, flags=re.S)+result.stderr[-2000:])
