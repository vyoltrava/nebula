// временный скрипт: исправление отступов в GlobalPlayer.tsx
const fs = require("fs");
const p = "components/GlobalPlayer.tsx";
let s = fs.readFileSync(p, "utf8");
const fixes = [
  ["        if (!el) return;", "    if (!el) return;"],
  [
    "            value={{ track, playing, currentTime, duration, rate, playTrack, toggle, close, seekBy, seekTo, cycleRate, registerVideoPlayer, analyserRef }}",
    "      value={{ track, playing, currentTime, duration, rate, playTrack, toggle, close, seekBy, seekTo, cycleRate, registerVideoPlayer, analyserRef }}",
  ],
];
for (const [a, b] of fixes) {
  s = s.split(a).join(b);
}
fs.writeFileSync(p, s);
console.log("fixed");
