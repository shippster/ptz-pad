# What's new in PTZ Pad

Each version's notes appear in the app's update notice and on the GitHub release.
Write them for the people running the cameras: what changed and what they need to do.

## 1.16.0 (2026-11-15)

- **The lock holds much better.** Two common causes of lost locks are fixed:
    - The pose model sometimes reports the speaker twice, as a second head-and-shoulders copy slightly off to one side. PTZ Pad took the copy for someone standing beside them and could then refuse the real speaker. It now knows the copy is the same person.
    - When the speaker turned side-on, their body measurements changed and PTZ Pad let go of them, even alone on stage. Now, with nobody else close by, the same body moving smoothly stays locked however it measures.
- **The log says why a lock waited.** If a lock waits for the speaker for half a second or more, the command log says why (left the shot, someone in front of them, someone else matched better, or their build didn't match) and how long it took to get them back. If breaks still happen, those lines tell us exactly what to fix.
- **Set the zoom for each shot.** Auto-tracking now has Wide, Medium and Close buttons, with a Wider/Tighter slider for each shot. Or zoom the camera by hand until the shot looks right and click **Use current zoom**. A dot marks shots with your own size, and **Built-in size** puts a shot back. Changing a shot or its size zooms to it straight away.
- **Walking out of the shot: zoom out first.** When the speaker walks out of the frame, PTZ Pad now zooms out smoothly to find them. If they still aren't in the wider shot, it pans the way they went. Once it finds them, it zooms back to the shot's size. If they're about to walk out faster than the camera can pan, it widens a little to keep them in. Change this under Feel and connection, Auto-tracking, **When the speaker walks out of the shot** (zoom out then pan, pan only, or stay).

## 1.15.0 (2026-11-15)

- **Check for updates button.** Next to the version number at the top. Click it any time to see if a newer PTZ Pad is out. If there is, the update notice opens with what's new; if not, it tells you you're up to date. Nothing installs on its own, so it's safe to click during a show.
- **Works on the claude.ai page too.** There it checks through the PTZ Pad helper on your computer. If the page is behind, ask Claude to update it, or download the desktop app.

## 1.14.1 (2026-11-15)

- **Talking with your hands no longer loses the speaker.** The pose model sometimes sees a second "person" around a speaker's moving arm or hand. PTZ Pad now recognizes it as part of the speaker, so the red box stays on them and the lock holds. The extra box around their hands is gone from the monitor too.
- **Quicker recovery after a missed frame.** If the speaker drops out for a moment while gesturing, PTZ Pad picks them straight back up where it last saw them clearly, instead of waiting about a second.
- Someone really standing just behind the speaker still counts as a separate person. Nothing to change in your settings.

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
