#!/usr/bin/env bash
# ==============================================================================
# NOOR DRIVE — Ubuntu / Linux Nautilus Right-Click Context Menu Installer
# Adds "Upload to NOOR DRIVE" right-click action to GNOME Files (Nautilus)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$HOME/.local/share/nautilus/scripts"
TARGET_SCRIPT="$SCRIPT_DIR/Upload to NOOR DRIVE"
SYNC_DIR="$HOME/NoorDrive"

mkdir -p "$SCRIPT_DIR"
mkdir -p "$SYNC_DIR"

cat << 'EOF' > "$TARGET_SCRIPT"
#!/usr/bin/env bash
# Action executed when user right-clicks and chooses Scripts -> Upload to NOOR DRIVE

SYNC_DIR="$HOME/NoorDrive"
mkdir -p "$SYNC_DIR"

COUNT=0
while IFS= read -r FILE; do
  if [ -n "$FILE" ]; then
    cp -r "$FILE" "$SYNC_DIR/"
    COUNT=$((COUNT + 1))
  fi
done <<< "$NAUTILUS_SCRIPT_SELECTED_FILE_PATHS"

if [ "$COUNT" -gt 0 ]; then
  if command -v notify-send >/dev/null 2>&1; then
    notify-send "NOOR DRIVE" "Copied $COUNT item(s) to ~/NoorDrive. Syncing to Cloud..." --icon=cloud
  fi
fi
EOF

chmod +x "$TARGET_SCRIPT"

echo "✅ Nautilus right-click action installed at: $TARGET_SCRIPT"
echo "👉 You can now right-click any file in Ubuntu Files and select: Scripts -> Upload to NOOR DRIVE"
