import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import AppLayout from "./AppLayout";
import { Skeleton } from "./ui/Skeleton";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-10">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-5 md:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}
