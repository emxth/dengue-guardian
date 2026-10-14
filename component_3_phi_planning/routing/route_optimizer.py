
"""Initial priority-aware PHI route-ordering prototype.

Uses synthetic coordinates and Haversine distance.
Does not represent real road-network distances or travel times.
"""

import argparse
import csv
import math
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "Kaduwela_C3_Research_Database_V2_SYNTHETIC.sqlite"
PLAN_DIR = ROOT / "optimization" / "output"
OUTPUT_DIR = ROOT / "routing" / "output"

PRIORITY_ORDER = {"High": 0, "Medium": 1, "Low": 2}


def read_csv(path):
    with path.open("r", newline="", encoding="utf-8-sig") as file:
        return list(csv.DictReader(file))


def haversine_km(lat1, lon1, lat2, lon2):
    """Calculate approximate straight-line distance between coordinates."""
    earth_radius_km = 6371.0

    lat1, lon1, lat2, lon2 = map(
        math.radians, [lat1, lon1, lat2, lon2]
    )

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1)
        * math.cos(lat2)
        * math.sin(dlon / 2) ** 2
    )

    return 2 * earth_radius_km * math.asin(
        math.sqrt(min(1.0, a))
    )


def load_locations():
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        """
        SELECT location_id, latitude, longitude
        FROM Locations
        """
    ).fetchall()
    conn.close()

    locations = {}
    for location_id, latitude, longitude in rows:
        if latitude is None or longitude is None:
            continue

        locations[location_id] = (
            float(latitude),
            float(longitude),
        )

    return locations


def order_phi_route(tasks, locations):
    """Prioritize task tiers, then use nearest-neighbour ordering within tiers."""
    remaining = list(tasks)
    ordered = []
    current_location = None
    cumulative_km = 0.0

    while remaining:
        # Always select the highest remaining priority tier first.
        best_priority = min(
            PRIORITY_ORDER.get(t["priority_level"], 99)
            for t in remaining
        )

        tier = [
            t for t in remaining
            if PRIORITY_ORDER.get(t["priority_level"], 99)
            == best_priority
        ]

        # If no current location is known, begin with the highest-scoring
        # task in the highest available priority tier.
        if current_location is None:
            chosen = max(
                tier,
                key=lambda t: float(t["priority_score"]),
            )
            segment_km = 0.0
        else:
            current_coords = locations[current_location]

            chosen = min(
                tier,
                key=lambda t: haversine_km(
                    current_coords[0],
                    current_coords[1],
                    locations[t["location_id"]][0],
                    locations[t["location_id"]][1],
                ),
            )

            chosen_coords = locations[chosen["location_id"]]
            segment_km = haversine_km(
                current_coords[0],
                current_coords[1],
                chosen_coords[0],
                chosen_coords[1],
            )

        cumulative_km += segment_km

        row = dict(chosen)
        row["route_stop"] = len(ordered) + 1
        row["straight_line_segment_km"] = round(segment_km, 3)
        row["cumulative_straight_line_km"] = round(cumulative_km, 3)
        row["route_method"] = (
            "Priority tier first; nearest neighbour within tier"
        )

        ordered.append(row)
        remaining.remove(chosen)
        current_location = chosen["location_id"]

    return ordered


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default="2026-04-01")
    args = parser.parse_args()

    plan_path = PLAN_DIR / f"phi_plan_{args.date}.csv"
    if not plan_path.exists():
        raise FileNotFoundError(
            f"Schedule not found: {plan_path}. Run phi_scheduler.py first."
        )

    plan = read_csv(plan_path)
    scheduled = [t for t in plan if t["status"] == "Scheduled"]
    locations = load_locations()

    if not scheduled:
        raise ValueError("No scheduled tasks are available for routing.")

    missing = [
        t["scenario_task_id"]
        for t in scheduled
        if t["location_id"] not in locations
    ]
    if missing:
        raise ValueError(
            f"Missing coordinates for {len(missing)} scheduled tasks."
        )

    output = []

    # Create a separate route order for each PHI.
    phi_ids = sorted({t["assigned_phi"] for t in scheduled})

    for phi_id in phi_ids:
        phi_tasks = [
            t for t in scheduled if t["assigned_phi"] == phi_id
        ]
        # Preserve the appointment times assigned by the scheduler.
        # Route optimization must not reorder tasks across time slots.
        phi_tasks.sort(key=lambda task: task["start_time"])

        route_rows = []
        cumulative_km = 0.0
        previous_location = None

        for task in phi_tasks:
            row = dict(task)

            if previous_location is None:
                segment_km = 0.0
            else:
                previous_coords = locations[previous_location]
                current_coords = locations[task["location_id"]]

                segment_km = haversine_km(
                    previous_coords[0],
                    previous_coords[1],
                    current_coords[0],
                    current_coords[1],
                )

            cumulative_km += segment_km

            row["route_stop"] = len(route_rows) + 1
            row["straight_line_segment_km"] = round(segment_km, 3)
            row["cumulative_straight_line_km"] = round(
                cumulative_km, 3
            )
            row["route_method"] = (
                "Appointment-time order; straight-line distance estimate"
            )

            route_rows.append(row)
            previous_location = task["location_id"]

        output.extend(route_rows)
        
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"phi_route_{args.date}.csv"

    if output:
        with output_path.open(
            "w", newline="", encoding="utf-8"
        ) as file:
            writer = csv.DictWriter(
                file, fieldnames=list(output[0].keys())
            )
            writer.writeheader()
            writer.writerows(output)

    print("INITIAL PHI ROUTE-ORDERING PROTOTYPE")
    print(f"Planning date: {args.date}")
    print(f"PHIs with routes: {len(phi_ids)}")
    print(f"Scheduled tasks ordered: {len(output)}")
    print(f"CSV output: {output_path}")
    print("Distances are straight-line estimates from synthetic coordinates.")
    print("Travel from PHI bases and real road-network travel are not included.")


if __name__ == "__main__":
    main()
