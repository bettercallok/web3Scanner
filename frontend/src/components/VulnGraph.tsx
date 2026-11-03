import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import ForceGraph2D from "react-force-graph-2d";
import { API } from "../api";
import Icon from "./Icon";

// Canvas can't read CSS variables, so the palette is mirrored here.
const COLORS = { contract: "#3fcf8e", fn: "#7c6cff", external: "#6c7487", vulnerable: "#f2556b" };
const LEGEND = [
  { color: COLORS.contract, label: "Contract" },
  { color: COLORS.fn, label: "Function" },
  { color: COLORS.external, label: "External" },
  { color: COLORS.vulnerable, label: "Has finding" },
];

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
  const [data, setData] = useState<{ nodes: GraphNode[]; links: GraphLink[]; truncated?: boolean }>({ nodes: [], links: [] });
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
      <div className="empty-state">
        <div className="spinner" style={{ margin: "0 auto 14px" }} />
        {generating ? (
          <>
            <h3>Generating call graph…</h3>
            <p>Running Slither on the contract. This can take up to a minute.</p>
          </>
        ) : (
          <p>Loading graph…</p>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><Icon name="alert" size={20} /></div>
        <p>{error}</p>
      </div>
    );
  }

  if (!data.nodes || data.nodes.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><Icon name="branches" size={20} /></div>
        <h3>No call graph available</h3>
        <p>This happens for bytecode-only or ABI-only scans.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="card-header">
        <div>
          <div className="card-title">Call graph</div>
          <div className="card-sub">
            {data.nodes.length} functions · {data.links.length} calls
            {data.truncated && " · truncated to the first 300 nodes"}
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => graphRef.current?.zoomToFit(400, 40)}>Fit to view</button>
      </div>

      <div className="legend">
        {LEGEND.map((item) => (
          <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>
        ))}
      </div>

      <div ref={containerRef} className="graph-frame">
        <ForceGraph2D
          ref={graphRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={data}
          nodeLabel={(node: any) => node.label || node.id}
          nodeColor={(node: any) => {
            if (node.vulnerable) return COLORS.vulnerable;
            if (node.group === 1) return COLORS.contract;
            if (node.group === 2) return COLORS.fn;
            return COLORS.external;
          }}
          nodeRelSize={5}
          linkColor={() => "rgba(164,170,186,0.18)"}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          linkWidth={1}
          backgroundColor="#0a0c10"
          onEngineStop={() => graphRef.current?.zoomToFit(400, 40)}
        />
      </div>
    </div>
  );
}
