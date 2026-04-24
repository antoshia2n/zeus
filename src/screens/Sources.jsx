import { useEffect, useState } from "react";
import { T, card, lb10, mono } from "shia2n-core";
import { listSources } from "../lib/zeus.js";
import { SOURCE_LABEL_MAP } from "../constants.js";

export default function Sources({ uid }) {
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!uid) return;
    listSources(uid).then(({ data }) => {
      setItems(data);
      setReady(true);
    });
  }, [uid]);

  if (!ready) {
    return (
      <div
        style={{
          fontSize: 12,
          color: T.muted,
          padding: "32px 0",
          textAlign: "center",
        }}
      >
        読み込み中...
      </div>
    );
  }

  const total = items.reduce((sum, x) => sum + x.count, 0);

  return (
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      <div style={card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 16,
          }}
        >
          <div style={lb10}>TOTAL</div>
          <div style={{ ...mono, fontSize: 24, fontWeight: 700 }}>
            {total.toLocaleString()}
          </div>
        </div>

        {items.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: T.muted,
              fontSize: 13,
              padding: "24px 0",
            }}
          >
            まだエントリがありません
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {items.map((x, i) => (
              <div
                key={x.source}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 0",
                  borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                }}
              >
                <div style={{ fontSize: 13 }}>
                  {SOURCE_LABEL_MAP[x.source] || x.source}
                </div>
                <div style={{ ...mono, fontSize: 14, fontWeight: 500 }}>
                  {x.count.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
