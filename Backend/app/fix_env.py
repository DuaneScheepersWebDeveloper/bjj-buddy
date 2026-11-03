"""Check Backend/.env and repair the common problems. Never prints secret values.

Run from the Backend folder:

    python -m app.fix_env

It adds a fresh SECRET_KEY if it's missing, splits settings that ended up on the same
line, and tells you if DATABASE_URL or OPENAI_API_KEY are missing. A copy of the old
file is kept as .env.backup.
"""

from __future__ import annotations

import re
import secrets
import shutil
from pathlib import Path

ENV = Path(__file__).resolve().parent.parent / ".env"
KNOWN = ("DATABASE_URL", "SECRET_KEY", "OPENAI_API_KEY", "ENVIRONMENT", "EMAIL_BACKEND", "SMTP_HOST", "SMTP_PORT",
         "SMTP_USERNAME", "SMTP_PASSWORD", "EMAIL_FROM", "ADMIN_API_KEY", "LOG_CLIENT_ERRORS", "VOICE_MAX_SECONDS",
         "VOICE_TRANSCRIBE_MODEL", "VOICE_TIDY_MODEL")
# A setting name glued onto the end of the previous line, e.g. "...bjjbuddyOPENAI_API_KEY=sk-..."
GLUED = re.compile(r"(?<=\S)(" + "|".join(KNOWN) + r")=")


def main() -> None:
    if not ENV.exists():
        print(f"No .env file found at {ENV}. Create it first (see the README).")
        return

    raw = ENV.read_bytes().decode("utf-8-sig", errors="replace")  # also drops a Notepad "BOM"
    lines = raw.replace("\r\n", "\n").replace("\r", "\n").split("\n")

    fixed: list[str] = []
    changes: list[str] = []
    for line in lines:
        if line.strip().startswith("#") or "=" not in line:
            fixed.append(line)
            continue
        parts = GLUED.split(line)
        if len(parts) > 1:  # two settings on one line: split them
            first, rest = parts[0], parts[1:]
            fixed.append(first)
            for name, value in zip(rest[0::2], rest[1::2]):
                fixed.append(f"{name}={value}")
            changes.append("split settings that were on the same line")
        else:
            fixed.append(line.strip())

    def names() -> dict[str, str]:
        found = {}
        for line in fixed:
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                found[k.strip().upper()] = v.strip()
        return found

    found = names()
    if not found.get("SECRET_KEY"):
        fixed = [l for l in fixed if not l.strip().upper().startswith("SECRET_KEY")]
        fixed.append(f"SECRET_KEY={secrets.token_urlsafe(48)}")
        changes.append("added a new SECRET_KEY")

    # Tidy: no blank lines in the middle, one newline at the end.
    fixed = [l for l in fixed if l.strip()]
    if changes:
        shutil.copyfile(ENV, ENV.with_name(".env.backup"))
        ENV.write_text("\n".join(fixed) + "\n", encoding="utf-8")

    found = names()
    print("Backend/.env check")
    print("------------------")
    for key in ("DATABASE_URL", "SECRET_KEY", "OPENAI_API_KEY"):
        value = found.get(key, "")
        if not value:
            status = "MISSING"
        elif key == "OPENAI_API_KEY":
            ok = value.startswith("sk-") and len(value) > 40 and not re.search(r"[\s'\"]", value)
            status = f"present ({len(value)} characters{'' if ok else ', looks wrong: check it'})"
        else:
            status = "present"
        print(f"  {key:<16} {status}")
    if changes:
        print(f"\nFixed: {', '.join(changes)}. (Old file kept as .env.backup)")
    else:
        print("\nNothing needed fixing.")
    if not found.get("DATABASE_URL"):
        print("Add this line:  DATABASE_URL=postgresql://postgres:dev@localhost:5432/bjjbuddy")
    if not found.get("OPENAI_API_KEY"):
        print("Add your OpenAI key on its own line:  OPENAI_API_KEY=sk-...")
    print("\nNext: python -m app.voice_check   then restart the API with ./start.sh")


if __name__ == "__main__":
    main()
