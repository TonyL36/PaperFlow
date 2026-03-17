import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";

export function TopNav() {
  const auth = useAuth();
  const isAdmin = auth.state.status === "authenticated" ? auth.state.roles.includes("ADMIN") : false;
  return (
    <div className="pf-topnav">
      <div className="pf-topnav__inner">
        <Link to="/posts" className="pf-brand">
          PaperFlow
        </Link>
        <NavLink to="/posts" className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}>
          📰 Feed
        </NavLink>
        <NavLink to="/viz" className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}>
          🧭 Viz
        </NavLink>
        {auth.state.status === "authenticated" ? (
          <>
            <NavLink
              to="/favorites"
              className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}
            >
              Favorites
            </NavLink>
            <NavLink
              to="/footprints"
              className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}
            >
              Footprints
            </NavLink>
          </>
        ) : null}
        {isAdmin ? (
          <>
            <NavLink
              to="/admin/users"
              className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}
            >
              🧑‍⚖️ Users
            </NavLink>
            <NavLink
              to="/admin/comments"
              className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}
            >
              🛡️ Moderation
            </NavLink>
          </>
        ) : null}
        <div className="pf-navspacer" />
        {auth.state.status === "authenticated" ? (
          <div className="pf-row">
            <span className="pf-muted">Signed in</span>
            <Button
              onClick={() => {
                void auth.logout();
              }}
            >
              Sign out
            </Button>
          </div>
        ) : (
          <NavLink to="/login" className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}>
            Sign in
          </NavLink>
        )}
      </div>
    </div>
  );
}
