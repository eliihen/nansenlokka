bash -lc '
find archive -type f -name "*.png" | awk -F/ "
  {
    file=\$0
    name=\$NF
    sub(/\.png$/, \"\", name)
    # name = YYYY-MM-DD_HH:MM:SS
    split(name, a, /[_:-]/)
    Y=a[1]; M=a[2]; D=a[3]; h=a[4]; m=a[5]; s=a[6]

    # hour filter: 07:00:00 .. 16:59:59 (i.e. outside 7-17 excluded, 17:00 excluded)
    if (h < 7 || h >= 17) next

    # day-of-week (1..7, Mon..Sun) using GNU date
    cmd = \"date -d \\\"\" Y \"-\" M \"-\" D \"\\\" +%u\"
    cmd | getline dow
    close(cmd)

    # weekend filter: 6=Sat, 7=Sun
    if (dow >= 6) next

    # concat demuxer wants: file '\''path'\''
    gsub(/'\''/, \"'\\\\''\", file)
    print \"file '\\''\" file \"'\\''\"
  }
" > /tmp/timelapse_files.txt

ffmpeg -hide_banner -y \
  -f concat -safe 0 -i /tmp/timelapse_files.txt \
  -vf "fps=30,format=yuv420p" \
  -c:v libx264 -crf 18 -preset medium \
  timelapse.mp4
'

