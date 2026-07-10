import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ncClient } from "@/api/ncClient";
import AlertsPage from "./AlertsPage";

export default function AlertsPageWrapper() {
  const { data: currentUser = null } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => ncClient.auth.me(),
    staleTime: 0,
    refetchOnMount: "always",
  });

  return <AlertsPage currentUser={currentUser} />;
}