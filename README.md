# WhereToCofi

## Public link with Cloudflare

Run this command from the project directory:

```powershell
.\start-public.ps1
```

The script starts the app when needed and prints a random public
`https://...trycloudflare.com` address. Keep the terminal open while the link
is in use; press `Ctrl+C` to stop sharing it.

The generated address changes each time. Cloudflare Quick Tunnels are intended
for demos and development, not permanent production hosting.
