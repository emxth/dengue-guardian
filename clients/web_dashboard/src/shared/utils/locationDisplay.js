export function cleanLocationLabel(value) {
    return String(value ?? "")
        .replace(/\s*[-–—·|,]?\s*\bsynthetic point\b/gi, "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^[·|,–—-]+|[·|,–—-]+$/g, "")
        .trim();
}

export function formatLocation(...values) {
    const parts = values.map(cleanLocationLabel).filter(Boolean);
    return [...new Map(parts.map((part) => [part.toLocaleLowerCase(), part])).values()].join(" · ");
}