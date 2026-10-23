"""Provision a PHI mobile account; there is intentionally no public signup."""

import argparse
import getpass
import sqlite3
from pathlib import Path

from component_3_phi_planning.api.mongo_store import get_database
from component_3_phi_planning.api.phi_auth import hash_password


def main():
    parser = argparse.ArgumentParser(description="Create or reset a PHI mobile login.")
    parser.add_argument("phi_id", help="PHI identifier, for example PHI01")
    parser.add_argument("--display-name", default="")
    parser.add_argument("--moh-area", default="")
    parser.add_argument("--phi-range", default="")
    args = parser.parse_args()

    password = getpass.getpass("Set PHI password (minimum 12 characters): ")
    confirmation = getpass.getpass("Confirm password: ")
    if len(password) < 12 or password != confirmation:
        parser.error("Passwords must match and be at least 12 characters.")

    database_path = Path(__file__).resolve().parents[1] / "data" / "Kaduwela_C3_Updated_New_ver.sqlite"
    with sqlite3.connect(database_path) as connection:
        phi = connection.execute(
            "SELECT phi_id, moh_area, phi_range FROM PHI_Master WHERE phi_id = ?",
            (args.phi_id.strip(),),
        ).fetchone()
    if phi is None:
        parser.error(f"PHI ID {args.phi_id!r} is not in the PHI_Master roster.")

    account = {
        "phi_id": phi[0],
        "display_name": args.display_name.strip() or phi[0],
        "moh_area": args.moh_area.strip() or phi[1] or "",
        "phi_range": args.phi_range.strip() or phi[2] or "",
        "active": True,
        **hash_password(password),
    }
    get_database().phi_accounts.replace_one({"phi_id": account["phi_id"]}, account, upsert=True)
    print(f"Provisioned PHI account: {account['phi_id']}")


if __name__ == "__main__":
    main()