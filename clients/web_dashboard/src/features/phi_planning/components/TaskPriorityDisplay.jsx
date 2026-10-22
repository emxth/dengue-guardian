import PriorityBadge from "./PriorityBadge";

export default function TaskPriorityDisplay({ task }) {
    const level = task.scheduling_priority_level || task.priority_level || "Low";

    return <PriorityBadge level={level} />;
}
