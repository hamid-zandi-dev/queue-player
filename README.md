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
| ♪ button | Show / hide the queue panel |
| Number button on a row | Play that track, then continue from that track to the end of the list |
| ↑ / ↓ | Move track up or down in the queue |
| ✕ | Remove track from the queue |
| Prev | Previous track in the play order (restarts the track when already first) |
| ▶ / ❚❚ | Play / pause |
| Next | Next track in the play order |
| All | Repeat the whole list after the last track |
| One | Repeat the current track forever |
| Shuffle | Play the remaining tracks in random order |
| Rescan | Look for tracks added to the page since load |

Clicking a row is the important one: the queue keeps playing from that item onward instead of stopping on it. With **Shuffle** on, the random order continues from the clicked item. **All**, **One** and **Shuffle** are independent toggles; **All** and **One** exclude each other.

Tracks that cannot play (no source, broken URL, unsupported format) are skipped automatically, so the queue never stalls on them.

When a track ends, the next one starts automatically. The panel also registers Media Session handlers, so hardware media keys (play/pause/next/previous) work.

## How tracks are detected

- Every `<audio>` and `<video>` element on the page is collected.
- New elements and `src` changes are picked up automatically (MutationObserver), so players that build their list lazily are still covered.
- One element reused for every song is handled too: each new `src` becomes a new queue entry, and the element source is restored when the entry is played.
- Titles come from `data-title`, `data-track-title`, `data-name`, `aria-label`, `title`, `aria-labelledby`, or the closest list item / track wrapper.

## Limits

- Players built on MediaSource (MediaSource Extensions) hand out `blob:` URLs that die as soon as the site moves to the next song. Those elements are skipped, because replaying them later is impossible. The extension still watches them, so a player that swaps plain URLs works.
- Chrome autoplay policy can block the first programmatic `play()`. When that happens the panel shows **Autoplay blocked by browser. Resume** — one click resumes, and the click also unlocks auto-advance for the rest of the queue.
- The extension drives the page's own media elements, so a site player that fights for control of the same element can behave oddly.

## Files

```
extension/
  manifest.json      MV3 manifest
  content.js         scan, queue, auto-advance, in-page panel
  panel-styles.js    panel CSS (injected into a shadow root)
  popup.html/js      toolbar popup: track count, open panel, rescan
```
