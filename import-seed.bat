@echo off
echo Importing seed files...
for %%f in (cloudflare\seed\seed-*.sql) do (
    echo Importing %%f
    npx wrangler d1 execute costco --file="%%f" --remote
)
echo Done!
