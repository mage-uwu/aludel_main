#!/bin/sh
# Law: the app pays for itself in CHARACTERS, not lines.
#
# It used to be 800 lines. That worked until it didn't: the count sat pinned at 800 for
# twenty-five commits while the source grew a third, because every feature was paid for by
# joining statements rather than by deleting anything. A line budget prices newlines, and
# newlines are free — so it stopped measuring complexity and started rewarding density.
# Worse, it twice selected the cheaper-to-write design over the correct one.
#
# Characters price the thing itself — and once they do, joining statements saves nothing, so
# the incentive to game it is simply gone. The line cap is only a backstop against a monster
# (a JSON schema crammed onto one line), not a style rule: JSX and prompts may run long.
BUDGET=81000
MAXLINE=400
FILES=$(find src worker -name '*.ts' -o -name '*.tsx' | grep -v '\.test\.' | sort)
CHARS=$(cat $FILES | wc -c | tr -d ' ')
LINES=$(cat $FILES | wc -l | tr -d ' ')
LONG=$(cat $FILES | awk -v m=$MAXLINE 'length($0) > m' | wc -l | tr -d ' ')
echo "app source: $CHARS / $BUDGET chars  ($LINES lines, $LONG over ${MAXLINE}c)"
[ "$CHARS" -le "$BUDGET" ] || { echo "over budget — new code pays for itself by trimming real fat"; exit 1; }
[ "$LONG" -eq 0 ] || { echo "$LONG line(s) over ${MAXLINE} chars — that is not a line, it is a paragraph"; exit 1; }
