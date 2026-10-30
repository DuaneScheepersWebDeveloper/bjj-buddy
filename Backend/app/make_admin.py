"""Give a user admin rights (or take them away) from the command line.

Run from the Backend folder, with the virtual environment active:

    python -m app.make_admin you@example.com            # make admin
    python -m app.make_admin you@example.com --remove   # back to a normal user

The user must already have an account (sign up in the app first).
"""

import logging
import sys

from sqlalchemy import func
from sqlmodel import Session, select

from app.database import create_db_and_tables, engine
from app.models.user_model import ROLE_ADMIN, ROLE_USER, User


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    remove = "--remove" in argv
    if len(args) != 1:
        print(__doc__)
        return 1
    email = args[0].strip().lower()

    engine.echo = False  # keep the output readable
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    create_db_and_tables()  # makes sure the "role" column exists

    with Session(engine) as db:
        user = db.exec(select(User).where(func.lower(User.email) == email)).first()
        if user is None:
            print(f"No account found for {email}. Sign up in the app first, then run this again.")
            return 1
        user.role = ROLE_USER if remove else ROLE_ADMIN
        if not remove:
            user.is_active = True
        db.add(user)
        db.commit()
        print(f"{user.full_name} <{user.email}> is now {'a normal user' if remove else 'an admin'}.")
        print("Close and reopen the app (or log out and back in) to see the change.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
