Battle elemental VFX assets
===========================

Used by playElementAttackVfx() in index.html for all eight elemental attack bursts
(水／火／草／雷／格鬥／岩石／念力／聖光).

Files
-----
- fire.png / fire.gif  — Fire burst frames
- water.png            — Water splash frames
- grass.png            — Leaf burst frames (procedural)
- thunder.png          — Lightning bolt frames (procedural)
- fight.png            — Orange impact / punch shockwave (procedural)
- rock.png             — Grey-brown rubble scatter (procedural)
- psy.png              — Indigo psychic rings / ripples (procedural)
- holy.png             — Gold-white holy pillar / cross rays (procedural)
- meta.json            — Frame counts / cell sizes for the sprite sheets

Licenses & sources
------------------
1) Fire & Water base art from "The Juice Box" by Nick Case (ncase)
   - https://opengameart.org/content/the-juice-box
   - License: CC0 (public domain) — https://creativecommons.org/publicdomain/zero/1.0/
   - Optional credit: http://commonly.cc / http://juice.commonly.cc/
   - fire.gif is the original Juice Box fire GIF.
   - fire.png / water.png are sprite sheets derived from Juice Box fire/water
     sequences (white keyed to transparency; resized for mobile).

2) grass.png / thunder.png / fight.png / rock.png / psy.png / holy.png
   - Original procedural sprite sheets made for this educational game
     (no third-party pixels). Treat as CC0 for this project.

Also researched (not bundled, size/fit):
- Kenney Particle Pack (CC0) — https://kenney.nl/assets/particle-pack
- CodeManu Free VFX pack (CC0) — https://opengameart.org/content/free-vfx-asset-pack

Runtime also draws a short canvas particle flash per element so the hit
stays readable even if a sheet fails to load.
fire: Canva design DAHZK_ILFFE (數理怪獸_火攻擊特效_512) → fire_attack_vfx_512.png (512×512 RGBA single-frame, scale/fade). Legacy sheet fire.png kept.
2026-10-27: All eight elements now use single-frame 512×512 RGBA PNGs
(*_attack_vfx_512.png) with CSS scale/fade (battle-vfx-sheet-single).
Legacy sprite sheets kept as *.png; pre-swap copies in
backup-pre-vfx8-20261027/.
