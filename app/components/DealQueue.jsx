'use client';
import { useState, useEffect, useCallback } from 'react';

const STATUS_LABEL = {
  in_submissions: 'SUBMITTED',
  submitted: 'SUBMITTED',
  in_underwriting: 'IN UW',
  analysis: 'IN UW',
  uw_needs_info: 'NEEDS INFO',
};

const STATUS_COLOR = {
  in_submissions: '#7ac6ff',
  submitted: '#7ac6ff',
  in_underwriting: '#EAD068',
  analysis: '#EAD068',
  uw_needs_info: '#ff8a65',
};

const fmt = (n) => '$' + Math.round(parseFloat(n) || 0).toLocaleString('en-US');

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffHours = diffMs / 3600000;
  const diffDays = Math.floor(diffHours / 24);
  if (diffHours < 1) return 'just now';
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/**
 * Collapsible deal queue panel. Shows all deals awaiting underwriting.
 *
 * Props:
 *   activeDealId — currently-loaded deal id (highlighted in list)
 *   onSelectDeal(deal) — called when a queue row is clicked
 */
export default function DealQueue({ activeDealId, onSelectDeal }) {
  const [open, setOpen] = useState(false);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loadedAt, setLoadedAt] = useState(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/deals/queue', { cache: 'no-store' });
      if (!res.ok) throw new Error(`queue fetch failed (${res.status})`);
      const data = await res.json();
      setDeals(data.deals || []);
      setLoadedAt(Date.now());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !loadedAt) fetchQueue();
  }, [open, loadedAt, fetchQueue]);

  const handleClick = (deal) => {
    setOpen(false);
    onSelectDeal?.(deal);
  };

  const count = deals.length;

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          background: 'rgba(0,229,255,0.08)',
          border: '1px solid rgba(0,229,255,0.3)',
          borderRadius: 10,
          color: '#00e5ff',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span>⚡ Deal Queue</span>
        {count > 0 && (
          <span
            style={{
              background: '#00e5ff',
              color: '#05131a',
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 7px',
              borderRadius: 10,
              minWidth: 18,
              textAlign: 'center',
            }}
          >{count}</span>
        )}
        <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▾</span>
      </button>

      {open && (
        <>
          {/* Backdrop to close on outside click */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 50,
              background: 'transparent',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              zIndex: 51,
              width: 440,
              maxHeight: '70vh',
              overflowY: 'auto',
              background: 'rgba(8,12,18,0.97)',
              border: '1px solid rgba(0,229,255,0.25)',
              borderRadius: 12,
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              backdropFilter: 'blur(16px)',
              padding: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                position: 'sticky',
                top: 0,
                background: 'rgba(8,12,18,0.97)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.9)',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >Pending Deals</div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fetchQueue();
                }}
                disabled={loading}
                style={{
                  fontSize: 10,
                  padding: '4px 10px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 6,
                  color: 'rgba(255,255,255,0.6)',
                  cursor: loading ? 'default' : 'pointer',
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  fontFamily: 'inherit',
                }}
              >{loading ? 'loading…' : 'refresh'}</button>
            </div>

            {error && (
              <div style={{ padding: 16, fontSize: 12, color: '#ef5350' }}>
                {error}
              </div>
            )}

            {!error && !loading && deals.length === 0 && (
              <div
                style={{
                  padding: 24,
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.35)',
                  textAlign: 'center',
                }}
              >no deals awaiting underwriting</div>
            )}

            {deals.map((d) => {
              const active = activeDealId === d.id;
              const statusKey = (d.status || '').toLowerCase();
              const statusLabel = STATUS_LABEL[statusKey] || statusKey.replace(/_/g, ' ');
              const statusColor = STATUS_COLOR[statusKey] || '#999';
              const ownerName =
                [d.owner_first, d.owner_last].filter(Boolean).join(' ').trim() || '';
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => handleClick(d)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 16px',
                    background: active ? 'rgba(0,229,255,0.08)' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    cursor: 'pointer',
                    color: 'inherit',
                    fontFamily: 'inherit',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 10,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#fff',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >{(d.merchant_name || d.merchant_dba || '—').toUpperCase()}</div>
                      <div
                        style={{
                          fontSize: 10,
                          color: 'rgba(255,255,255,0.4)',
                          marginTop: 2,
                        }}
                      >
                        {[
                          d.iso_name || 'unassigned iso',
                          ownerName,
                          formatTimeAgo(d.created_at),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 10,
                        color: statusColor,
                        border: `1px solid ${statusColor}55`,
                        background: `${statusColor}12`,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        flexShrink: 0,
                      }}
                    >{statusLabel}</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 14,
                      marginTop: 6,
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.55)',
                    }}
                  >
                    <span>{d.position_count || (d.positions?.length ?? 0)} positions</span>
                    <span>{fmt(d.total_balance)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
