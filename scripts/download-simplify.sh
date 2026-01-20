#!/bin/bash
# Download Simplify Jobs extension from Chrome Web Store

EXTENSION_ID="pbanhockgagggenencehbnadejlgchfc"
EXTENSION_DIR="/app/extensions/simplify"
TEMP_FILE="/tmp/simplify.crx"

echo "Downloading Simplify Jobs extension..."

# Create extension directory
mkdir -p "$EXTENSION_DIR"

# Download extension from Chrome Web Store
# Using the direct download URL format
curl -L -o "$TEMP_FILE" \
  "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=120.0.0.0&acceptformat=crx2,crx3&x=id%3D${EXTENSION_ID}%26uc"

if [ $? -ne 0 ]; then
  echo "Failed to download extension"
  exit 1
fi

echo "Extracting extension..."

# Check if it's a CRX file and extract it
# CRX files have a header that needs to be stripped before unzipping
# CRX3 format: Cr24 magic number (4 bytes) + version (4 bytes) + header length (4 bytes) + header

# Get the header length for CRX3
HEADER_SIZE=$(python3 -c "
import struct
with open('$TEMP_FILE', 'rb') as f:
    magic = f.read(4)
    if magic == b'Cr24':
        version = struct.unpack('<I', f.read(4))[0]
        header_len = struct.unpack('<I', f.read(4))[0]
        print(12 + header_len)
    else:
        print(0)
")

if [ "$HEADER_SIZE" -gt 0 ]; then
  echo "CRX3 format detected, header size: $HEADER_SIZE"
  tail -c +$((HEADER_SIZE + 1)) "$TEMP_FILE" > /tmp/simplify.zip
  unzip -o /tmp/simplify.zip -d "$EXTENSION_DIR"
else
  # Try direct unzip (might be CRX2 or already a zip)
  unzip -o "$TEMP_FILE" -d "$EXTENSION_DIR" 2>/dev/null || {
    echo "Trying CRX2 format..."
    # CRX2 format: Cr24 (4) + version (4) + pubkey len (4) + sig len (4) + pubkey + sig
    tail -c +17 "$TEMP_FILE" > /tmp/simplify.zip
    unzip -o /tmp/simplify.zip -d "$EXTENSION_DIR"
  }
fi

# Verify manifest.json exists
if [ -f "$EXTENSION_DIR/manifest.json" ]; then
  echo "✓ Simplify extension installed successfully"
  cat "$EXTENSION_DIR/manifest.json" | grep -E '"name"|"version"' | head -2
else
  echo "✗ Failed to install extension - manifest.json not found"
  ls -la "$EXTENSION_DIR"
  exit 1
fi

# Cleanup
rm -f "$TEMP_FILE" /tmp/simplify.zip

echo "Extension ready at: $EXTENSION_DIR"
