# Building this site in Church Co

The HTML pages in this repo are the blueprint. Recreate each one with Church Co's own blocks so staff can edit it later, and keep pages unpublished until the elders have reviewed them.

## 1. Design settings (Design & Themes)

| Setting          | Value                                          |
|------------------|------------------------------------------------|
| Primary color    | `#26341F` (pine)                               |
| Accent color     | `#A27A45` (bronze)                             |
| Background       | `#FBF9F4`                                      |
| Alternate band   | `#F1ECE1` (sand)                               |
| Text             | `#1C211A`                                      |
| Heading font     | Jost, weight 500 (big page titles in capitals) |
| Body font        | Jost, weight 400                               |
| Scripture lines  | Cormorant Garamond, italic 500                 |
| Logo             | `assets/brand/mark-color.png` (header), `assets/brand/badge-watercolor.webp` (footer) |

## 2. Pages, in build order

| Page           | File            | Sections, top to bottom |
|----------------|-----------------|-------------------------|
| Home           | `index.html`    | Hero (pine, photo behind) · Sunday facts row · "New here?" image + text · "Belong. Find peace. Be Spirit-led." band · Who we are · Three photo tiles · Give band |
| Plan a Visit   | `visit.html`    | Page header · Sunday facts row · What to expect (rows) beside photo + address card · "Tell us you're coming" band |
| About          | `about.html`    | Page header · Mission (two columns with verses) · Why Calvary Hill? (logo + text) · Four values · Elders (three photo cards) · Visit band |
| Beliefs        | `beliefs.html`  | Page header · Eight beliefs in two columns · "We'd love to talk" band |
| Connect        | `connect.html`  | Page header · Gathering Groups (photo + text, seasons, four pillars) · Serve (text + team tags + photo) · Prayer request |
| Kids           | `kids.html`     | Page header · On Sundays (photo + text, three points) · Pray together with ACTS · Visit band |
| Give           | `give.html`     | Page header · Give online + 2 Corinthians 9:7 · Where it goes (three columns) |

Navigation: Visit · About · Beliefs · Connect · Kids · Give, with a "Plan a visit" button.

## 3. Pieces that may need a Code block

Use standard blocks wherever they come close. These three are the likeliest to need Church Co's Code block (copy the markup from the page and the matching rules from `css/styles.css`):

- The home hero's cross standing on the layered hills (`.hero__art`)
- The hill shapes at the bottom of each page header (`.hero__hills`)
- The "Belong. Find peace. Be Spirit-led." band (`.words`)

## 4. Links to swap in

- Church Center links still use `omnifellowship.churchcenter.com`. "Let us know", "Sign up to serve" and "Share a prayer request" point to the Church Center home page until the real form links are added.
- Photos: see the photo table in `README.md`, plus elder photos for the About page.
