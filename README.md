# PTZ Pad

Drive PTZ cameras with an Xbox controller. The desktop app has the camera bridge built in, so there is nothing else to run.

## Run it

Double-click the launcher for your computer:

- Windows: **Start PTZ Pad (Windows).bat**
- Mac: **Start PTZ Pad (Mac).command** (the first time, right-click it and choose Open)
- Linux: **start-ptz-pad-linux.sh**

The first launch downloads a private copy of Node.js and the app components into this folder. It needs internet and takes a minute or two. Nothing is installed system-wide. Later launches start right away and work offline.

To start fresh, delete the `runtime` and `node_modules` folders and run the launcher again.

## Make an installer

First run the launcher once, so the tools are in place. Then, from a terminal in this folder (on Windows, add `runtime\node` to PATH first; on Mac and Linux, `export PATH="$PWD/runtime/node/bin:$PATH"`):

```
npm run dist:win     # Windows: PTZ-Pad-Setup.exe and a portable .exe
npm run dist:mac     # macOS: .dmg (build on a Mac)
npm run dist:linux   # Linux: .AppImage
```

The files land in `dist/`. After that you can install PTZ Pad like any other app and never touch a terminal again.

No build machine? Push this folder to a GitHub repository, open the Actions tab, run "Release PTZ Pad", and download the installers for all three systems from the finished run.

## Releases and updates

PTZ Pad lives at https://github.com/micahshippee/ptz-pad. Installers are on the [Releases page](https://github.com/micahshippee/ptz-pad/releases/latest), and the web version is at https://micahshippee.github.io/ptz-pad/.

**One-time setup:** in the repository, open Settings, then Pages, and under Build and deployment set Source to **GitHub Actions**.

**Shipping an update**

1. `node tools/bump.js patch` (or `minor`, `major`, or a number like `1.13.0`). This sets the version in `package.json` and the app, and adds a section to `CHANGELOG.md`.
2. Write the notes under that section, for the people running cameras: what changed and anything they need to do.
3. Commit and push to `main`.

"Release PTZ Pad" then builds the Windows, Mac and Linux installers, publishes a release with your notes, and updates the web version and its update feed (`version.json`). It refuses to run if the version numbers disagree or the notes are empty. Pushes that don't change the version reach no one.

**What people see.** Within a few hours (or on next launch), every copy shows a notice with the new notes. The desktop app links to the download; the web version offers a reload. Nothing updates on its own, so a show is never interrupted. Choosing Later leaves a small "available" chip at the top. After updating, PTZ Pad shows What's new once.

## The web version

Open the GitHub Pages address in Chrome or Edge, then choose **Install PTZ Pad** from the address bar or browser menu. It gets its own window and icon, and opens without internet once installed.

A web page can't send VISCA or NDI, and browsers block an HTTPS page from calling cameras over plain HTTP. So the web version sends every command through the bridge at `http://localhost:8787` on the same computer:

- **Easiest:** install PTZ Pad from Releases and keep it open. The desktop app runs the bridge for this computer.
- **Or** run `npm run bridge` from this folder (see Prefer a browser? below).

The first time, the browser asks whether the page may reach devices on your local network or apps on this device. Choose Allow.

Auto-tracking and stream testing need the desktop app. The controller, presets, operator modes, VISCA, HTTP, NDI and TriCaster all work in the web version.

## First launch notes

- Windows may show a SmartScreen warning because the app isn't code-signed. Choose More info, then Run anyway.
- macOS: right-click PTZ Pad, choose Open, then Open again. When asked whether PTZ Pad may find devices on your local network, choose Allow, or camera commands won't reach the cameras.
- Windows Firewall may ask about network access the first time. Allow it on private networks.

## Supported cameras

