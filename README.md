# BYU Study Spot Finder

A website that lists study spots across BYU campus, with a campus map, building floor views, filters (group size, noise, outlets, indoors/outdoors), favorites, and user-added spots.

## Repository layout

| Path | What it is |
|---|---|
| `docs/erd/` | Entity-relationship diagram (`erd.png`, `erd.svg`) and the script that draws it (`build_erd.py`). |
| `docs/notes/prototype-readme.md` | Notes on the front-end prototype: pages, routes, files, and design decisions. |
| `prototype/` | Front-end prototype (plain HTML/CSS/JS, open `index.html` in a browser). Add the files here. |

## Regenerating the ERD

```
cd docs/erd
python3 build_erd.py
```

No packages needed; it uses only the Python standard library.

## Working together

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch and pull request workflow.
