# Certa Masthead Brand
Reusable top-right page decoration from the approved Certa layout.

## Plain HTML
Copy `assets/`, `standalone.html`, and `certa-masthead.css`.

## React
Copy `assets/`, `CertaMastheadBrand.jsx`, and `CertaMastheadBrand.css`.

```jsx
import CertaMastheadBrand from "./CertaMastheadBrand";
<header className="pageHeader">
  <div>{/* title/subtitle */}</div>
  <CertaMastheadBrand />
</header>
```

Recommended parent:
```css
.pageHeader{display:flex;justify-content:space-between;align-items:flex-start;gap:32px}
```

The PNG includes both the handwritten “Trade together. Go further.” lettering and the mountain/trader illustration, so there is no custom font dependency.
