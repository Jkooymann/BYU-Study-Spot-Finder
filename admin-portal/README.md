# Admin Portal (IS401)

This folder holds the team's hand-coded admin portal: a separate Node/Express app
with a landing page, login, Maintain Users / Maintain Records pages, and logout.

It is its own app and is deployed separately from the main site. The main
Study Spot Finder site in `prototype/` (served by GitHub Pages from `main`) does
not use anything in this folder.

It lives on `main` next to the main site. Nothing in `prototype/` links to these
files except the Admin Portal button, so editing them can't break the live site.

## File structure

Everything here is empty on purpose. The team writes the code.

```
admin-portal/
├── index.js            the Express server (routes, login, database)
├── package.json        packages the app uses (express, ejs, express-session, knex, pg, multer)
├── package-lock.json
├── views/              one .ejs file per page
│   ├── index.ejs       1. Landing page, log in at top right (logout clears the cookie), image
│   ├── users.ejs       2. Users: table of users, with Delete
│   ├── addUser.ejs     3. Add a user
│   ├── editUser.ejs    4. Edit a user
│   ├── records.ejs     5. Records (study spots, the study_spot table), with Delete
│   ├── addRecord.ejs   6. Add a study spot
│   └── editRecord.ejs  7. Edit a study spot
└── public/
    └── images/         images for the pages (landing page image goes here)
        └── users/      uploaded user pictures
```

The `.gitkeep` files only make git keep the empty image folders. Delete them once real images are in.

## Running it on your computer

Open a **Command Prompt** terminal in VS Code (not PowerShell), then:

```
cd admin-portal
npm install
node index.js
```

The app runs at http://localhost:3000. The "Admin Portal" button on the main site's OKR page points there for now.
`node_modules/` and `.env` are already ignored by the repo's `.gitignore`.
