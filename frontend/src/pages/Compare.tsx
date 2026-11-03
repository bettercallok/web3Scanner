import { Navigate, useSearchParams } from "react-router-dom";

/** Legacy route: /compare?a=&b= now lives at /diff (which shares links and auto-runs). */
export default function Compare() {
  const [params] = useSearchParams();
  return <Navigate to={`/diff?${params.toString()}`} replace />;
}