NDI PTZ (any NDI camera with PTZ control), VISCA over IP (Sony, BirdDog, Canon, Avonic, Lumens, Marshall, Datavideo), raw VISCA over UDP and TCP (PTZOptics, HuddleCam, AVer and most OEM cameras), PTZOptics-style HTTP-CGI, Panasonic AW, Axis VAPIX, and custom HTTP URLs. Cameras that need a login work with Basic or Digest authentication.

## NDI cameras

1. Install NDI Tools, free from ndi.video. It includes the NDI Runtime that PTZ Pad uses. Restart PTZ Pad afterwards.
2. Add a camera, choose NDI PTZ, and click Find NDI sources. Pick your camera from the name box.
3. If the camera is on another subnet and doesn't show up, enter its IP address and search again.

If the camera connects but won't move, turn on NDI PTZ control in the camera's own settings, or use VISCA instead. If pan or focus runs backwards on a particular model, tick Reverse pan on this camera, or Swap focus direction.

If PTZ Pad can't find the runtime on its own, paste the full path to the NDI library file under Feel and connection. On Windows it's Processing.NDI.Lib.x64.dll, on Mac libndi.dylib.

## USB, laptop and Mevo cameras

Under **Control protocol** in a camera's settings:

- **USB, USB-C or built-in camera:** webcams, this laptop's own camera, USB-C cameras, HDMI-to-USB capture devices, and a Mevo in wired webcam mode. Click **Find cameras** and pick it. Its live picture shows in the main monitor. If the camera supports pan, tilt and zoom over USB (UVC PTZ, such as OBSBOT, PTZOptics USB and Logitech PTZ Pro), the sticks, presets, Home and auto-tracking move it. A fixed camera, like a laptop's, shows its picture and the people it sees, but can't follow them. Only one app can use a USB camera at a time.
- **Mevo (picture only):** PTZ Pad can't move a Mevo (its pan and zoom are digital, inside the Mevo app), so it shows its picture. Mevo Start and Mevo Core send NDI|HX (turn it on in the Mevo app); older Mevo send SRT. Any Mevo also works over USB in wired webcam mode at 720p; choose USB, USB-C or built-in camera for that.
- **Other camera, picture only:** any NDI, RTSP or SRT picture, with no commands sent.

A PTZ camera whose picture comes in through a USB capture device can use it for auto-tracking: under Video for auto-tracking, choose **USB or USB-C capture device**.

On a Mac, the first time PTZ Pad opens a camera, macOS asks for camera access; allow it.

## Director and camera operator modes

The three choices at the top of the dashboard set how the controllers are used. PTZ Pad remembers your choice.

1. **Director** (one controller): everything in PTZ Pad, as in 1.8.0. Picking a camera can put it on TriCaster preview, LB + D-pad previews, cuts and transitions, and Menu goes live. A second controller is ignored.
2. **One camera operator** (one controller): pick a camera and move it: sticks, triggers, presets, focus, speed, precision, home, auto-track and lock. Nothing goes to preview or program: picking a camera doesn't preview it, LB + D-pad, Menu, the keyboard (Enter, P, C) and the on-screen GO LIVE, Preview, Cut and Auto are all off, and your selection doesn't jump when the director switches. Tally (LIVE / PVW) still works, and the live camera follows the camera-operator setting in TriCaster setup (slowly by default). A second controller is ignored.
3. **Two camera operators** (two controllers): the same as one camera operator, for two people at once. Press any button on each controller. Controller 2 drives its own camera at the same moment as controller 1, with the same layout. D-pad left / right picks a controller's camera and skips the one the other controller has. The Controller 2 bar under the camera list shows its camera (click a number to change it), what it is sending and its own max speed, with **Buzz it** (rumbles controller 2) and **Swap 1 and 2**. The Xbox button and the pop-up camera stay with controller 1. Leaving this mode stops controller 2's camera.

A controller keeps its slot until it disconnects, and the camera it was moving stops.

## Pop-up camera (Camera 6)

