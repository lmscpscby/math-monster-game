Battle elemental VFX assets
===========================

Used by playElementAttackVfx() in index.html for all eight elemental attack bursts
(水／火／草／雷／格鬥／岩石／念力／聖光).

Files
-----
Live attack bursts are single-frame 512×512 RGBA PNGs. index.html points
CSS background-image at these paths only:

- fire_attack_vfx_512.png
- water_attack_vfx_512.png
- grass_attack_vfx_512.png
- thunder_attack_vfx_512.png
- fight_attack_vfx_512.png
- rock_attack_vfx_512.png
- psy_attack_vfx_512.png
- holy_attack_vfx_512.png
- meta.json — frame size for those single-frame PNGs

The page does not load the old sprite sheets. fire.png, water.png,
grass.png, thunder.png, fight.png, rock.png, psy.png, holy.png, fire.gif,
and backup-pre-vfx8-20261027/ are not in this tree.

Licenses & sources
------------------
1) Fire & Water base art from "The Juice Box" by Nick Case (ncase)
   - https://opengameart.org/content/the-juice-box
   - License: CC0 (public domain) — https://creativecommons.org/publicdomain/zero/1.0/
   - Optional credit: http://commonly.cc / http://juice.commonly.cc/
   - The retired fire.gif was the original Juice Box fire GIF.
   - The retired fire.png / water.png sheets were derived from Juice Box
     fire/water sequences (white keyed to transparency; resized for mobile).
     Those sheets are no longer published.

2) The retired grass / thunder / fight / rock / psy / holy sprite sheets
   - Original procedural sheets made for this educational game
     (no third-party pixels). Treat as CC0 for this project.
     Those sheets are no longer published.

Also researched (not bundled, size/fit):
- Kenney Particle Pack (CC0) — https://kenney.nl/assets/particle-pack
- CodeManu Free VFX pack (CC0) — https://opengameart.org/content/free-vfx-asset-pack

Runtime also draws a short canvas particle flash per element so the hit
stays readable even if a sheet fails to load.
fire: Canva design DAHZK_ILFFE (數理怪獸_火攻擊特效_512) → fire_attack_vfx_512.png (512×512 RGBA single-frame, scale/fade).
2026-10-27: All eight elements use single-frame 512×512 RGBA PNGs
(*_attack_vfx_512.png) with CSS scale/fade (battle-vfx-sheet-single).
2026-11-10: Unpublished the unused legacy sheets, fire.gif, and
backup-pre-vfx8-20261027/ so GitHub Pages does not upload them.
