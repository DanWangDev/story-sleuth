import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  type RouteObject,
} from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.js";
import { useAuth } from "./auth/auth-context.js";
import { LandingPage } from "./pages/LandingPage.js";
import { SessionPage } from "./pages/SessionPage.js";
import { ResultsPage } from "./pages/ResultsPage.js";

/**
 * Routes that require an authenticated user — while the auth state is
 * loading, render nothing (LandingPage's TopBar handles the blank
 * state); once resolved, send anonymous users back to / where they
 * can sign in.
 */
function Protected({
  children,
}: {
  children: React.ReactElement;
}): React.ReactElement | null {
  const { state } = useAuth();
  if (state.status === "loading") return null;
  if (state.status === "anonymous") return <Navigate to="/" replace />;
  return children;
}

const routes: RouteObject[] = [
  { path: "/", element: <LandingPage /> },
  {
    path: "/sessions/:id",
    element: (
      <Protected>
        <SessionPage />
      </Protected>
    ),
  },
  {
    path: "/sessions/:id/results",
    element: (
      <Protected>
        <ResultsPage />
      </Protected>
    ),
  },
];

const router = createBrowserRouter(routes);

export function App(): React.ReactElement {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
