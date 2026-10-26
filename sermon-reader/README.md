# Sermon Rehearsal

Hear your Logos sermon read back in a natural voice so you can internalize it.

There are two tools here:

| Tool | Use it for |
| --- | --- |
| `index.html`, the read-back app | Listening at your desk. It highlights each sentence as it's read, so you can jump around, repeat paragraphs, and practise from memory. |
| `sermon-audio.sh`, the audio maker | Saving the sermon as an `.m4a` file to play on your phone, in the car, or on a walk. |

## One-time setup: get a natural voice

macOS comes with high-quality voices, but you have to download them first:

1. Open **System Settings → Accessibility → Spoken Content**.
2. Next to **System Voice**, click the voice menu and choose **Manage Voices…**
3. Under **English**, download one or two voices marked **(Premium)** or **(Enhanced)**.
   Good ones to try: *Ava (Premium)*, *Zoe (Premium)*, *Evan (Enhanced)*, *Nathan (Enhanced)*.
4. Quit and reopen your browser so it sees the new voices.

## Read-back app

Open `index.html` in **Safari** (it has the best access to the Mac's Premium voices) or Chrome.

1. In Logos, open your sermon, click into the text, press **⌘A**, then **⌘C**.
2. In the app, click **Paste a new sermon**, click the box, press **⌘V**, and click **Load sermon**.
   You can also drop a `.docx`, `.rtf`, `.txt` or `.md` file you exported from Logos.
3. Press **Play**, or click any sentence to start there.

The app remembers your last sermon, where you stopped, and your settings on that browser.

Ways to rehearse:

- **Repeat-after-me pauses** leave a gap after each sentence so you can say it back aloud.
- **Read each paragraph** 2–4 times to drill a section until it sticks.
- **Cover the text** blurs everything except the current line, so you can test your recall.
- Keyboard: **Space** play/pause, **← →** previous/next sentence, **↑ ↓** previous/next paragraph.

Bible shorthand is read the way you'd say it. For example, `1 Cor. 13:4–7` is read as
"First Corinthians 13, verse 4 through 7", and footnote markers copied from Logos are skipped.

## Audio file for your phone

The first time only, open **Terminal** in this folder and run:

```bash
chmod +x sermon-audio.sh
```

Then, after copying your sermon in Logos (⌘A, ⌘C):

```bash
./sermon-audio.sh
```

The audio is saved to **Desktop → Sermon Audio**, and Finder opens to show it. AirDrop it to your
iPhone, or drag it into the Music app to sync it.

Options:

```bash
./sermon-audio.sh my-sermon.docx          # use an exported file instead of the clipboard
./sermon-audio.sh -v "Zoe (Premium)"      # choose a voice (list them with: say -v '?')
./sermon-audio.sh -r 150                  # slower: words per minute (default 165)
./sermon-audio.sh -p 2                    # longer pause between paragraphs, in seconds
```

### Optional: a right-click "Make Sermon Audio" menu item

1. Open **Automator** and choose **New Document → Quick Action**.
2. Set *Workflow receives current* to **text** in **any application**.
3. Add a **Run Shell Script** action, set *Pass input* to **to stdin**, and enter:
   ```bash
   "$HOME/path/to/sermon-reader/sermon-audio.sh" -
   ```
4. Save it as **Make Sermon Audio**.

Now select your sermon text, right-click, and choose **Services → Make Sermon Audio**. Whether
this shows up inside Logos depends on Logos supporting macOS Services. If it doesn't, copy the
text and run the script from Terminal.

### Quickest option, with no setup

macOS can read any selected text aloud. Turn on **System Settings → Accessibility → Spoken
Content → Speak selection**, select text in Logos, and press **⌥ Esc** (Option + Escape).
