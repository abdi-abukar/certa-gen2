# Certa Footer HTML

Standalone recreation of the supplied footer concept.

Files:
- `index.html`
- `styles.css`
- `assets/certa-footer-landscape.png`
- `assets/certa-logo-lockup.png`

The lower landscape is cropped from the supplied concept image so the HTML version keeps the same Certa pixel-art scene. The upper navigation/newsletter area is real HTML/CSS and can be wired directly into React.

## React
Move the footer markup into your component and replace:
- `class` with `className`
- anchor `href="#"` values with your routes
- newsletter form action with your subscribe handler

All CSS is scoped to `certa-footer*` classes.
