// src/components/ui/Badge.jsx
export default function Badge({ children }) {
return (
<span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">
{children}
</span>
);
}