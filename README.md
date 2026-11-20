# Armor Builder

A personal, offline-first phone web app for running Dan John's **Armor Building Formula** with kettlebells.

- Guided sessions: warm-up (1-2-3-4-5), ABC every-minute clock with round counter, 2-3-5-10 press ladders with rest timers, carries, cool-down walk.
- Two programs: ABF for Fat Loss and the classic 8-week ABF, with "nudge" targets that adapt to how each session felt.
- Animated movement guides with cues, common faults and easier/harder options.
- Daily check-in (weight, waist, steps, protein, sleep, photos) and progress charts.
- Calendar (.ics) reminders, backup/restore, CSV export, optional PIN lock.

## Privacy
All data stays in the browser's storage on your device. The site contains only code: no accounts, servers, analytics or third-party scripts, and a strict Content-Security-Policy.

## Credits
Program logic is paraphrased from *The Armor Building Formula* and *Armor Building Formula II* by Dan John (danjohnuniversity.com) for personal use. Not medical advice.

## Deploying
Static files, no build step. Serve the folder over HTTPS (GitHub Pages works). Bump `VERSION` in `sw.js` on each deploy so phones pick up the update.
