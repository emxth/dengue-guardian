/**
 * PriorityBadge — displays a coloured pill for High, Medium, or Low priority.
 * Matches the Dengue-Guardian theme tokens.
 */
export default function PriorityBadge({ level }) {
    const config = {
        High: "bg-red-50 border border-riskHigh text-riskHigh",
        Medium: "bg-amber-50 border border-riskMedium text-riskMedium",
        Low: "bg-mintSurface border border-riskCleared text-riskCleared",
        Review: "bg-background border border-borderLight text-textMuted",
    };

    const label = level ?? "Unknown";
    const cls = config[label] ?? "bg-background border border-borderLight text-textMuted";

    return (
        <span
            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${cls}`}
        >
            {label}
        </span>
    );
}
