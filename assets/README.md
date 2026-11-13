# Assets

Live monster art lives under `monsters/{fire,water,grass,thunder}/` with ASCII filenames referenced by `index.html` (`BEAST_IMAGES`).

**Staging inbox (new art before integrate):** Mac Desktop folder `maths game(新加)`.
Copy new files there, then ask the bot to classify, convert, and move into this tree.

Do not drop new images in the repo root — keep root paths for legacy starters/bosses/mythics only.

## Island scroll plates

`assets/bg/lobby-island-map-blank-nolabels.jpg` is the blank 1296×830 lobby map (no baked glyphs). `.island-stage` uses `aspect-ratio: 1296 / 830` so hotspot percentages sit on the map.

`assets/bg/ui-scroll-plate-blank-178.png` is a blank 178×52 scroll shared by every lobby hotspot. Titles are HTML (`.island-hotspot__plate-label`), including「雲霄決鬥場」. Cache-bust with each file's sha256 prefix (`?v=873a121d` for the map, `?v=f22a2191` for the plate). Do not ship a labeled preview as the live map or plate.

## Knowledge Temple

The island plate「知識聖殿」opens `#view-temple`. Book covers and the hall background keep the official kit filenames: `ui-temple-hall-bg-1920.jpg`, `ui-temple-book-star-trail.png`, `ui-temple-book-shanhai.png`. Titles are HTML overlays. Colleague portraits are `ui-temple-portrait-*.jpg` (1024×1024). The chronicle parchment is `rune-parchment-bg.jpg`. Cache-bust with each file's sha256 prefix.
