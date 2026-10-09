# Contributing

We use a simple branch + pull request workflow. Nobody pushes straight to `main`.

## One-time setup

```
git clone https://github.com/Jkooymann/BYU-Study-Spot-Finder.git
cd BYU-Study-Spot-Finder
```

## For each change

1. Get the latest `main`:
   ```
   git checkout main
   git pull
   ```
2. Make a branch named for the work:
   ```
   git checkout -b add-filter-panel
   ```
3. Edit, then commit in small steps:
   ```
   git add .
   git commit -m "Add noise level filter"
   ```
4. Push the branch:
   ```
   git push -u origin add-filter-panel
   ```
5. On GitHub, click **Compare & pull request**, describe the change, and ask a teammate to review.
6. After an approval, click **Merge pull request**, then delete the branch.

## Tips

- Keep pull requests small and focused on one thing.
- Pull `main` often so your branch doesn't drift.
- Use GitHub Issues to list tasks and assign them, so two people don't build the same thing.
