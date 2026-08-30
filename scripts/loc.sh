#!/bin/sh
# Law: the app is <= 800 lines of TypeScript. Tests, CSS, and config are uncounted.
BUDGET=800
TOTAL=$(cat src/*.ts src/*.tsx worker/*.ts 2>/dev/null | grep -v '\.test\.' >/dev/null; find src worker -name '*.ts' -o -name '*.tsx' | grep -v '\.test\.' | xargs wc -l | tail -1 | awk '{print $1}')
echo "app source: $TOTAL / $BUDGET lines"
[ "$TOTAL" -le "$BUDGET" ] || { echo "over budget — the noun ceiling applies to lines too"; exit 1; }
