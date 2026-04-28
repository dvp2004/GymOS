# GymOS v11 — Product polish layer

This patch is intentionally CSS-only so it improves the live product feel without touching the TypeScript/data layer.

## Changes

- Premium dark visual system with stronger design tokens.
- More app-like background, glass cards, stronger metric hierarchy, and higher-contrast action buttons.
- More polished Today dashboard layout for the existing command-centre cards.
- Cleaner workout cards with bigger tap targets and improved exercise-history strips.
- Better mobile bottom navigation styling with iPhone safe-area spacing.
- Improved heatmap, progression, analysis, history, import, auth, and storage card styling.
- Fixes CSS inconsistencies from the previous styling layer.

## Apply

Copy `src/App.css` into your project and overwrite the existing file.

Then run:

```powershell
npm run build
```

If it passes:

```powershell
git add .; git commit -m "Polish GymOS mobile-first UI"; git push
```
