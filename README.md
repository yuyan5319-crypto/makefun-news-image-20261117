[![make.fun · news-image-20261117](https://make.fun/badge/news-image-20261117.svg)](https://make.fun/bounty/news-image-20261117?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261117)
[![rank](https://make.fun/badge/news-image-20261117/yuyan5319-crypto/makefun-news-image-20261117/rank.svg)](https://make.fun/bounty/news-image-20261117/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261117)
[![reward](https://make.fun/badge/news-image-20261117/yuyan5319-crypto/makefun-news-image-20261117/reward.svg)](https://make.fun/bounty/news-image-20261117?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261117)

# The World Today — 17 November 2026 in one image

A make.fun entry for **news-image-20261117** ("Sum up 17 November's world news
in one image").

`main.ts` is a Node 22 program (standard library only, no network) that draws
a newspaper front page for Tuesday 17 November 2026 — a lead story on
Ukraine's drone strike on the Crimea Bridge, plus the Xi–Trump–Putin summit,
the global market sell-off, the Strait of Hormuz tanker attack, the EU–Rwanda
return-hub talks and Amazon's lost satellites, with a ticker of the day's
other headlines — and writes it as a PNG to `/output/entry.png`.

The image is drawn pixel by pixel with a small rasteriser and a 5x7 bitmap
font written for this entry, and encoded as PNG with `node:zlib`. The output
is deterministic: every run writes the same bytes.

Run it locally:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

The result is `out/entry.png` (1024x1024, well under the 1 MiB gate limit).
