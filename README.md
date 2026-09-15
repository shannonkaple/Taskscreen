# Taskscreen — GitHub Pages version

This package is made for:

https://shannonkaple.github.io/Taskscreen/

## Important: add your two font files

The code is already configured to force the two fonts you supplied, but the font files are NOT bundled in this download.

Create a folder named:

`fonts`

inside your `Taskscreen` repository, then upload your own copies with these exact filenames:

- `KAHomebodyClub.ttf`
- `VAG-Rounded-Std-Black_47296.ttf`

The page will automatically use them after GitHub Pages updates.

## What this version does

- EDIT / DONE mode
- Editable section headings
- Editable objective
- Editable Task of the Day instruction bar
- Wider Task instruction bar
- Editable reminder text
- Editable timer labels
- Editable voice-level wording
- Editable Bathroom + Water heading
- Editable doorbell instruction
- Editable table button names while in Edit mode
- Separate 1ST GRADE and 2ND GRADE profiles
- Each grade independently saves all text, end time, reminders, voice level, labels, text sizes, and task content
- Uploaded image/GIF/video files persist using IndexedDB on the same browser/device
- Task image/video URLs also save
- Per-panel TITLE and TEXT A− / A+ controls
- Class end time can be clicked and changed quickly outside Edit mode
- Bathroom caller starts with NO table selected
- Selecting a table changes the entire Bathroom + Water panel to that table's color
- Active table name is much larger
- Bathroom/Water graphic remains above the buttons
- Blue doorbell stays on the right with larger instruction text
- Previous called tables gray out
- Next and Reset still work
- 3× attention chime on a new bathroom table

## Saving

Text/settings save automatically in browser storage.

Uploaded local media is stored in IndexedDB, which is much better than localStorage for images/GIFs/video.

Because this is a static GitHub Pages site, saved classroom settings are browser/device-specific. They do not automatically follow you to another computer.

## Upload to GitHub

In the root of the `Taskscreen` repository, upload/replace:

- `index.html`
- `styles.css`
- `app.js`
- the `assets` folder
- your own `fonts` folder with the two font files above

Keep GitHub Pages pointed to your main branch/root.

- v13: Removed the visible/dotted outline around the Task of the Day media/video area.
