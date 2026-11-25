# Model realism progress

Status: **local development and acceptance complete (2026-11-25)**. Repository: `ramiar-ch/firstyearhack`. Integration branch: `city-viewer`.

## Goal and acceptance

Improve all visible model families in Strand Theft Auto toward a consistent, realistic London style. Use 80% as a review target: score silhouette and proportions, material and colour, close-up detail, motion or scene placement, and render consistency from 0 to 5 each. Aim for 20/25 or better on representative models in each family. Record evidence and gaps. A score is a visual review estimate. Gameplay, collisions and stable frame time remain separate pass criteria.

## Current checkpoint

- Stage 7 (2026-11-25) added ten photographed albedo textures, four normal maps and a London street HDR panorama for daytime vehicle reflections. Included one ImageGen ripstop tile for the jackets. The bundled assets total about 4 MB and ship with both modes. Roof UVs run along the actual slopes, roofs with incompatible footprints use a flat surface, and kerbs are bevelled and lowered at crossings. Street vehicle roots and walking feet follow the road elevation. Vehicle shells have rounded shoulders and buses have dual rear tyres. The browser wheel check measured about 4 mm maximum sampled contact error, and the protagonist landed exactly on the sampled road height. All 24 automated tests passed. Edge verified both modes, daytime and night reflections, and startup with all new texture files unavailable. See [source photographs and prompt](city-viewer/assets/surfaces/README.md) for the material sources.
- Stage 6 (2026-11-25) added confirmed deletion for each mode from the launcher and pause menu. An active session stays open after deletion, and saving it again requires an explicit Save game action. Ambient traffic recycles outside all active camera frustums and away from players. Pedestrian footprints support sideways displacement and gradual recovery. Bicycle crashes still slow the rider without adding wanted stars. All 24 automated tests passed. Edge verified both save slots and cancellation, pushing while walking and driving, obstacle impacts in a car and on a bike, and 205 traffic relocations with no visible or near-player relocations in a two-camera scenario.
- Stage 5 (2026-11-25): added native mouse lock to solo driving in both modes. Esc pauses and releases it. Street split also releases it and keeps playing. The player bicycle reuses the walking protagonist's geometry and colours. The seated rig follows the actual steering and pedal transforms. Sampled hand contact stayed within 6 mm of the grip target and shoe contact stayed on the pedal. Built-in ImageGen produced the [visual reference](city-viewer/assets/reference/README.md) used for the rain jacket, bicycle basket, estate trim, inset sash windows, landmark stone and bench timber. Edge verified locked free look, recentering, W steering, Esc, riding in both modes and returning to the walking model. All 20 automated tests passed.
- Stage 1 (2026-11-25): Street Missions now opens a save screen with New game, a dated save card with mission count and money, and Resume for a paused Street world. Browser verification covered no-save startup, Back/Esc, save card visibility, instant resume using the same world instance, and loading after a full reload.
- Stage 2 (2026-11-25): added 60 traffic slots for saloons and estate cars with distinct bodies, paint palettes and handling. Rebuilt glazing as a shared surface with seals and merged contiguous strips. Refined lamps, police strobes, door seams, bus vents and bike hardware. Edge rendered eight close models with the same draw count per model as before and unchanged wheel contact, plus both new body styles in the live city. Save regression covers both new bodies.
- Stage 3 (2026-11-25): increased simulated pedestrians from 1,500 to 1,775 and added older women, teens and street workers. Added packs, scarves and helmets, refined eyes, cuffs and sleeve joints, and revised the crowd walk and shadow shader. The crowd stays instanced, uses a 38 m detail radius and is culled against all active cameras. Edge rendered all seven close variants and the protagonist with shadows.
- Stage 4 (2026-11-25): added four facade variants within the existing wall batches and modeled hipped and gabled roofs with sloped normals. Improved Elizabeth Tower, St Paul's, Bush House, Somerset House, the Royal Courts and the London Eye. Both eras use instanced Eye capsules in the modern view and the landmark is hidden in 1997. Refined street trees, benches and telephone kiosks, and fixed the round-prop collision cases at the exact centre and across cell boundaries. Reviewed updated landmark framing and live scene placement in Edge.
- Implemented an articulated protagonist with a muted jacket, facial detail, distinct shoes and sleeves, plus displacement-driven steps, knee and ankle bends, arm swing and a jump pose.
- Implemented solo mouse-drag driving views in Street and Sightseeing, steering assistance while the forward key is held, and smooth recentering after 1.25 seconds without mouse motion.
- All 20 `npm test` cases passed. Edge verified both modes, Street's new/load/resume routes, exact collision cases, new-vehicle selection and save, the landmark shortcuts, night lighting, and restoration of the era and split-screen settings. Driving camera and protagonist motion checks also passed on the previously pushed checkpoint.
- Pending cloud execution: the Codex Cloud account received `environment_repo_access_failed` for this repository. The environment picker showed no repository environment. No recurring job was configured. The GitHub owner must grant the Codex connection access and publish a Cloud environment.

## Cloud environment

Select `ramiar-ch/firstyearhack` and start from `city-viewer`. The app uses Node.js 22 or 24 and has no npm runtime dependencies. Use `npm start` to run the HTTP server on port 8080. Use `npm test` for the regression suite. Browser checks require Chromium with WebGL support and access to `cdn.jsdelivr.net` for the pinned Three.js and QR code modules. Test the 3D renderer with the Cloud browser if available, or install Chromium and system dependencies with `npx --yes playwright install --with-deps chromium` during environment setup. Check that the local game serves HTTP 200 and that both launcher choices work before publishing the environment.

## Visual and performance review

Scores are a developer visual review of representative models. Columns follow the five criteria above. A 4 means the object reads naturally at the normal gameplay distance. A 5 would require finer real-world reference matching at close range.

| Reviewed family | Shape | Materials | Detail | Motion / placement | Consistency | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Protagonist and seven pedestrian profiles | 4 | 4 | 4 | 4 | 4 | 20/25 |
| Cars, vans, buses, patrol car and bicycle | 4 | 4 | 4 | 4 | 4 | 20/25 |
| Landmark buildings and London Eye | 4 | 4 | 4 | 4 | 4 | 20/25 |
| Ordinary facades, trees and street furniture | 4 | 4 | 4 | 4 | 4 | 20/25 |

Matched in-world samples compared against `4b76519` in Edge on this machine at 900 × 580, Fast quality, Natural lighting and bloom off. Numbers reflect headless rendering on this machine. Renderer counters are for the last draw pass rather than a sum across all split views.

| Scenario | Median frame ms, before → after | Triangles, before → after | Calls, before → after |
| --- | ---: | ---: | ---: |
| Street spawn | 50.2 → 50.0 | 12.52 M → 7.82 M | 418 → 596 |
| Street 1997 split | 101.0 → 66.8 | 12.88 M → 5.72 M | 114 → 117 |
| Sightseeing, Big Ben at night | 50.1 → 49.9 | 12.00 M → 6.61 M | 165 → 251 |

The remaining visual limits are stylized faces and cloth, inferred elevations for untagged buildings, and simplified interiors. Further refinement can start from the latest stage commit and the same visual checklist. Cloud execution remains dependent on GitHub access for the Codex connection. No additional quota was purchased.
