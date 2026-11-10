# Assets

Live monster art lives under `monsters/{fire,water,grass,thunder}/` with ASCII filenames referenced by `index.html` (`BEAST_IMAGES`).

**Staging inbox (new art before integrate):** Mac Desktop folder `maths game(新加)`.
Copy new files there, then ask the bot to classify, convert, and move into this tree.

Do not drop new images in the repo root — keep root paths for legacy starters/bosses/mythics only.

## Island wood plates

`assets/bg/ui-label-cloudrealm.png` is a blank 568×120 plate (no baked glyphs). The lobby hotspot paints「雲霄決鬥場」in HTML (`.island-hotspot__plate-label`) so the title can change without re-exporting art. Cache-bust with the file's sha256 prefix (`?v=ace0b984`). Do not ship a preview mock as the live plate.
