#!/usr/bin/env bash
# Builds Play-compliant store assets from the raw simulator captures.
#
# Play requires the longest side of a screenshot to be at most twice the
# shortest side. The raw iPhone captures are 1206x2622 (ratio 2.17), so they
# cannot be uploaded as they are. Everything here renders onto a 1080x1920
# canvas (9:16), which also meets the resolution bar Play asks for to be
# eligible for prominent placement.
#
# Output is 24-bit PNG without alpha, as the store listing requires.

set -euo pipefail

cd "$(dirname "$0")/../.."

RAW="screenshots/aso/raw-16pro"
OUT="screenshots/aso/play-ready"
FONTS="node_modules/@expo-google-fonts/nunito"
BOLD="$FONTS/800ExtraBold/Nunito_800ExtraBold.ttf"
REG="$FONTS/600SemiBold/Nunito_600SemiBold.ttf"

# Palette from src/config/theme.ts
RIVER_DARK="#3A6070"
RIVER="#4A7C8A"
SAND_LIGHT="#E8DCC8"

W=1080
H=1920
# The box is wider than any tall capture needs, so full-screen captures are
# bound by height while short crops are allowed to grow and fill the band.
IMG_W=860
IMG_H=1360
BAND_TOP=430
BAND_H=1400

mkdir -p "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Height of the iOS status bar in these captures. Removing it keeps the iPhone
# Dynamic Island out of a listing that ships on Google Play, and leaves the
# app's own header as the top edge of the card.
STATUS_BAR=165

# render <source> <output> <headline> <subline> [status-bar-rows-to-remove]
render() {
  local src="$1" out="$2" head="$3" sub="$4" chop="${5:-$STATUS_BAR}"

  magick -size "${W}x${H}" "gradient:${RIVER_DARK}-${RIVER}" "$TMP/bg.png"

  # Scale the capture into the band, keeping its aspect ratio.
  magick "$src" -chop "0x${chop}+0+0" -resize "${IMG_W}x${IMG_H}" "$TMP/shot.png"
  local sw sh
  sw=$(magick identify -format '%w' "$TMP/shot.png")
  sh=$(magick identify -format '%h' "$TMP/shot.png")

  # Round the corners so the capture reads as a device, not a pasted rectangle.
  # The mask has to be a greyscale clone: building it from `xc:none` leaves an
  # alpha channel that copy_opacity then reads as fully transparent.
  magick "$TMP/shot.png" \
    \( +clone -alpha opaque -fill black -colorize 100 \
       -fill white -draw "roundrectangle 0,0,$((sw - 1)),$((sh - 1)),26,26" \) \
    -alpha off -compose copy_opacity -composite "$TMP/rounded.png"

  # Soft drop shadow lifts it off the gradient.
  magick "$TMP/rounded.png" \
    \( +clone -background black -shadow 55x18+0+12 \) \
    +swap -background none -layers merge +repage "$TMP/card.png"

  # The shadow grows the canvas, so centre on the card, not on the capture.
  local ch
  ch=$(magick identify -format '%h' "$TMP/card.png")
  local y=$((BAND_TOP + (BAND_H - ch) / 2))
  [ "$y" -lt "$BAND_TOP" ] && y=$BAND_TOP

  magick "$TMP/bg.png" "$TMP/card.png" \
    -gravity north -geometry "+0+${y}" -composite "$TMP/step.png"

  magick -background none -fill white -font "$BOLD" -pointsize 66 \
    -size 900x -gravity center "caption:${head}" "$TMP/head.png"
  magick -background none -fill "$SAND_LIGHT" -font "$REG" -pointsize 34 \
    -size 860x -gravity center "caption:${sub}" "$TMP/sub.png"

  # Place the subline under the headline instead of at a fixed offset, so a
  # headline that wraps to two lines does not collide with it.
  local hh sub_y
  hh=$(magick identify -format '%h' "$TMP/head.png")
  sub_y=$((120 + hh + 44))

  magick "$TMP/step.png" \
    "$TMP/head.png" -gravity north -geometry +0+120 -composite \
    "$TMP/sub.png" -gravity north -geometry "+0+${sub_y}" -composite \
    -alpha remove -alpha off "PNG24:${out}"

  echo "  $(basename "$out")  $(magick identify -format '%wx%h' "$out")"
}

echo "screenshots:"
render "$RAW/01-home-full.png"             "$OUT/01-nivel-y-clima.png" \
  "A cuánto está el río, ahora" \
  "Altura del Paraná en tu estación más cercana"

# 09 is 03 with the "◀ Safari" link painted out and the empty tail cropped off.
render "$RAW/09-detail-clean.png"           "$OUT/02-tendencia.png" \
  "Si viene subiendo o bajando" \
  "Nivel y tendencia de cada estación"

# 08 is 02 with the simulator's "◀ Safari" back link painted out of the status bar.
render "$RAW/08-stations-clean.png"         "$OUT/03-estaciones.png" \
  "10 estaciones del Paraná" \
  "De Corrientes a San Lorenzo"

# This one is a mid-page crop, so it has no status bar to remove.
render "$RAW/07-noticias-crop.png"          "$OUT/04-noticias-106.png" \
  "Noticias y el 106, a mano" \
  "Prefectura Naval y emergencias náuticas" 0

render "$RAW/04-profile.png"                "$OUT/05-fuentes.png" \
  "Datos públicos, app independiente" \
  "Fuentes citadas, sin afiliación oficial"

# Feature graphic: 1024x500, required by the store listing.
echo "feature graphic:"
magick -size 1024x500 "gradient:${RIVER_DARK}-${RIVER}" "$TMP/fg.png"
magick assets/icon.png -resize 210x210 \
  \( +clone -alpha extract \
     -draw "fill black polygon 0,0 0,44 44,0 fill white circle 44,44 44,0" \
     \( +clone -flip \) -compose Multiply -composite \
     \( +clone -flop \) -compose Multiply -composite \) \
  -alpha off -compose CopyOpacity -composite "$TMP/icon.png"

magick -background none -fill white -font "$BOLD" -pointsize 78 \
  -size 620x -gravity west "caption:Paraná Info" "$TMP/fg-title.png"
magick -background none -fill "$SAND_LIGHT" -font "$REG" -pointsize 34 \
  -size 620x -gravity west "caption:Altura del río, clima y pronóstico" "$TMP/fg-sub.png"

magick "$TMP/fg.png" \
  "$TMP/icon.png"     -gravity west  -geometry +80+0   -composite \
  "$TMP/fg-title.png" -gravity west  -geometry +340+-30 -composite \
  "$TMP/fg-sub.png"   -gravity west  -geometry +340+55  -composite \
  -alpha remove -alpha off "PNG24:$OUT/feature-graphic.png"

echo "  feature-graphic.png  $(magick identify -format '%wx%h' "$OUT/feature-graphic.png")"
