# Calvary Hill Church website

Concept website for Calvary Hill Church (formerly Omni Fellowship), 330 S. Clark Rd, Cedar Hill, TX.

It is a static site: plain HTML, CSS and JavaScript with no build step, so it can be hosted on GitHub Pages, Netlify, or any web host.

## Run it locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Structure

```
index.html              Home page (all sections)
css/styles.css          Styles; brand colors and fonts are tokens at the top
js/main.js              Mobile menu, copy-address button, current group season,
                        and the watercolor hills + cross drawn in the hero
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
- Church Center links: they still use `omnifellowship.churchcenter.com` and the prayer-pledge link goes to the Church Center home page
- Contact email: still `info@omnifellowship.com`
- Photos: the "Your first Sunday" section has a placeholder for a real photo
- Elder and staff names and titles for an About / Leadership page
