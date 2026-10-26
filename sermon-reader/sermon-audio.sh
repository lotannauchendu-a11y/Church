#!/bin/bash
# Turn a sermon into an audio file (.m4a) you can play on your phone or in the car.
# Uses only tools built into macOS: say, textutil, afconvert.
#
# Usage:
#   ./sermon-audio.sh                    read the sermon from the clipboard (copy it in Logos first)
#   ./sermon-audio.sh sermon.docx        read a .docx, .rtf, .txt or .md file
#   ./sermon-audio.sh -                  read from standard input (for an Automator Quick Action)
#
# Options:
#   -v "Ava (Premium)"   voice to use (list them with: say -v '?')
#   -r 165               speaking rate in words per minute (default 165)
#   -p 1.2               pause between paragraphs in seconds (default 1.2)
#   -o ~/Desktop/x.m4a   where to save (default: ~/Desktop/Sermon Audio/<title>.m4a)

set -euo pipefail

voice=""
rate=165
pause=1.2
out=""

while getopts "v:r:p:o:h" opt; do
  case "$opt" in
    v) voice="$OPTARG" ;;
    r) rate="$OPTARG" ;;
    p) pause="$OPTARG" ;;
    o) out="$OPTARG" ;;
    *) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  esac
done
shift $((OPTIND - 1))
src="${1:-}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# 1. Get the sermon as plain text.
case "$src" in
  "")  pbpaste > "$work/raw.txt" ;;
  -)   cat > "$work/raw.txt" ;;
  *.docx|*.doc|*.rtf|*.rtfd|*.odt|*.html)
       textutil -convert txt -stdout "$src" > "$work/raw.txt" ;;
  *)   cp "$src" "$work/raw.txt" ;;
esac

if [ "$(wc -w < "$work/raw.txt")" -lt 5 ]; then
  echo "No sermon text found. In Logos press Cmd+A, then Cmd+C, and run this again." >&2
  exit 1
fi

# 2. Clean it up and expand Bible shorthand so it is read the way you would say it.
pause_ms=$(awk -v p="$pause" 'BEGIN { printf "%d", p * 1000 }')
# perl ships with macOS and, unlike the built-in sed, understands \b word boundaries.
perl -CSD -pe '
  BEGIN {
    %n = (Sam=>"Samuel", Kgs=>"Kings", Chr=>"Chronicles", Chron=>"Chronicles", Cor=>"Corinthians",
          Thess=>"Thessalonians", Tim=>"Timothy", Pet=>"Peter", Pt=>"Peter", Jn=>"John");
    %b = (Gen=>"Genesis", Ex=>"Exodus", Exod=>"Exodus", Lev=>"Leviticus", Num=>"Numbers",
          Deut=>"Deuteronomy", Josh=>"Joshua", Judg=>"Judges", Ps=>"Psalm", Psa=>"Psalm",
          Prov=>"Proverbs", Eccl=>"Ecclesiastes", Isa=>"Isaiah", Jer=>"Jeremiah", Ezek=>"Ezekiel",
          Dan=>"Daniel", Hos=>"Hosea", Mic=>"Micah", Hab=>"Habakkuk", Zech=>"Zechariah",
          Mal=>"Malachi", Matt=>"Matthew", Mt=>"Matthew", Mk=>"Mark", Lk=>"Luke", Jn=>"John",
          Rom=>"Romans", Gal=>"Galatians", Eph=>"Ephesians", Phil=>"Philippians",
          Col=>"Colossians", Heb=>"Hebrews", Jas=>"James", Rev=>"Revelation");
    %o = (1=>"First", 2=>"Second", 3=>"Third");
    $nre = join "|", keys %n; $bre = join "|", keys %b;
  }
  s/\x{00a0}/ /g;
  s/\[\d+\]|[\x{00b9}\x{00b2}\x{00b3}\x{2070}-\x{2079}]+//g;      # footnote marks
  s/^\s*[\x{2022}\x{25cf}\x{25aa}\x{25e6}*-]\s+//;               # bullets
  s/\b([123]) ?($nre)\b\.?/$o{$1} $n{$2}/g;
  s/\b($bre)\.?(?=\s*\d)/$b{$1}/g;
  s/\bvv\.\s*/verses /g;  s/\bv\.\s*(?=\d)/verse /g;  s/\bcf\.\s*/compare /gi;
  s/\be\.g\.,?\s*/for example, /gi;  s/\bi\.e\.,?\s*/that is, /gi;
  s/(\d+):(\d+)\s*[-\x{2013}\x{2014}]\s*(\d+)(?!:)/$1, verses $2 through $3/g;
  s/(\d+)\s*[-\x{2013}\x{2014}]\s*(\d+)/$1 through $2/g;
  s/(\d+):(\d+)/$1, verse $2/g;
  s/&/ and /g;
' "$work/raw.txt" \
  | awk -v ms="$pause_ms" 'NF { print $0 " [[slnc " ms "]]" }' > "$work/speak.txt"

# 3. Pick the most natural English voice installed, unless one was given.
if [ -z "$voice" ]; then
  voices="$(say -v '?')"
  for tier in "(Premium)" "(Enhanced)"; do
    voice="$(printf '%s\n' "$voices" | grep -F "$tier" | grep -E ' en_(US|GB|AU|CA|IE)' | head -1 | sed -E 's/ {2,}.*//')"
    [ -n "$voice" ] && break
  done
  if [ -z "$voice" ]; then
    echo "Tip: for a much more natural voice, download a Premium voice in" >&2
    echo "  System Settings > Accessibility > Spoken Content > System Voice > Manage Voices" >&2
  fi
fi

# 4. Decide where to save it.
if [ -z "$out" ]; then
  title="$(grep -m1 -E '[[:alnum:]]' "$work/raw.txt" | cut -c1-60 | tr -cd '[:alnum:] ,.-' | sed -E 's/[[:space:]]+$//')"
  mkdir -p "$HOME/Desktop/Sermon Audio"
  out="$HOME/Desktop/Sermon Audio/${title:-Sermon} $(date +%Y-%m-%d).m4a"
fi

# 5. Record and convert to a small, phone-friendly file.
words=$(wc -w < "$work/raw.txt" | tr -d ' ')
echo "Recording ${words} words with ${voice:-the system voice} at ${rate} wpm (about $((words / rate + 1)) min)…"
if [ -n "$voice" ]; then
  say -v "$voice" -r "$rate" -f "$work/speak.txt" -o "$work/sermon.aiff"
else
  say -r "$rate" -f "$work/speak.txt" -o "$work/sermon.aiff"
fi
afconvert -f m4af -d aac -b 96000 "$work/sermon.aiff" "$out"

echo "Saved: $out"
open -R "$out"
