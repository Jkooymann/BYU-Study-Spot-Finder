BYU STUDY SPOT FINDER

App Summary: 
Many BYU students struggle to find good places to study, especially during busy times when popular spots like the library are too crowded. Students often waste time walking around campus trying to find a spot that fits their needs, whether that's a quiet place, somewhere with outlets, an area for group studying, or some combination of the three. Our app solves this problem by helping BYU students quickly find study spots that match their preferences. Students can search for locations in different buildings and filter them based on features such as noise level, busyness, group size, and available amenities. The app also allows students to rate study spots, leave reviews, and add new locations that other students might not know about. Users can save their favorite study spots and create custom filters to make finding a place even easier in the future. Ultimately, our goal is to help BYU students spend less time looking for somewhere to study and more time actually getting their work done.

ERD:
<img width="1214" height="521" alt="Screenshot 2026-10-10 at 11 34 01 PM" src="https://github.com/user-attachments/assets/a1dee7a7-4f22-41bd-87a3-e18275927548" />

Tech Stack:
Frontend: HTML/CSS/JS
Backend: Supabase
Database: Supabase

We chose HTML/CSS/JS for our frontend because we worked primarily with Claude during our design sprint. It built a user-friendly frontend with HTML so we decided to continue on that route. We chose Supabase for the backend and database as we are most familiar with that service. We believe it will be easiest to have the same service provide both. We will have ChatGPT and Claude to help connect each layer.

How to Get It Running:
- Open our team's GitHub repository using the provided link.
- Download the project files or clone the repository to your computer.
- Open the project folder in Visual Studio Code.
- Make sure the project is connected to Supabase using the project's Supabase URL and publishable key.
- Start a local web server using VS Code's Live Server extension by clicking “Go Live” and open the website in a browser.
- The website should display the available BYU study spots and allow users to interact with the Favorites button.

Verifying the Vertical Slice:
- Open the BYU Study Spot Finder website.
- Find a study spot and click the Favorites button next to it.
- The button should change appearance to indicate that the study spot has been favorited.
- The app sends this information to Supabase, where the favorite is saved in the Favorite_Spot table with the user's ID and the study spot's ID.
- Refresh the webpage and check that the heart is still marked as favorited.
- Click the Favorites button again to remove the study spot from your favorites.
- Refresh the page again to verify that the study spot is no longer favorited.
- This demonstrates that the frontend, backend, and database are all communicating successfully, and that changes are permanently saved rather    than just temporarily stored in the browser.
