#!/bin/bash
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.npm-global/bin:$HOME/.bun/bin:$PATH"
vercel --prod --yes
echo
echo "Done. You can close this window."
