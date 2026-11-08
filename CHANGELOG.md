# What's new in PTZ Pad

Each version's notes appear in the app's update notice and on the GitHub release.
Write them for the people running the cameras: what changed and what they need to do.

## 1.14.0 (2026-11-08)

- **Auto-tracking locks on a person, not a shirt colour.** Once locked, PTZ Pad stays with that one person until you change it: click someone else, press Unlock (L), or press A to go back to the preview. Someone in the same colours can no longer take over.
- **Crossings hold steady.** When someone walks in front of the locked person, PTZ Pad holds still instead of guessing, then carries on with the same person. Anyone seen in the shot alongside them can never take their place.
- **Waiting for them to come back.** If the locked person leaves the shot, a dashed WAITING box shows where they were last seen. PTZ Pad picks them up again when they reappear near it, or anywhere once they've been gone a while and their build clearly matches.
- **The lock uses body build, not clothes.** PTZ Pad learns each person's proportions (shoulders, head, arms, torso, legs) from the pose model, so lighting and clothing don't matter. The colour swatch is gone; the panel and monitor show LOCKED ON PERSON, WAITING or HOLDING.
- **Setting renamed: Lock body match** (under Feel and connection, Auto-tracking). Raise it if the lock ever picks up the wrong person after they've been out of shot; lower it if it's slow to find the right one again.
- Without a lock, the red box now waits longer before switching while the speaker is hidden behind someone.

## 1.13.1 (2026-11-08)

- **Loading a camera file asks on the panel.** Choose Load cameras or Cancel right under the buttons. This replaces the pop-up dialog, which the claude.ai version blocked.

## 1.13.0 (2026-11-08)

- **Set up cameras from a JSON file.** In Add a camera, choose Load JSON file… (or drop the file on the panel) to add or update many cameras at once. A camera with the same name as one you have is updated; the rest are added. Tick Replace all my cameras to swap in the file's list instead.
- **Save your cameras as JSON.** Save my cameras as JSON writes every camera's setup to a file you can load on another computer. It includes any camera passwords, so keep it private.
- **Checked before anything changes.** If the file has a problem (a missing name, an unknown protocol, a bad port), PTZ Pad says what to fix and changes nothing. Cameras being updated stop moving while they change, so load files when you're off air.
- **Fixed:** the hint under Reverse tilt showed a stray code in place of its apostrophes.

## 1.12.0 (2026-11-01)

- **Install PTZ Pad from your browser.** Open the web version in Chrome or Edge and choose Install PTZ Pad. It gets its own window and icon and opens without internet.
- **Update notices.** PTZ Pad tells you when a new version is out, shows what's new, and links to the download. It never updates in the middle of a show.
- **The desktop app now powers the web version.** While PTZ Pad is open, the web version on the same computer can send camera commands through it. No separate bridge to run.
- **Safer bridge.** The bridge now accepts commands only from PTZ Pad's own pages, so other websites can't move your cameras.
