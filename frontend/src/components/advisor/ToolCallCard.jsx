export default function ToolCallCard({ call }) {
  return (
    <div className="card" style={{ marginTop: 8, border: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <strong>{call.summary || call.name}</strong>
        <span className={`badge ${call.status === 'error' ? 'badge-danger' : call.status === 'pending_confirmation' ? 'badge-info' : call.status === 'rejected' || call.status === 'expired' ? 'badge-neutral' : 'badge-success'}`}>{call.status}</span>
      </div>
      {call.result && <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 260, overflow: 'auto', fontSize: 12, marginBottom: 0 }}>{JSON.stringify(call.result, null, 2)}</pre>}
    </div>
  );
}
