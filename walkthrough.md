# Walkthrough: Cloudflare Deployment Version

The Cloudflare-ready files have been set up in `C:\Users\Epi\Documents\Projects\AutoFocus\tdqsys\`. 

## What Changed?
Instead of a local `server.js` running permanently on your laptop and saving to a text file, Cloudflare relies on **Cloudflare Workers KV (Key-Value Database)**. I created a `functions` folder containing two serverless endpoints:
1. `api/save.js`: Intercepts the dashboard's saves and pushes them into your Cloudflare KV namespace.
2. `api/data.js`: Automatically pulls down the saved cloud state on page load. 

The HTML/CSS elements in the `public` folder are entirely unchanged!

## How to Test and Deploy with Cloudflare

### 1. Test Locally with Wrangler
You will need Node.js and the official Cloudflare CLI, `wrangler`.
1. Open PowerShell and install wrangler:
   ```cmd
   npm install -g wrangler
   ```
2. Navigate to your new directory:
   ```cmd
   cd "C:\Users\Epi\Documents\Projects\AutoFocus\tdqsys"
   ```
3. Run the local Cloudflare dev server:
   ```cmd
   wrangler pages dev public --kv=QUEUE_DATA
   ```
   *This commands Cloudflare to spin up a local development server at `localhost:8788` simulating the cloud environment and creating a temporary local KV database!*

### 2. Deploy to Production
To push this live to the cloud so you can access it on any device via a public URL:
1. First, create your KV namespace using Wrangler (you will be prompted to log in to Cloudflare):
   ```cmd
   wrangler kv namespace create "QUEUE_DATA"
   ```
   *Note: This command will output an `id = "..."` value. Open your `wrangler.toml` file and replace the generated placeholder ID with this new alphanumeric ID.*

2. Finally, deploy the app:
   ```cmd
   wrangler pages deploy public
   ```

Cloudflare will give you a public `.pages.dev` URL where your fully functional, cloud-persisted queue system is now live!
