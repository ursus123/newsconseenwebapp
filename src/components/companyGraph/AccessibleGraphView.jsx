import React from "react";

export default function AccessibleGraphView({ mode, nodes, edges, onInspectNode, onInspectEdge }) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const disconnected = nodes.filter(
    node => !edges.some(edge => edge.source === node.id || edge.target === node.id),
  ).length;

  if (mode === "summary") {
    return (
      <section tabIndex={0} className="h-full overflow-auto rounded-2xl border bg-white p-5" aria-label="Textual graph summary">
        <h2 className="font-black">Company Graph textual summary</h2>
        <p className="mt-2 text-sm">{nodes.length} authorized records and {edges.length} governed relationships are visible.</p>
        <p className="mt-2 text-sm">{disconnected} records have no visible connection.</p>
      </section>
    );
  }

  if (mode === "relationships") {
    return (
      <div className="h-full overflow-auto rounded-2xl border bg-white">
        <table className="w-full text-left text-sm">
          <caption className="p-3 text-left font-black">Governed relationships</caption>
          <thead><tr className="border-y bg-slate-50">
            <th scope="col" className="p-3">Source</th>
            <th scope="col" className="p-3">Relationship</th>
            <th scope="col" className="p-3">Target</th>
            <th scope="col" className="p-3">State</th>
          </tr></thead>
          <tbody>{edges.map(edge => {
            const source = byId.get(edge.source)?.label || edge.source;
            const target = byId.get(edge.target)?.label || edge.target;
            const predicate = edge.label || edge.predicate;
            return (
              <tr key={edge.id}>
                <td className="p-3">{source}</td>
                <td className="p-3">
                  <button type="button" onClick={() => onInspectEdge(edge)} className="min-h-11 rounded-md px-2 font-bold text-indigo-700 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2" aria-label={`Inspect relationship ${predicate} from ${source} to ${target}`}>
                    {predicate}
                  </button>
                </td>
                <td className="p-3">{target}</td>
                <td className="p-3">{edge.assertion_state}; {Math.round((edge.confidence || 0) * 100)}% confidence</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    );
  }

  if (mode === "outline") {
    return (
      <section className="h-full overflow-auto rounded-2xl border bg-white p-4" aria-label="Hierarchical neighborhood outline">
        <h2 className="font-black">Relationship outline</h2>
        <ul className="mt-3 space-y-3">{nodes.map(node => (
          <li key={node.id}>
            <button type="button" onClick={() => onInspectNode(node)} className="min-h-11 rounded-md px-2 font-bold text-indigo-700 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{node.label}</button>
            <ul className="ml-5 list-disc text-sm">{edges.filter(edge => edge.source === node.id).map(edge => (
              <li key={edge.id}>{edge.label || edge.predicate} → {byId.get(edge.target)?.label || edge.target}</li>
            ))}</ul>
          </li>
        ))}</ul>
      </section>
    );
  }

  return (
    <section className="h-full overflow-auto rounded-2xl border bg-white p-3" aria-label="Keyboard navigable graph records">
      <h2 className="px-2 font-black">Authorized records</h2>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">{nodes.map(node => (
        <button key={node.id} type="button" onClick={() => onInspectNode(node)} className="min-h-12 rounded-xl border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
          <span className="block text-sm font-black">{node.label}</span>
          <span className="text-xs">{node.entity_type}; status {node.status || "not available"}; {edges.filter(edge => edge.source === node.id || edge.target === node.id).length} relationships</span>
        </button>
      ))}</div>
    </section>
  );
}
