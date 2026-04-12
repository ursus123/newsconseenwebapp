// Redirects to /AddClient — merged in Sprint 4 (AddClient is the canonical multi-step wizard)
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function ClientOnboarding() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/AddClient", { replace: true }); }, [navigate]);
  return null;
}
