# Calvary Hill Church website

Concept website for Calvary Hill Church, 330 S. Clark Rd, Cedar Hill, TX.

Mission: we exist to treasure Jesus above all and make disciples who make disciples.

It is a static site: plain HTML, CSS and JavaScript with no build step, so it can be hosted on GitHub Pages, Netlify, or any web host.

## Concepts

- **Main site**: the simple, photo-ready design. Dark pine hero, short copy, one idea per section. Pages: `index.html` (home), `visit.html`, `about.html`, `beliefs.html`, `connect.html`, `kids.html`, `give.html`.
- **Hillside** (`concepts/hillside/`): the first concept, with watercolor hills and fuller copy. Kept for reference.

Both share the logo files in `assets/brand/`.

## Photos

Drop photos into `assets/photos/` with these names and they appear automatically. Until a file exists, its spot shows a placeholder.

| File          | Where it shows                                  |
|---------------|-------------------------------------------------|
| `hero.jpg`    | Behind the top section, toned into the green    |
| `sunday.jpg`  | Home "New here?" section and Plan a Visit page  |
| `groups.jpg`  | Gathering Groups tile and Connect page          |
| `kids.jpg`    | Calvary Hill Kids tile and Kids page            |
| `serve.jpg`   | Serve tile and Connect page                     |

Landscape photos at least 1600px wide work best for `hero.jpg` and `sunday.jpg`; the tiles crop to a tall 4:5 frame.

## Run it locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Structure

```
index.html              Home page
visit.html, about.html, beliefs.html, connect.html, kids.html, give.html
                        Inner pages (shared header and footer)
css/styles.css          Styles for every page; brand colors and fonts are tokens at the top
js/main.js              Mobile menu, photo loading, current group season
CHURCHCO.md             How to rebuild these pages in Church Co
assets/brand/           Web logo files cut from the logo concepts
assets/brand/source/    Original logo files and make_assets.py, which regenerates
                        the web files: python3 assets/brand/source/make_assets.py assets/brand
assets/photos/          Church photos (see the table above)
concepts/hillside/      The first concept (watercolor hills)
```

## Brand

| Token     | Hex       | Use                                  |
|-----------|-----------|--------------------------------------|
| `--pine`  | `#26341F` | Hero, give band, buttons             |
| `--bronze`| `#A27A45` | Hill strokes, labels, accents        |
| `--bg`    | `#FBF9F4` | Page background                      |
| `--sand`  | `#F1ECE1` | Alternate light band, photo slots    |
| `--ink`   | `#1C211A` | Body text, footer                    |

Fonts (Google Fonts): Jost for headings and text (close to "CHURCH" in the logo lockup), Cormorant Garamond italic for the one Scripture-style line.

## Content to confirm before launch

- Service time (10:00 AM) and whether there is one service or two
- Kids ministry age groups and check-in time
- Fall Festival details (Oct 31, 5–7 PM) once the city permit is approved
- Church Center links still point to the old `omnifellowship.churchcenter.com` address, and the prayer-pledge and plan-a-visit links go to the Church Center home page
- A contact email on the new domain (the footers show only the phone number for now)
- Real photos for the hero and the photo slots
- Elder names, titles and photos on the About page (Steve's last name is taken from his email address)
- Kids check-in process and age groups on the Kids page
