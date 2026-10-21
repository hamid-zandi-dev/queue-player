# Queue Player

Chrome extension (Manifest V3) that finds every audio/video track already on a page and plays them one after another, so nobody has to click each track by hand.

No build step, no dependencies, no publish. Load it unpacked and test it locally.

## Install locally (no Chrome Web Store)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right toggle).
3. Click **Load unpacked**.
4. Select the `extension` folder of this repo (`/home/hzandi/queue-player/extension`).
5. Open the target page and **reload it** (the content script only runs on pages loaded after install).
6. The blue **♪** button appears in the bottom right corner of the page. Click it to open the queue.

To test a local file (`file:///...`): on `chrome://extensions`, click the extension, enable **Allow access to file URLs**.

After editing `content.js` or `panel-styles.js`: click the reload icon on the extension card in `chrome://extensions`, then reload the page.

Chrome 137+ ignores `--load-extension` on the command line. The **Load unpacked** button in `chrome://extensions` still works. For scripted runs add `--disable-features=DisableLoadExtensionCommandLineSwitch`.

## Test page

`test-page.html` in the repo root has 5 generated tones (one `<audio>` element each) plus one reused element that swaps its `src`. Serve the folder and open it:

```
python3 -m http.server 8765
# open http://127.0.0.1:8765/test-page.html
```

For `file://` URLs enable **Allow access to file URLs** on the extension card.

## Panel controls

| Control | Action |
| --- | --- |
| ♪ button | Show / hide the queue panel (bottom right, 32px above the page edge to clear site support buttons) |
| Progress bar | Drag or click to seek inside the current track |
| Any part of a row (number, title, meta) | Play that track and start the run from there |
| ↑ / ↓ | Move track up or down in the queue |
| ✕ | Remove track from the queue |
| ⏮ / ▶ / ⏭ | Previous, play-pause, next (icons only, always LTR) |
| All | Repeat the run after its last track (icon + label) |
| One | Repeat the current track forever (icon + label) |
| Shuffle | Play the remaining tracks in random order (icon + label) |
| Rescan | Look for tracks added to the page since load |

Clicking a row is the important one. The queue does not stop on that item: it keeps playing the following items, one by one, in list order. **All** then loops that same run, so a run started in the middle of the list keeps its shape (item 4 → 5 → 6 → 4 → 5 …) instead of jumping back to item 1. **Shuffle** plays the remaining tracks in random order, still starting from the clicked item. **All**, **One** and **Shuffle** are independent toggles; **All** and **One** exclude each other.

Tracks that cannot play (no source, broken URL, unsupported format) are skipped automatically, so the queue never stalls on them.

## Progress bar

The bar above the transport buttons shows the current position and is seekable (click or drag). Under the time it shows what the browser already has:

- `buffered 1:12 (48%)` — how much of the track is in the media buffer.
- `4.2 MB downloaded` — bytes fetched so far for the current source, summed over the range requests the player made.

Sources served as `data:` URLs have no transfer size, so only the buffered amount is shown for them.

When a track ends, the next one starts automatically. The panel also registers Media Session handlers, so hardware media keys (play/pause/next/previous) work.

## Right-to-left pages

The player is always LTR, no matter what the page does. A right-to-left site cannot flip the panel: the progress bar always fills from left to right, the row order and the transport row stay put (back on the left, next on the right), and the ♪ button stays in the bottom right corner. The direction is forced on the panel itself, so an inherited `direction: rtl` from the site has no effect.

Track titles keep their own script, so a Persian title still reads correctly inside the LTR panel.

## Two-way sync

The panel and the page are the same player, seen from two sides:

- **Page → panel**: when the site plays a track, the panel marks that row as current, shows its position in the progress bar, and stays quiet (the site keeps the sound). The site keeps leading until you act in the panel.
- **Panel → page**: when you play a track from the panel, the page's own media element is switched to the same track and plays it muted, so the site's UI (row highlight, progress, time) follows the queue while the sound comes from the panel. A site that swaps `src` on `ended` is fought off, so the queue order wins.

If the site takes over (you press play on the page), the panel hands control back: the site becomes the sound source and the panel follows it again.

## How it plays

The extension plays the queue through its own hidden audio element and pauses the page's own media while the queue runs. That keeps the extension out of the way of the site's player: a site that swaps `src` on `ended` cannot interrupt the queue, and the queue never restarts a track mid-way.

Fallback: if the source cannot be played by the extension (signed URL, special headers, DRM), the extension hands playback back to the page's own media element for that track.

Queue entries are deduplicated by source URL, so a player that reuses one element for every song still gives one entry per song. Track names come from `data-title` / `aria-label` / track wrappers, and for reused players from the site's visible "now playing" label.

## How tracks are detected

- Every `<audio>` and `<video>` element on the page is collected.
- New elements and `src` changes are picked up automatically (MutationObserver), so players that build their list lazily are still covered.
- One element reused for every song is handled too: each new `src` becomes a queue entry, and the same source is never listed twice.
- Titles come from `data-title`, `data-track-title`, `data-name`, `aria-label`, `title`, `aria-labelledby`, the closest list item / track wrapper, or the site's visible "now playing" label.

## Limits

- Players built on MediaSource (MediaSource Extensions) hand out `blob:` URLs that die as soon as the site moves to the next song. Those elements are skipped, because replaying them later is impossible. The extension still watches them, so a player that swaps plain URLs works.
- Chrome autoplay policy can block the first programmatic `play()`. When that happens the panel shows **Autoplay blocked by browser. Resume** — one click resumes, and the click also unlocks auto-advance for the rest of the queue.
- The extension pauses the page's own media while the queue runs, so the site player shows "paused" during queue playback.
- A track that only plays inside the site player (signed URL, special headers, DRM) is handed back to the page's element, and the site player can then interrupt the queue.

## Files

```
extension/
  manifest.json      MV3 manifest
  content.js         scan, queue, auto-advance, in-page panel
  panel-styles.js    panel CSS (injected into a shadow root)
  popup.html/js      toolbar popup: track count, open panel, rescan
```
