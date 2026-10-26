# Calvary Hill Church website

Concept website for Calvary Hill Church, 330 S. Clark Rd, Cedar Hill, TX.

Mission: we exist to treasure Jesus above all and make disciples who make disciples.

It is a static site: plain HTML, CSS and JavaScript with no build step, so it can be hosted on GitHub Pages, Netlify, or any web host.

## Concepts

- **Concept 1, Hillside** (`index.html`): watercolor hills with the brush cross in the hero, fuller copy on every section.
- **Concept 2, Simple** (`concept-2/`): a quieter, photo-ready layout. Dark pine hero, short copy, one idea per section, photo slots for groups, kids and serving.

Both share the logo files in `assets/brand/`.

## Run it locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Structure

```
index.html              Concept 1 home page
css/styles.css          Concept 1 styles; brand colors and fonts are tokens at the top
js/main.js              Concept 1 scripts: mobile menu, copy-address button, current
                        group season, and the watercolor hills + cross in the hero
concept-2/              Concept 2 home page, styles and script
assets/brand/           Web logo files cut from the logo concepts
assets/brand/source/    Original logo files and make_assets.py, which regenerates
                        the web files: python3 assets/brand/source/make_assets.py assets/brand
```

## Brand

| Token        | Hex       | Use                                    |
|--------------|-----------|----------------------------------------|
| `--pine`     | `#2B3A23` | Cross and wordmark green, dark bands   |
| `--bronze`   | `#9E7542` | Hill strokes, accents                  |
| `--paper`    | `#F6F1E6` | Logo background, main page background  |
| `--sand`     | `#ECE4D2` | Alternate light band                   |
| `--ink`      | `#1F261B` | Body text, footer                      |

Fonts (Google Fonts): Cinzel for headings (matches the logo's capitals), Cormorant Garamond italic for Scripture, Montserrat for body text and labels (matches "CHURCH" in the lockup).

## Content to confirm before launch

- Service time (10:00 AM) and whether there is one service or two
- Kids ministry age groups and check-in time
- Fall Festival details (Oct 31, 5–7 PM) once the city permit is approved
- Church Center links still point to the old `omnifellowship.churchcenter.com` address, and the prayer-pledge and plan-a-visit links go to the Church Center home page
- A contact email on the new domain (the footers show only the phone number for now)
- Real photos for the hero and the photo slots
- Elder and staff names and titles for an About / Leadership page
