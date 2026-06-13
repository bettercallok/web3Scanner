import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { ForceGraph2D } from "react-force-graph-2d";

const API = import.meta.env.VITE_API_BASE_URL || "";

interface Node {
  id: string;
  group: number;
  vulnerable?: boolean;
}

interface Link {
  source: string;
  target: string;
}

export default function VulnGraph({ jobId }: { jobId: string }) {
  const [data, setData] = useState<{ nodes: Node[]; links: Link[] }>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

  useEffect(() => {
    axios
      .get(`${API}/api/scans/${jobId}/graph/`)
      .then((res) => {
        setData(res.data);
      })
      .catch((err) => console.error("Failed to fetch graph", err))
      .finally(() => setLoading(false));
  }, [jobId]);

  useEffect(() => {
    if (containerRef.current) {
      setDimensions({
        width: containerRef.current.clientWidth,
        height: 400,
      });
    }
  }, [loading]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>Loading graph...</div>;

  return (
    <div className="vuln-graph-container" ref={containerRef} style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "#0a0a0c" }}>
      <ForceGraph2D
        width={dimensions.width}
        height={dimensions.height}
        graphData={data}
        nodeLabel="id"
        nodeColor={(node: any) => (node.vulnerable ? "#ff3366" : node.group === 1 ? "#00e6a8" : "#8a8f98")}
        linkColor={() => "rgba(255,255,255,0.15)"}
        nodeRelSize={6}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
      />
    </div>
  );
}
