import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import ForceGraph2D from "react-force-graph-2d";

const API = import.meta.env.VITE_API_BASE_URL || "";

interface GraphNode {
  id: string;
  label?: string;
  group: number;
  vulnerable?: boolean;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
}

export default function VulnGraph({ jobId }: { jobId: string }) {
  const [data, setData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  useEffect(() => {
    setLoading(true);
    setGenerating(false);
    setError(null);

    // The first call may take up to 60s if graph is being generated on-demand
    const controller = new AbortController();
    const timeoutId = setTimeout(() => setGenerating(true), 2000); // show "generating" message after 2s

    axios
      .get(`${API}/api/scans/${jobId}/graph/`, { signal: controller.signal, timeout: 120000 })
      .then((res) => {
        clearTimeout(timeoutId);
        if (res.data.error) {
          setError(res.data.error);
        } else {
          setData(res.data);
        }
      })
      .catch((err) => {
        if (err.name !== "CanceledError") {
          setError("Failed to load call graph.");
          console.error("Failed to fetch graph", err);
        }
      })
      .finally(() => {
        clearTimeout(timeoutId);
        setLoading(false);
        setGenerating(false);
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [jobId]);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth || 800,
          height: 500,
        });
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [loading]);

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: "var(--text-3)" }}>
        {generating ? (
          <div>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚙️</div>
            <div style={{ color: "var(--accent)", fontWeight: 600, marginBottom: 8 }}>
              Generating Call Graph...
            </div>
            <div style={{ fontSize: 13, color: "var(--text-3)" }}>
              Running Slither analysis on the contract. This may take up to 60 seconds.
            </div>
          </div>
        ) : (
          <div style={{ color: "var(--text-3)" }}>Loading graph...</div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
        <div>{error}</div>
      </div>
    );
  }

  if (!data.nodes || data.nodes.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>📊</div>
        <div>No call graph could be generated for this contract.</div>
        <div style={{ fontSize: 12, marginTop: 8 }}>This may happen for bytecode-only or ABI-only scans.</div>
      </div>
    );
  }

  return (
    <div>
      {/* Graph controls */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>
          {data.nodes.length} nodes · {data.links.length} edges
        </span>
        <button
          onClick={() => graphRef.current?.zoomToFit(400)}
          style={{
            marginLeft: "auto",
            padding: "4px 12px",
            fontSize: 12,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text-2)",
            cursor: "pointer",
          }}
        >
          ⊙ Fit Graph
        </button>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
        {[
          { color: "#00e6a8", label: "Contract" },
          { color: "#5b8cf5", label: "Function" },
          { color: "#8a8f98", label: "External" },
          { color: "#ff3366", label: "Vulnerable" },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: item.color }} />
            {item.label}
          </div>
        ))}
      </div>

      <div
        ref={containerRef}
        style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "#050507" }}
      >
        <ForceGraph2D
          ref={graphRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={data}
          nodeLabel={(node: any) => node.label || node.id}
          nodeColor={(node: any) => {
            if (node.vulnerable) return "#ff3366";
            if (node.group === 1) return "#00e6a8";
            if (node.group === 2) return "#5b8cf5";
            return "#8a8f98";
          }}
          nodeRelSize={5}
          linkColor={() => "rgba(255,255,255,0.12)"}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          linkWidth={1}
          backgroundColor="#050507"
          onEngineStop={() => graphRef.current?.zoomToFit(400, 40)}
        />
      </div>
    </div>
  );
}
