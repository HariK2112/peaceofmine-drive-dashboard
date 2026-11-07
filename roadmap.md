# Roadmap

- [x] Import whole PeaceOfMine repo into `car/`
- [x] Dashboard redesign: one-screen laptop layout, consistent design tokens, tabbed telemetry dock
- [x] Pretend-car data for the preview
- [x] Copy-back script for the original repo (`scripts/push-car.sh`)
- [ ] Test on the real car (needs the user and the hardware)
- [x] Layout pass 2: front + probe cameras side by side, phase-aware focus (drive → probe), compact battery in header, even spacing, numbered workflow steps
- [x] Layout pass 3: clean rewrite of the main screen (one dock card with tabs, single-row drive bar, mission panel with described steps), clearer wording, Hold to home in Probe controls
- [x] Tidy the Setup window: grouped side nav, same panel shape everywhere, numbered calibration steps, less text, advanced settings in drawers
- [ ] Run the dashboard browser tests (`test_browser_inputs`, `test_browser_adc`) on a dev machine; they can't run here (they time out in this sandbox on the original dashboard too)
