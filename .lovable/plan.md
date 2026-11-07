# Redesign the PeaceOfMine car dashboard for laptop

## Goal
Make this project the dashboard for PeaceOfMine, linked into it as a git submodule. Redesign the dashboard so it uses one consistent look and fits a laptop screen with no scrolling. All existing controls and safety behavior stay the same.

## What changes
- **One screen, no scrolling (1280×720 and larger):** a fixed grid.
  - Top bar: connection status, Take control, a red Stop that's always visible, and Settings.
  - Left (largest): the camera, with drive status overlaid.
  - Right column: the task workbench (search, probe and alignment actions).
  - Bottom strip: the detector chart, map, power and target log, shown as compact tiles. Longer content scrolls inside its own tile, not the page.
- **Consistent design language:** one set of colors, spacing, corner radius, type sizes, button styles and status chips (ok / warning / blocked / error). The look is a dark, high-contrast control-room style that stays readable outdoors.
- **Less confusing:** related controls are grouped under clear headings. Every button shows its blocking reason in the same place and the same way. Diagnostics (drive, probe, detector) fold into tabs inside one panel instead of three separate panels.
- **Settings dialog:** restyled to match, with the same tabs and fields.

## Repository setup (submodule)
```text
PeaceOfMine/                         (parent repo, on the car)
  src/peaceofmine_operator/
    dashboard/  -> submodule = this Lovable project's GitHub repo
      public/dashboard/index.html, app.js, style.css ...   (what the car serves)
```
1. Connect this project to GitHub. That creates a new repository.
2. In PeaceOfMine:
   - Remove the old dashboard folder.
   - Run `git submodule add <new-repo-url> src/peaceofmine_operator/dashboard`.
   - Point `web_bridge.py`, and the install path in `setup.py`/the Dockerfile, at `dashboard/public/dashboard`. I'll give you the exact lines, since I can't edit PeaceOfMine myself.
3. Updating later: run `git submodule update --remote`, then commit in PeaceOfMine.

I'll read the ROS nodes, topics and `web_bridge.py` straight from your GitHub repo. That way the dashboard and pretend-car data match what the car really sends, and none of that code gets copied in here.

## Testing on the real car
1. Update the submodule on the car.
2. Run `util/build`, `util/run` and the launch command.
3. Open the usual Tailscale URL on port 8080. The car serves the new dashboard with live data.

The Lovable preview itself can't reach the car.

## Preview here
I'll add a pretend-car data source with realistic sample data, so every panel shows something. It only switches on in the Lovable preview, never on the car.

## Out of scope
The car-side Python/ROS code, message formats and safety logic. No behavior changes, only layout, styling and presentation markup.

## Technical details
- Copy the current `index.html`, `style.css`, `app.js`, `adc.js`, `actuator-settings.js`, `camera-config.js` and the vendor files (Chart.js, keydrown) into `public/dashboard/`. Edit only the `index.html` structure and `style.css`. Keep every `id`/`data-*` hook that `app.js` uses, so it keeps working with `web_bridge.py`.
- Rewrite `style.css` around CSS custom properties and a `100vh` grid, with `min-height: 0; overflow: auto` on the panels.
- Add `public/dashboard/mock-car.js`, which loads only with `?mock=1`. It patches `WebSocket` for `/ws` and emits telemetry shaped like what `web_bridge.py` sends.
- Change `src/routes/index.tsx` to a full-screen page embedding `/dashboard/index.html?mock=1`, with a proper title and meta.
- Check with Playwright at 1280×720 and 1920×1080: no document scroll, no overlaps, no console errors.
- Record in `AGENTS.md`:
  - `public/dashboard` is the deliverable consumed as a submodule.
  - The DOM hooks that `app.js` uses must be preserved.
