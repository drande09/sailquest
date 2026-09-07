# SailQuest

A browser sailing game with real WebGL 3D, an optional first-person helm, and an overhead view. No Unity or Blender installation is needed to play. Boat geometry, rigging, cloth, water and scenery are generated locally with Three.js; there are no runtime CDN or external asset requests.

## Play and practice

Choose **Sailing school** for untimed, steady-wind practice:

1. **Find your reach:** beam, close and broad reaches, with sail trim at each heading.
2. **Zigzag upwind:** build speed, tack through the bow, settle on the other tack, then tack back.
3. **Sail downwind:** broad reach, controlled run, and return to a broad reach on the same side.
4. **Make a smooth gybe:** approach, bring the boom toward the middle, turn the stern through the wind, then ease on the new side.

The wind dial puts the **wind source at the top**. The boat rotates with your heading. Red marks the boat-specific no-go zone; gold marks the current lesson heading. Moving arrows on the water point in the direction the air travels. The trim marker is a suggestion, not an automatic control. Turn it off in the pause menu or with **N**.

All five original game modes, seven unlockable boats, races, missions, stars and cosmetics remain available. Existing `sailquest_save_v1` saves migrate without resetting progress. Lesson completion and camera preferences are saved on the device.

| Control | Action |
| --- | --- |
| A / D or left / right | Turn the boat left / right |
| W / S or up / down | Bring the mainsail in / ease it out |
| Q / E | Ease / trim the jib on boats with a jib |
| I | Toggle automatic jib trim |
| V | Cycle 3D chase, first person and overhead |
| Drag the sea | Look around in 3D |
| Look ahead / double-click sea | Recenter your view |
| N | Toggle wind arrows and suggested trim |
| Escape | Pause; release held controls |
| Space | Water gun in Water Battle |
| M | Toggle sound |

Touch steering and mainsail buttons appear on phones and touch devices. The first-person camera sits on the windward side and keeps a stable horizon. Gentle-motion and lower-resolution settings are available in the pause menu. WebGL failure falls back to the overhead renderer, including lessons.

## Run locally

The checked-in `js/scene3d.bundle.js` makes the repository directly compatible with static hosting, including the existing GitHub Pages setup.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4173`. After changing `src/scene3d.js`, run `npm run build` and refresh the page. The build regenerates the checked-in renderer bundle and creates a standalone static `dist/` folder. Commit the updated bundle alongside renderer source changes so branch-based GitHub Pages serves the same version.

## Verify

```sh
npm test
npm run build
# With the local server running and Microsoft Edge installed:
node scripts/browser-check.cjs
```

Physics tests cover trim/speed behavior, no-go stalling, tacks versus same-side turns, gybes, irons recovery, finite dynamics for all boats, and completing all four lessons through helm and sheet inputs. The browser check covers WebGL shader/runtime errors, all camera views, all original modes and boat models, keyboard/touch controls, pause, restarting countdowns, and the WebGL fallback. It saves desktop and phone screenshots under ignored `artifacts/`.

## Simulation boundaries

This is a forgiving learning game, not a boat-handling or fluid-dynamics simulator. It uses true-wind polars, an approximate trim curve, game speed scaling, simplified heel, and extra steerage to help beginners escape irons. Apparent-wind changes, waves acting on the hull, capsize, collisions with decorative distant scenery and real rig loads are not simulated. The historical rigs use simplified models. A real tiller moves opposite the bow's turn; the keyboard controls the boat's turn directly.

Use the game to recognize sailing angles and the steering/trim sequence, then practice on the water with an instructor. The lesson terminology follows the [RYA introduction to points of sail](https://www.rya.org.uk/training/do-you-know-your-points-of-sail/). Boat-specific handling will vary.

The renderer uses [Three.js](https://threejs.org/) under its MIT license; see `THIRD_PARTY_LICENSES.txt` and the retained notices in the generated bundle.
