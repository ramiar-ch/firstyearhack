# Model realism progress

Status: **in progress**. Repository: `ramiar-ch/firstyearhack`. Integration branch: `city-viewer`.

## Goal and acceptance

Improve all visible model families in Strand Theft Auto toward a consistent, realistic London style. Use 80% as a review target: score silhouette and proportions, material and colour, close-up detail, motion or scene placement, and render consistency from 0 to 5 each. Aim for 20/25 or better on representative models in each family. Record evidence and gaps. A score is a visual review estimate. Gameplay, collisions and stable frame time remain separate pass criteria.

## Current checkpoint

- Stage 1 (2026-11-25): Street Missions now opens a save screen with New game, a dated save card with mission count and money, and Resume for a paused Street world. Browser verification covered no-save startup, Back/Esc, save card visibility, instant resume using the same world instance, and loading after a full reload.
- Stage 2 (2026-11-25): added 60 scheduled traffic slots for saloons and estate cars with distinct bodies, paint palettes and handling. Rebuilt glazing as a shared surface with seals and reduced its triangle count by merging contiguous strips. Refined lamps, police strobes, door seams, bus vents and bike hardware. Edge rendered an eight-model close-up review. Existing models' bounds and wheel contact matched the original. The existing models kept the same draw count (9 calls per car/bus including the review ground and 6 for the bicycle); close model triangles increased by 14–18% with the new details. Save regression covers both new bodies. Working review scores are 20/25 for passenger cars, 20/25 for buses and 20/25 for bikes, pending the world and night comparison.
- Stage 3 (2026-11-25): increased simulated pedestrians from 1,500 to 1,775 and added older women, teens and street workers. Added distinct packs, scarves and helmets, refined eyes, cuffs and sleeve joints, and revised the crowd walk and shadow shader. The full crowd stays instanced, uses a 38 m detail radius and is culled against all visible cameras. Edge rendered all seven close variants and the protagonist with shadows in a common setup. Pending final in-world day/night and split-screen checks.
- Implemented an articulated protagonist with a muted jacket, facial detail, distinct shoes and sleeves, plus displacement-driven steps, knee and ankle bends, arm swing and a jump pose.
- Implemented solo mouse-drag driving views in Street and Sightseeing, steering assistance while the forward key is held, and smooth recentering after 1.25 seconds without mouse motion.
- Local verification on 2026-11-25: all 18 `npm test` cases passed. Edge verified dragging at rest, W-assisted physical turning and recentering in both modes, plus the protagonist walking and blending to idle. Visual scoring and the reproducible performance baseline are the first Cloud tasks.
- Pending cloud execution: the Codex Cloud account received `environment_repo_access_failed` for this repository. The environment picker showed no repository environment. No recurring job was configured. The GitHub owner must grant the Codex connection access and publish a Cloud environment.

## Cloud environment

Select `ramiar-ch/firstyearhack` and start from `city-viewer`. The app uses Node.js 22 or 24 and has no npm runtime dependencies. Use `npm start` to run the HTTP server on port 8080. Use `npm test` for the regression suite. Browser checks require Chromium with WebGL support and access to `cdn.jsdelivr.net` for the pinned Three.js and QR code modules. Test the 3D renderer with the Cloud browser if available, or install Chromium and system dependencies with `npx --yes playwright install --with-deps chromium` during environment setup. Check that the local game serves HTTP 200 and that both launcher choices work before publishing the environment.

## Resume task

1. Read this file and inspect the latest commits before editing. Confirm that a run for this objective is not already active. Use included quota only. If access or quota is unavailable, record the blocker and preserve the last checkpoint.
2. Capture repeatable baseline screenshots at daylight and night in close and medium views. Record triangle counts, draw calls and median frame time on the same setup. Include Street, Sightseeing and 1997 split screen.
3. Review the protagonist gait and bicycle rider alongside men, women, children and older NPCs. Polish the weakest silhouettes and contacts first. Keep crowd instancing and compare against the baseline.
4. Refine the player car, patrol cars, taxis, vans, buses, bicycles and docks. Check wheel contact, cabin/glass, scale and collision outlines. Preserve nearby vehicle selection, parking and save restoration.
5. Refine landmark roofs and facades, then representative ordinary buildings, street furniture and vegetation. Keep LOD and distant geometry efficient. Verify that visible geometry still fits the collision world.
6. After each batch, compare screenshots and performance, run `npm test`, and run the relevant browser checks. Record the commit, visual scores, measurements, unresolved problems and next action here. Commit the checkpoint so a fresh Cloud task can continue it. Keep the task open until all model families meet the review target and regression checks pass.

If supported, schedule a Cloud follow-up every five hours only after confirming it can inspect the current run, resume the saved workspace or latest checkpoint, and skip while an execution is active. End the recurrence once the last batch and its checks are complete. Do not purchase quota.
