Here's my revision/upgrade plan:

1. Clone the project to a new folder, consider it as a new project, keeping this original project as it is, as a backup, and then perform all the succeeding updates/upgrade on the new project.

2. Package the whole system as a windows program, so that the process of deployment will be by way of an installer, then all files will be installed to the PC that the client will use, then a shortcut will be created, and then when the user initiates the shortcut, it will then initiate the local server, synced online when internet is available, divert to local data when internet is down, and go back to being synced online when internet comes back.

3. I want this program to be flexible and generic as much as possible, add a 1st page(system settings) when the shortcut is ran for the 1st time(after installation), must be skipped on the next runs, but still available via a system settings button on the dashboard. Must add extra security when changing anything in the system settings(warning regarding data loss possibility or perhaps add an option to clear all data in queue or preserve).
-Why do we need this?
	-I want to add the user freedom to have the option to have up to 2 car brands
	-have the option to have up to 12 cards for the car queue numbers., eg. 7 cars for brand 1, 4 cars for brand 2, total of 11, or, 5 cars for brand 1, 5 cars for brand 2, or 12 cars, brand 1 only, no brand 2, in short the total number of cars must not exceed 12 cars, as it is the limit of the number of cards in the dashboard for it to be viewable on a full screen without scrolling and zooming in or out.
	-Auto disable Brand 2 options if Brand 1 number of cars is 12
	-Add data validation to the number of cars input boxes.
	-Have an input boxes for Brand names, Car names/models and Queue number prefixes.
	-Have a color palette for choosing the accent color for the Brand 1 and 2, if possible add the feature to input color hex code.

4. Push the production installer package to git and cloudflare(I'm not sure about this, since it will no longer be a webapp, but a windows program.

5. A button for update to pull from git or cloudflare when an update has been made. Auto update feature if possible.
6. We will adjust accordingly the layout of cards based on the combinations of the number of cars of brand 1 and 2.