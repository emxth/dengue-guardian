
import csv
from collections import Counter
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "output"


def validate_csv(filename):
    path = OUTPUT_DIR / filename

    if not path.exists():
        raise FileNotFoundError(f"Output file not found: {path}")

    with path.open("r", newline="", encoding="utf-8-sig") as file:
        rows = list(csv.DictReader(file))

    scores = []
    levels = Counter()
    invalid = 0

    for row in rows:
        value = row.get("priority_score", "")

        if value == "":
            invalid += 1
            continue

        score = float(value)

        if not 0 <= score <= 100:
            raise ValueError(
                f"Score outside 0-100 in {filename}: {score}"
            )

        scores.append(score)
        levels[row["priority_level"]] += 1

    print(f"\nFile: {filename}")
    print(f"Total records: {len(rows):,}")
    print(f"Valid scores: {len(scores):,}")
    print(f"Invalid scores requiring review: {invalid:,}")
    print(f"Priority distribution: {dict(levels)}")

    if scores:
        print(f"Minimum score: {min(scores):.2f}")
        print(f"Maximum score: {max(scores):.2f}")
        print(f"Mean score: {sum(scores) / len(scores):.2f}")

    expected = {"task_id", "priority_score", "priority_level",
                "priority_reason", "calculated_at"}

    if rows:
        missing = expected - set(rows[0])
        if missing:
            raise ValueError(f"Missing output columns: {sorted(missing)}")

    print("Basic validation passed.")


if __name__ == "__main__":
    validate_csv("case_priority_scores.csv")
    validate_csv("complaint_priority_scores.csv")