Camera 6 is a pop-up camera. It isn't in the camera list or the D-pad rotation; press the **Xbox button** (or **LB and RB at the same moment**, or **G** on the keyboard, or the dashed Camera 6 button) to open it over the dashboard with its own picture. Auto-tracking starts on it so you can see who it can follow. Push the **right stick** left or right to move the amber selection between people, then press **A** or **click the right stick** to follow that person (or click them with the mouse). **X** stops following, **B** or the Xbox button closes it, and Camera 6 keeps following after it closes. While it's open, the left stick and triggers drive Camera 6. Set its address and video with the **Settings** button; any camera can be made the pop-up camera with **Pop-up camera** in its settings.

Windows often keeps the Xbox button for its own Game Bar, so if the button does nothing, use LB + RB, or turn off the Xbox button shortcut in Windows Game Bar settings.

## Layout

The dashboard fits on one laptop screen: the side column scrolls inside itself, and every section has a drop-down arrow on its heading. The camera settings, controller layout and feel-and-connection panels under the preview start closed; PTZ Pad remembers what you open.

## Locking on the speaker

Going live with **A** (see Auto-tracking) locks on the speaker in the red box. You can also lock or unlock any time with **Lock** in the Auto-tracking panel or **L** on the keyboard. PTZ Pad freezes the colour of their shirt and from then on follows only someone wearing it. It never moves the red box to anyone else, however long the speaker is hidden or out of shot, until you press A again to unlock or turn auto-tracking off. The locked colour shows as a swatch next to the red box, under the monitor (LOCKED with the colour's name) and in the Auto-tracking panel with its hex value; the dashed box inside the red box is the part of the shirt the colour is read from. Clicking someone while locked locks on them instead. In the pop-up camera, A locks on the person you picked.

Without a lock, the red box stays on the speaker until they have been missing for **10 detections in a row** (set this under Feel and connection, Auto-tracking: 3 to 60), and only then picks someone else. If a lock loses the speaker under changing light, lower **Lock colour match** there.

## Auto-tracking

PTZ Pad can follow a speaker on its own. It watches a small, low-resolution copy of the camera's NDI video, finds people with an on-device pose model (nothing goes to the cloud), and steers the camera gently to keep the speaker framed.

1. In the camera's settings, under **Video for auto-tracking**, choose where the tracker gets the picture:
   - **NDI:** pick the NDI source. For NDI cameras you can leave it blank to use the camera's own NDI source.
   - **RTSP or SRT stream:** enter the stream address, or use **Fill in the address for** to start from a common pattern, then click **Test stream** to see a picture from it. Put any login in the address (rtsp://user:password@192.168.1.50/2). Use the camera's low-resolution second stream if it has one; it tracks just as well and uses less of the computer.
2. Press **A** on the controller for a **tracking preview**. The tracker's video plays in the main monitor with the comfort zone (green) and the person it will follow (red box), but the camera doesn't move. Move the comfort zone with the right stick, and click a person to pick someone else. Press **A** again to **go live**: PTZ Pad locks on the speaker in the red box and the camera follows. The camera list shows Track preview, then Tracking. (Right stick click, or **Auto-track** on screen, starts tracking straight away without the preview.)
3. Move the left stick or the triggers to take over at any time. Let go and tracking picks up again. Press **A** again to stop the camera and go back to the preview; right stick click turns auto-tracking off. Switching to another camera ends a preview.

PTZ Pad checks its own work while tracking. It measures how the whole picture moves while the camera turns, which tells it the stream's delay, how fast the camera turns, and whether it is turning the right way. If the camera turns away from the speaker (common with image mirror or flip settings and ceiling mounts), PTZ Pad reverses tracking for that camera, remembers it, and turns back to find the speaker; what it learned is shown in the camera's settings under Video for auto-tracking, with a Relearn button. The Reverse pan, Reverse tilt and Invert tilt settings change the controller only; auto-tracking ignores them, starts from the camera's standard direction, and learns the right way itself. If the picture doesn't move at all while the camera is turning, PTZ Pad stops tracking and says so, because the stream is probably from a different camera. Until it has measured the camera, it moves gently.

The **Fine tune** slider in the Auto-tracking panel nudges tracking from Relaxed (waits longer, moves more gently) to Tight (follows quicker, keeps the speaker nearer center) while it runs. The - and = keys do the same.

If several people are in the shot, PTZ Pad starts with the one nearest the center of the shot; click a person in the main monitor to follow them instead (a click picks, a drag steers). Once it has picked someone, it stays on that person: it matches them by position, size and the colours they wear, so someone walking past or crossing in front doesn't take over. If the speaker is hidden or leaves the shot, PTZ Pad waits for that same person for the number of detections you set (10 by default) before choosing again, or forever while locked.

The main monitor shows the comfort zone as a box: green while the speaker is inside it, amber while the camera is moving to re-center them. The dashed box inside is the settle zone, where a move stops. The box moves ahead of a speaker who is walking. You choose where the comfort zone sits for each camera: while that camera is auto-tracking, push the right stick to move it (it shows in the monitor even before a speaker is found), or use **Comfort zone position** in the Auto-tracking panel. **Center** puts it back. Click the right stick to turn auto-tracking on or off (A still works too). When a camera isn't tracking, the right stick zooms.

**Tracking PID control** (in Feel and connection) shows the values the tracking controller uses: P (how hard it pushes toward center), I (removes a lingering offset), D (brakes as the speaker nears center), the settle zone, max pan and tilt speed, ease in and ease out times, and a video delay to allow for until PTZ Pad has measured the real one (300 ms to start). By default they follow Tracking speed, Smoothness and Fine tune. Turn on **Set PID values by hand** to set your own; **Back to automatic values** undoes that. While tracking, the panel shows the live error, each term and the output for pan and tilt.

**Smooth starts and stops:** every tracking move fades in from a standstill and fades out to a stop on an S-curve, for pan, tilt and zoom alike. PTZ Pad starts the fade-out early, from how fast the speaker is closing on the comfort zone, so a gentle stop still lands on target. Turning auto-tracking off mid-move fades the move out instead of stopping dead, taking over with the sticks fades tracking out, and letting go fades it back in. Set the times with Ease in and Ease out under Tracking PID control (longer is gentler).

**Precision mode and live cameras:** precision and the live-on-program limit lower the top speed, but the stick keeps its full range between the camera's slowest speed and that top, so even precision on a live camera always moves (at the slowest speed for a light push). Auto-tracking on a live camera also never drops below the slowest speed, so it can still make small corrections.

**Precision mode** applies to tracking too: by default, holding RB slows tracking's pan, tilt and zoom to the precision speed. You can make tracking always run at precision speed, or turn this off, under Precision mode while tracking. Tracking keeps running on a camera while you switch to another camera and steer that one by hand.

Tracking moves like a camera operator: it eases into and out of moves, holds a steady speed instead of nudging between speeds, pauses before changing direction, and zooms only once the speaker has settled, slowly, and never while panning. Settings under Feel and connection let you choose the shot (wide, medium or close), whether to zoom to keep the shot size, how quickly to follow, how smooth the starts and stops are, how far the speaker can move before the camera reacts, and what to do when the speaker leaves (stay put, or go to a preset after a few seconds).

If a stream drops, PTZ Pad reconnects on its own and the line under the main monitor says what went wrong. Streams are decoded by FFmpeg, which the launcher installs with PTZ Pad.

Auto-tracking runs in the PTZ Pad desktop app. It isn't available on the claude.ai page or in browser mode. The first launch after updating downloads the tracking model (a few MB), so it needs internet once.

With A now used for tracking, preset 1 moves to **RB + A**. Presets 2 to 8 are unchanged.

## TriCaster

PTZ Pad works alongside a TriCaster (TC1, TC2 Elite, Mini 4K and other current models) over your network.

1. In the **TriCaster** panel (top right, under Presets), open **TriCaster setup**, tick **Use a TriCaster with PTZ Pad**, enter its IP address, and click **Test connection**. If LivePanel has a password, enter that username and password too.
2. In each camera's settings, check its **TriCaster input**. Camera 1 starts as Input 1, camera 2 as Input 2, and so on; the list shows the input names from the TriCaster.

Then:
- **GO LIVE:** press **Menu** on the controller, the GO LIVE button, or Enter, to put the selected camera on program, as a cut or a transition (your choice). Turn on **Press GO LIVE twice** for extra safety. Home is now **View + Menu**.
- **Tally:** the camera buttons show which camera is live (red) and on preview (green), and the camera you're controlling gets an ON AIR frame when it's live. The controller gives a short double rumble when your camera goes live.
- **Preview follows you, and you follow the TriCaster:** picking a camera in PTZ Pad puts it on TriCaster preview. When someone changes preview on the TriCaster, PTZ Pad switches to that camera so you can line up the next shot. Either can be turned off, and PTZ Pad stays on your camera after its own GO LIVE.
- **Switch from PTZ Pad:** hold LB and press D-pad up to put the camera on preview, D-pad down to cut, or D-pad right for an auto transition. The keyboard keys are P, C and Shift+C. The TriCaster panel has the same buttons.
- **Moving the live camera:** the director can always move the camera that's on program, at full speed by default (or slowly, if you choose that under **Director: moving the camera that's live** in TriCaster setup). **Camera operators: moving the camera that's live** sets what camera operators can do: move it slowly (the default), at full speed, or not at all.

## Use it as a private claude.ai page

PTZ Pad can also run as a private page on claude.ai, opened in the Claude desktop app. The page sends commands through a small helper that the Claude app runs on your computer.

1. Double-click **Set up Claude helper (Windows).bat** or **Set up Claude helper (Mac).command**. The first run downloads what it needs.
2. Quit the Claude desktop app completely and open it again.
3. Open your PTZ Pad page in the Claude desktop app. Allow it to use PTZ Pad when asked, and choose Always allow if the app asks you to confirm commands.

Camera control works only in the Claude desktop app, on the computer where the helper is set up. In a regular browser tab the page loads but can't reach the cameras.

## Prefer a browser?

`npm run bridge` and open http://localhost:8787 in Chrome or Edge. The same app runs there, using the bridge over HTTP, and you can install it as an app from that address too. Other devices on your network can open `http://THIS-COMPUTER:8787`.

The same bridge serves the web version on GitHub Pages. It only takes commands from its own pages, from localhost, and from the `homepage` address in `package.json`. It's set to https://micahshippee.github.io/ptz-pad/. To allow other addresses too, list them in the `PTZ_PAD_ORIGINS` environment variable, comma separated.

## Files

- `app/ptz-controller.html` is the controller interface.
- `bridge-core.js` sends VISCA and HTTP commands to cameras.
- `ndi-core.js` sends PTZ commands over NDI through the NDI Runtime, and pulls low-resolution video for tracking.
- `video-core.js` decodes RTSP and SRT streams for tracking with FFmpeg.
- `tracker/` finds and follows the speaker (MediaPipe Pose, on-device).
- `main.js` and `preload.js` wrap both into the desktop app.
- `ptz-bridge.js` starts the browser-mode bridge on its own; `bridge-server.js` is the bridge itself, also run by the desktop app.
- `web/` holds the web version's manifest, service worker and icons; `tools/build-web.js` assembles the GitHub Pages site.
- `.github/workflows/` releases each new version (`build.yml`) and publishes the web version (`pages.yml`).
- `CHANGELOG.md` holds the release notes; `tools/bump.js` starts a version; `tools/check-version.js` and `tools/release-notes.js` are used by the release.
- `helper/ptz-pad-mcp.js` is the helper the Claude desktop app runs for the claude.ai page.
