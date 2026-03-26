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
        <NavLink to="/pathfinder" className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}>
          🗺️ Pathfinder
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
              🛡️ Comment Review
            </NavLink>
            <NavLink
              to="/admin/posts/moderation"
              className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}
            >
              🧩 Post Policy
            </NavLink>
            <NavLink
              to="/admin/settings/mail"
              className={({ isActive }) => ["pf-navlink", isActive ? "pf-navlink--active" : null].filter(Boolean).join(" ")}
            >
              ✉️ Mail
            </NavLink>
          </>
        ) : null}
        <div className="pf-navspacer" />
        {auth.state.status === "authenticated" ? (
          <div className="pf-row">
            <Link to="/me" className="pf-nav-profile">
              {auth.state.avatarUrl ? <img src={auth.state.avatarUrl} alt="avatar" className="pf-avatar" /> : <div className="pf-avatar">{auth.state.displayName.slice(0, 1) || "U"}</div>}
              <span className="pf-muted">{auth.state.displayName}</span>
            </Link>
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
