# Redesign the PeaceOfMine car dashboard for laptop

## Goal
Bring your car dashboard (`src/peaceofmine_operator/dashboard/`) into this project and redesign it. You'll get one consistent visual style and a single-screen laptop layout with no page scrolling. All existing controls and safety behavior stay the same. Afterwards, you can link this project to a new GitHub repository and copy the dashboard folder back into PeaceOfMine.

## What changes
- **One screen, no scrolling (1280×720 and larger):** a fixed grid.
  - Top bar: connection status, Take control, a red Stop that's always visible, and Settings.
  - Left (largest): the camera, with drive status overlaid.
  - Right column: the task workbench (search, probe and alignment actions).
  - Bottom strip: the detector chart, map, power and target log, shown as compact tiles. Longer content scrolls inside its own tile, not the page.
- **Consistent design language:** one set of colors, spacing, corner radius, type sizes, button styles and status chips (ok / warning / blocked / error). The look is a dark, high-contrast control-room style that stays readable outdoors.
- **Less confusing:** related controls are grouped under clear headings. Every button shows its blocking reason in the same place and the same way. Diagnostics (drive, probe, detector) fold into tabs inside one panel instead of three separate panels.
- **Settings dialog:** restyled to match, with the same tabs and fields.

## Syncing with your repository
- Lovable can't sync with PeaceOfMine directly. Connecting to GitHub always creates a brand-new repository.
- I'll keep a read-only copy of the whole repo in this project. That way I can read the ROS nodes, topics, `web_bridge.py` and message formats, and the dashboard and pretend-car data will match what the car actually sends.
- Getting changes back: connect this project to a new GitHub repository, then copy `public/dashboard/` into `src/peaceofmine_operator/dashboard/` in PeaceOfMine. One `cp`, or a small script I can add.

## Out of scope
The car-side Python/ROS code, message formats and safety logic. No behavior changes, only layout, styling and presentation markup.

## How preview works here
The dashboard needs the car's live data connection. For this preview, I'll add a pretend-car data source that sends realistic sample data, so every panel shows something. It's only for the preview and never ships to the car.

## Technical details
- Copy `index.html`, `style.css`, `app.js`, `adc.js`, `actuator-settings.js`, `camera-config.js` and the vendor files (Chart.js, keydrown) unchanged into `public/dashboard/`. Then edit only `index.html` structure and `style.css`. Keep every element `id` and `data-*` hook that `app.js` uses, so the JS keeps working with `web_bridge.py`.
- Rewrite `style.css` around CSS custom properties (color, spacing, radius, type scale) and a `100vh` CSS grid. Panels use `min-height: 0; overflow: auto`.
- Mock: `public/dashboard/mock-car.js`, loaded only when not served by the car (e.g. host isn't the car / `?mock=1`). It patches `WebSocket` for the `/ws` URL and emits sample telemetry messages in the shapes `app.js` expects.
- Change `src/routes/index.tsx` to a full-screen page that embeds `/dashboard/index.html?mock=1`, and give it a proper title and meta.
- Check with Playwright at 1280×720 and 1920×1080: no document scroll, no overlapping panels, no console errors.
- Record in `AGENTS.md` that the dashboard lives as static files in `public/dashboard` and must keep the DOM hooks `app.js` uses.
