#!/usr/bin/env bash
set -uo pipefail
ROOT="$HOME/opportunity-atlas-research"
mkdir -p "$ROOT"/{repos,logs,inputs,results}
LOG="$ROOT/logs/setup-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG") 2>&1
echo "ATLAS SETUP START $(date -u)"; echo "LOG=$LOG"
run(){ echo ">>> $1"; shift; "$@"; result=$?; echo "RESULT=$result"; return 0; }
for cmd in git node npm python3 python3.12 uv docker claude codex; do command -v "$cmd" || echo "$cmd NOT INSTALLED"; done
node --version || true; python3 --version || true
cd "$ROOT/repos" || exit 1
for item in "got-engine|https://github.com/Satyajitdutta/got-engine.git" "MiroFish|https://github.com/mj3b/MiroFish.git" "oasis|https://github.com/camel-ai/oasis.git" "synthetic-focus-group|https://github.com/laymom/synthetic-focus-group.git"; do
  name="${item%%|*}"; url="${item#*|}"
  if [ -d "$name/.git" ]; then echo "EXISTS $name"; else run "clone $name" git clone --depth 1 "$url" "$name"; fi
  if [ -d "$name/.git" ]; then git -C "$name" rev-parse HEAD; fi
done
if [ -f got-engine/api/proxy.js ]; then run "GoT syntax" node --check got-engine/api/proxy.js; fi
if command -v uv >/dev/null 2>&1; then
  run "Python 3.12 venv" uv venv --python 3.12 "$ROOT/.venv"
fi
if [ -f MiroFish/package.json ]; then
  cd "$ROOT/repos/MiroFish" || exit 1
  run "MiroFish dependencies" npm run setup:all
  cd "$ROOT/repos" || exit 1
fi
if [ -x "$ROOT/.venv/bin/python" ] && command -v uv >/dev/null 2>&1; then
  run "OASIS package" uv pip install --python "$ROOT/.venv/bin/python" camel-oasis
  run "OASIS import" "$ROOT/.venv/bin/python" -c "import oasis; print('OASIS IMPORT OK')"
fi
if [ -f synthetic-focus-group/SKILL.md ]; then echo "FOCUS GROUP SOURCE OK"; fi
if command -v claude >/dev/null 2>&1; then run "Claude CLI" claude --version; else echo "FOCUS GROUP BLOCKED: Claude CLI absent"; fi
cat > "$ROOT/inputs/previous-business-scopes.md" <<'EOF'
# Historical hypotheses, not buyer validated
1. Pithonix Mall Intelligence: hybrid mall shopper AI experience
2. DemandSwitch: live consumer demand routing to retailers
3. SpaceYield: short-duration commercial venue access
4. PromiseProof: interior design purchase visualization
5. EV Society Access Desk: residential EV charging access
6. Destination Wedding Fit Rescue: urgent wedding wardrobe assistance
Require multi-branch GoT, adversarial critiques, MiroFish/OASIS social simulations, independent synthetic focus-group reactions, real competition and unit economics; no invented validation.
EOF
echo "ATLAS SETUP FINISHED $(date -u)"
echo "RESULTS ARE INSTALLATION TESTS ONLY; NO PAID AI MODEL CALLS OR MARKET VALIDATION"
