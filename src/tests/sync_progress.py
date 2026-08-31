"""
Monitor tree sync progress in real-time from proxy logs.
Usage: python3 sync_progress.py [/path/to/out_prox.txt]
"""
import os
import sys
import time
from datetime import datetime, timedelta

LOG_PATH = sys.argv[1] if len(sys.argv) > 1 else "/home/pi/zk/swap/proxy/out_prox.txt"

if not os.path.exists(LOG_PATH):
    print(f"Log not found: {LOG_PATH}")
    sys.exit(1)

BAR_WIDTH = 30

def render_bar(pct, width=BAR_WIDTH):
    filled = int(width * pct / 100)
    bar  = "\033[42m" + " " * filled + "\033[0m"
    bar += "\033[100m" + " " * (width - filled) + "\033[0m"
    return bar

def parse_progress():
    polk_str, pas_str = None, None
    started_at = None
    try:
        with open(LOG_PATH, "r") as f:
            lines = f.readlines()
    except Exception:
        return None, None, None

    for line in lines:
        ts = line[:19] if len(line) >= 19 else ""
        try:
            started_at = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S")
            break
        except ValueError:
            continue

    for line in reversed(lines):
        if "progress:" in line:
            parts = line.strip().split()
            for p in parts:
                if "/" in p and all(x.isdigit() for x in p.split("/")):
                    done, total = p.split("/")
                    if int(total) == 3083 and polk_str is None:
                        polk_str = p
                    elif int(total) == 2654 and pas_str is None:
                        pas_str = p
                    break
        if polk_str and pas_str:
            break

    return polk_str, pas_str, started_at

def format_eta(percent, elapsed_s):
    if percent <= 0 or elapsed_s <= 0:
        return "--:--:--"
    total_s = elapsed_s / (percent / 100)
    remaining_s = max(0, total_s - elapsed_s)
    td = timedelta(seconds=int(remaining_s))
    return str(td)

# Header
print("\033[H\033[2J\033[?25l", end="")  # clear screen, hide cursor
print("\033[1mTree Sync Monitor\033[0m")
print("─" * 58)

try:

    while True:
        result = parse_progress()
        if result[0] is None:
            # Only draw static header once
            sys.stdout.write("\033[3;1HWaiting for progress data...")
            sys.stdout.flush()
            time.sleep(2)
            continue

        polk, paseo, started = result
        if polk:
            pd, pt = polk.split("/")
            pp = (int(pd) / int(pt)) * 100 if int(pt) > 0 else 0
        else:
            pd, pt, pp = "?", "?", 0
        if paseo:
            sd, st = paseo.split("/")
            sp = (int(sd) / int(st)) * 100 if int(st) > 0 else 0
        else:
            sd, st, sp = "?", "?", 0

        elapsed = (datetime.now() - started).total_seconds() if started else 0
        elapsed_str = str(timedelta(seconds=int(elapsed)))
        polk_eta = format_eta(pp, elapsed)
        pas_eta = format_eta(sp, elapsed)
        now = datetime.now().strftime("%H:%M:%S")

        # Redraw every cycle — ETA depends on real elapsed time, not just pct change
        bar_polk = render_bar(pp)
        bar_pas = render_bar(sp)

        # Move to row 3+ and overwrite
        out = (
            f"\033[3;1H\033[K"    f"Updated: {now}  Elapsed: {elapsed_str}\n"
            f"\033[K"              f"  \033[36mPolkadot\033[0m {bar_polk} \033[1;33m{pp:5.1f}%\033[0m  {pd}/{pt}  ETA {polk_eta}\n"
            f"\033[K"              f"  \033[35mPaseo   \033[0m {bar_pas} \033[1;33m{sp:5.1f}%\033[0m  {sd}/{st}  ETA {pas_eta}"
        )
        sys.stdout.write(out)
        sys.stdout.flush()

        time.sleep(2)
except KeyboardInterrupt:
    sys.stdout.write("\n\033[?25h\033[E")
    sys.stdout.flush()
    sys.exit(0)