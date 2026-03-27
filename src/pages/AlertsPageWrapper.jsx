import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import AlertsPage from "./AlertsPage";

export default function AlertsPageWrapper() {
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  return <AlertsPage currentUser={currentUser} />;
}